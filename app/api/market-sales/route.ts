import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { currentActor, ProductionError, productionError, readBody } from '@/lib/production-api'
import { historyQuery } from '@/lib/production-history'
import { endOfDay } from '@/lib/production-stock'
import { parseDate, parsePositiveDecimal } from '@/lib/production-validation'
import { farmSupplier, marketDay, marketWeek, markupPercent, receiptCode, sheetColumns } from '@/lib/market-data'

const productInclude = {
  reception: { select: { receiptNumber: true, receivedAt: true, shipment: { select: { code: true } } } },
  shipmentItem: { include: { crop: true, variety: true, productionArea: true, unit: true } },
} satisfies Prisma.ReceptionItemInclude

const saleInclude = { receptionItem: { include: productInclude } } satisfies Prisma.MarketSaleInclude
type Product = Prisma.ReceptionItemGetPayload<{ include: typeof productInclude }>
type Sale = Prisma.MarketSaleGetPayload<{ include: typeof saleInclude }>

function productData(row: Product) {
  return {
    id: row.id,
    receivedAt: row.reception.receivedAt,
    receiptNumber: row.reception.receiptNumber,
    shipmentCode: row.reception.shipment.code,
    crop: row.shipmentItem.crop.name,
    variety: row.shipmentItem.variety?.name ?? null,
    area: row.shipmentItem.productionArea?.name ?? null,
    unit: row.shipmentItem.unit.name,
    productionUnitPrice: row.shipmentItem.estimatedUnitPrice,
    customerUnitPrice: row.customerUnitPrice,
  }
}

function saleData(row: Sale) {
  return {
    id: row.id, date: row.date, quantity: row.quantity, unitPrice: row.unitPrice,
    total: row.total, updatedAt: row.updatedAt, product: productData(row.receptionItem),
  }
}

async function stock(request: Request, date: Date, params: URLSearchParams) {
  const { take, skip, search, result } = historyQuery(request, 50)
  const excludeId = params.get('excludeSaleId')
  const itemId = params.get('itemId')
  const term = search ? '%' + search.contains + '%' : null
  const nextDay = new Date(date)
  nextDay.setUTCDate(nextDay.getUTCDate() + 1)
  nextDay.setUTCHours(5, 0, 0, 0)

  return prisma.$transaction(async (tx) => {
    const available = await tx.$queryRaw<{ id: string; available: Prisma.Decimal }[]>`
      SELECT ri.id, ri."receivedQuantity" - totals.sold AS available
      FROM "ReceptionItem" ri
      JOIN "Reception" r ON r.id = ri."receptionId"
      JOIN "Shipment" sh ON sh.id = r."shipmentId"
      JOIN "ShipmentItem" si ON si.id = ri."shipmentItemId"
      JOIN "Crop" c ON c.id = si."cropId"
      CROSS JOIN LATERAL (
        SELECT COALESCE(SUM(s.quantity), 0) AS sold
        FROM "MarketSale" s WHERE s."receptionItemId" = ri.id AND s."cancelledAt" IS NULL
        ${excludeId ? Prisma.sql`AND s.id <> ${excludeId}` : Prisma.empty}
      ) totals
      WHERE ri."deletedAt" IS NULL AND r."deletedAt" IS NULL AND r."receivedAt" < ${nextDay}
        AND sh."deletedAt" IS NULL AND sh.status <> 'CANCELLED' AND si."deletedAt" IS NULL
        AND ri."receivedQuantity" > totals.sold
        ${itemId ? Prisma.sql`AND ri.id = ${itemId}` : Prisma.empty}
        ${term ? Prisma.sql`AND (
          c.name ILIKE ${term} OR sh.code ILIKE ${term} OR
          ('REC-' || LPAD(r."receiptNumber"::text, GREATEST(3, LENGTH(r."receiptNumber"::text)), '0')) ILIKE ${term}
        )` : Prisma.empty}
      ORDER BY r."receivedAt" DESC, ri.id ASC
      LIMIT ${take} OFFSET ${skip ?? 0}
    `
    const products = await tx.receptionItem.findMany({
      where: { id: { in: available.map((row) => row.id) } },
      include: productInclude,
    })
    const byId = new Map(products.map((product) => [product.id, product]))
    return result(available.flatMap((row) => {
      const product = byId.get(row.id)
      return product ? [{ ...productData(product), available: row.available }] : []
    }))
  }, { isolationLevel: 'RepeatableRead' })
}

function spreadsheetCell(value: string) {
  // Excel interpreta cadenas iniciales como fórmulas incluso dentro de comillas.
  const safe = !/^-?\d+(?:,\d+)?%?$/.test(value) && /^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(value) ? "'" + value : value
  return '"' + safe.replaceAll('"', '""') + '"'
}

