import { Prisma } from '@prisma/client'
import { ProductionError } from '@/lib/production-api'
import { activeHarvest, committedStock } from '@/lib/production-stock'

type Transaction = Prisma.TransactionClient

const entityTypes = [
  'unit', 'crop', 'variety', 'productionArea', 'harvest', 'lossReason', 'loss',
  'costCategory', 'costSubcategory', 'cost', 'costAllocation',
  'shipment', 'shipmentItem', 'shipmentAllocation', 'reception', 'receptionItem',
] as const
export type Entity = typeof entityTypes[number]

export const productionTrashTypes: readonly Entity[] = [
  'unit', 'crop', 'variety', 'productionArea', 'harvest', 'lossReason', 'loss',
  'costCategory', 'costSubcategory', 'cost', 'costAllocation',
]

function isEntity(value: string): value is Entity {
  return entityTypes.some((type) => type === value)
}

type TrashModel = {
  findUnique(args: { where: { id: string } }): Promise<({ deletedAt: Date | null } & Record<string, unknown>) | null>
  updateMany(args: { where: { id: string; deletedAt: Date | null }; data: { deletedAt: Date | null } }): Promise<{ count: number }>
}

function model(tx: Transaction, type: Entity): TrashModel {
  return tx[type] as unknown as TrashModel
}

export async function retireIfExpired(
  tx: Transaction,
  entityType: 'crop' | 'variety' | 'productionArea' | 'unit' | 'lossReason' | 'costCategory' | 'costSubcategory',
  record: { id: string; deletedAt: Date | null },
): Promise<boolean> {
  if (!record.deletedAt) return false
  const expired = await tx.trashEntry.findFirst({
    where: { entityType, entityId: record.id, deletedAt: record.deletedAt, purgeAt: { lte: new Date() }, restoredAt: null },
    select: { id: true },
  })
  if (!expired) return false
  const retired = `~retirado-${record.id}`
  switch (entityType) {
    case 'crop':
      await tx.crop.update({ where: { id: record.id }, data: { normalizedName: retired } })
      break
    case 'variety':
      await tx.variety.update({ where: { id: record.id }, data: { normalizedName: retired } })
      break
    case 'productionArea':
      await tx.productionArea.update({ where: { id: record.id }, data: { normalizedName: retired } })
      break
    case 'unit':
      await tx.unit.update({ where: { id: record.id }, data: { name: retired } })
      break
    case 'lossReason':
      await tx.lossReason.update({ where: { id: record.id }, data: { name: retired, normalizedName: retired } })
      break
    case 'costCategory':
      await tx.costCategory.update({ where: { id: record.id }, data: { name: retired, normalizedName: retired } })
      break
    case 'costSubcategory':
      await tx.costSubcategory.update({ where: { id: record.id }, data: { normalizedName: retired } })
      break
  }
  return true
}

export async function moveToTrash(tx: Transaction, entityType: Entity, id: string, groupId: string = crypto.randomUUID(), deletedBy?: string | null) {
  const delegate = model(tx, entityType)
  const record = await delegate.findUnique({ where: { id } })
  if (!record) throw new ProductionError('El registro no existe.', 404)
  const deletedAt = new Date()
  const { count } = await delegate.updateMany({ where: { id, deletedAt: null }, data: { deletedAt } })
  if (!count) throw new ProductionError('El registro ya está en la papelera.', 409)

  const purgeAt = new Date(deletedAt)
  purgeAt.setUTCDate(purgeAt.getUTCDate() + 60)
  await tx.trashEntry.create({
    data: { entityType, entityId: id, groupId, deletedAt, purgeAt, deletedBy, snapshotJson: JSON.parse(JSON.stringify(record)) },
  })
  return { id, groupId, deletedAt, purgeAt }
}

const parents: Partial<Record<Entity, Partial<Record<Entity, string>>>> = {
  crop: { unit: 'unitId' },
  variety: { crop: 'cropId' },
  productionArea: { crop: 'cropId' },
  harvest: { crop: 'cropId', variety: 'varietyId', productionArea: 'productionAreaId', unit: 'unitId' },
  loss: { harvest: 'harvestId', lossReason: 'reasonId' },
  costSubcategory: { costCategory: 'categoryId' },
  cost: { costCategory: 'categoryId', costSubcategory: 'subcategoryId' },
  costAllocation: { cost: 'costId', crop: 'cropId' },
  shipmentItem: { shipment: 'shipmentId' },
  shipmentAllocation: { shipmentItem: 'shipmentItemId', harvest: 'harvestId' },
  reception: { shipment: 'shipmentId' },
  receptionItem: { reception: 'receptionId', shipmentItem: 'shipmentItemId' },
}

