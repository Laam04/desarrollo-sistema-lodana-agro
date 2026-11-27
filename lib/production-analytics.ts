import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ProductionError } from '@/lib/production-api'
import { marketDay } from '@/lib/market-data'
import {
  buildForecast, describeSeasonality, historyMonths, monthDistance, shiftMonth,
  type AnalyticsReport, type AnalyticsSeries, type MonthRange, type MonthlyPoint,
} from '@/lib/analytics-model'

const minimumPublicRecords = 3
const maxDisplayedMonths = 60

type Movement = {
  month: string
  crop: string
  unit: string
  metric: 'harvested' | 'losses' | 'shipped' | 'received' | 'sold'
  quantity: Prisma.Decimal
  count: number
  useful: Prisma.Decimal | null
  related: number | null
  sameMonthRelated: number | null
  nonAffectingCount: number | null
  affecting: Prisma.Decimal | null
  statistical: Prisma.Decimal | null
  unclassified: Prisma.Decimal | null
}

type Reason = { crop: string; unit: string; name: string; quantity: Prisma.Decimal }

export function readAnalyticsPeriod(request: Request, latestMonth: string): MonthRange {
  const params = new URL(request.url).searchParams
  const to = params.get('to') ?? latestMonth
  const rawFrom = params.get('from')
  let from = rawFrom ?? ''
  if (rawFrom === null && validMonth(to)) {
    const shifted = shiftMonth(to, -11)
    from = shifted < '2000-01' ? '2000-01' : shifted
  }
  if (!validMonth(from) || !validMonth(to) || from > to || to > latestMonth ||
    monthDistance(from, to) >= maxDisplayedMonths) {
    throw new ProductionError('Selecciona un rango de hasta 60 meses entre 2000 y el último mes disponible.')
  }
  return { from, to }
}

function validMonth(month: string) {
  return /^20\d{2}-(0[1-9]|1[0-2])$/.test(month)
}

function rangesTogether(ranges: MonthRange[]) {
  const merged: MonthRange[] = []
  for (const range of ranges.toSorted((first, second) => first.from.localeCompare(second.from))) {
    const previous = merged.at(-1)
    if (previous && range.from <= shiftMonth(previous.to, 1)) {
      if (range.to > previous.to) previous.to = range.to
    } else {
      merged.push({ ...range })
    }
  }
  return merged
}

function boundaries(ranges: MonthRange[], receipt = false) {
  return ranges.map(({ from, to }) => ({
    start: new Date(from + (receipt ? '-01T05:00:00Z' : '-01T00:00:00Z')),
    end: new Date(shiftMonth(to, 1) + (receipt ? '-01T05:00:00Z' : '-01T00:00:00Z')),
  }))
}

function inWindows(column: Prisma.Sql, windows: ReturnType<typeof boundaries>) {
  return Prisma.sql`(${Prisma.join(windows.map(({ start, end }) => Prisma.sql`(${column} >= ${start} AND ${column} < ${end})`), ' OR ')})`
}

function includesMonth(month: string, ranges: MonthRange[]) {
  return ranges.some(({ from, to }) => from <= month && month <= to)
}

