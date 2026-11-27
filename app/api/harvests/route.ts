import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { prisma, runSerializable } from '@/lib/prisma'
import { ProductionError, productionError, readBody, requireProfile } from '@/lib/production-api'
import { historyQuery } from '@/lib/production-history'
import { activeHarvest, activeLoss, committedStock, stockAllocation } from '@/lib/production-stock'
import { cleanName, parseDate, parsePositiveDecimal } from '@/lib/production-validation'
import { lossDraft, saveLoss } from '@/lib/harvest-loss'
import { moveToTrash } from '@/lib/trash'

const harvestInclude = {
  crop: true,
  variety: true,
  productionArea: true,
  unit: true,
  losses: { where: activeLoss, include: { reason: true }, orderBy: { date: 'desc' } },
} satisfies Prisma.HarvestInclude

type Harvest = Prisma.HarvestGetPayload<{ include: typeof harvestInclude }>

export async function GET(request: Request) {
  try {
    await requireProfile(['production', 'admin'])
    const { cropId, date, search, take, skip, result } = historyQuery(request, 200)
    const rows = await prisma.harvest.findMany({
      where: {
        ...activeHarvest, cropId, date,
        OR: search ? [
          { crop: { name: search } }, { unit: { name: search } }, { variety: { name: search } },
          { productionArea: { name: search } }, { notes: search },
        ] : undefined,
      },
      include: harvestInclude,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take, skip,
    })
    return NextResponse.json(result(rows))
  } catch (error) {
    return productionError(error, 'No se pudieron consultar las cosechas.')
  }
}

async function assertReferences(tx: Prisma.TransactionClient, ids: {
  cropId: string; varietyId: string | null; productionAreaId: string | null; unitId: string
}, before?: Harvest) {
  if (before && before.cropId === ids.cropId && before.varietyId === ids.varietyId &&
    before.productionAreaId === ids.productionAreaId && before.unitId === ids.unitId) return

  if (before && (before.losses.length ||
      await tx.shipmentAllocation.count({ where: { ...stockAllocation, harvestId: before.id } }) ||
      await tx.loss.count({ where: { ...activeLoss, harvestId: before.id } }))) {
    throw new ProductionError('El cultivo, la variedad, el área y la unidad quedan fijados cuando la cosecha tiene mermas activas o forma parte de un envío vigente.', 409)
  }

  const { cropId, varietyId, productionAreaId, unitId } = ids
  const [crop, unit, variety, area] = await Promise.all([
    tx.crop.findFirst({ where: { id: cropId, active: true, deletedAt: null } }),
    tx.unit.findFirst({ where: { id: unitId, active: true, deletedAt: null } }),
    varietyId && tx.variety.findFirst({ where: { id: varietyId, cropId, active: true, deletedAt: null } }),
    productionAreaId && tx.productionArea.findFirst({ where: { id: productionAreaId, cropId, active: true, deletedAt: null } }),
  ])
  if (!crop || !unit) throw new ProductionError('Selecciona un cultivo y una unidad activos.')
  if ((varietyId && !variety) || (productionAreaId && !area)) {
    throw new ProductionError('La variedad, el lote o la zona debe estar activo y pertenecer al cultivo.')
  }
}