function exportSheet(rows: Sale[], date: string) {
  const localized = (value: Prisma.Decimal) => value.toFixed(2).replace('.', ',')
  const lines = rows.map((row) => {
    const product = productData(row.receptionItem)
    const markup = markupPercent(row.unitPrice.toString(), product.productionUnitPrice?.toString() ?? null)
    return [
      row.date.toISOString().slice(0, 10), receiptCode(product.receiptNumber), farmSupplier,
      [product.crop, product.variety, product.area].filter(Boolean).join(' · '),
      localized(row.quantity), product.unit, localized(row.unitPrice), localized(row.total),
      product.productionUnitPrice ? localized(product.productionUnitPrice) : '',
      markup === null ? '' : markup.toFixed(2).replace('.', ',') + '%',
      product.shipmentCode,
    ]
  })
  const csv = '\uFEFF' + [[...sheetColumns, 'Precio de Producción ($)', 'Ganancia sobre costo (%)', 'Envío'], ...lines]
    .map((row) => row.map(spreadsheetCell).join(';')).join('\r\n')
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="agro-market-' + date + '.csv"',
    },
  })
}

async function salesSummary(where: Prisma.MarketSaleWhereInput, from: string, to: string) {
  const rows = await prisma.marketSale.findMany({
    where,
    select: { date: true, total: true, quantity: true, receptionItem: { select: { shipmentItem: { select: { estimatedUnitPrice: true } } } } },
    orderBy: { date: 'asc' },
  })
  const days = new Map<string, { date: string; total: Prisma.Decimal; count: number }>()
  let total = new Prisma.Decimal(0)
  let profit = new Prisma.Decimal(0)
  let missingCost = 0
  for (const row of rows) {
    const date = row.date.toISOString().slice(0, 10)
    const day = days.get(date) ?? { date, total: new Prisma.Decimal(0), count: 0 }
    day.total = day.total.plus(row.total)
    day.count++
    days.set(date, day)
    total = total.plus(row.total)
    const cost = row.receptionItem.shipmentItem.estimatedUnitPrice
    if (cost?.gt(0)) profit = profit.plus(row.total.minus(cost.mul(row.quantity).toDecimalPlaces(2)))
    else missingCost++
  }
  return { from, to, total, profit: rows.length > missingCost ? profit : null, count: rows.length, missingCost, days: [...days.values()] }
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams
    const dateText = params.get('date') ?? marketDay()
    const date = parseDate(dateText)
    if (!date) throw new ProductionError('Indica una fecha válida.')
    if (params.get('view') === 'stock') return NextResponse.json(await stock(request, date, params))
    const summary = params.get('view') === 'summary'
    const weekly = summary || params.get('period') === 'week'
    const { from, to } = weekly ? marketWeek(dateText) : { from: dateText, to: dateText }
    const where = { cancelledAt: null, date: { gte: new Date(from + 'T00:00:00Z'), lte: endOfDay(new Date(to + 'T00:00:00Z')) } }
    if (summary) return NextResponse.json(await salesSummary(where, from, to))
    if (params.get('export') === 'csv') {
      const rows = await prisma.marketSale.findMany({
        where, include: saleInclude, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      })
      return exportSheet(rows, weekly ? from + '_a_' + to : dateText)
    }

    const { take, skip, result } = historyQuery(request, 50)
    const [rows, totals] = await prisma.$transaction([
      prisma.marketSale.findMany({
        where, include: saleInclude, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }], take, skip,
      }),
      prisma.marketSale.aggregate({ where, _sum: { total: true }, _count: true }),
    ], { isolationLevel: 'RepeatableRead' })
    const data = result(rows.map(saleData))
    return NextResponse.json({
      ...(Array.isArray(data) ? { rows: data, hasNext: false } : data),
      totals: { total: totals._sum.total ?? new Prisma.Decimal(0), count: totals._count }, from, to,
    })
  } catch (error) {
    return productionError(error, 'No se pudieron consultar los datos de ventas.')
  }
}

function draft(data: Record<string, unknown>) {
  const { receptionItemId } = data
  const date = parseDate(data.date)
  const quantity = parsePositiveDecimal(data.quantity)
  const unitPrice = parsePositiveDecimal(data.unitPrice)
  if (!date || String(data.date) > marketDay() || !quantity || !unitPrice ||
    typeof receptionItemId !== 'string' || !receptionItemId) {
    throw new ProductionError('Indica un recibo, una fecha hasta hoy, cantidad y precio positivo.')
  }
  const total = new Prisma.Decimal(quantity).mul(unitPrice).toDecimalPlaces(2)
  if (total.gte('1000000000000')) throw new ProductionError('El importe de la venta supera el máximo permitido.')
  return { receptionItemId, date, quantity, unitPrice, total } as const
}