async function loadMovements(
  tx: Prisma.TransactionClient,
  activity: MonthRange[],
  historical: MonthRange[],
  dayEnd: Date,
  lossCutoff: Date,
  receiptCutoff: Date,
) {
  const dates = boundaries(activity)
  const harvestDates = boundaries(rangesTogether([...activity, ...historical]))
  const receptionDates = boundaries(activity, true)
  return tx.$queryRaw<Movement[]>`
    WITH harvested AS (
      SELECT h.id, h.date, h."cropId", h."unitId", h.quantity
      FROM "Harvest" h
      WHERE h."deletedAt" IS NULL AND h.status = 'ACTIVE'
        AND ${inWindows(Prisma.sql`h.date`, harvestDates)} AND h.date < ${dayEnd}
    ), deducted AS (
      SELECT l."harvestId",
        SUM(l.quantity) AS quantity,
        COUNT(*)::int AS records,
        COUNT(*) FILTER (WHERE to_char(l.date, 'YYYY-MM') = to_char(h.date, 'YYYY-MM'))::int AS same_month_records
      FROM "Loss" l JOIN harvested h ON h.id = l."harvestId"
      WHERE l."deletedAt" IS NULL AND l.status = 'ACTIVE' AND l."affectsHarvest" IS TRUE AND l.date < ${lossCutoff}
      GROUP BY l."harvestId"
    ), movements AS (
      SELECT to_char(h.date, 'YYYY-MM') AS month, h."cropId", h."unitId", 'harvested' AS metric,
        SUM(h.quantity) AS quantity, COUNT(*)::int AS count,
        SUM(GREATEST(0, h.quantity - COALESCE(d.quantity, 0))) AS useful,
        COALESCE(SUM(d.records), 0)::int AS related,
        COALESCE(SUM(d.same_month_records), 0)::int AS same_month_related,
        NULL::int AS non_affecting_count,
        NULL::numeric AS affecting, NULL::numeric AS statistical, NULL::numeric AS unclassified
      FROM harvested h LEFT JOIN deducted d ON d."harvestId" = h.id
      GROUP BY 1, 2, 3
      UNION ALL
      SELECT to_char(l.date, 'YYYY-MM'), h."cropId", h."unitId", 'losses', SUM(l.quantity), COUNT(*)::int,
        NULL, NULL, NULL,
        COUNT(*) FILTER (WHERE l."affectsHarvest" IS NOT TRUE)::int,
        SUM(l.quantity) FILTER (WHERE l."affectsHarvest" IS TRUE),
        SUM(l.quantity) FILTER (WHERE l."affectsHarvest" IS FALSE),
        SUM(l.quantity) FILTER (WHERE l."affectsHarvest" IS NULL)
      FROM "Loss" l JOIN "Harvest" h ON h.id = l."harvestId"
      WHERE l."deletedAt" IS NULL AND l.status = 'ACTIVE' AND h."deletedAt" IS NULL AND h.status = 'ACTIVE'
        AND ${inWindows(Prisma.sql`l.date`, dates)} AND l.date < ${lossCutoff} AND h.date < ${dayEnd}
      GROUP BY 1, 2, 3
      UNION ALL
      SELECT to_char(s.date, 'YYYY-MM'), i."cropId", i."unitId", 'shipped', SUM(i.quantity), COUNT(DISTINCT s.id)::int,
        NULL, NULL, NULL, NULL, NULL, NULL, NULL
      FROM "Shipment" s JOIN "ShipmentItem" i ON i."shipmentId" = s.id
      WHERE s."deletedAt" IS NULL AND s.status <> 'CANCELLED' AND i."deletedAt" IS NULL
        AND ${inWindows(Prisma.sql`s.date`, dates)} AND s.date < ${dayEnd}
      GROUP BY 1, 2, 3
      UNION ALL
      SELECT to_char(r."receivedAt" AT TIME ZONE 'America/Guayaquil', 'YYYY-MM'),
        i."cropId", i."unitId", 'received', SUM(ri."receivedQuantity"), COUNT(DISTINCT r.id)::int,
        NULL, NULL, NULL, NULL, NULL, NULL, NULL
      FROM "Reception" r JOIN "ReceptionItem" ri ON ri."receptionId" = r.id
      JOIN "ShipmentItem" i ON i.id = ri."shipmentItemId" AND i."shipmentId" = r."shipmentId"
      JOIN "Shipment" s ON s.id = r."shipmentId"
      WHERE r."deletedAt" IS NULL AND ri."deletedAt" IS NULL AND i."deletedAt" IS NULL
        AND s."deletedAt" IS NULL AND s.status <> 'CANCELLED'
        AND ${inWindows(Prisma.sql`r."receivedAt"`, receptionDates)} AND r."receivedAt" <= ${receiptCutoff}
      GROUP BY 1, 2, 3
      UNION ALL
      SELECT to_char(v.date, 'YYYY-MM'), i."cropId", COALESCE(ri."saleUnitId", i."unitId"), 'sold', SUM(v.quantity), COUNT(*)::int,
        NULL, NULL, NULL, NULL, NULL, NULL, NULL
      FROM "MarketSale" v JOIN "ReceptionItem" ri ON ri.id = v."receptionItemId"
      JOIN "Reception" r ON r.id = ri."receptionId"
      JOIN "ShipmentItem" i ON i.id = ri."shipmentItemId" AND i."shipmentId" = r."shipmentId"
      JOIN "Shipment" s ON s.id = r."shipmentId"
      WHERE v."cancelledAt" IS NULL AND r."deletedAt" IS NULL AND ri."deletedAt" IS NULL AND i."deletedAt" IS NULL
        AND s."deletedAt" IS NULL AND s.status <> 'CANCELLED'
        AND ${inWindows(Prisma.sql`v.date`, dates)} AND v.date < ${dayEnd} AND r."receivedAt" <= ${receiptCutoff}
      GROUP BY 1, 2, 3
    )
    SELECT m.month, c.name AS crop, u.name AS unit, m.metric, SUM(m.quantity) AS quantity,
      SUM(m.count)::int AS count, SUM(m.useful) AS useful, SUM(m.related)::int AS related,
      SUM(m.same_month_related)::int AS "sameMonthRelated",
      SUM(m.non_affecting_count)::int AS "nonAffectingCount",
      SUM(m.affecting) AS affecting, SUM(m.statistical) AS statistical, SUM(m.unclassified) AS unclassified
    FROM movements m JOIN "Crop" c ON c.id = m."cropId" JOIN "Unit" u ON u.id = m."unitId"
    GROUP BY 1, 2, 3, 4
    ORDER BY 2, 3, 1
  `
}

