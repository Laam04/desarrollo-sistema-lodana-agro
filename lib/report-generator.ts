import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ProductionError } from '@/lib/production-api'
import { productionAnalytics } from '@/lib/production-analytics'
import { getInstitutionConfig, type InstitutionConfig } from '@/lib/system-config'
import {
  ecuadorDateRangeToUtc,
  formatPeriodLabel,
  isFullCalendarMonthRange,
  previousEquivalentPeriod,
  validateReportDateRange,
} from '@/lib/report-periods'
import {
  buildDeterministicInsights,
  safePercentChange,
  type CropUnitBreakdown,
  type UnitMetricSummary,
} from '@/lib/report-insights'
import { shipmentStatusLabels } from '@/lib/shipment-status'

export const REPORT_TYPES = [
  'PRODUCTION',
  'COSTS',
  'SHIPMENTS_RECEPTIONS',
  'MARKET_SALES',
  'CONSOLIDATED_IMPACT',
  'WEEKLY_OPERATIONAL',
] as const

export type ReportType = (typeof REPORT_TYPES)[number]

export const REPORT_TYPE_META: Record<ReportType, { label: string; scope: 'Finca Experimental Lodana' | 'Agro Market' | 'Finca Experimental Lodana y Agro Market'; description: string }> = {
  PRODUCTION: {
    label: 'Reporte de producción agrícola',
    scope: 'Finca Experimental Lodana',
    description: 'Cosechas, producción útil, mermas por tipo y motivo, distribución por cultivo y zona, y evolución.',
  },
  COSTS: {
    label: 'Reporte de costos de producción',
    scope: 'Finca Experimental Lodana',
    description: 'Costos totales, gastos generales, distribución por categoría y cultivo, evolución e indicadores económicos.',
  },
  SHIPMENTS_RECEPTIONS: {
    label: 'Reporte de despachos y recepciones',
    scope: 'Finca Experimental Lodana y Agro Market',
    description: 'Cantidades enviadas, recibidas, diferencias de entrega y estado de envíos pendientes o parciales.',
  },
  MARKET_SALES: {
    label: 'Reporte comercial de Agro Market',
    scope: 'Agro Market',
    description: 'Total vendido, volumen comercializado por unidad, ventas por producto, ganancia bruta estimada y evolución.',
  },
  CONSOLIDATED_IMPACT: {
    label: 'Reporte consolidado de productividad y análisis de impacto',
    scope: 'Finca Experimental Lodana y Agro Market',
    description: 'Informe integral con indicadores de producción, costos, despachos, comercialización, estacionalidad y previsiones.',
  },
  WEEKLY_OPERATIONAL: {
    label: 'Reporte semanal de producción y comercialización',
    scope: 'Finca Experimental Lodana y Agro Market',
    description: 'Seguimiento operativo de lunes a domingo con cosechas, mermas, despachos, recepciones y ventas de Agro Market.',
  },
}

export function isReportType(value: unknown): value is ReportType {
  return typeof value === 'string' && (REPORT_TYPES as readonly string[]).includes(value)
}

export type ReportFilters = {
  cropId?: string | null
  cropName?: string | null
  unitId?: string | null
  unitName?: string | null
}

export type ReportKpiCard = {
  label: string
  value: string
  detail?: string
  delta?: number | null
}

export type ReportTable = {
  title: string
  subtitle?: string
  columns: { key: string; label: string; align?: 'left' | 'right' }[]
  rows: Record<string, string | number | null>[]
  emptyMessage?: string
}

export type ReportChart = {
  title: string
  unit: string
  kind: 'line' | 'bar'
  labels: string[]
  series: { label: string; color: 'green' | 'blue' | 'amber' | 'purple' | 'gray'; values: (number | null)[] }[]
}

export type ReportPayload = {
  version: 1
  type: ReportType
  title: string
  scope: string
  cadence: 'WEEKLY' | 'MONTHLY' | 'CUSTOM'
  period: {
    from: string
    to: string
    label: string
    previousFrom: string | null
    previousTo: string | null
    previousLabel: string | null
    comparable: boolean
  }
  filters: {
    cropId: string | null
    cropName: string | null
    unitId: string | null
    unitName: string | null
  }
  institution: InstitutionConfig
  generatedAt: string
  hasData: boolean
  kpis: ReportKpiCard[]
  charts: ReportChart[]
  tables: ReportTable[]
  seasonality?: {
    crop: string
    unit: string
    completeYears: number
    higherMonths: number[]
    lowerMonths: number[]
    typicalMonths: number[]
  }[]
  forecasts?: {
    crop: string
    unit: string
    observedMonths: number
    consecutiveMonths: number
    trend: number | null
    estimates: { month: string; value: number; low: number | null; high: number | null }[]
  }[]
  observations: string[]
  limitations: string[]
}

const numFmt = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 2 })
const usdFmt = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' })

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function fmtNum(n: number | null, unit = ''): string {
  if (n === null || !Number.isFinite(n)) return '—'
  return `${numFmt.format(round2(n))}${unit ? ` ${unit}` : ''}`
}

function fmtUsd(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—'
  return usdFmt.format(round2(n))
}

function fmtDelta(delta: number | null): string {
  if (delta === null) return 'No comparable'
  return `${delta > 0 ? '+' : ''}${numFmt.format(delta)}%`
}

async function resolveFilters(cropId?: string | null, unitId?: string | null) {
  const [crop, unit] = await Promise.all([
    cropId ? prisma.crop.findUnique({ where: { id: cropId }, select: { id: true, name: true } }) : null,
    unitId ? prisma.unit.findUnique({ where: { id: unitId }, select: { id: true, name: true } }) : null,
  ])
  if (cropId && !crop) throw new ProductionError('El cultivo seleccionado no existe.', 404)
  if (unitId && !unit) throw new ProductionError('La unidad de medida seleccionada no existe.', 404)
  return {
    cropId: crop?.id ?? null,
    cropName: crop?.name ?? null,
    unitId: unit?.id ?? null,
    unitName: unit?.name ?? null,
  }
}