async function save(request: Request, editing: boolean) {
  try {
    const body = await readBody(request)
    const input = draft(body)
    const id = editing ? body.id : body.requestId
    if (typeof id !== 'string' || !id || (!editing && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))) {
      throw new ProductionError('La solicitud de venta necesita un identificador válido.')
    }
    const actor = await currentActor()
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.marketSale.findUnique({ where: { id }, include: saleInclude })
      if (editing && (!existing || existing.cancelledAt)) throw new ProductionError('La venta ya no está disponible.', 404)
      if (editing && existing && body.updatedAt !== undefined && existing.updatedAt.toISOString() !== body.updatedAt) {
        throw new ProductionError('Esta venta cambió. Abre el registro actualizado antes de editarlo.', 409)
      }
      if (existing && !editing) {
        const matches = !existing.cancelledAt && existing.receptionItemId === input.receptionItemId &&
          existing.date.getTime() === input.date.getTime() && existing.quantity.eq(input.quantity) &&
          existing.unitPrice.eq(input.unitPrice)
        if (!matches) throw new ProductionError('La clave de solicitud ya corresponde a otra venta.', 409)
        return { sale: existing, created: false }
      }

      const product = await tx.receptionItem.findFirst({
        where: {
          id: input.receptionItemId, deletedAt: null,
          reception: { deletedAt: null, shipment: { deletedAt: null, status: { not: 'CANCELLED' } } },
          shipmentItem: { deletedAt: null },
        },
        include: productInclude,
      })
      if (!product) throw new ProductionError('El producto ya no está disponible en el recibo.', 404)
      if (marketDay(product.reception.receivedAt) > input.date.toISOString().slice(0, 10)) {
        throw new ProductionError('La fecha de venta debe ser igual o posterior a la recepción.')
      }
      const sold = await tx.marketSale.aggregate({
        where: { receptionItemId: product.id, cancelledAt: null, ...(editing ? { id: { not: id } } : {}) },
        _sum: { quantity: true },
      })
      const available = product.receivedQuantity.minus(sold._sum.quantity ?? 0)
      if (available.lt(input.quantity)) {
        throw new ProductionError(`La cantidad supera el saldo disponible de ${Prisma.Decimal.max(available, 0).toFixed(2)}.`, 409)
      }
      const sale = editing
        ? await tx.marketSale.update({ where: { id }, data: input, include: saleInclude })
        : await tx.marketSale.create({ data: { id, ...input, createdBy: actor }, include: saleInclude })
      await tx.auditLog.create({
        data: {
          entity: 'MarketSale', entityId: id, action: editing ? 'UPDATE' : 'CREATE', actor,
          beforeJson: existing ? JSON.parse(JSON.stringify(saleData(existing))) : undefined,
          afterJson: JSON.parse(JSON.stringify(saleData(sale))),
        },
      })
      return { sale, created: !editing }
    }, { isolationLevel: 'Serializable' })
    return NextResponse.json(saleData(result.sale), { status: result.created ? 201 : 200 })
  } catch (error) {
    return productionError(error, 'No se pudo guardar la venta.')
  }
}

export function POST(request: Request) { return save(request, false) }
export function PATCH(request: Request) { return save(request, true) }

export async function DELETE(request: Request) {
  try {
    const { id, updatedAt } = await readBody(request)
    if (typeof id !== 'string' || !id) throw new ProductionError('Selecciona la venta que quieres anular.')
    const actor = await currentActor()
    await prisma.$transaction(async (tx) => {
      const sale = await tx.marketSale.findUnique({ where: { id }, include: saleInclude })
      if (!sale) throw new ProductionError('Venta no encontrada.', 404)
      if (sale.cancelledAt) return
      if (updatedAt !== undefined && sale.updatedAt.toISOString() !== updatedAt) {
        throw new ProductionError('Esta venta cambió. Revisa el registro actualizado antes de anularlo.', 409)
      }
      await tx.marketSale.update({ where: { id }, data: { cancelledAt: new Date() } })
      await tx.auditLog.create({
        data: { entity: 'MarketSale', entityId: id, action: 'CANCEL', actor, beforeJson: JSON.parse(JSON.stringify(saleData(sale))) },
      })
    }, { isolationLevel: 'Serializable' })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return productionError(error, 'No se pudo anular la venta.')
  }
}
