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

export type AnalyticsReport = {
  period: MonthRange
  previous: MonthRange
  yearAgo: MonthRange
  latestMonth: string
  currentMonth: string
  series: AnalyticsSeries[]
  publicView: boolean
}

function median(values: number[]) {
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
  const byMonth = new Map(points.map((point) => [point.month, point]))
  const consecutive: Observation[] = []
  for (let month = lastClosed; byMonth.has(month); month = shiftMonth(month, -1)) {
    consecutive.unshift(byMonth.get(month)!)
  }

  const result: Forecast = {
    observedMonths: points.length,
    consecutiveMonths: consecutive.length,
    history: points.filter((point) => point.month >= shiftMonth(lastClosed, -11)),
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
  const byYear = new Map<string, Observation[]>()
  for (const point of points) {
    const year = point.month.slice(0, 4)
    const entries = byYear.get(year) ?? []
    entries.push(point)
    byYear.set(year, entries)
  }
  const higher = Array<number>(12).fill(0)
  const lower = Array<number>(12).fill(0)
  const typical = Array<number>(12).fill(0)
  const years: Seasonality['years'] = []
  for (const [year, entries] of byYear) {
    if (entries.length !== 12) continue
    const total = entries.reduce((sum, entry) => sum + entry.quantity, 0)
    years.push({ year, total })
    if (total <= 0) continue
    for (const { month, quantity } of entries) {
      const index = Number(month.slice(-2)) - 1
      const relative = quantity / (total / 12)
      if (relative > 1.1) higher[index]++
      else if (relative < 0.9) lower[index]++
      else typical[index]++
    }
  }
  const threshold = Math.max(2, Math.ceil(years.length * 2 / 3))
  const supported = (counts: number[]) => counts.flatMap((count, index) => count >= threshold ? [index + 1] : [])
  return { years, higher: supported(higher), lower: supported(lower), typical: supported(typical) }
}