export async function restoreTrash(
  tx: Transaction,
  selector: { groupId: string } | { id: string },
  actor: string | null,
  allowedTypes?: readonly Entity[],
) {
  const now = new Date()
  const canRestore = { restoredAt: null, purgeAt: { gt: now } }
  const entries = await tx.trashEntry.findMany({ where: { ...canRestore, ...selector } })
  if (!entries.length) throw new ProductionError('El registro no existe en la papelera o ya venció.', 404)
  if (allowedTypes && entries.some((entry) => !allowedTypes.includes(entry.entityType as Entity))) {
    throw new ProductionError('El perfil no tiene acceso para restaurar este registro.', 403)
  }
  const restored = new Set<string>()

  async function restore(entry: typeof entries[number]) {
    const { entityType, entityId } = entry
    const key = `${entityType}:${entityId}`
    if (restored.has(key)) return
    if (!isEntity(entityType)) throw new ProductionError('El tipo de registro no se puede restaurar.', 409)

    const delegate = model(tx, entityType)
    const record = await delegate.findUnique({ where: { id: entityId } })
    if (!record) throw new ProductionError('Uno de los registros ya no existe.', 404)
    if (record.deletedAt && record.deletedAt.getTime() !== entry.deletedAt.getTime()) {
      throw new ProductionError('El registro tiene una eliminación más reciente.', 409)
    }

    for (const [parentType, field] of Object.entries(parents[entityType] ?? {})) {
      const parentId = record[field]
      if (typeof parentId !== 'string' || !isEntity(parentType)) continue
      const parent = await model(tx, parentType).findUnique({ where: { id: parentId } })
      if (!parent) throw new ProductionError('Falta un registro asociado.', 409)
      if (!parent.deletedAt) continue
      const parentEntry = await tx.trashEntry.findFirst({
        where: { ...canRestore, entityType: parentType, entityId: parentId, deletedAt: parent.deletedAt },
      })
      if (!parentEntry) throw new ProductionError('El registro asociado ya no se puede recuperar.', 409)
      await restore(parentEntry)
    }

    if (record.deletedAt && entityType === 'loss') {
      const loss = await tx.loss.findUniqueOrThrow({ where: { id: entityId }, include: { harvest: true } })
      if (loss.harvest.status !== activeHarvest.status) {
        throw new ProductionError('La cosecha asociada no admite esta merma.', 409)
      }
      if (loss.date.toISOString().slice(0, 10) < loss.harvest.date.toISOString().slice(0, 10)) {
        throw new ProductionError('La merma es anterior a la fecha actual de su cosecha.', 409)
      }
      if (loss.affectsHarvest) {
        const committed = (await committedStock(tx, [loss.harvestId])).get(loss.harvestId) ?? new Prisma.Decimal(0)
        if (committed.plus(loss.quantity).gt(loss.harvest.quantity)) {
          throw new ProductionError('La cosecha ya no tiene saldo para restaurar esta merma.', 409)
        }
      }
    }

    // Los envíos nuevos se cancelan conservando la trazabilidad. La papelera de
    // producción no reabre movimientos históricos de recepción o inventario.
    if (['shipment', 'shipmentItem', 'shipmentAllocation', 'reception', 'receptionItem'].includes(entityType)) {
      throw new ProductionError('Los envíos y recepciones históricos requieren revisión antes de restaurarlos.', 409)
    }

    if (record.deletedAt) {
      await delegate.updateMany({ where: { id: entityId, deletedAt: record.deletedAt }, data: { deletedAt: null } })
    }
    await tx.trashEntry.update({ where: { id: entry.id }, data: { restoredAt: now, restoredBy: actor } })
    restored.add(key)
  }

  entries.sort((a, b) => entityTypes.indexOf(a.entityType as Entity) - entityTypes.indexOf(b.entityType as Entity))
  for (const entry of entries) await restore(entry)
  return restored.size
}