async function queryProductionData(from: string, to: string, cropId: string | null, unitId: string | null) {
  const { dateStart, dateEndExclusive } = ecuadorDateRangeToUtc(from, to)

  const [harvests, losses] = await Promise.all([
    prisma.harvest.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        date: { gte: dateStart, lt: dateEndExclusive },
        ...(cropId ? { cropId } : {}),
        ...(unitId ? { unitId } : {}),
      },
      include: {
        crop: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true } },
        productionArea: { select: { name: true, zone: { select: { name: true } } } },
        losses: {
          where: { deletedAt: null, status: 'ACTIVE', affectsHarvest: true },
          select: { quantity: true },
        },
      },
      orderBy: { date: 'asc' },
    }),
    prisma.loss.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        date: { gte: dateStart, lt: dateEndExclusive },
        harvest: {
          deletedAt: null,
          status: 'ACTIVE',
          ...(cropId ? { cropId } : {}),
          ...(unitId ? { unitId } : {}),
        },
      },
      include: {
        reason: { select: { name: true } },
        harvest: {
          select: {
            crop: { select: { id: true, name: true } },
            unit: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { date: 'asc' },
    }),
  ])

  const byUnit = new Map<string, UnitMetricSummary>()
  const byCropUnit = new Map<string, CropUnitBreakdown>()
  const byZoneUnit = new Map<string, { zone: string; unit: string; harvested: number; useful: number; count: number }>()
  const byBucketUnit = new Map<string, { bucket: string; unit: string; harvested: number; useful: number; losses: number }>()
  const byReasonUnit = new Map<string, { reason: string; unit: string; quantity: number; count: number }>()

  const useDaily = from.slice(0, 7) === to.slice(0, 7)
  const bucketOf = (d: Date) => (useDaily ? d.toISOString().slice(0, 10) : d.toISOString().slice(0, 7))

  for (const h of harvests) {
    const unit = h.unit.name
    const crop = h.crop.name
    const qty = h.quantity.toNumber()
    const deducted = h.losses.reduce((sum, l) => sum + l.quantity.toNumber(), 0)
    const useful = Math.max(0, qty - deducted)

    const uEntry = byUnit.get(unit) ?? {
      unit,
      harvested: 0,
      useful: 0,
      losses: 0,
      affectingLosses: 0,
      statisticalLosses: 0,
      unclassifiedLosses: 0,
      harvestCount: 0,
    }
    uEntry.harvested += qty
    uEntry.useful += useful
    uEntry.harvestCount += 1
    byUnit.set(unit, uEntry)

    const cuKey = `${crop}||${unit}`
    const cu = byCropUnit.get(cuKey) ?? { crop, unit, harvested: 0, useful: 0, losses: 0, harvestCount: 0 }
    cu.harvested += qty
    cu.useful += useful
    cu.harvestCount += 1
    byCropUnit.set(cuKey, cu)

    const zoneName = h.productionArea?.zone?.name ?? h.productionArea?.name ?? 'Sin zona asignada'
    const zuKey = `${zoneName}||${unit}`
    const zu = byZoneUnit.get(zuKey) ?? { zone: zoneName, unit, harvested: 0, useful: 0, count: 0 }
    zu.harvested += qty
    zu.useful += useful
    zu.count += 1
    byZoneUnit.set(zuKey, zu)

    const bucket = bucketOf(h.date)
    const buKey = `${bucket}||${unit}`
    const bu = byBucketUnit.get(buKey) ?? { bucket, unit, harvested: 0, useful: 0, losses: 0 }
    bu.harvested += qty
    bu.useful += useful
    byBucketUnit.set(buKey, bu)
  }

  for (const l of losses) {
    const unit = l.harvest.unit.name
    const crop = l.harvest.crop.name
    const qty = l.quantity.toNumber()

    const uEntry = byUnit.get(unit) ?? {
      unit,
      harvested: 0,
      useful: 0,
      losses: 0,
      affectingLosses: 0,
      statisticalLosses: 0,
      unclassifiedLosses: 0,
      harvestCount: 0,
    }
    uEntry.losses += qty
    if (l.affectsHarvest === true) uEntry.affectingLosses += qty
    else if (l.affectsHarvest === false) uEntry.statisticalLosses += qty
    else uEntry.unclassifiedLosses += qty
    byUnit.set(unit, uEntry)

    const cuKey = `${crop}||${unit}`
    const cu = byCropUnit.get(cuKey) ?? { crop, unit, harvested: 0, useful: 0, losses: 0, harvestCount: 0 }
    cu.losses += qty
    byCropUnit.set(cuKey, cu)

    const bucket = bucketOf(l.date)
    const buKey = `${bucket}||${unit}`
    const bu = byBucketUnit.get(buKey) ?? { bucket, unit, harvested: 0, useful: 0, losses: 0 }
    bu.losses += qty
    byBucketUnit.set(buKey, bu)

    const ruKey = `${l.reason.name}||${unit}`
    const ru = byReasonUnit.get(ruKey) ?? { reason: l.reason.name, unit, quantity: 0, count: 0 }
    ru.quantity += qty
    ru.count += 1
    byReasonUnit.set(ruKey, ru)
  }

  return {
    hasData: harvests.length > 0 || losses.length > 0,
    byUnit: [...byUnit.values()].toSorted((a, b) => a.unit.localeCompare(b.unit, 'es')),
    byCropUnit: [...byCropUnit.values()].toSorted((a, b) => a.unit.localeCompare(b.unit, 'es') || b.harvested - a.harvested),
    byZoneUnit: [...byZoneUnit.values()].toSorted((a, b) => a.unit.localeCompare(b.unit, 'es') || b.harvested - a.harvested),
    byBucketUnit: [...byBucketUnit.values()].toSorted((a, b) => a.bucket.localeCompare(b.bucket)),
    byReasonUnit: [...byReasonUnit.values()].toSorted((a, b) => b.quantity - a.quantity),
  }
}

async function queryCostsData(from: string, to: string, cropId: string | null) {
  const { dateStart, dateEndExclusive } = ecuadorDateRangeToUtc(from, to)

  const costs = await prisma.cost.findMany({
    where: {
      deletedAt: null,
      date: { gte: dateStart, lt: dateEndExclusive },
      ...(cropId
        ? { allocations: { some: { deletedAt: null, cropId } } }
        : {}),
    },
    include: {
      category: { select: { name: true } },
      subcategory: { select: { name: true } },
      allocations: {
        where: { deletedAt: null },
        include: { crop: { select: { id: true, name: true } } },
      },
    },
    orderBy: { date: 'asc' },
  })

  let totalUsd = 0
  let directUsd = 0
  let generalUsd = 0

  const byCategory = new Map<string, { category: string; amountUsd: number; count: number }>()
  const byCrop = new Map<string, { cropId: string; crop: string; amountUsd: number; count: number }>()
  const byBucket = new Map<string, { bucket: string; totalUsd: number; directUsd: number; generalUsd: number }>()

  const useDaily = from.slice(0, 7) === to.slice(0, 7)
  const bucketOf = (d: Date) => (useDaily ? d.toISOString().slice(0, 10) : d.toISOString().slice(0, 7))

  for (const c of costs) {
    const costAmount = c.amountUsd.toNumber()
    const bucket = bucketOf(c.date)

    if (cropId) {
      // Solo la porción asignada al cultivo filtrado
      const alloc = c.allocations.find((a) => a.cropId === cropId)
      if (!alloc) continue
      const share = alloc.amountUsd !== null
        ? alloc.amountUsd.toNumber()
        : alloc.percent !== null
          ? round2(costAmount * (alloc.percent.toNumber() / 100))
          : 0
      totalUsd += share
      directUsd += share

      const cat = byCategory.get(c.category.name) ?? { category: c.category.name, amountUsd: 0, count: 0 }
      cat.amountUsd += share
      cat.count += 1
      byCategory.set(c.category.name, cat)

      const cropName = alloc.crop?.name ?? 'Cultivo'
      const cropEntry = byCrop.get(cropId) ?? { cropId, crop: cropName, amountUsd: 0, count: 0 }
      cropEntry.amountUsd += share
      cropEntry.count += 1
      byCrop.set(cropId, cropEntry)

      const b = byBucket.get(bucket) ?? { bucket, totalUsd: 0, directUsd: 0, generalUsd: 0 }
      b.totalUsd += share
      b.directUsd += share
      byBucket.set(bucket, b)
      continue
    }

    totalUsd += costAmount
    const isGeneral = c.applicationType === 'GENERAL' || c.allocations.length === 0
    if (isGeneral) generalUsd += costAmount
    else directUsd += costAmount

    const cat = byCategory.get(c.category.name) ?? { category: c.category.name, amountUsd: 0, count: 0 }
    cat.amountUsd += costAmount
    cat.count += 1
    byCategory.set(c.category.name, cat)

    const b = byBucket.get(bucket) ?? { bucket, totalUsd: 0, directUsd: 0, generalUsd: 0 }
    b.totalUsd += costAmount
    if (isGeneral) b.generalUsd += costAmount
    else b.directUsd += costAmount
    byBucket.set(bucket, b)

    if (!isGeneral) {
      for (const alloc of c.allocations) {
        if (!alloc.cropId || !alloc.crop) continue
        const share = alloc.amountUsd !== null
          ? alloc.amountUsd.toNumber()
          : alloc.percent !== null
            ? round2(costAmount * (alloc.percent.toNumber() / 100))
            : 0
        const ce = byCrop.get(alloc.cropId) ?? { cropId: alloc.cropId, crop: alloc.crop.name, amountUsd: 0, count: 0 }
        ce.amountUsd += share
        ce.count += 1
        byCrop.set(alloc.cropId, ce)
      }
    }
  }

  return {
    hasData: costs.length > 0,
    recordCount: costs.length,
    totalUsd: round2(totalUsd),
    directUsd: round2(directUsd),
    generalUsd: round2(generalUsd),
    byCategory: [...byCategory.values()].toSorted((a, b) => b.amountUsd - a.amountUsd),
    byCrop: [...byCrop.values()].toSorted((a, b) => b.amountUsd - a.amountUsd),
    byBucket: [...byBucket.values()].toSorted((a, b) => a.bucket.localeCompare(b.bucket)),
  }
}

