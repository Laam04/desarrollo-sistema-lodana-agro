'use client'

import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, BarChart3, CalendarDays, CircleHelp, Leaf, PackageCheck, ShoppingBasket, TrendingDown, Truck, Wheat, type LucideIcon } from 'lucide-react'
import useSWR from 'swr'
import { productionFetch } from '@/lib/production-client'
import { forecastMinimum, monthDistance, monthsBetween, shiftMonth, type AnalyticsReport, type AnalyticsSeries, type Metric, type MonthRange } from '@/lib/analytics-model'
import { AnalyticsChart, analyticsNumber, formatMonth } from '@/components/analytics-chart'

const panel = 'min-w-0 rounded-2xl border border-[#dbe7dd] bg-white p-4 shadow-sm dark:border-[#2d3b32] dark:bg-[#18211c] sm:p-5'
const field = 'min-w-0 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-emerald-600'
const button = 'rounded-xl border border-border px-3 py-2 text-sm font-semibold transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:opacity-50'
const primary = 'rounded-xl bg-[#2c6048] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#234d39] focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:opacity-50'
const percentFormat = new Intl.NumberFormat('es-EC', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' })
const metricCards: { key: Metric; title: string; icon: LucideIcon }[] = [
  { key: 'harvested', title: 'Producción cosechada', icon: Wheat },
  { key: 'useful', title: 'Producción útil', icon: Leaf },
  { key: 'losses', title: 'Mermas registradas', icon: TrendingDown },
  { key: 'shipped', title: 'Cantidad enviada', icon: Truck },
  { key: 'received', title: 'Recibida por Agro Market', icon: PackageCheck },
  { key: 'harvestCount', title: 'Cosechas registradas', icon: BarChart3 },
]

function showQuantity(value: number | null, unit = '') {
  return value === null ? '—' : analyticsNumber.format(value) + (unit ? ' ' + unit : '')
}

function inPeriod(month: string, range: MonthRange) {
  return month >= range.from && month <= range.to
}

function total(series: AnalyticsSeries[], metric: Metric, range: MonthRange) {
  let quantity = 0
  let observed = false
  for (const item of series) {
    for (const point of item.monthly) {
      if (!inPeriod(point.month, range) || point[metric] === undefined) continue
      observed = true
      quantity += point[metric]!
    }
  }
  return observed ? quantity : null
}

function availableMonths(series: AnalyticsSeries[], metric: Metric, range: MonthRange) {
  return new Set(series.flatMap((item) => item.monthly.flatMap((point) =>
    inPeriod(point.month, range) && point[metric] !== undefined ? [point.month] : [],
  ))).size
}

function comparison(series: AnalyticsSeries[], metric: Metric, report: AnalyticsReport, current: number | null) {
  if (current === null || report.period.to === report.currentMonth) return null
  const before = total(series, metric, report.previous)
  if (before === null || before <= 0) return null
  const offset = monthDistance(report.previous.from, report.period.from)
  for (const item of series) {
    const points = item.monthly.filter((point) => point[metric] !== undefined)
    const observed = new Set(points.map((point) => point.month))
    const compatible = points.every(({ month }) => {
      if (inPeriod(month, report.period)) return observed.has(shiftMonth(month, -offset))
      if (inPeriod(month, report.previous)) return observed.has(shiftMonth(month, offset))
      return true
    })
    if (!compatible) return null
  }
  return (current - before) / before
}

function InfoPanel({ title, icon: Icon, note, children }: {
  title: string; icon: LucideIcon; note?: string; children: ReactNode
}) {
  const id = useId()
  return (
    <section className={panel} aria-labelledby={id}>
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-800 dark:bg-[#234634] dark:text-emerald-200"><Icon className="size-4.5" aria-hidden /></span>
        <div><h3 id={id} className="text-base font-semibold">{title}</h3>{note && <p className="mt-1 text-xs leading-5 text-muted-foreground">{note}</p>}</div>
      </div>
      {children}
    </section>
  )
}

function QuantityList({ rows, unit }: { rows: { label: string; value: number | null }[]; unit: string }) {
  return (
    <dl className="divide-y divide-border rounded-xl border border-border text-sm">
      {rows.map(({ label, value }) => (
        <div key={label} className="flex justify-between gap-3 px-3 py-2">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right font-semibold tabular-nums">{showQuantity(value, unit)}</dd>
        </div>
      ))}
    </dl>
  )
}

function ranking(series: AnalyticsSeries[], metric: Metric, range: MonthRange) {
  return series.flatMap((item) => {
    const value = total([item], metric, range)
    return value === null ? [] : [{ label: item.crop, value }]
  }).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'es-EC'))
}