async function save(request: Request, update: boolean) {
  try {
    const actor = await requireProfile(['production', 'admin'])
    const body = await readBody(request)
    const date = parseDate(body.date)
    const quantity = parsePositiveDecimal(body.quantity)
    const cropId = typeof body.cropId === 'string' ? body.cropId : ''
    const id = typeof body.id === 'string' ? body.id : ''
    if (!date || !cropId || !quantity || (update && !id)) {
      throw new ProductionError('Fecha, cultivo y cantidad positiva de hasta dos decimales son obligatorios.')
    }
    const hasPrice = body.estimatedUnitPrice != null && body.estimatedUnitPrice !== ''
    const estimatedUnitPrice = hasPrice ? parsePositiveDecimal(body.estimatedUnitPrice) : null
    if (hasPrice && !estimatedUnitPrice) throw new ProductionError('Indica un precio positivo de hasta dos decimales.')

    const hasLoss = body.lossQuantity != null && body.lossQuantity !== ''
    if (!hasLoss && (cleanName(body.lossReason) || cleanName(body.lossNotes) || body.lossDate)) {
      throw new ProductionError('Completa la cantidad de la merma o deja sus campos vacíos.')
    }
    if (update && hasLoss) throw new ProductionError('Registra la merma desde la sección Mermas.')
    const loss = hasLoss ? lossDraft({
      date: body.lossDate || body.date, quantity: body.lossQuantity, reason: body.lossReason,
      affectsHarvest: body.lossAffectsHarvest, notes: body.lossNotes,
    }) : null

    const row = await runSerializable(async (tx) => {
      const before = update ? await tx.harvest.findFirst({ where: { id, ...activeHarvest }, include: harvestInclude }) : null
      if (update && !before) throw new ProductionError('La cosecha no existe o está en la papelera.', 404)
      const crop = typeof body.unitId === 'string' && body.unitId
        ? null : await tx.crop.findUnique({ where: { id: cropId }, select: { unitId: true } })
      const unitId = (typeof body.unitId === 'string' && body.unitId) || crop?.unitId || ''
      const area = body.productionAreaId ?? body.lotId
      const ids = {
        cropId, unitId,
        varietyId: typeof body.varietyId === 'string' && body.varietyId ? body.varietyId : null,
        productionAreaId: typeof area === 'string' && area ? area : null,
      }
      if (!ids.productionAreaId && (!before || before.cropId !== cropId || before.productionAreaId)) {
        throw new ProductionError('Selecciona una zona para la cosecha.')
      }
      await assertReferences(tx, ids, before ?? undefined)

      if (before) {
        if (!before.quantity.eq(quantity)) {
          const committed = (await committedStock(tx, [id])).get(id) ?? new Prisma.Decimal(0)
          if (committed.gt(quantity)) {
            throw new ProductionError(`La cantidad debe cubrir los envíos y mermas ya registrados (${committed.toFixed(2)}).`, 409)
          }
        }
        if (before.date.toISOString().slice(0, 10) !== date.toISOString().slice(0, 10)) {
          const day = date.toISOString().slice(0, 10)
          const start = new Date(day + 'T00:00:00.000Z')
          const earlierShipment = await tx.shipmentAllocation.findFirst({
            where: { ...stockAllocation, harvestId: id, shipmentItem: {
              ...stockAllocation.shipmentItem, shipment: { ...stockAllocation.shipmentItem.shipment, date: { lt: start } },
            } },
            select: { id: true },
          })
          if (earlierShipment || before.losses.some((item) => item.date < start)) {
            throw new ProductionError('La fecha de la cosecha debe ser igual o anterior a la de sus envíos y mermas.', 409)
          }
        }
      }

      const data = { ...ids, date, quantity, estimatedUnitPrice, notes: cleanName(body.notes).slice(0, 2000) || null }
      const harvest = before
        ? await tx.harvest.update({ where: { id }, data })
        : await tx.harvest.create({ data: { ...data, createdBy: actor } })
      if (loss) await saveLoss(tx, harvest.id, loss, actor)
      const saved = await tx.harvest.findUniqueOrThrow({ where: { id: harvest.id }, include: harvestInclude })
      await tx.auditLog.create({
        data: {
          entity: 'Harvest', entityId: saved.id, action: before ? 'UPDATE' : 'CREATE', actor,
          beforeJson: before ? { date: before.date, quantity: before.quantity.toString(), cropId: before.cropId } : undefined,
          afterJson: { date: saved.date, quantity: saved.quantity.toString(), cropId: saved.cropId },
        },
      })
      return saved
    })
    return NextResponse.json(row, { status: update ? 200 : 201 })
  } catch (error) {
    return productionError(error, 'No se pudo guardar la cosecha.')
  }
}

export function POST(request: Request) {
  return save(request, false)
}

export function PATCH(request: Request) {
  return save(request, true)
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireProfile(['production', 'admin'])
    const { id } = await readBody(request)
    if (typeof id !== 'string' || !id) throw new ProductionError('Indica la cosecha que quieres eliminar.')
    const result = await runSerializable(async (tx) => {
      const harvest = await tx.harvest.findFirst({ where: { id, ...activeHarvest }, include: harvestInclude })
      if (!harvest) throw new ProductionError('La cosecha no existe o está en la papelera.', 404)
      if (await tx.shipmentAllocation.count({ where: { ...stockAllocation, harvestId: id } })) {
        throw new ProductionError('La cosecha tiene cantidades asignadas a un envío vigente.', 409)
      }
      const entry = await moveToTrash(tx, 'harvest', id, undefined, actor)
      for (const loss of harvest.losses) await moveToTrash(tx, 'loss', loss.id, entry.groupId, actor)
      await tx.auditLog.create({
        data: { entity: 'Harvest', entityId: id, action: 'TRASH', actor, beforeJson: { quantity: harvest.quantity.toString() } },
      })
      return entry
    })
    return NextResponse.json(result)
  } catch (error) {
    return productionError(error, 'No se pudo mover la cosecha a la papelera.')
  }
}