async function queryShipmentsReceptionsData(from: string, to: string, cropId: string | null, unitId: string | null) {
  const { dateStart, dateEndExclusive } = ecuadorDateRangeToUtc(from, to)

  const shipments = await prisma.shipment.findMany({
    where: {
      deletedAt: null,
      date: { gte: dateStart, lt: dateEndExclusive },
      ...(cropId || unitId
        ? {
            items: {
              some: {
                deletedAt: null,
                ...(cropId ? { cropId } : {}),
                ...(unitId ? { unitId } : {}),
              },
            },
          }
        : {}),
    },
    include: {
      items: {
        where: {
          deletedAt: null,
          ...(cropId ? { cropId } : {}),
          ...(unitId ? { unitId } : {}),
        },
        include: {
          crop: { select: { name: true } },
          variety: { select: { name: true } },
          unit: { select: { name: true } },
          receptionItems: {
            where: { deletedAt: null, reception: { deletedAt: null } },
            select: { receivedQuantity: true },
          },
        },
      },
      receptions: {
        where: { deletedAt: null },
        select: { id: true, receiptNumber: true, receivedAt: true, closesWithDifferences: true },
      },
    },
    orderBy: [{ date: 'desc' }, { code: 'desc' }],
  })

  const counts = { total: 0, pending: 0, partial: 0, received: 0, withDifferences: 0, cancelled: 0 }
  const byUnit = new Map<string, { unit: string; shipped: number; received: number; difference: number }>()
  const byCropUnit = new Map<string, { crop: string; unit: string; shipped: number; received: number; difference: number }>()
  const attentionRows: { code: string; date: string; status: string; itemsSummary: string; pendingSummary: string }[] = []

  for (const s of shipments) {
    if (s.status === 'CANCELLED') {
      counts.cancelled += 1
      continue
    }
    counts.total += 1
    if (s.status === 'IN_TRANSIT' || s.status === 'ACTIVE') counts.pending += 1
    else if (s.status === 'PARTIALLY_RECEIVED') counts.partial += 1
    else if (s.status === 'RECEIVED') counts.received += 1
    else if (s.status === 'RECEIVED_WITH_DIFFERENCES') counts.withDifferences += 1

    const itemNotes: string[] = []
    const diffNotes: string[] = []

    for (const item of s.items) {
      const sent = item.quantity.toNumber()
      const rec = item.receptionItems.reduce((sum, r) => sum + r.receivedQuantity.toNumber(), 0)
      const diff = Math.max(0, round2(sent - rec))
      const unit = item.unit.name
      const crop = item.crop.name

      const u = byUnit.get(unit) ?? { unit, shipped: 0, received: 0, difference: 0 }
      u.shipped += sent
      u.received += rec
      u.difference += diff
      byUnit.set(unit, u)

      const cuKey = `${crop}||${unit}`
      const cu = byCropUnit.get(cuKey) ?? { crop, unit, shipped: 0, received: 0, difference: 0 }
      cu.shipped += sent
      cu.received += rec
      cu.difference += diff
      byCropUnit.set(cuKey, cu)

      itemNotes.push(`${crop}: ${fmtNum(sent, unit)}`)
      if (diff > 0) diffNotes.push(`${crop}: ${fmtNum(diff, unit)}`)
    }

    if (s.status !== 'RECEIVED') {
      attentionRows.push({
        code: s.code,
        date: s.date.toISOString().slice(0, 10),
        status: shipmentStatusLabels[s.status] ?? s.status,
        itemsSummary: itemNotes.join(' · '),
        pendingSummary: diffNotes.length ? diffNotes.join(' · ') : 'Sin saldo pendiente',
      })
    }
  }

  return {
    hasData: shipments.length > 0,
    counts,
    byUnit: [...byUnit.values()].toSorted((a, b) => a.unit.localeCompare(b.unit, 'es')),
    byCropUnit: [...byCropUnit.values()].toSorted((a, b) => a.unit.localeCompare(b.unit, 'es') || b.shipped - a.shipped),
    attentionRows,
  }
}

