export const historyMonths = 60
export const forecastMinimum = 24

export function shiftMonth(month: string, offset: number) {
  const [year, number] = month.split('-').map(Number)
  return new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7)
}

export function monthDistance(from: string, to: string) {
  const [firstYear, firstMonth] = from.split('-').map(Number)
  const [lastYear, lastMonth] = to.split('-').map(Number)
  return (lastYear - firstYear) * 12 + lastMonth - firstMonth
}

export function monthsBetween(from: string, to: string) {
  return Array.from({ length: Math.max(0, monthDistance(from, to) + 1) }, (_, index) => shiftMonth(from, index))
}

const shortMonthLabel = new Intl.DateTimeFormat('es-EC', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const fullMonthLabel = new Intl.DateTimeFormat('es-EC', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const shortDayLabel = new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short', timeZone: 'UTC' })
const fullDayLabel = new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })

export function isMonthBucket(label: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(label)
}

export function isDayBucket(label: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(label)) return false
  const parsed = new Date(`${label}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === label
}

export function formatChartAxisLabel(label: string) {
  if (isMonthBucket(label)) {
    return shortMonthLabel.format(new Date(`${label}-01T00:00:00Z`))
  }
  if (isDayBucket(label)) {
    return shortDayLabel.format(new Date(`${label}T00:00:00Z`))
  }
  return label
}

export function formatChartDetailLabel(label: string) {
  if (isMonthBucket(label)) {
    return fullMonthLabel.format(new Date(`${label}-01T00:00:00Z`))
  }
  if (isDayBucket(label)) {
    return fullDayLabel.format(new Date(`${label}T00:00:00Z`))
  }
  return label
}

export type MonthRange = { from: string; to: string }
export type Metric = 'harvested' | 'useful' | 'harvestCount' | 'losses' | 'affectingLosses' |
  'statisticalLosses' | 'unclassifiedLosses' | 'deducted' | 'shipped' | 'received' | 'sold'

export type MonthlyPoint = { month: string } & Partial<Record<Metric, number>>
type Observation = { month: string; quantity: number }

export type Forecast = {
  observedMonths: number
  consecutiveMonths: number
  history: Observation[]
  estimates: { month: string; value: number; low: number | null; high: number | null }[]
  trend: number | null
}

export type Seasonality = {
  years: { year: string; total: number }[]
  higher: number[]
  lower: number[]
  typical: number[]
}

export type AnalyticsSeries = {
  crop: string
  unit: string
  monthly: MonthlyPoint[]
  reasons: { name: string; quantity: number }[]
  forecast: Forecast
  seasonality: Seasonality
}

export type AnalyticsFinancials = {
  costsUsd: number
  previousCostsUsd: number
  deliveredUsd: number
  previousDeliveredUsd: number
  salesUsd: number
  previousSalesUsd: number
  topCategories: { name: string; amountUsd: number }[]
  byCrop: { crop: string; deliveredUsd: number; salesUsd: number; directCostsUsd: number }[]
  monthly: { month: string; costsUsd: number; deliveredUsd: number; salesUsd: number }[]
}

export type AnalyticsReport = {
  period: MonthRange
  previous: MonthRange
  yearAgo: MonthRange
  latestMonth: string
  currentMonth: string
  series: AnalyticsSeries[]
  publicView: boolean
  financials?: AnalyticsFinancials
}

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = values.toSorted((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function recentTrend(series: Observation[]) {
  const recent = series.slice(-24)
  return median(recent.slice(12).map((entry, index) => entry.quantity - recent[index].quantity))
}

function estimate(series: Observation[], horizon: number, trend: number) {
  const offset = series.length + horizon - 1
  return Math.max(0, 0.7 * series[offset - 12].quantity + 0.3 * series[offset - 24].quantity + trend)
}

export function buildForecast(points: Observation[], lastClosed: string): Forecast {
  const byMonth = new Map<string, Observation>()
  for (const point of points) {
    if (point.month <= lastClosed && Number.isFinite(point.quantity) && point.quantity >= 0) {
      byMonth.set(point.month, point)
    }
  }
  const consecutive: Observation[] = []
  for (let month = lastClosed; byMonth.has(month); month = shiftMonth(month, -1)) {
    consecutive.unshift(byMonth.get(month)!)
  }

  const historyStart = shiftMonth(lastClosed, -11)
  const result: Forecast = {
    observedMonths: byMonth.size,
    consecutiveMonths: consecutive.length,
    history: [...byMonth.values()]
      .filter((point) => point.month >= historyStart && point.month <= lastClosed)
      .toSorted((a, b) => a.month.localeCompare(b.month)),
    estimates: [],
    trend: null,
  }
  if (consecutive.length < forecastMinimum) return result

  const trend = recentTrend(consecutive)
  result.trend = trend
  for (let horizon = 1; horizon <= 6; horizon++) {
    // Repite el pronóstico desde fechas pasadas usando solo lo conocido entonces.
    const errors: number[] = []
    for (let end = forecastMinimum; end + horizon <= consecutive.length; end++) {
      const past = consecutive.slice(0, end)
      const expected = estimate(past, horizon, recentTrend(past))
      errors.push(Math.abs(expected - consecutive[end + horizon - 1].quantity))
    }
    errors.sort((a, b) => a - b)
    const spread = errors.length >= 6 ? errors[Math.ceil(errors.length * 0.8) - 1] : null
    const value = estimate(consecutive, horizon, trend)
    result.estimates.push({
      month: shiftMonth(lastClosed, horizon), value,
      low: spread === null ? null : Math.max(0, value - spread),
      high: spread === null ? null : value + spread,
    })
  }
  return result
}

export function describeSeasonality(points: Observation[]): Seasonality {
  const byYear = new Map<string, Map<string, number>>()
  for (const point of points) {
    if (!Number.isFinite(point.quantity) || point.quantity < 0) continue
    const year = point.month.slice(0, 4)
    const entries = byYear.get(year) ?? new Map<string, number>()
    entries.set(point.month, point.quantity)
    byYear.set(year, entries)
  }
  const higher = Array<number>(12).fill(0)
  const lower = Array<number>(12).fill(0)
  const typical = Array<number>(12).fill(0)
  const years: Seasonality['years'] = []
  let positiveYears = 0
  for (const [year, entries] of byYear) {
    if (entries.size !== 12) continue
    const total = [...entries.values()].reduce((sum, quantity) => sum + quantity, 0)
    years.push({ year, total })
    if (total <= 0) continue
    positiveYears++
    for (const [month, quantity] of entries) {
      const index = Number(month.slice(-2)) - 1
      const relative = quantity / (total / 12)
      if (relative > 1.1) higher[index]++
      else if (relative < 0.9) lower[index]++
      else typical[index]++
    }
  }
  const threshold = Math.max(2, Math.ceil(positiveYears * 2 / 3))
  const supported = (counts: number[]) => counts.flatMap((count, index) => count >= threshold ? [index + 1] : [])
  return { years, higher: supported(higher), lower: supported(lower), typical: supported(typical) }
}