function Ranking({ items, unit }: { items: { label: string; value: number }[]; unit: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">Sin registros disponibles para mostrar el ranking.</p>
  return (
    <ol className="grid max-h-72 gap-2.5 overflow-y-auto pr-1 text-sm">
      {items.map(({ label, value }) => (
        <li key={label} className="grid gap-1">
          <div className="flex flex-wrap justify-between gap-x-2"><span>{label}</span><span className="font-semibold tabular-nums">{showQuantity(value, unit)}</span></div>
          <div className="h-1.5 rounded-full bg-muted" aria-hidden><div className="h-full rounded-full bg-emerald-600" style={{ width: `${items[0].value > 0 ? value / items[0].value * 100 : 0}%` }} /></div>
        </li>
      ))}
    </ol>
  )
}

function trendText(series: AnalyticsSeries, period: MonthRange, currentMonth: string) {
  const records = series.monthly
    .filter((row) => row.harvested !== undefined && row.month < currentMonth && inPeriod(row.month, period))
    .toSorted((a, b) => a.month.localeCompare(b.month))
  const latest = records.at(-1)
  const prior = records.at(-2)
  if (!latest || !prior || shiftMonth(prior.month, 1) !== latest.month) {
    return 'La tendencia mensual se puede comparar cuando hay dos meses cerrados consecutivos con datos.'
  }
  const delta = latest.harvested! - prior.harvested!
  if (Math.abs(delta) < 0.00001) {
    return `En ${formatMonth(latest.month)}, se cosechó la misma cantidad de ${series.crop} que en ${formatMonth(prior.month)}.`
  }
  return `En ${formatMonth(latest.month)}, se cosechó ${showQuantity(Math.abs(delta), series.unit)} ${delta > 0 ? 'más' : 'menos'} de ${series.crop} que en ${formatMonth(prior.month)}.`
}

const monthNames = new Intl.DateTimeFormat('es-EC', { month: 'long', timeZone: 'UTC' })

function SeasonalityPanel({ item, report }: { item: AnalyticsSeries; report: AnalyticsReport }) {
  const { years, higher, lower, typical } = item.seasonality
  const names = (group: number[]) => group.map((number) => monthNames.format(new Date(Date.UTC(2024, number - 1, 1)))).join(', ')
  const current = item.monthly.filter((point) => inPeriod(point.month, report.period) && point.harvested !== undefined)
  const sorted = current.toSorted((a, b) => a.harvested! - b.harvested!)
  const smallest = sorted[0]
  const biggest = sorted.at(-1)
  const annual = years.toSorted((a, b) => b.year.localeCompare(a.year))
  return (
    <InfoPanel title="Comportamiento estacional" icon={CalendarDays} note={`${item.crop} · ${item.unit} · Hasta cinco años de historia mensual`}>
      <div className="grid gap-3 text-sm">
        {sorted.length >= 2 && (
          <p className="text-muted-foreground">
            Entre los meses con datos del período, el mayor registro fue en <strong className="text-foreground">{formatMonth(biggest!.month)}</strong> ({showQuantity(biggest!.harvested!, item.unit)})
            y el menor en <strong className="text-foreground">{formatMonth(smallest.month)}</strong> ({showQuantity(smallest.harvested!, item.unit)}).
            {report.period.to === report.currentMonth && ' El mes en curso es parcial.'}
          </p>
        )}
        {years.length < 2 ? (
          <p className="rounded-xl bg-muted/60 p-3 text-muted-foreground">Se necesitan al menos dos años calendario con datos en sus 12 meses para evaluar un patrón estacional. Años completos disponibles: {years.length}.</p>
        ) : (
          <>
            {higher.length + lower.length + typical.length ? (
              <dl className="grid gap-2 rounded-xl bg-muted/40 p-3">
                {!!higher.length && <div><dt className="font-medium">Habitualmente por encima del promedio mensual</dt><dd className="text-muted-foreground">{names(higher)}</dd></div>}
                {!!lower.length && <div><dt className="font-medium">Habitualmente por debajo del promedio mensual</dt><dd className="text-muted-foreground">{names(lower)}</dd></div>}
                {!!typical.length && <div><dt className="font-medium">Comportamiento parecido al promedio</dt><dd className="text-muted-foreground">{names(typical)}</dd></div>}
              </dl>
            ) : <p className="text-muted-foreground">Los años completos muestran resultados variables entre meses. El patrón aún es inconcluso.</p>}
            <p className="text-xs leading-5 text-muted-foreground">La clasificación usa diferencias de más de 10 % frente al promedio mensual de cada año y exige que el comportamiento coincida en al menos dos tercios de los años completos.</p>
            <QuantityList rows={annual.map(({ year, total }) => ({ label: `Producción ${year}`, value: total }))} unit={item.unit} />
            {annual.length >= 2 && <p className="text-muted-foreground">Diferencia de {annual[0].year} frente a {annual[1].year}: {showQuantity(annual[0].total - annual[1].total, item.unit)}.</p>}
          </>
        )}
      </div>
    </InfoPanel>
  )
}

function ForecastPanel({ item, report }: { item: AnalyticsSeries; report: AnalyticsReport }) {
  const [horizon, setHorizon] = useState(6)
  const forecast = item.forecast
  const lastClosed = shiftMonth(report.currentMonth, -1)
  const history = new Map(forecast.history.map(({ month, quantity }) => [month, quantity]))
  const predictions = new Map(forecast.estimates.slice(0, horizon).map((point) => [point.month, point]))
  const hasInterval = [...predictions.values()].some((point) => point.high !== null)
  const months = monthsBetween(shiftMonth(lastClosed, -11), shiftMonth(lastClosed, horizon))
  return (
    <InfoPanel title="Previsión de cosecha" icon={BarChart3} note={`${item.crop} · ${item.unit}`}>
      <div className="grid gap-3">
        <p className="text-sm text-muted-foreground">
          {forecast.observedMonths} meses cerrados con datos {report.publicView ? 'publicados ' : ''}en los últimos cinco años.
          {' '}{forecast.consecutiveMonths} meses consecutivos hasta {formatMonth(lastClosed)}.
        </p>
        {!forecast.estimates.length ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Se requieren al menos {forecastMinimum} meses cerrados consecutivos. Faltan {forecastMinimum - forecast.consecutiveMonths} para habilitar la previsión de esta serie.
          </p>
        ) : (
          <>
            <label className="grid max-w-48 gap-1 text-sm font-medium">Horizonte de previsión
              <select className={field} value={horizon} onChange={(event) => setHorizon(Number(event.target.value))}>
                <option value={3}>3 meses</option><option value={6}>6 meses</option>
              </select>
            </label>
            <AnalyticsChart label="Previsión de cosecha" unit={item.unit} months={months} lines={[
              { label: 'Cosecha registrada', color: 'green', values: months.map((month) => history.get(month) ?? null) },
              {
                label: 'Estimación',
                color: 'purple',
                dashed: true,
                bridgeFrom: history.has(lastClosed) ? { index: months.indexOf(lastClosed), value: history.get(lastClosed)! } : undefined,
                values: months.map((month) => predictions.get(month)?.value ?? null),
              },
            ]} band={hasInterval ? {
              low: months.map((month) => predictions.get(month)?.low ?? null),
              high: months.map((month) => predictions.get(month)?.high ?? null),
            } : undefined} />
            <p className="text-xs leading-5 text-muted-foreground">El cálculo combina el mismo mes de los dos años anteriores, da más peso al año reciente y ajusta la estimación según los cambios mensuales interanuales. El mes en curso se estima completo.</p>
            {forecast.trend !== null && forecast.trend !== 0 && (
              <p className="text-xs leading-5 text-muted-foreground">El ajuste reciente {forecast.trend > 0 ? 'suma' : 'resta'} {showQuantity(Math.abs(forecast.trend), item.unit)} a la referencia mensual.</p>
            )}
            <p className="text-xs leading-5 text-muted-foreground">{hasInterval
              ? 'El rango orientativo usa errores de pruebas hechas sobre meses anteriores. Los resultados reales pueden quedar fuera del rango.'
              : 'El rango orientativo se habilita cuando hay al menos seis pruebas históricas por horizonte.'}</p>
          </>
        )}
      </div>
    </InfoPanel>
  )
}