async function loadReasons(tx: Prisma.TransactionClient, range: MonthRange, dayEnd: Date) {
  return tx.$queryRaw<Reason[]>`
    WITH reasons AS (
      SELECT c.name AS crop, u.name AS unit, lr.name, SUM(l.quantity) AS quantity
      FROM "Loss" l JOIN "Harvest" h ON h.id = l."harvestId" JOIN "LossReason" lr ON lr.id = l."reasonId"
      JOIN "Crop" c ON c.id = h."cropId" JOIN "Unit" u ON u.id = h."unitId"
      WHERE l."deletedAt" IS NULL AND l.status = 'ACTIVE' AND h."deletedAt" IS NULL AND h.status = 'ACTIVE'
        AND ${inWindows(Prisma.sql`l.date`, boundaries([range]))} AND l.date < ${dayEnd} AND h.date < ${dayEnd}
      GROUP BY 1, 2, 3
    ), ranked AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY crop, unit ORDER BY quantity DESC, name ASC) AS rank
      FROM reasons
    )
    SELECT crop, unit, name, quantity FROM ranked WHERE rank <= 5 ORDER BY crop, unit, rank
  `
}

function addMovement(
  point: MonthlyPoint,
  row: Movement,
  publicView: boolean,
  lossMeta?: { published: boolean; nonAffectingCount: number },
) {
  if (publicView && row.count < minimumPublicRecords) return
  point[row.metric] = row.quantity.toNumber()
  if (row.metric === 'harvested') {
    point.harvestCount = row.count
    const related = row.related ?? 0
    const sameMonthRelated = row.sameMonthRelated ?? 0
    const crossMonthRelated = Math.max(0, related - sameMonthRelated)
    const leaksRelated = related > 0 && related < minimumPublicRecords
    const leaksCrossMonth = crossMonthRelated > 0 && crossMonthRelated < minimumPublicRecords
    const leaksNonAffecting =
      Boolean(lossMeta?.published) &&
      (lossMeta?.nonAffectingCount ?? 0) > 0 &&
      (lossMeta?.nonAffectingCount ?? 0) < minimumPublicRecords

    if (row.useful !== null && (!publicView || (!leaksRelated && !leaksCrossMonth && !leaksNonAffecting))) {
      point.useful = row.useful.toNumber()
      point.deducted = row.quantity.minus(row.useful).toNumber()
    }
  }
  if (row.metric === 'losses' && !publicView) {
    point.affectingLosses = row.affecting?.toNumber() ?? 0
    point.statisticalLosses = row.statistical?.toNumber() ?? 0
    point.unclassifiedLosses = row.unclassified?.toNumber() ?? 0
  }
}