async function queryMarketSalesData(from: string, to: string, cropId: string | null, unitId: string | null) {
  const { dateStart, dateEndExclusive } = ecuadorDateRangeToUtc(from, to)

  const whereBase: Prisma.MarketSaleWhereInput = {
    date: { gte: dateStart, lt: dateEndExclusive },
    receptionItem: {
      deletedAt: null,
      reception: { deletedAt: null, shipment: { deletedAt: null, status: { not: 'CANCELLED' } } },
      shipmentItem: {
        deletedAt: null,
        ...(cropId ? { cropId } : {}),
        ...(unitId ? { unitId } : {}),
      },
    },
  }

  const [activeSales, cancelledCount] = await Promise.all([
    prisma.marketSale.findMany({
      where: { ...whereBase, cancelledAt: null },
      include: {
        receptionItem: {
          select: {
            shipmentItem: {
              select: {
                estimatedUnitPrice: true,
                crop: { select: { name: true } },
                variety: { select: { name: true } },
                unit: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { date: 'asc' },
    }),
    prisma.marketSale.count({
      where: { ...whereBase, cancelledAt: { not: null } },
    }),
  ])

  let totalSalesUsd = new Prisma.Decimal(0)
  let grossProfit = new Prisma.Decimal(0)
  let missingCostCount = 0

  const byUnit = new Map<string, { unit: string; quantity: number; totalUsd: number; count: number }>()
  const byProduct = new Map<string, {
    product: string
    unit: string
    quantity: number
    totalUsd: number
    grossProfitUsd: number | null
    costCoveredCount: number
    count: number
  }>()
  const byBucket = new Map<string, { bucket: string; totalUsd: number; count: number }>()

  const useDaily = from.slice(0, 7) === to.slice(0, 7)
  const bucketOf = (d: Date) => (useDaily ? d.toISOString().slice(0, 10) : d.toISOString().slice(0, 7))

  for (const sale of activeSales) {
    const si = sale.receptionItem.shipmentItem
    const unit = si.unit.name
    const productLabel = [si.crop.name, si.variety?.name].filter(Boolean).join(' · ')
    const qty = sale.quantity.toNumber()
    const total = sale.total.toNumber()

    totalSalesUsd = totalSalesUsd.plus(sale.total)

    let saleProfit: number | null = null
    if (si.estimatedUnitPrice && si.estimatedUnitPrice.gt(0)) {
      const p = sale.total.minus(si.estimatedUnitPrice.mul(sale.quantity).toDecimalPlaces(2))
      grossProfit = grossProfit.plus(p)
      saleProfit = p.toNumber()
    } else {
      missingCostCount += 1
    }

    const u = byUnit.get(unit) ?? { unit, quantity: 0, totalUsd: 0, count: 0 }
    u.quantity += qty
    u.totalUsd += total
    u.count += 1
    byUnit.set(unit, u)

    const pKey = `${productLabel}||${unit}`
    const pe = byProduct.get(pKey) ?? {
      product: productLabel,
      unit,
      quantity: 0,
      totalUsd: 0,
      grossProfitUsd: null,
      costCoveredCount: 0,
      count: 0,
    }
    pe.quantity += qty
    pe.totalUsd += total
    pe.count += 1
    if (saleProfit !== null) {
      pe.grossProfitUsd = round2((pe.grossProfitUsd ?? 0) + saleProfit)
      pe.costCoveredCount += 1
    }
    byProduct.set(pKey, pe)

    const bucket = bucketOf(sale.date)
    const b = byBucket.get(bucket) ?? { bucket, totalUsd: 0, count: 0 }
    b.totalUsd += total
    b.count += 1
    byBucket.set(bucket, b)
  }

  const hasCoveredProfit = activeSales.length > missingCostCount

  return {
    hasData: activeSales.length > 0 || cancelledCount > 0,
    totalSalesUsd: totalSalesUsd.toNumber(),
    salesCount: activeSales.length,
    cancelledCount,
    grossProfitUsd: hasCoveredProfit ? grossProfit.toNumber() : null,
    missingCostCount,
    byUnit: [...byUnit.values()].toSorted((a, b) => a.unit.localeCompare(b.unit, 'es')),
    byProduct: [...byProduct.values()].toSorted((a, b) => b.totalUsd - a.totalUsd),
    byBucket: [...byBucket.values()].toSorted((a, b) => a.bucket.localeCompare(b.bucket)),
  }
}

function buildProductionCharts(
  byBucketUnit: { bucket: string; unit: string; harvested: number; useful: number; losses: number }[],
): ReportChart[] {
  const units = [...new Set(byBucketUnit.map((r) => r.unit))].toSorted((a, b) => a.localeCompare(b, 'es'))
  const charts: ReportChart[] = []
  for (const unit of units.slice(0, 3)) {
    const rows = byBucketUnit.filter((r) => r.unit === unit)
    const labels = [...new Set(rows.map((r) => r.bucket))].toSorted()
    if (labels.length === 0) continue
    const byBucket = new Map(rows.map((r) => [r.bucket, r]))
    charts.push({
      title: `Evolución de producción y mermas (${unit})`,
      unit,
      kind: labels.length <= 2 ? 'bar' : 'line',
      labels,
      series: [
        { label: 'Cosechado', color: 'green', values: labels.map((l) => round2(byBucket.get(l)?.harvested ?? 0)) },
        { label: 'Producción útil', color: 'blue', values: labels.map((l) => round2(byBucket.get(l)?.useful ?? 0)) },
        { label: 'Mermas', color: 'amber', values: labels.map((l) => round2(byBucket.get(l)?.losses ?? 0)) },
      ],
    })
  }
  return charts
}

export async function buildReportPayload(params: {
  type: ReportType
  from: string
  to: string
  cadence?: 'WEEKLY' | 'MONTHLY' | 'CUSTOM'
  cropId?: string | null
  unitId?: string | null
  now?: Date
}): Promise<ReportPayload> {
  const validation = validateReportDateRange(params.from, params.to)
  if (!validation.ok) throw new ProductionError(validation.error, 400)

  const now = params.now ?? new Date()
  const cadence = params.cadence ?? (isFullCalendarMonthRange(params.from, params.to) ? 'MONTHLY' : 'CUSTOM')
  const [filters, institution] = await Promise.all([
    resolveFilters(params.cropId, params.unitId),
    getInstitutionConfig(),
  ])

  const periodLabel = formatPeriodLabel(params.from, params.to, cadence)
  const prev = previousEquivalentPeriod(params.from, params.to, now)
  const meta = REPORT_TYPE_META[params.type]

  const basePayload: Omit<ReportPayload, 'hasData' | 'kpis' | 'charts' | 'tables' | 'observations' | 'limitations'> = {
    version: 1,
    type: params.type,
    title: meta.label,
    scope: meta.scope,
    cadence,
    period: {
      from: params.from,
      to: params.to,
      label: periodLabel,
      previousFrom: prev.comparable ? prev.from : null,
      previousTo: prev.comparable ? prev.to : null,
      previousLabel: prev.comparable ? prev.label : null,
      comparable: prev.comparable,
    },
    filters,
    institution,
    generatedAt: now.toISOString(),
  }

  // 1. REPORTE DE PRODUCCIÓN AGRÍCOLA
  if (params.type === 'PRODUCTION') {
    const [curr, prevProd] = await Promise.all([
      queryProductionData(params.from, params.to, filters.cropId, filters.unitId),
      prev.comparable ? queryProductionData(prev.from, prev.to, filters.cropId, filters.unitId) : null,
    ])

    const prevByUnit = new Map((prevProd?.byUnit ?? []).map((u) => [u.unit, u]))
    const prevByCropUnit = new Map((prevProd?.byCropUnit ?? []).map((c) => [`${c.crop}||${c.unit}`, c]))

    const unitsWithPrev: UnitMetricSummary[] = curr.byUnit.map((u) => {
      const p = prevByUnit.get(u.unit)
      return {
        ...u,
        previousHarvested: prev.comparable ? (p?.harvested ?? null) : undefined,
        previousUseful: prev.comparable ? (p?.useful ?? null) : undefined,
        previousLosses: prev.comparable ? (p?.losses ?? null) : undefined,
      }
    })

    const cropsWithPrev: CropUnitBreakdown[] = curr.byCropUnit.map((c) => ({
      ...c,
      previousHarvested: prev.comparable ? (prevByCropUnit.get(`${c.crop}||${c.unit}`)?.harvested ?? null) : undefined,
    }))

    const totalHarvestRecords = curr.byUnit.reduce((s, u) => s + u.harvestCount, 0)
    const kpis: ReportKpiCard[] = [
      { label: 'Cosechas registradas', value: numFmt.format(totalHarvestRecords), detail: `${curr.byUnit.length} unidad(es) con movimiento` },
      ...unitsWithPrev.slice(0, 3).map((u) => ({
        label: `Cosechado (${u.unit})`,
        value: fmtNum(u.harvested, u.unit),
        detail: `Útil: ${fmtNum(u.useful, u.unit)} · Mermas: ${fmtNum(u.losses, u.unit)}`,
        delta: prev.comparable ? safePercentChange(u.harvested, u.previousHarvested ?? null) : null,
      })),
    ]

    const tables: ReportTable[] = [
      {
        title: 'Resumen por unidad de medida',
        subtitle: 'Cada fila agrupa únicamente registros en la misma unidad de medida.',
        columns: [
          { key: 'unit', label: 'Unidad' },
          { key: 'harvestCount', label: 'Cosechas', align: 'right' },
          { key: 'harvested', label: 'Cosechado', align: 'right' },
          { key: 'useful', label: 'Producción útil', align: 'right' },
          { key: 'losses', label: 'Mermas totales', align: 'right' },
          { key: 'delta', label: 'Var. cosechado', align: 'right' },
        ],
        rows: unitsWithPrev.map((u) => ({
          unit: u.unit,
          harvestCount: u.harvestCount,
          harvested: fmtNum(u.harvested),
          useful: fmtNum(u.useful),
          losses: fmtNum(u.losses),
          delta: fmtDelta(prev.comparable ? safePercentChange(u.harvested, u.previousHarvested ?? null) : null),
        })),
        emptyMessage: 'Sin cosechas ni mermas registradas en este período.',
      },
      {
        title: 'Distribución por cultivo y unidad',
        columns: [
          { key: 'crop', label: 'Cultivo' },
          { key: 'unit', label: 'Unidad' },
          { key: 'harvestCount', label: 'Cosechas', align: 'right' },
          { key: 'harvested', label: 'Cosechado', align: 'right' },
          { key: 'useful', label: 'Producción útil', align: 'right' },
          { key: 'losses', label: 'Mermas', align: 'right' },
          { key: 'delta', label: 'Var. vs anterior', align: 'right' },
        ],
        rows: cropsWithPrev.map((c) => ({
          crop: c.crop,
          unit: c.unit,
          harvestCount: c.harvestCount,
          harvested: fmtNum(c.harvested),
          useful: fmtNum(c.useful),
          losses: fmtNum(c.losses),
          delta: fmtDelta(prev.comparable ? safePercentChange(c.harvested, c.previousHarvested ?? null) : null),
        })),
        emptyMessage: 'Sin registros por cultivo.',
      },
      {
        title: 'Distribución por zona / área de producción',
        columns: [
          { key: 'zone', label: 'Zona / Área' },
          { key: 'unit', label: 'Unidad' },
          { key: 'count', label: 'Cosechas', align: 'right' },
          { key: 'harvested', label: 'Cosechado', align: 'right' },
          { key: 'useful', label: 'Producción útil', align: 'right' },
        ],
        rows: curr.byZoneUnit.map((z) => ({
          zone: z.zone,
          unit: z.unit,
          count: z.count,
          harvested: fmtNum(z.harvested),
          useful: fmtNum(z.useful),
        })),
        emptyMessage: 'Sin registros asociados a zonas.',
      },
    ]

    if (curr.byReasonUnit.length > 0) {
      tables.push({
        title: 'Motivos de merma registrados',
        columns: [
          { key: 'reason', label: 'Motivo' },
          { key: 'unit', label: 'Unidad' },
          { key: 'count', label: 'Registros', align: 'right' },
          { key: 'quantity', label: 'Cantidad', align: 'right' },
        ],
        rows: curr.byReasonUnit.slice(0, 15).map((r) => ({
          reason: r.reason,
          unit: r.unit,
          count: r.count,
          quantity: fmtNum(r.quantity),
        })),
      })
    }

    const insights = buildDeterministicInsights({
      periodLabel,
      comparable: prev.comparable,
      comparisonReason: prev.reason,
      productionByUnit: unitsWithPrev,
      cropBreakdown: cropsWithPrev,
      hasMultipleUnits: unitsWithPrev.length > 1,
    })

    return {
      ...basePayload,
      hasData: curr.hasData,
      kpis,
      charts: buildProductionCharts(curr.byBucketUnit),
      tables,
      observations: insights.observations,
      limitations: insights.limitations,
    }
  }

  // 2. REPORTE DE COSTOS DE PRODUCCIÓN
  if (params.type === 'COSTS') {
    const [currCosts, prevCosts, currProd] = await Promise.all([
      queryCostsData(params.from, params.to, filters.cropId),
      prev.comparable ? queryCostsData(prev.from, prev.to, filters.cropId) : null,
      queryProductionData(params.from, params.to, filters.cropId, filters.unitId),
    ])

    const deltaTotal = prev.comparable ? safePercentChange(currCosts.totalUsd, prevCosts?.totalUsd ?? null) : null
    const kpis: ReportKpiCard[] = [
      { label: 'Total costos registrados', value: fmtUsd(currCosts.totalUsd), detail: `${currCosts.recordCount} registros`, delta: deltaTotal },
      { label: 'Costos asignados a cultivos', value: fmtUsd(currCosts.directUsd), detail: currCosts.totalUsd > 0 ? `${numFmt.format(round2((currCosts.directUsd / currCosts.totalUsd) * 100))}% del total` : 'Sin costos' },
      { label: 'Gastos generales', value: fmtUsd(currCosts.generalUsd), detail: currCosts.totalUsd > 0 ? `${numFmt.format(round2((currCosts.generalUsd / currCosts.totalUsd) * 100))}% del total` : 'Sin costos' },
      { label: 'Categorías con movimiento', value: String(currCosts.byCategory.length), detail: currCosts.byCategory[0] ? `Mayor: ${currCosts.byCategory[0].category}` : 'Sin registros' },
    ]

    // Indicador económico válido: costo directo por unidad útil por (cultivo, unidad)
    const costByCropName = new Map(currCosts.byCrop.map((c) => [c.crop, c.amountUsd]))
    const unitCostRows = currProd.byCropUnit
      .filter((cu) => cu.useful > 0 && (costByCropName.get(cu.crop) ?? 0) > 0)
      .map((cu) => {
        const directCost = costByCropName.get(cu.crop)!
        // Solo si el cultivo se mide en una única unidad en este período para no asignar el mismo costo a 2 unidades
        const unitsForCrop = currProd.byCropUnit.filter((other) => other.crop === cu.crop).length
        return {
          crop: cu.crop,
          unit: cu.unit,
          directCostUsd: fmtUsd(directCost),
          useful: fmtNum(cu.useful, cu.unit),
          costPerUnit: unitsForCrop === 1 ? `${fmtUsd(directCost / cu.useful)} / ${cu.unit}` : 'Múltiples unidades (no prorrateable)',
        }
      })

    const charts: ReportChart[] = currCosts.byBucket.length > 0
      ? [{
          title: 'Evolución de costos de producción (USD)',
          unit: 'USD',
          kind: currCosts.byBucket.length <= 2 ? 'bar' : 'line',
          labels: currCosts.byBucket.map((b) => b.bucket),
          series: [
            { label: 'Total USD', color: 'green', values: currCosts.byBucket.map((b) => round2(b.totalUsd)) },
            { label: 'Asignados a cultivo', color: 'blue', values: currCosts.byBucket.map((b) => round2(b.directUsd)) },
            { label: 'Gastos generales', color: 'amber', values: currCosts.byBucket.map((b) => round2(b.generalUsd)) },
          ],
        }]
      : []

    const tables: ReportTable[] = [
      {
        title: 'Distribución de costos por categoría',
        columns: [
          { key: 'category', label: 'Categoría' },
          { key: 'count', label: 'Registros', align: 'right' },
          { key: 'amountUsd', label: 'Monto (USD)', align: 'right' },
          { key: 'share', label: 'Participación', align: 'right' },
        ],
        rows: currCosts.byCategory.map((c) => ({
          category: c.category,
          count: c.count,
          amountUsd: fmtUsd(c.amountUsd),
          share: currCosts.totalUsd > 0 ? `${numFmt.format(round2((c.amountUsd / currCosts.totalUsd) * 100))}%` : '—',
        })),
        emptyMessage: 'Sin costos registrados en el período.',
      },
      {
        title: 'Costos asignados por cultivo',
        subtitle: 'Incluye asignaciones por monto fijo o porcentaje; excluye gastos generales.',
        columns: [
          { key: 'crop', label: 'Cultivo' },
          { key: 'count', label: 'Asignaciones', align: 'right' },
          { key: 'amountUsd', label: 'Monto asignado (USD)', align: 'right' },
          { key: 'share', label: '% de costos directos', align: 'right' },
        ],
        rows: currCosts.byCrop.map((c) => ({
          crop: c.crop,
          count: c.count,
          amountUsd: fmtUsd(c.amountUsd),
          share: currCosts.directUsd > 0 ? `${numFmt.format(round2((c.amountUsd / currCosts.directUsd) * 100))}%` : '—',
        })),
        emptyMessage: 'Sin costos asignados directamente a cultivos.',
      },
      {
        title: 'Indicador económico: costo directo por unidad útil',
        subtitle: 'Calculado solo cuando existen costos directos y producción útil positiva en una única unidad para el cultivo.',
        columns: [
          { key: 'crop', label: 'Cultivo' },
          { key: 'directCostUsd', label: 'Costo directo', align: 'right' },
          { key: 'useful', label: 'Producción útil', align: 'right' },
          { key: 'costPerUnit', label: 'Costo directo / unidad útil', align: 'right' },
        ],
        rows: unitCostRows,
        emptyMessage: 'No hay cultivos con simultáneamente costos directos asignados y producción útil positiva en el período.',
      },
    ]

    const insights = buildDeterministicInsights({
      periodLabel,
      comparable: prev.comparable,
      comparisonReason: prev.reason,
      costs: {
        totalUsd: currCosts.totalUsd,
        directUsd: currCosts.directUsd,
        generalUsd: currCosts.generalUsd,
        recordCount: currCosts.recordCount,
        previousTotalUsd: prev.comparable ? (prevCosts?.totalUsd ?? null) : undefined,
        topCategory: currCosts.byCategory[0] ? { name: currCosts.byCategory[0].category, amountUsd: currCosts.byCategory[0].amountUsd } : null,
      },
    })

    return {
      ...basePayload,
      hasData: currCosts.hasData,
      kpis,
      charts,
      tables,
      observations: insights.observations,
      limitations: insights.limitations,
    }
  }

  // 3. REPORTE DE DESPACHOS Y RECEPCIONES
  if (params.type === 'SHIPMENTS_RECEPTIONS') {
    const data = await queryShipmentsReceptionsData(params.from, params.to, filters.cropId, filters.unitId)
    const kpis: ReportKpiCard[] = [
      { label: 'Despachos activos', value: String(data.counts.total), detail: data.counts.cancelled > 0 ? `${data.counts.cancelled} cancelados excluidos` : 'Sin cancelaciones' },
      { label: 'Recibidos completos', value: String(data.counts.received), detail: 'Sin saldo pendiente' },
      { label: 'Pendientes / parciales', value: String(data.counts.pending + data.counts.partial), detail: `${data.counts.pending} en tránsito · ${data.counts.partial} parciales` },
      { label: 'Cerrados con diferencias', value: String(data.counts.withDifferences), detail: 'Requieren revisión operativa' },
    ]

    const charts: ReportChart[] = data.byUnit.length > 0
      ? [{
          title: 'Cantidades despachadas vs recibidas por unidad',
          unit: 'por unidad',
          kind: 'bar',
          labels: data.byUnit.map((u) => u.unit),
          series: [
            { label: 'Despachado', color: 'blue', values: data.byUnit.map((u) => round2(u.shipped)) },
            { label: 'Recibido', color: 'green', values: data.byUnit.map((u) => round2(u.received)) },
            { label: 'Diferencia', color: 'amber', values: data.byUnit.map((u) => round2(u.difference)) },
          ],
        }]
      : []

    const tables: ReportTable[] = [
      {
        title: 'Balance de despachos y recepciones por unidad',
        subtitle: 'Despachado y recibido se comparan exclusivamente dentro de cada unidad.',
        columns: [
          { key: 'unit', label: 'Unidad' },
          { key: 'shipped', label: 'Despachado', align: 'right' },
          { key: 'received', label: 'Recibido', align: 'right' },
          { key: 'difference', label: 'Diferencia', align: 'right' },
          { key: 'fulfillment', label: '% recibido', align: 'right' },
        ],
        rows: data.byUnit.map((u) => ({
          unit: u.unit,
          shipped: fmtNum(u.shipped),
          received: fmtNum(u.received),
          difference: fmtNum(u.difference),
          fulfillment: u.shipped > 0 ? `${numFmt.format(round2((u.received / u.shipped) * 100))}%` : '—',
        })),
        emptyMessage: 'Sin despachos activos en el período.',
      },
      {
        title: 'Detalle por cultivo y unidad',
        columns: [
          { key: 'crop', label: 'Cultivo' },
          { key: 'unit', label: 'Unidad' },
          { key: 'shipped', label: 'Despachado', align: 'right' },
          { key: 'received', label: 'Recibido', align: 'right' },
          { key: 'difference', label: 'Diferencia', align: 'right' },
        ],
        rows: data.byCropUnit.map((c) => ({
          crop: c.crop,
          unit: c.unit,
          shipped: fmtNum(c.shipped),
          received: fmtNum(c.received),
          difference: fmtNum(c.difference),
        })),
        emptyMessage: 'Sin líneas de despacho en el período.',
      },
      {
        title: 'Despachos pendientes, parciales o cerrados con diferencias',
        columns: [
          { key: 'code', label: 'Código' },
          { key: 'date', label: 'Fecha' },
          { key: 'status', label: 'Estado' },
          { key: 'itemsSummary', label: 'Enviado' },
          { key: 'pendingSummary', label: 'Saldo / Diferencia' },
        ],
        rows: data.attentionRows.slice(0, 30),
        emptyMessage: 'Todos los despachos activos del período fueron recibidos completos.',
      },
    ]

    const insights = buildDeterministicInsights({
      periodLabel,
      comparable: prev.comparable,
      comparisonReason: prev.reason,
      shipmentCounts: data.counts,
      shipmentsByUnit: data.byUnit,
      hasMultipleUnits: data.byUnit.length > 1,
    })

    return {
      ...basePayload,
      hasData: data.hasData,
      kpis,
      charts,
      tables,
      observations: insights.observations,
      limitations: insights.limitations,
    }
  }

  // 4. REPORTE COMERCIAL DE AGRO MARKET
  if (params.type === 'MARKET_SALES') {
    const [curr, prevMarket] = await Promise.all([
      queryMarketSalesData(params.from, params.to, filters.cropId, filters.unitId),
      prev.comparable ? queryMarketSalesData(prev.from, prev.to, filters.cropId, filters.unitId) : null,
    ])

    const deltaSales = prev.comparable ? safePercentChange(curr.totalSalesUsd, prevMarket?.totalSalesUsd ?? null) : null
    const kpis: ReportKpiCard[] = [
      { label: 'Total vendido', value: fmtUsd(curr.totalSalesUsd), detail: `${curr.salesCount} ventas activas`, delta: deltaSales },
      {
        label: 'Ganancia bruta estimada',
        value: fmtUsd(curr.grossProfitUsd),
        detail: curr.missingCostCount > 0 ? `${curr.missingCostCount} ventas sin precio de referencia` : 'Cobertura completa de costo de referencia',
      },
      { label: 'Ventas registradas', value: String(curr.salesCount), detail: curr.cancelledCount > 0 ? `${curr.cancelledCount} anuladas excluidas` : 'Sin anulaciones' },
      { label: 'Ticket promedio', value: curr.salesCount > 0 ? fmtUsd(curr.totalSalesUsd / curr.salesCount) : '—', detail: `${curr.byProduct.length} productos comercializados` },
    ]

    const charts: ReportChart[] = curr.byBucket.length > 0
      ? [{
          title: 'Evolución comercial de Agro Market (USD)',
          unit: 'USD',
          kind: curr.byBucket.length <= 2 ? 'bar' : 'line',
          labels: curr.byBucket.map((b) => b.bucket),
          series: [
            { label: 'Ventas (USD)', color: 'green', values: curr.byBucket.map((b) => round2(b.totalUsd)) },
          ],
        }]
      : []

    const tables: ReportTable[] = [
      {
        title: 'Volumen comercializado por unidad de medida',
        subtitle: 'Las cantidades físicas se presentan por unidad sin combinar unidades incompatibles.',
        columns: [
          { key: 'unit', label: 'Unidad' },
          { key: 'count', label: 'Ventas', align: 'right' },
          { key: 'quantity', label: 'Cantidad vendida', align: 'right' },
          { key: 'totalUsd', label: 'Monto (USD)', align: 'right' },
        ],
        rows: curr.byUnit.map((u) => ({
          unit: u.unit,
          count: u.count,
          quantity: fmtNum(u.quantity),
          totalUsd: fmtUsd(u.totalUsd),
        })),
        emptyMessage: 'Sin ventas registradas en este período.',
      },
      {
        title: 'Ventas por producto',
        columns: [
          { key: 'product', label: 'Producto' },
          { key: 'unit', label: 'Unidad' },
          { key: 'count', label: 'Ventas', align: 'right' },
          { key: 'quantity', label: 'Cantidad', align: 'right' },
          { key: 'totalUsd', label: 'Total vendido', align: 'right' },
          { key: 'grossProfitUsd', label: 'Ganancia bruta est.', align: 'right' },
        ],
        rows: curr.byProduct.slice(0, 30).map((p) => ({
          product: p.product,
          unit: p.unit,
          count: p.count,
          quantity: fmtNum(p.quantity),
          totalUsd: fmtUsd(p.totalUsd),
          grossProfitUsd: fmtUsd(p.grossProfitUsd),
        })),
        emptyMessage: 'Sin ventas por producto en este período.',
      },
    ]

    const insights = buildDeterministicInsights({
      periodLabel,
      comparable: prev.comparable,
      comparisonReason: prev.reason,
      market: {
        totalSalesUsd: curr.totalSalesUsd,
        salesCount: curr.salesCount,
        cancelledCount: curr.cancelledCount,
        grossProfitUsd: curr.grossProfitUsd,
        missingCostCount: curr.missingCostCount,
        previousTotalSalesUsd: prev.comparable ? (prevMarket?.totalSalesUsd ?? null) : undefined,
        byUnit: curr.byUnit,
        topProduct: curr.byProduct[0] ? { label: curr.byProduct[0].product, totalUsd: curr.byProduct[0].totalUsd } : null,
      },
      hasMultipleUnits: curr.byUnit.length > 1,
    })

    return {
      ...basePayload,
      hasData: curr.hasData,
      kpis,
      charts,
      tables,
      observations: insights.observations,
      limitations: insights.limitations,
    }
  }

  // 5 & 6. REPORTE CONSOLIDADO DE PRODUCTIVIDAD / IMPACTO Y REPORTE SEMANAL OPERATIVO
  const [currProd, prevProd, currCosts, prevCosts, currShip, currMarket, prevMarket] = await Promise.all([
    queryProductionData(params.from, params.to, filters.cropId, filters.unitId),
    prev.comparable ? queryProductionData(prev.from, prev.to, filters.cropId, filters.unitId) : null,
    queryCostsData(params.from, params.to, filters.cropId),
    prev.comparable ? queryCostsData(prev.from, prev.to, filters.cropId) : null,
    queryShipmentsReceptionsData(params.from, params.to, filters.cropId, filters.unitId),
    queryMarketSalesData(params.from, params.to, filters.cropId, filters.unitId),
    prev.comparable ? queryMarketSalesData(prev.from, prev.to, filters.cropId, filters.unitId) : null,
  ])

  // Reutiliza el motor oficial productionAnalytics() para estacionalidad y previsiones en reportes consolidados
  let seasonalityOut: ReportPayload['seasonality'] = []
  let forecastsOut: ReportPayload['forecasts'] = []
  let analyticsInsightInput: Parameters<typeof buildDeterministicInsights>[0]['analyticsSeries'] = undefined

  if (params.type === 'CONSOLIDATED_IMPACT') {
    const fromMonth = params.from.slice(0, 7)
    const toMonth = params.to.slice(0, 7)
    try {
      const syntheticReq = new Request(`http://localhost/api/production-summary?from=${fromMonth}&to=${toMonth}`)
      const analytics = await productionAnalytics(syntheticReq, false)
      const filteredSeries = analytics.series.filter((s) =>
        (!filters.cropName || s.crop === filters.cropName) &&
        (!filters.unitName || s.unit === filters.unitName),
      )

      seasonalityOut = filteredSeries.map((s) => ({
        crop: s.crop,
        unit: s.unit,
        completeYears: s.seasonality.years.length,
        higherMonths: s.seasonality.higher,
        lowerMonths: s.seasonality.lower,
        typicalMonths: s.seasonality.typical,
      }))

      forecastsOut = filteredSeries.map((s) => ({
        crop: s.crop,
        unit: s.unit,
        observedMonths: s.forecast.observedMonths,
        consecutiveMonths: s.forecast.consecutiveMonths,
        trend: s.forecast.trend,
        estimates: s.forecast.estimates,
      }))

      analyticsInsightInput = filteredSeries.map((s) => ({
        crop: s.crop,
        unit: s.unit,
        completeYears: s.seasonality.years.length,
        higherMonths: s.seasonality.higher,
        lowerMonths: s.seasonality.lower,
        forecastAvailable: s.forecast.estimates.length > 0,
        consecutiveMonths: s.forecast.consecutiveMonths,
        forecastTrend: s.forecast.trend,
      }))
    } catch {
      // Si el rango excede 60 meses o no aplica al resumen mensual, se omite previsión/estacionalidad con nota explícita.
      analyticsInsightInput = []
    }
  }

  const prevByUnit = new Map((prevProd?.byUnit ?? []).map((u) => [u.unit, u]))
  const prevByCropUnit = new Map((prevProd?.byCropUnit ?? []).map((c) => [`${c.crop}||${c.unit}`, c]))

  const unitsWithPrev: UnitMetricSummary[] = currProd.byUnit.map((u) => ({
    ...u,
    previousHarvested: prev.comparable ? (prevByUnit.get(u.unit)?.harvested ?? null) : undefined,
    previousUseful: prev.comparable ? (prevByUnit.get(u.unit)?.useful ?? null) : undefined,
    previousLosses: prev.comparable ? (prevByUnit.get(u.unit)?.losses ?? null) : undefined,
  }))

  const cropsWithPrev: CropUnitBreakdown[] = currProd.byCropUnit.map((c) => ({
    ...c,
    previousHarvested: prev.comparable ? (prevByCropUnit.get(`${c.crop}||${c.unit}`)?.harvested ?? null) : undefined,
  }))

  const totalHarvests = currProd.byUnit.reduce((s, u) => s + u.harvestCount, 0)
  const kpis: ReportKpiCard[] = [
    { label: 'Cosechas registradas', value: String(totalHarvests), detail: `${currProd.byUnit.length} unidad(es) de medida` },
    {
      label: 'Costos de producción',
      value: fmtUsd(currCosts.totalUsd),
      detail: `${fmtUsd(currCosts.directUsd)} cultivos · ${fmtUsd(currCosts.generalUsd)} generales`,
      delta: prev.comparable ? safePercentChange(currCosts.totalUsd, prevCosts?.totalUsd ?? null) : null,
    },
    {
      label: 'Despachos a Agro Market',
      value: String(currShip.counts.total),
      detail: `${currShip.counts.received} completos · ${currShip.counts.pending + currShip.counts.partial} pendientes · ${currShip.counts.withDifferences} con dif.`,
    },
    {
      label: 'Ventas Agro Market',
      value: fmtUsd(currMarket.totalSalesUsd),
      detail: currMarket.grossProfitUsd !== null
        ? `Ganancia bruta est.: ${fmtUsd(currMarket.grossProfitUsd)}`
        : `${currMarket.salesCount} ventas activas`,
      delta: prev.comparable ? safePercentChange(currMarket.totalSalesUsd, prevMarket?.totalSalesUsd ?? null) : null,
    },
  ]

  const charts: ReportChart[] = [
    ...buildProductionCharts(currProd.byBucketUnit).slice(0, 2),
  ]
  if (currMarket.byBucket.length > 0) {
    charts.push({
      title: 'Evolución comercial en Agro Market (USD)',
      unit: 'USD',
      kind: currMarket.byBucket.length <= 2 ? 'bar' : 'line',
      labels: currMarket.byBucket.map((b) => b.bucket),
      series: [{ label: 'Ventas USD', color: 'purple', values: currMarket.byBucket.map((b) => round2(b.totalUsd)) }],
    })
  }

  const tables: ReportTable[] = [
    {
      title: 'Producción y mermas por unidad de medida',
      subtitle: 'Producción cosechada, útil y mermas sin mezclar unidades incompatibles.',
      columns: [
        { key: 'unit', label: 'Unidad' },
        { key: 'harvested', label: 'Cosechado', align: 'right' },
        { key: 'useful', label: 'Útil', align: 'right' },
        { key: 'losses', label: 'Mermas', align: 'right' },
        { key: 'delta', label: 'Var. cosechado', align: 'right' },
      ],
      rows: unitsWithPrev.map((u) => ({
        unit: u.unit,
        harvested: fmtNum(u.harvested),
        useful: fmtNum(u.useful),
        losses: fmtNum(u.losses),
        delta: fmtDelta(prev.comparable ? safePercentChange(u.harvested, u.previousHarvested ?? null) : null),
      })),
      emptyMessage: 'Sin movimientos de producción en el período.',
    },
    {
      title: 'Variaciones de producción por cultivo y unidad',
      columns: [
        { key: 'crop', label: 'Cultivo' },
        { key: 'unit', label: 'Unidad' },
        { key: 'harvested', label: 'Cosechado', align: 'right' },
        { key: 'useful', label: 'Útil', align: 'right' },
        { key: 'previous', label: 'Período anterior', align: 'right' },
        { key: 'delta', label: 'Variación', align: 'right' },
      ],
      rows: cropsWithPrev.map((c) => ({
        crop: c.crop,
        unit: c.unit,
        harvested: fmtNum(c.harvested),
        useful: fmtNum(c.useful),
        previous: c.previousHarvested != null ? fmtNum(c.previousHarvested) : '—',
        delta: fmtDelta(prev.comparable ? safePercentChange(c.harvested, c.previousHarvested ?? null) : null),
      })),
      emptyMessage: 'Sin registros por cultivo en el período.',
    },
    {
      title: 'Trazabilidad logística (Despachos vs Recepciones por unidad)',
      columns: [
        { key: 'unit', label: 'Unidad' },
        { key: 'shipped', label: 'Despachado', align: 'right' },
        { key: 'received', label: 'Recibido', align: 'right' },
        { key: 'difference', label: 'Diferencia', align: 'right' },
      ],
      rows: currShip.byUnit.map((s) => ({
        unit: s.unit,
        shipped: fmtNum(s.shipped),
        received: fmtNum(s.received),
        difference: fmtNum(s.difference),
      })),
      emptyMessage: 'Sin despachos hacia Agro Market en el período.',
    },
    {
      title: 'Resumen de costos por categoría',
      columns: [
        { key: 'category', label: 'Categoría' },
        { key: 'count', label: 'Registros', align: 'right' },
        { key: 'amountUsd', label: 'Monto (USD)', align: 'right' },
      ],
      rows: currCosts.byCategory.slice(0, 12).map((c) => ({
        category: c.category,
        count: c.count,
        amountUsd: fmtUsd(c.amountUsd),
      })),
      emptyMessage: 'Sin costos registrados en el período.',
    },
    {
      title: 'Desempeño comercial en Agro Market (Top productos)',
      columns: [
        { key: 'product', label: 'Producto' },
        { key: 'unit', label: 'Unidad' },
        { key: 'quantity', label: 'Cantidad vendida', align: 'right' },
        { key: 'totalUsd', label: 'Total vendido', align: 'right' },
        { key: 'grossProfitUsd', label: 'Ganancia bruta est.', align: 'right' },
      ],
      rows: currMarket.byProduct.slice(0, 15).map((p) => ({
        product: p.product,
        unit: p.unit,
        quantity: fmtNum(p.quantity),
        totalUsd: fmtUsd(p.totalUsd),
        grossProfitUsd: fmtUsd(p.grossProfitUsd),
      })),
      emptyMessage: 'Sin ventas activas en Agro Market durante el período.',
    },
  ]

  const allUnitsCount = new Set([
    ...currProd.byUnit.map((u) => u.unit),
    ...currShip.byUnit.map((u) => u.unit),
    ...currMarket.byUnit.map((u) => u.unit),
  ]).size

  const insights = buildDeterministicInsights({
    periodLabel,
    comparable: prev.comparable,
    comparisonReason: prev.reason,
    productionByUnit: unitsWithPrev,
    cropBreakdown: cropsWithPrev,
    costs: {
      totalUsd: currCosts.totalUsd,
      directUsd: currCosts.directUsd,
      generalUsd: currCosts.generalUsd,
      recordCount: currCosts.recordCount,
      previousTotalUsd: prev.comparable ? (prevCosts?.totalUsd ?? null) : undefined,
      topCategory: currCosts.byCategory[0] ? { name: currCosts.byCategory[0].category, amountUsd: currCosts.byCategory[0].amountUsd } : null,
    },
    shipmentCounts: currShip.counts,
    shipmentsByUnit: currShip.byUnit,
    market: {
      totalSalesUsd: currMarket.totalSalesUsd,
      salesCount: currMarket.salesCount,
      cancelledCount: currMarket.cancelledCount,
      grossProfitUsd: currMarket.grossProfitUsd,
      missingCostCount: currMarket.missingCostCount,
      previousTotalSalesUsd: prev.comparable ? (prevMarket?.totalSalesUsd ?? null) : undefined,
      byUnit: currMarket.byUnit,
      topProduct: currMarket.byProduct[0] ? { label: currMarket.byProduct[0].product, totalUsd: currMarket.byProduct[0].totalUsd } : null,
    },
    analyticsSeries: analyticsInsightInput,
    hasMultipleUnits: allUnitsCount > 1,
  })

  return {
    ...basePayload,
    hasData: currProd.hasData || currCosts.hasData || currShip.hasData || currMarket.hasData,
    kpis,
    charts,
    tables,
    ...(params.type === 'CONSOLIDATED_IMPACT'
      ? { seasonality: seasonalityOut, forecasts: forecastsOut }
      : {}),
    observations: insights.observations,
    limitations: insights.limitations,
  }
}

export function extractReportSummary(payload: ReportPayload) {
  return {
    hasData: payload.hasData,
    kpis: payload.kpis.slice(0, 4),
    observationCount: payload.observations.length,
  }
}