export function AnalyticsDashboard({ publicView = false }: { publicView?: boolean }) {
  const [selected, setSelected] = useState<MonthRange | null>(null)
  const [draft, setDraft] = useState<MonthRange | null>(null)
  const [crop, setCrop] = useState('')
  const [unitFilter, setUnitFilter] = useState('')
  const [chartCrop, setChartCrop] = useState('')
  const [yearComparison, setYearComparison] = useState(false)
  const [filterError, setFilterError] = useState('')
  const endpoint = publicView ? '/api/public-analytics' : '/api/production-summary'
  const { data, error, isLoading, isValidating, mutate } = useSWR<AnalyticsReport>(
    selected ? endpoint + '?' + new URLSearchParams(selected) : endpoint, productionFetch, { keepPreviousData: true },
  )
  const period = draft ?? selected ?? data?.period ?? { from: '', to: '' }
  const crops = [...new Set(data?.series.map((item) => item.crop))].sort((a, b) => a.localeCompare(b, 'es-EC'))
  const cropSeries = data?.series.filter((item) => crop === '' || !crops.includes(crop) || item.crop === crop) ?? []
  const availableUnits = [...new Set(cropSeries.map((item) => item.unit))].sort((a, b) => {
    if (!data) return 0
    const hasProduction = (name: string) => cropSeries.some((row) => row.unit === name && total([row], 'harvested', data.period) !== null)
    return Number(hasProduction(b)) - Number(hasProduction(a)) || a.localeCompare(b, 'es-EC')
  })
  const unit = availableUnits.includes(unitFilter) ? unitFilter : availableUnits[0] ?? ''
  const filtered = cropSeries.filter((item) => item.unit === unit)
  const currentRanking = data ? ranking(filtered, 'harvested', data.period) : []
  const series = filtered.find((item) => item.crop === chartCrop)
    ?? filtered.find((item) => item.crop === currentRanking[0]?.label)
    ?? filtered[0]

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validMonth = (value: string) => /^20\d{2}-(0[1-9]|1[0-2])$/.test(value)
    if (
      !validMonth(period.from) ||
      !validMonth(period.to) ||
      period.from > period.to ||
      (data && period.to > data.latestMonth) ||
      monthDistance(period.from, period.to) >= 60
    ) {
      setFilterError('Selecciona un período válido (AAAA-MM) de hasta 60 meses dentro del rango disponible.')
      return
    }
    setFilterError('')
    setSelected(period)
    setDraft(null)
  }

  return (
    <div className="grid min-w-0 gap-5">
      <form onSubmit={apply} className={panel} aria-label="Filtros de estadísticas">
        <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          <label className="grid gap-1 text-xs font-medium">Desde
            <input className={field} type="month" min="2000-01" max={data?.latestMonth} value={period.from} required disabled={!data}
              onChange={(event) => setDraft({ ...period, from: event.target.value })} />
          </label>
          <label className="grid gap-1 text-xs font-medium">Hasta
            <input className={field} type="month" min={period.from || '2000-01'} max={data?.latestMonth} value={period.to} required disabled={!data}
              onChange={(event) => setDraft({ ...period, to: event.target.value })} />
          </label>
          <label className="grid gap-1 text-xs font-medium">Cultivo
            <select className={field} value={crops.includes(crop) ? crop : ''} onChange={(event) => { setCrop(event.target.value); setChartCrop('') }}>
              <option value="">Todos los cultivos</option>
              {crops.map((name) => <option key={name}>{name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium">Unidad
            <select className={field} value={unit} onChange={(event) => { setUnitFilter(event.target.value); setChartCrop('') }}>
              {!unit && <option value="">Sin unidades disponibles</option>}
              {availableUnits.map((name) => <option key={name}>{name}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-1">
            <button type="submit" className={primary} disabled={!data}>Aplicar</button>
            <button type="button" className={button} disabled={!data} onClick={() => { setDraft(null); setSelected(null); setFilterError('') }}>Últimos 12 meses</button>
          </div>
        </div>
        {filterError && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{filterError}</p>}
      </form>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
          <span>{error.message}</span><button type="button" className="font-semibold underline" onClick={() => void mutate()}>Reintentar</button>
        </div>
      )}
      {(isLoading || isValidating) && <p role="status" className="text-sm text-muted-foreground">{data ? 'Actualizando estadísticas…' : 'Cargando estadísticas…'}</p>}
      {data && (
        <>
          <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <p className="font-medium text-foreground">Período mostrado: {formatMonth(data.period.from)} a {formatMonth(data.period.to)}{unit ? ` · ${unit}` : ''}.</p>
              {unit && <p>Los indicadores reúnen los cultivos del filtro en la unidad seleccionada.</p>}
              <p>{publicView
                ? 'Los totales públicos suman los valores publicados. Se requieren tres registros por indicador, cultivo y unidad en cada mes cerrado. Los guiones indican información ausente o reservada.'
                : 'Los guiones y espacios del gráfico indican meses sin registros. El mes en curso incluye lo registrado hasta hoy.'}</p>
            </div>
          </div>
          <section aria-label="Indicadores del período" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {metricCards.map(({ key, title, icon: Icon }) => {
              const value = total(filtered, key, data.period)
              const change = comparison(filtered, key, data, value)
              const monthsWithData = availableMonths(filtered, key, data.period)
              const periodMonths = monthDistance(data.period.from, data.period.to) + 1
              const Arrow = change !== null && change < 0 ? ArrowDownRight : ArrowUpRight
              return (
                <div key={key} className={panel}>
                  <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-muted-foreground">{title}</p><Icon className="size-4.5 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden /></div>
                  <p className="mt-3 text-2xl font-semibold tabular-nums">{showQuantity(value, key === 'harvestCount' ? '' : unit)}</p>
                  {change !== null && <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Arrow className="size-3.5" aria-hidden />{percentFormat.format(change)} frente al período anterior</p>}
                  {monthsWithData > 0 && monthsWithData < periodMonths && <p className="mt-1 text-xs text-muted-foreground">Datos en {monthsWithData} de {periodMonths} meses</p>}
                </div>
              )
            })}
          </section>
          {!series ? (
            <p className={`${panel} text-sm text-muted-foreground`}>Todavía no hay series disponibles. La previsión requiere 24 meses cerrados consecutivos de cosecha por cultivo y unidad.</p>
          ) : (
            <AnalysisSections key={JSON.stringify([series.crop, series.unit])} report={data} series={series} filtered={filtered}
              chooseChart={setChartCrop} yearComparison={yearComparison} setYearComparison={setYearComparison} />
          )}
        </>
      )}
    </div>
  )
}

function AnalysisSections({ report, series, filtered, chooseChart, yearComparison, setYearComparison }: {
  report: AnalyticsReport
  series: AnalyticsSeries
  filtered: AnalyticsSeries[]
  chooseChart: (name: string) => void
  yearComparison: boolean
  setYearComparison: (checked: boolean) => void
}) {
  const months = monthsBetween(report.period.from, report.period.to)
  const point = new Map(series.monthly.map((row) => [row.month, row]))
  const values = (key: Metric, offset = 0) => months.map((month) => point.get(offset ? shiftMonth(month, offset) : month)?.[key] ?? null)
  const yearValues = values('harvested', -12)
  const yearSales = values('sold', -12)
  const hasYear = [...yearValues, ...yearSales].some((value) => value !== null)
  const quantity = (key: Metric) => total([series], key, report.period)
  const shipped = quantity('shipped')
  const received = quantity('received')
  const sold = quantity('sold')
  const comparableFlows = (first: Metric, second: Metric) => !report.publicView || months.every((month) =>
    (point.get(month)?.[first] !== undefined) === (point.get(month)?.[second] !== undefined),
  )
  const harvested = quantity('harvested')
  const deducted = quantity('deducted')
  const ratioAvailable = harvested !== null && harvested > 0 && deducted !== null &&
    months.every((month) => point.get(month)?.harvested === undefined || point.get(month)?.deducted !== undefined)
  const lossRows = report.publicView ? [] : [
    { label: 'Afectan la cosecha', value: quantity('affectingLosses') },
    { label: 'Solo estadísticas', value: quantity('statisticalLosses') },
    { label: 'Sin clasificar', value: quantity('unclassifiedLosses') },
  ]
  const caption = `${series.crop} · ${series.unit}`

  return (
    <div className="grid gap-5">
      <InfoPanel title="Evolución mensual de la producción" icon={Wheat} note={caption}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          {filtered.length > 1 && (
            <label className="grid min-w-48 gap-1 text-xs font-medium">Cultivo del gráfico
              <select className={field} value={series.crop} onChange={(event) => chooseChart(event.target.value)}>
                {filtered.map((item) => <option key={item.crop}>{item.crop}</option>)}
              </select>
            </label>
          )}
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" className="accent-emerald-700" checked={yearComparison && hasYear} disabled={!hasYear} onChange={(event) => setYearComparison(event.target.checked)} />
            Comparar con el año anterior{!hasYear && ' (sin datos disponibles)'}
          </label>
        </div>
        <AnalyticsChart label="Evolución mensual de la producción" unit={series.unit} months={months} lines={[
          { label: 'Cosechada', color: 'green', values: values('harvested') },
          { label: 'Útil', color: 'blue', values: values('useful') },
          ...(yearComparison && yearValues.some((value) => value !== null) ? [{ label: 'Cosechada · año anterior', color: 'gray' as const, values: yearValues, dashed: true }] : []),
        ]} />
        <p className="mt-3 text-sm text-muted-foreground">{trendText(series, report.period, report.currentMonth)}</p>
      </InfoPanel>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <InfoPanel title="Producción por cultivo" icon={Leaf} note={`Cantidad cosechada en ${series.unit} en el período mostrado.`}>
          <Ranking items={ranking(filtered, 'harvested', report.period)} unit={series.unit} />
        </InfoPanel>
        <SeasonalityPanel item={series} report={report} />
      </div>

      <InfoPanel title="Análisis de mermas" icon={TrendingDown} note={caption}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <AnalyticsChart label="Mermas por mes de registro" unit={series.unit} months={months} lines={[
            { label: 'Mermas por fecha de registro', color: 'amber', values: values('losses') },
          ]} />
          <div className="grid content-start gap-3">
            <QuantityList rows={[{ label: 'Total de mermas', value: quantity('losses') }, ...lossRows]} unit={series.unit} />
            <p className="text-sm text-muted-foreground">
              {ratioAvailable
                ? `Las mermas que reducen las cosechas del período equivalen al ${analyticsNumber.format(deducted! / harvested! * 100)} % de lo cosechado.`
                : 'El porcentaje requiere datos disponibles de cosecha y de merma descontada para los mismos meses.'}
            </p>
            <p className="text-xs leading-5 text-muted-foreground">La producción útil descuenta únicamente las mermas marcadas como pertinentes a su cosecha de origen. El gráfico agrupa las pérdidas por su propia fecha de registro.</p>
            {!report.publicView && (
              <div className="grid gap-2"><h4 className="text-sm font-semibold">Principales motivos de pérdida</h4><Ranking items={series.reasons.map((row) => ({ label: row.name, value: row.quantity }))} unit={series.unit} /></div>
            )}
          </div>
        </div>
      </InfoPanel>

      <InfoPanel title="Envíos y recepciones" icon={Truck} note={caption}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <AnalyticsChart label="Envíos y recepciones mensuales" unit={series.unit} months={months} lines={[
            { label: 'Enviada por Lodana', color: 'green', values: values('shipped') },
            { label: 'Recibida por Agro Market', color: 'blue', values: values('received') },
          ]} />
          <div className="grid content-start gap-3">
            <QuantityList unit={series.unit} rows={[
              { label: 'Enviada', value: shipped }, { label: 'Recibida', value: received },
              { label: 'Enviada menos recibida', value: shipped !== null && received !== null && comparableFlows('shipped', 'received') ? shipped - received : null },
            ]} />
            <p className="text-xs leading-5 text-muted-foreground">El envío cuenta en el mes de despacho y la recepción en el mes de llegada. La diferencia puede incluir entregas parciales, pendientes o registradas en otro mes.</p>
          </div>
        </div>
      </InfoPanel>

      <InfoPanel title="Actividad comercial de Agro Market" icon={ShoppingBasket} note={caption}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <AnalyticsChart label="Recepciones y ventas mensuales de Agro Market" unit={series.unit} months={months} lines={[
            { label: 'Recibida', color: 'blue', values: values('received') },
            { label: 'Vendida', color: 'green', values: values('sold') },
            ...(yearComparison && yearSales.some((value) => value !== null) ? [{ label: 'Vendida · año anterior', color: 'gray' as const, values: yearSales, dashed: true }] : []),
          ]} />
          <div className="grid content-start gap-3">
            <QuantityList unit={series.unit} rows={[
              { label: 'Recibida', value: received }, { label: 'Vendida', value: sold },
              { label: 'Recibida menos vendida', value: received !== null && sold !== null && comparableFlows('received', 'sold') ? received - sold : null },
            ]} />
            <p className="text-xs leading-5 text-muted-foreground">Las ventas pueden proceder de recepciones de otros meses. La diferencia resume los movimientos del período.</p>
            <h4 className="text-sm font-semibold">Productos con mayor volumen vendido</h4>
            <Ranking items={ranking(filtered, 'sold', report.period).slice(0, 8)} unit={series.unit} />
          </div>
        </div>
      </InfoPanel>

      <ForecastPanel item={series} report={report} />
    </div>
  )
}