export async function productionAnalytics(request: Request, publicView: boolean): Promise<AnalyticsReport> {
  const now = new Date()
  const today = marketDay(now)
  const dayEnd = new Date(new Date(today + 'T00:00:00Z').getTime() + 86_400_000)
  const currentMonth = today.slice(0, 7)
  const lastClosed = shiftMonth(currentMonth, -1)
  const latestMonth = publicView ? lastClosed : currentMonth
  const period = readAnalyticsPeriod(request, latestMonth)
  const span = monthDistance(period.from, period.to) + 1
  const previous = { from: shiftMonth(period.from, -span), to: shiftMonth(period.from, -1) }
  const yearAgo = { from: shiftMonth(period.from, -12), to: shiftMonth(period.to, -12) }
  const activity = rangesTogether([period, previous, yearAgo])
  const historical = { from: shiftMonth(lastClosed, -(historyMonths - 1)), to: lastClosed }

  const closedDateCutoff = new Date(currentMonth + '-01T00:00:00Z')
  const closedReceiptCutoff = new Date(currentMonth + '-01T05:00:00Z')
  const lossCutoff = publicView ? closedDateCutoff : dayEnd
  const receiptCutoff = publicView ? closedReceiptCutoff : now

  const [movements, reasons] = await prisma.$transaction(async (tx) => [
    await loadMovements(tx, activity, [historical], publicView ? closedDateCutoff : dayEnd, lossCutoff, receiptCutoff),
    publicView ? [] : await loadReasons(tx, period, dayEnd),
  ], { isolationLevel: 'RepeatableRead', timeout: publicView ? 10_000 : 20_000 })

  const key = (crop: string, unit: string) => JSON.stringify([crop, unit])
  const cellKey = (crop: string, unit: string, month: string) => JSON.stringify([crop, unit, month])

  const lossMetaByCell = new Map<string, { published: boolean; nonAffectingCount: number }>()
  for (const row of movements) {
    if (row.metric === 'losses') {
      lossMetaByCell.set(cellKey(row.crop, row.unit, row.month), {
        published: row.count >= minimumPublicRecords,
        nonAffectingCount: row.nonAffectingCount ?? 0,
      })
    }
  }

  const groups = new Map<string, { crop: string; unit: string; months: Map<string, MonthlyPoint>; reasons: AnalyticsSeries['reasons'] }>()
  for (const row of movements) {
    if (publicView && row.count < minimumPublicRecords) continue
    const id = key(row.crop, row.unit)
    const group = groups.get(id) ?? { crop: row.crop, unit: row.unit, months: new Map(), reasons: [] }
    const point = group.months.get(row.month) ?? { month: row.month }
    addMovement(point, row, publicView, lossMetaByCell.get(cellKey(row.crop, row.unit, row.month)))
    group.months.set(row.month, point)
    groups.set(id, group)
  }
  for (const row of reasons) {
    groups.get(key(row.crop, row.unit))?.reasons.push({ name: row.name, quantity: row.quantity.toNumber() })
  }

  const series = [...groups.values()].map(({ crop, unit, months, reasons: lossReasons }): AnalyticsSeries => {
    const points = [...months.values()]
    const observations = points.flatMap(({ month, harvested }) =>
      harvested !== undefined && historical.from <= month && month <= historical.to
        ? [{ month, quantity: harvested }]
        : [],
    )
    return {
      crop, unit,
      monthly: points.filter(({ month }) => includesMonth(month, activity)),
      reasons: lossReasons,
      seasonality: describeSeasonality(observations),
      forecast: buildForecast(observations, lastClosed),
    }
  })
  return { period, previous, yearAgo, currentMonth, latestMonth, series, publicView }
}
