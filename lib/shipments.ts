import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { ProductionError, isRecord } from '@/lib/production-api'
import { cleanName, parseDate, parsePositiveDecimal } from '@/lib/production-validation'
import { committedStock, endOfDay, shipmentStock } from '@/lib/production-stock'
import { editableShipmentStatuses } from '@/lib/shipment-status'

export const shipmentInclude = {
  items: {
    where: { deletedAt: null },
    orderBy: { id: 'asc' },
    include: {
      crop: true, variety: true, productionArea: true, unit: true,
      allocations: { where: { deletedAt: null }, include: { harvest: true } },
    },
  },
  receptions: { where: { deletedAt: null }, include: { items: { where: { deletedAt: null } } } },
} satisfies Prisma.ShipmentInclude

export function shipmentDraft(body: Record<string, unknown>, allowLegacy: boolean) {
  const date = parseDate(body.date)
  const rows = body.items === undefined && allowLegacy
    ? [{ ...body, productionAreaId: body.productionAreaId ?? body.lotId }]
    : body.items

  if (!date || !Array.isArray(rows) || rows.length < 1 || rows.length > 100) {
    throw new ProductionError('Indica una fecha válida y entre 1 y 100 productos para el envío.')
  }

  const items = rows.map((row: unknown) => {
    if (!isRecord(row)) throw new ProductionError('Cada producto debe ser un objeto válido.')
    const { cropId, varietyId, productionAreaId, unitId } = row
    const quantity = parsePositiveDecimal(row.quantity)
    const unitPrice = parsePositiveDecimal(row.unitPrice)
    if (typeof cropId !== 'string' || !cropId || !quantity || !unitPrice ||
      [varietyId, productionAreaId, unitId].some((id) => id != null && typeof id !== 'string')) {
      throw new ProductionError('Cada producto debe tener un cultivo, cantidad y precio unitario válidos (hasta dos decimales).')
    }
    const estimatedTotalAmount = new Prisma.Decimal(quantity).mul(unitPrice).toDecimalPlaces(2)
    if (estimatedTotalAmount.gte('1000000000000')) {
      throw new ProductionError('El importe estimado de un producto supera el máximo permitido.')
    }
    return {
      cropId,
      varietyId: typeof varietyId === 'string' && varietyId ? varietyId : null,
      productionAreaId: typeof productionAreaId === 'string' && productionAreaId ? productionAreaId : null,
      unitId: typeof unitId === 'string' && unitId ? unitId : null,
      quantity,
      unitPrice,
      estimatedTotalAmount,
      notes: row.notes === undefined ? undefined : cleanName(row.notes).slice(0, 2000) || null,
    }
  })

  return { date, items, notes: cleanName(body.notes).slice(0, 2000) || null }
}

export async function findShipment(tx: Prisma.TransactionClient, id: string) {
  const shipment = await tx.shipment.findFirst({ where: { id, deletedAt: null }, include: shipmentInclude })
  if (!shipment) throw new ProductionError('El envío no existe o está en la papelera.', 404)
  return shipment
}

export function assertShipmentEditable(shipment: Awaited<ReturnType<typeof findShipment>>) {
  if (!editableShipmentStatuses.includes(shipment.status) || shipment.receptions.length) {
    throw new ProductionError('Solo puedes modificar un envío en tránsito que todavía no tiene recepciones.', 409)
  }
}

export async function saveShipment(
  tx: Prisma.TransactionClient,
  draft: ReturnType<typeof shipmentDraft>,
  actor: string | null,
  id?: string,
) {
  const before = id ? await findShipment(tx, id) : undefined
  if (before) assertShipmentEditable(before)

  const datesAndNotes = { date: draft.date, notes: draft.notes }
  const shipment = before
    ? await tx.shipment.update({ where: { id: before.id }, data: datesAndNotes })
    : await tx.shipment.create({
        data: { ...datesAndNotes, code: `ENV-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`, createdBy: actor },
      })

  if (before?.items.length) {
    const oldIds = before.items.map((item) => item.id)
    const deletedAt = new Date()
    await tx.shipmentAllocation.updateMany({
      where: { shipmentItemId: { in: oldIds }, deletedAt: null }, data: { deletedAt },
    })
    await tx.shipmentItem.updateMany({ where: { id: { in: oldIds } }, data: { deletedAt } })
  }

  const cropIds = [...new Set(draft.items.map((item) => item.cropId))]
  const crops = await tx.crop.findMany({ where: { id: { in: cropIds }, active: true, deletedAt: null } })
  const cropById = new Map(crops.map((crop) => [crop.id, crop]))
  const harvests = await tx.harvest.findMany({
    where: { ...shipmentStock, cropId: { in: cropIds }, date: { lte: endOfDay(draft.date) } },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    include: { unit: { select: { name: true } } },
  })
  const committed = await committedStock(tx, harvests.map((harvest) => harvest.id))
  const byProduct = new Map<string, typeof harvests>()
  for (const harvest of harvests) {
    const key = productKey(harvest)
    const matching = byProduct.get(key) ?? []
    matching.push(harvest)
    byProduct.set(key, matching)
  }
  const oldItems = new Map(before?.items.map((item) => [productKey(item), item]))

  for (const item of draft.items) {
    const crop = cropById.get(item.cropId)
    if (!crop) throw new ProductionError('Uno de los cultivos no existe o está inactivo.')
    const unitId = item.unitId || crop.unitId
    if (!unitId) throw new ProductionError(`Selecciona una unidad para ${crop.name}.`)
    const key = productKey({ ...item, unitId })
    const candidates = byProduct.get(key) ?? []
    let remaining = new Prisma.Decimal(item.quantity)
    const allocations: { harvestId: string; quantity: Prisma.Decimal }[] = []

    for (const harvest of candidates) {
      if (remaining.isZero()) break
      const used = committed.get(harvest.id) ?? new Prisma.Decimal(0)
      const available = harvest.quantity.minus(used)
      if (available.lte(0)) continue

      const quantity = Prisma.Decimal.min(available, remaining)
      allocations.push({ harvestId: harvest.id, quantity })
      committed.set(harvest.id, used.plus(quantity))
      remaining = remaining.minus(quantity)
    }
    if (remaining.gt(0)) {
      throw new ProductionError(`Existencias insuficientes para ${crop.name} en la fecha indicada. Faltan ${remaining.toFixed(2)} ${candidates[0]?.unit.name ?? 'en la unidad elegida'}.`, 409)
    }

    await tx.shipmentItem.create({
      data: {
        shipmentId: shipment.id,
        cropId: item.cropId,
        varietyId: item.varietyId,
        productionAreaId: item.productionAreaId,
        unitId,
        quantity: item.quantity,
        estimatedUnitPrice: item.unitPrice,
        estimatedTotalAmount: item.estimatedTotalAmount,
        notes: item.notes === undefined ? oldItems.get(key)?.notes : item.notes,
        allocations: { create: allocations },
      },
    })
  }

  const result = await findShipment(tx, shipment.id)
  await tx.auditLog.create({
    data: {
      entity: 'Shipment', entityId: shipment.id, action: before ? 'UPDATE' : 'CREATE', actor,
      beforeJson: before ? JSON.parse(JSON.stringify(before)) : undefined,
      afterJson: JSON.parse(JSON.stringify(result)),
    },
  })
  return result
}

export function productKey(item: { cropId: string; varietyId: string | null; productionAreaId: string | null; unitId: string }) {
  return JSON.stringify([item.cropId, item.varietyId, item.productionAreaId, item.unitId])
}
