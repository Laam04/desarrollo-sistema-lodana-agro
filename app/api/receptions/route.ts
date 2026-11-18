import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { currentActor, isRecord, ProductionError, productionError, readBody } from '@/lib/production-api'
import { historyQuery } from '@/lib/production-history'
import { cleanName, parsePositiveDecimal } from '@/lib/production-validation'
import { receivableStatuses } from '@/lib/shipment-status'

const receptionShipmentInclude = {
  items: {
    where: { deletedAt: null },
    orderBy: { id: 'asc' },
    include: {
      crop: { select: { name: true } },
      variety: { select: { name: true } },
      productionArea: { select: { name: true } },
      unit: { select: { name: true } },
      receptionItems: {
        where: { deletedAt: null, reception: { deletedAt: null } },
        select: { receivedQuantity: true },
      },
    },
  },
} satisfies Prisma.ShipmentInclude

type ReceptionShipment = Prisma.ShipmentGetPayload<{ include: typeof receptionShipmentInclude }>

const receptionLogInclude = {
  where: { deletedAt: null },
  orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
  select: {
    id: true, receiptNumber: true, receivedAt: true, receivedBy: true, notes: true,
    items: {
      where: { deletedAt: null },
      orderBy: { id: 'asc' },
      select: { id: true, shipmentItemId: true, receivedQuantity: true, notes: true },
    },
  },
} satisfies Prisma.ReceptionFindManyArgs

function withReceivedTotals(shipment: ReceptionShipment) {
  return {
    id: shipment.id,
    code: shipment.code,
    date: shipment.date,
    status: shipment.status,
    notes: shipment.notes,
    items: shipment.items.map(({ receptionItems, ...item }) => {
      const receivedQuantity = receptionItems.reduce(
        (total, row) => total.plus(row.receivedQuantity), new Prisma.Decimal(0),
      )
      return {
        ...item,
        receivedQuantity,
        pendingQuantity: Prisma.Decimal.max(0, item.quantity.minus(receivedQuantity)),
      }
    }),
  }
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams
    const shipmentId = params.get('shipmentId')
    const view = params.get('view')
    if (shipmentId) {
      const shipment = await prisma.shipment.findFirst({
        where: { id: shipmentId, deletedAt: null },
        include: { ...receptionShipmentInclude, receptions: receptionLogInclude },
      })
      if (!shipment) throw new ProductionError('Envío no encontrado.', 404)
      return NextResponse.json({ ...withReceivedTotals(shipment), receptions: shipment.receptions })
    }
    const { take, skip, date, search, result } = historyQuery(request, 100)
    const historical = view === 'history'
    const rows = await prisma.shipment.findMany({
      where: {
        deletedAt: null,
        date,
        ...(historical ? { receptions: { some: { deletedAt: null } } } : { status: { in: receivableStatuses } }),
        OR: search ? [
          { code: search },
          ...(view ? [{ items: { some: { deletedAt: null, crop: { name: search } } } }] : []),
        ] : undefined,
      },
      include: receptionShipmentInclude,
      orderBy: [{ date: historical ? 'desc' : 'asc' }, { id: historical ? 'desc' : 'asc' }],
      take,
      skip,
    })
    return NextResponse.json(result(rows.map(withReceivedTotals)))
  } catch (error) {
    return productionError(error, 'No se pudieron consultar los envíos para recepción.')
  }
}

export async function POST(request: Request) {
  try {
    const body = await readBody(request)
    const { shipmentId, requestId } = body
    if (typeof shipmentId !== 'string' || !shipmentId ||
      typeof requestId !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(requestId) ||
      !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) {
      throw new ProductionError('Indica un envío, una clave de solicitud UUID y los productos recibidos.')
    }
    const id = requestId.toLowerCase()
    const distinct = new Set<string>()
    const notes = cleanName(body.notes).slice(0, 2000) || null
    const items = body.items.map((row: unknown) => {
      if (!isRecord(row) || typeof row.shipmentItemId !== 'string' || !row.shipmentItemId) {
        throw new ProductionError('Indica el identificador de cada producto recibido.')
      }
      const receivedQuantity = parsePositiveDecimal(row.receivedQuantity)
      if (!receivedQuantity || distinct.has(row.shipmentItemId)) {
        throw new ProductionError('Cada producto debe aparecer una vez y tener una cantidad positiva de hasta dos decimales.')
      }
      distinct.add(row.shipmentItemId)
      return { shipmentItemId: row.shipmentItemId, receivedQuantity, notes: cleanName(row.notes).slice(0, 2000) || null }
    })
    const actor = await currentActor()

    const result = await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findFirst({
        where: { id: shipmentId, deletedAt: null }, include: receptionShipmentInclude,
      })
      if (!shipment) throw new ProductionError('Envío no encontrado.', 404)
      const existing = await tx.reception.findUnique({ where: { id }, include: { items: true } })
      if (existing) {
        const matches = !existing.deletedAt && existing.shipmentId === shipmentId &&
          existing.notes === notes && existing.items.length === items.length &&
          items.every((item) => existing.items.some((saved) => !saved.deletedAt &&
            saved.shipmentItemId === item.shipmentItemId && saved.receivedQuantity.eq(item.receivedQuantity) &&
            saved.notes === item.notes))
        if (!matches) throw new ProductionError('La clave de solicitud ya está asociada a otra recepción.', 409)
        return { created: false, reception: existing, shipment: withReceivedTotals(shipment) }
      }

      if (!receivableStatuses.includes(shipment.status)) {
        throw new ProductionError('El envío ya está cerrado para nuevas recepciones.', 409)
      }

      const current = withReceivedTotals(shipment)
      const pending = new Map(current.items.map((item) => [item.id, item.pendingQuantity]))
      for (const item of items) {
        const quantity = pending.get(item.shipmentItemId)
        if (!quantity) throw new ProductionError('Uno de los productos no pertenece al envío.')
        if (quantity.lt(item.receivedQuantity)) {
          throw new ProductionError(`La cantidad recibida supera el saldo pendiente de ${quantity.toFixed(2)}.`, 409)
        }
        pending.set(item.shipmentItemId, quantity.minus(item.receivedQuantity))
      }

      const reception = await tx.reception.create({
        data: { id, shipmentId, notes, receivedBy: actor, items: { create: items } },
        include: { items: true },
      })
      const status = [...pending.values()].every((quantity) => quantity.isZero()) ? 'RECEIVED' : 'PARTIALLY_RECEIVED'
      const updated = await tx.shipment.update({
        where: { id: shipmentId }, data: { status }, include: receptionShipmentInclude,
      })
      await tx.auditLog.create({
        data: {
          entity: 'Shipment', entityId: shipmentId, action: 'RECEIVE', actor,
          beforeJson: { status: shipment.status }, afterJson: { status, receptionId: reception.id },
        },
      })
      return { created: true, reception, shipment: withReceivedTotals(updated) }
    }, { isolationLevel: 'Serializable' })

    return NextResponse.json({ reception: result.reception, shipment: result.shipment }, { status: result.created ? 201 : 200 })
  } catch (error) {
    return productionError(error, 'No se pudo registrar la recepción.')
  }
}
