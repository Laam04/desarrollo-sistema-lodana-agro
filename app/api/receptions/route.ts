import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { prisma, runSerializable } from '@/lib/prisma'
import { isRecord, ProductionError, productionError, readBody, requireProfile } from '@/lib/production-api'
import { historyQuery } from '@/lib/production-history'
import { marketDay } from '@/lib/market-data'
import { cleanName, normalizeCatalogName, parsePositiveDecimal } from '@/lib/production-validation'
import { receivableStatuses } from '@/lib/shipment-status'
import { retireIfExpired } from '@/lib/trash'

const receptionShipmentInclude = {
  items: {
    where: { deletedAt: null },
    orderBy: { id: 'asc' },
    include: {
      crop: { select: { id: true, name: true } },
      variety: { select: { name: true } },
      productionArea: { select: { name: true } },
      unit: { select: { id: true, name: true } },
      receptionItems: {
        where: { deletedAt: null, parentItemId: null, reception: { deletedAt: null } },
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
    id: true, receiptNumber: true, receivedAt: true, receivedBy: true, notes: true, closesWithDifferences: true,
    items: {
      where: { deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        shipmentItemId: true,
        receivedQuantity: true,
        customerUnitPrice: true,
        notes: true,
        saleQuantity: true,
        saleUnitCost: true,
        parentItemId: true,
        convertedFromQty: true,
        saleUnit: { select: { id: true, name: true } },
      },
    },
  },
} satisfies Prisma.ReceptionFindManyArgs

function withReceivedTotals(shipment: ReceptionShipment) {
  const hasNoteImage = Boolean(shipment.noteImageName)
  return {
    id: shipment.id,
    code: shipment.code,
    date: shipment.date,
    status: shipment.status,
    notes: shipment.notes,
    hasNoteImage,
    noteImageName: shipment.noteImageName,
    noteImageUrl: hasNoteImage ? `/api/receptions/${shipment.id}/photo?v=${shipment.updatedAt.getTime()}` : null,
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

type ReceptionInputItem = {
  shipmentItemId: string
  receivedQuantity: number
  customerUnitPrice: number | null
  saleUnitId: string | null
  saleUnitName: string | null
  saleQuantity: number | null
  notes: string | null
}

function receptionMatches(
  existing: {
    deletedAt: Date | null
    shipmentId: string
    receivedBy: string | null
    notes: string | null
    closesWithDifferences: boolean
    items: {
      deletedAt: Date | null
      shipmentItemId: string
      receivedQuantity: Prisma.Decimal
      customerUnitPrice: Prisma.Decimal | null
      saleUnitId: string | null
      saleQuantity: Prisma.Decimal | null
      saleUnit?: { name: string } | null
      shipmentItem: { unitId: string; unit: { name: string } }
      notes: string | null
    }[]
  },
  params: {
    shipmentId: string
    shipmentStatus: string
    actor: string
    notes: string | null
    closesWithDifferences: boolean
    items: ReceptionInputItem[]
  },
) {
  const expectedClosesWithDifferences = params.closesWithDifferences && params.shipmentStatus !== 'RECEIVED'
  return (
    !existing.deletedAt &&
    existing.shipmentId === params.shipmentId &&
    existing.receivedBy === params.actor &&
    existing.notes === params.notes &&
    existing.closesWithDifferences === expectedClosesWithDifferences &&
    existing.items.length === params.items.length &&
    params.items.every((item) =>
      existing.items.some((saved) => {
        const matchesOriginalUnit =
          (item.saleUnitId ? item.saleUnitId === saved.shipmentItem.unitId : false) ||
          (item.saleUnitName
            ? normalizeCatalogName(item.saleUnitName) === normalizeCatalogName(saved.shipmentItem.unit.name)
            : false)
        const effectiveConversion =
          item.saleQuantity !== null && !(matchesOriginalUnit && item.saleQuantity === item.receivedQuantity)
        const saleUnitMatches = !effectiveConversion
          ? saved.saleQuantity === null && saved.saleUnitId === null
          : Boolean(
              saved.saleQuantity?.eq(item.saleQuantity!) &&
                (item.saleUnitId
                  ? saved.saleUnitId === item.saleUnitId
                  : item.saleUnitName
                    ? normalizeCatalogName(saved.saleUnit?.name ?? '') === normalizeCatalogName(item.saleUnitName)
                    : false),
            )
        return (
          !saved.deletedAt &&
          saved.shipmentItemId === item.shipmentItemId &&
          saved.receivedQuantity.eq(item.receivedQuantity) &&
          saved.notes === item.notes &&
          saleUnitMatches &&
          (item.customerUnitPrice === null
            ? saved.customerUnitPrice === null
            : saved.customerUnitPrice?.eq(item.customerUnitPrice))
        )
      }),
    )
  )
}

export async function GET(request: Request) {
  try {
    await requireProfile(['reception', 'admin'])
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
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
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
    const actor = await requireProfile(['reception', 'admin'])
    const body = await readBody(request)
    const { shipmentId, requestId } = body
    const closesWithDifferences = body.closesWithDifferences === true
    if (typeof shipmentId !== 'string' || !shipmentId ||
      typeof requestId !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(requestId) ||
      !Array.isArray(body.items) || body.items.length > 100 ||
      (body.items.length < 1 && !closesWithDifferences)) {
      throw new ProductionError('Indica un envío, una clave de solicitud UUID y los productos recibidos.')
    }
    const id = requestId.toLowerCase()
    const distinct = new Set<string>()
    const notes = cleanName(body.notes).slice(0, 2000) || null
    const items: ReceptionInputItem[] = body.items.map((row: unknown) => {
      if (!isRecord(row) || typeof row.shipmentItemId !== 'string' || !row.shipmentItemId) {
        throw new ProductionError('Indica el identificador de cada producto recibido.')
      }
      const receivedQuantity = parsePositiveDecimal(row.receivedQuantity)
      if (!receivedQuantity || distinct.has(row.shipmentItemId)) {
        throw new ProductionError('Cada producto debe aparecer una vez y tener una cantidad positiva de hasta dos decimales.')
      }
      distinct.add(row.shipmentItemId)
      const customerUnitPrice = row.customerUnitPrice == null || row.customerUnitPrice === '' ? null : parsePositiveDecimal(row.customerUnitPrice)
      if (row.customerUnitPrice != null && row.customerUnitPrice !== '' && customerUnitPrice === null) {
        throw new ProductionError('Indica un precio al cliente positivo de hasta dos decimales.')
      }
      const saleUnitId = typeof row.saleUnitId === 'string' && row.saleUnitId ? row.saleUnitId : null
      const saleUnitName = cleanName(row.saleUnitName) || null
      const hasSaleQty = row.saleQuantity != null && row.saleQuantity !== ''
      const saleQuantity = hasSaleQty ? parsePositiveDecimal(row.saleQuantity) : null
      if ((saleUnitId || saleUnitName || hasSaleQty) && ((!saleUnitId && !saleUnitName) || !saleQuantity)) {
        throw new ProductionError('Para cambiar la presentación al recibir, indica la nueva unidad y la cantidad equivalente.')
      }
      return {
        shipmentItemId: row.shipmentItemId,
        receivedQuantity,
        customerUnitPrice,
        saleUnitId,
        saleUnitName,
        saleQuantity,
        notes: cleanName(row.notes).slice(0, 2000) || null,
      }
    })

    const matchParams = { shipmentId, actor, notes, closesWithDifferences, items }

    try {
      const result = await runSerializable(async (tx) => {
        const shipment = await tx.shipment.findFirst({
          where: { id: shipmentId, deletedAt: null }, include: receptionShipmentInclude,
        })
        if (!shipment) throw new ProductionError('Envío no encontrado.', 404)
        const existing = await tx.reception.findUnique({
          where: { id },
          include: {
            items: {
              where: { deletedAt: null, parentItemId: null },
              include: {
                saleUnit: { select: { name: true } },
                shipmentItem: { select: { unitId: true, unit: { select: { name: true } } } },
              },
            },
          },
        })
        if (existing) {
          if (!receptionMatches(existing, { ...matchParams, shipmentStatus: shipment.status })) {
            throw new ProductionError('La clave de solicitud ya está asociada a otra recepción.', 409)
          }
          return { created: false, reception: existing, shipment: withReceivedTotals(shipment) }
        }

        if (!receivableStatuses.includes(shipment.status)) {
          throw new ProductionError('El envío ya está cerrado para nuevas recepciones.', 409)
        }
        if (items.length === 0 && shipment.status !== 'PARTIALLY_RECEIVED') {
          throw new ProductionError('Registra al menos un producto recibido antes de cerrar el envío con diferencias.')
        }
        const now = new Date()
        if (shipment.date.toISOString().slice(0, 10) > marketDay(now)) {
          throw new ProductionError('No puedes recibir un envío con fecha posterior a hoy.', 409)
        }

        const current = withReceivedTotals(shipment)
        const pending = new Map(current.items.map((item) => [item.id, item.pendingQuantity]))
        const shipItemById = new Map(shipment.items.map((item) => [item.id, item]))
        for (const item of items) {
          const quantity = pending.get(item.shipmentItemId)
          if (!quantity) throw new ProductionError('Uno de los productos no pertenece al envío.')
          if (quantity.lt(item.receivedQuantity)) {
            throw new ProductionError(`La cantidad recibida supera el saldo pendiente de ${quantity.toFixed(2)}.`, 409)
          }
          pending.set(item.shipmentItemId, quantity.minus(item.receivedQuantity))
        }

        const existingUnits = items.some((i) => i.saleUnitId || i.saleUnitName)
          ? await tx.unit.findMany({ select: { id: true, name: true, active: true, deletedAt: true } })
          : []
        const unitById = new Map(existingUnits.map((u) => [u.id, u]))
        const unitByNorm = new Map(existingUnits.map((u) => [normalizeCatalogName(u.name), u]))

        const createItems = []
        for (const item of items) {
          const shipItem = shipItemById.get(item.shipmentItemId)!
          let resolvedSaleUnitId: string | null = null
          let resolvedSaleQty: Prisma.Decimal | null = null
          let resolvedSaleUnitCost: Prisma.Decimal | null = null

          if (item.saleQuantity && (item.saleUnitId || item.saleUnitName)) {
            const byId = item.saleUnitId ? unitById.get(item.saleUnitId) ?? null : null
            let targetUnit: { id: string; name: string } | null = byId && !byId.deletedAt && byId.active ? byId : null
            if (!targetUnit && !item.saleUnitId && item.saleUnitName) {
              const norm = normalizeCatalogName(item.saleUnitName)
              let matched = unitByNorm.get(norm) ?? null
              if (matched?.deletedAt) {
                if (await retireIfExpired(tx, 'unit', matched)) {
                  unitByNorm.delete(norm)
                  matched = null
                } else {
                  throw new ProductionError('Esta unidad está en la papelera.', 409)
                }
              }
              if (matched && !matched.active) {
                matched = await tx.unit.update({
                  where: { id: matched.id },
                  data: { active: true },
                  select: { id: true, name: true, active: true, deletedAt: true },
                })
                unitById.set(matched.id, matched)
                unitByNorm.set(norm, matched)
              }
              if (!matched) {
                matched = await tx.unit.create({
                  data: { name: item.saleUnitName.toLowerCase().slice(0, 40), active: true },
                  select: { id: true, name: true, active: true, deletedAt: true },
                })
                unitById.set(matched.id, matched)
                unitByNorm.set(normalizeCatalogName(matched.name), matched)
              }
              targetUnit = matched
            }
            if (!targetUnit) throw new ProductionError('Selecciona o escribe una unidad de venta activa y válida.')
            if (targetUnit.id !== shipItem.unitId || item.saleQuantity !== item.receivedQuantity) {
              resolvedSaleUnitId = targetUnit.id
              resolvedSaleQty = new Prisma.Decimal(item.saleQuantity)
              resolvedSaleUnitCost =
                shipItem.estimatedUnitPrice && shipItem.estimatedUnitPrice.gt(0)
                  ? shipItem.estimatedUnitPrice.mul(item.receivedQuantity).div(item.saleQuantity).toDecimalPlaces(4)
                  : null
              if (resolvedSaleUnitCost?.gte('100000000')) {
                throw new ProductionError('El costo unitario ajustado por la conversión supera el máximo permitido.')
              }
            }
          }

          createItems.push({
            shipmentItemId: item.shipmentItemId,
            receivedQuantity: item.receivedQuantity,
            customerUnitPrice: item.customerUnitPrice,
            saleUnitId: resolvedSaleUnitId,
            saleQuantity: resolvedSaleQty,
            saleUnitCost: resolvedSaleUnitCost,
            notes: item.notes,
          })
        }

        const allReceived = [...pending.values()].every((quantity) => quantity.isZero())
        const effectiveClosesWithDifferences = closesWithDifferences && !allReceived
        const reception = await tx.reception.create({
          data: {
            id,
            shipmentId,
            receivedAt: now,
            notes,
            closesWithDifferences: effectiveClosesWithDifferences,
            receivedBy: actor,
            items: createItems.length ? { create: createItems } : undefined,
          },
          include: { items: { where: { deletedAt: null } } },
        })
        const status = allReceived
          ? 'RECEIVED'
          : effectiveClosesWithDifferences ? 'RECEIVED_WITH_DIFFERENCES' : 'PARTIALLY_RECEIVED'
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
      })

      return NextResponse.json({ reception: result.reception, shipment: result.shipment }, { status: result.created ? 201 : 200 })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const [existing, shipment] = await Promise.all([
          prisma.reception.findUnique({
            where: { id },
            include: {
              items: {
                where: { deletedAt: null, parentItemId: null },
                include: {
                  saleUnit: { select: { name: true } },
                  shipmentItem: { select: { unitId: true, unit: { select: { name: true } } } },
                },
              },
            },
          }),
          prisma.shipment.findFirst({ where: { id: shipmentId, deletedAt: null }, include: receptionShipmentInclude }),
        ])
        if (existing && shipment) {
          if (!receptionMatches(existing, { ...matchParams, shipmentStatus: shipment.status })) {
            throw new ProductionError('La clave de solicitud ya está asociada a otra recepción.', 409)
          }
          return NextResponse.json({ reception: existing, shipment: withReceivedTotals(shipment) }, { status: 200 })
        }
      }
      throw error
    }
  } catch (error) {
    return productionError(error, 'No se pudo registrar la recepción.')
  }
}
