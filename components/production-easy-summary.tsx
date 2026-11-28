'use client'

import Link from 'next/link'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  PackageCheck,
  ShoppingBasket,
  SlidersHorizontal,
  Sprout,
  TrendingDown,
  TriangleAlert,
  Truck,
  Wheat,
} from 'lucide-react'
import { AnalyticsDashboard } from '@/components/analytics-dashboard'
import { BrandLoader } from '@/components/brand-loader'
import {
  monthDistance,
  monthsBetween,
  shiftMonth,
  type AnalyticsReport,
  type AnalyticsSeries,
  type Metric,
  type MonthRange,
} from '@/lib/analytics-model'
import { productionFetch, today } from '@/lib/production-client'

type PeriodPreset = 'this_month' | 'last_month' | 'last_3' | 'this_year' | 'last_12' | 'custom'
type ChartTab = 'harvested' | 'losses' | 'shipped' | 'sold'

type AvailabilityItem = {
  cropId: string
  cropName: string
  varietyId: string | null
  varietyName: string | null
  productionAreaId: string | null
  productionAreaName: string | null
  unitId: string
  unitName?: string
  available: number | string
}

type CropCardData = {
  key: string
  crop: string
  unit: string
  harvested: number
  previousHarvested: number
  harvestCount: number
  useful: number
  losses: number
  deducted: number
  lossPercent: number | null
  topReason: { name: string; quantity: number } | null
  shipped: number
  received: number
  sold: number
  availableToday: number
  deliveredUsd: number
  directCostsUsd: number
  status: 'good' | 'attention' | 'ready' | 'quiet'
  statusLabel: string
  series: AnalyticsSeries | null
}

const numberFmt = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 2 })
const percentFmt = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 0 })
const currencyFmt = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' })
const fullMonthFmt = new Intl.DateTimeFormat('es-EC', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const shortMonthFmt = new Intl.DateTimeFormat('es-EC', { month: 'short', timeZone: 'UTC' })

function formatQty(value: number, unit = '') {
  const formatted = numberFmt.format(value)
  return unit ? `${formatted} ${unit}` : formatted
}

function formatMoney(value: number) {
  return currencyFmt.format(value)
}

function capitalize(text: string) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

function formatMonthLong(month: string) {
  return capitalize(fullMonthFmt.format(new Date(`${month}-01T00:00:00Z`)))
}

function formatMonthShort(month: string) {
  return capitalize(shortMonthFmt.format(new Date(`${month}-01T00:00:00Z`)).replace('.', ''))
}

const calendarMonths = [
  { num: '01', short: 'Ene', full: 'Enero' },
  { num: '02', short: 'Feb', full: 'Febrero' },
  { num: '03', short: 'Mar', full: 'Marzo' },
  { num: '04', short: 'Abr', full: 'Abril' },
  { num: '05', short: 'May', full: 'Mayo' },
  { num: '06', short: 'Jun', full: 'Junio' },
  { num: '07', short: 'Jul', full: 'Julio' },
  { num: '08', short: 'Ago', full: 'Agosto' },
  { num: '09', short: 'Sep', full: 'Septiembre' },
  { num: '10', short: 'Oct', full: 'Octubre' },
  { num: '11', short: 'Nov', full: 'Noviembre' },
  { num: '12', short: 'Dic', full: 'Diciembre' },
] as const

function parseMonthParts(month: string): { year: number; monthNum: string } {
  const [y, m] = month.split('-')
  return { year: Number(y) || 2026, monthNum: m || '01' }
}

function periodRangeFor(preset: Exclude<PeriodPreset, 'custom'>, currentMonth: string): MonthRange {
  if (preset === 'this_month') return { from: currentMonth, to: currentMonth }
  if (preset === 'last_month') {
    const prev = shiftMonth(currentMonth, -1)
    return { from: prev, to: prev }
  }
  if (preset === 'last_3') {
    return { from: shiftMonth(currentMonth, -2), to: currentMonth }
  }
  if (preset === 'this_year') {
    return { from: `${currentMonth.slice(0, 4)}-01`, to: currentMonth }
  }
  return { from: shiftMonth(currentMonth, -11), to: currentMonth }
}

function sumMetric(series: AnalyticsSeries, metric: Metric, range: MonthRange) {
  let total = 0
  for (const point of series.monthly) {
    if (point.month >= range.from && point.month <= range.to && point[metric] !== undefined) {
      total += point[metric]!
    }
  }
  return total
}

const presetButtons: { id: Exclude<PeriodPreset, 'custom'>; label: string }[] = [
  { id: 'this_month', label: 'Este mes' },
  { id: 'last_month', label: 'Mes pasado' },
  { id: 'last_3', label: 'Últimos 3 meses' },
  { id: 'this_year', label: 'Este año' },
  { id: 'last_12', label: 'Últimos 12 meses' },
]

const axisCompactFmt = new Intl.NumberFormat('es-EC', { notation: 'compact', maximumFractionDigits: 1 })

const chartTabs: {
  id: ChartTab
  label: string
  activeClass: string
  colors: { top: string; bottom: string; mutedTop: string; mutedBottom: string; accent: string }
  lowerIsBetter?: boolean
}[] = [
  {
    id: 'harvested',
    label: 'Cosecha',
    activeClass: 'border-[#2c6048] bg-[#2c6048] text-white',
    colors: {
      top: '#10b981',
      bottom: '#1f5e42',
      mutedTop: '#3d8b69',
      mutedBottom: '#234f3b',
      accent: '#10b981',
    },
  },
  {
    id: 'losses',
    label: 'Pérdidas',
    activeClass: 'border-amber-600 bg-amber-600 text-white',
    colors: {
      top: '#f59e0b',
      bottom: '#b45309',
      mutedTop: '#c98a2e',
      mutedBottom: '#7c4a12',
      accent: '#f59e0b',
    },
    lowerIsBetter: true,
  },
  {
    id: 'shipped',
    label: 'Envíos',
    activeClass: 'border-sky-600 bg-sky-600 text-white',
    colors: {
      top: '#38bdf8',
      bottom: '#0369a1',
      mutedTop: '#4c94b8',
      mutedBottom: '#1e5273',
      accent: '#38bdf8',
    },
  },
  {
    id: 'sold',
    label: 'Ventas',
    activeClass: 'border-emerald-700 bg-emerald-700 text-white',
    colors: {
      top: '#34d399',
      bottom: '#047857',
      mutedTop: '#469e7d',
      mutedBottom: '#1c5c46',
      accent: '#34d399',
    },
  },
]

function roundedTopBarPath(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0 || w <= 0) return ''
  const radius = Math.min(r, w / 2, h)
  const bottom = y + h
  return [
    `M ${x},${bottom}`,
    `L ${x},${y + radius}`,
    `Q ${x},${y} ${x + radius},${y}`,
    `L ${x + w - radius},${y}`,
    `Q ${x + w},${y} ${x + w},${y + radius}`,
    `L ${x + w},${bottom}`,
    'Z',
  ].join(' ')
}

function niceAxisStep(maxValue: number) {
  if (maxValue <= 0) return 1
  const raw = maxValue / 4
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const normalized = raw / magnitude
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10
  return Math.max(0.01, nice * magnitude)
}

function formatAxisTick(value: number, prefix = '') {
  const formatted = value >= 1000 ? axisCompactFmt.format(value) : numberFmt.format(value)
  return prefix ? `${prefix}${formatted}` : formatted
}

const statusStyles: Record<CropCardData['status'], { dot: string; badge: string }> = {
  good: {
    dot: 'bg-emerald-600 dark:bg-emerald-400',
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800',
  },
  attention: {
    dot: 'bg-amber-500 dark:bg-amber-400',
    badge: 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800',
  },
  ready: {
    dot: 'bg-sky-600 dark:bg-sky-400',
    badge: 'bg-sky-50 text-sky-900 border-sky-200 dark:bg-sky-950/50 dark:text-sky-200 dark:border-sky-800',
  },
  quiet: {
    dot: 'bg-slate-400',
    badge: 'bg-muted text-muted-foreground border-border',
  },
}

const cardClass =
  'rounded-2xl border-2 border-[#d5e3d7] bg-white p-4 shadow-sm dark:border-[#2d3b32] dark:bg-[#18211c] sm:p-6'

function SimpleBarChart({
  bars,
  unit,
  colors,
  metricLabel,
  highlightMonth,
  lowerIsBetter = false,
  contextNote,
}: {
  bars: { month: string; label: string; fullLabel: string; value: number }[]
  unit: string
  colors: { top: string; bottom: string; mutedTop: string; mutedBottom: string; accent: string }
  metricLabel: string
  highlightMonth?: string
  lowerIsBetter?: boolean
  contextNote?: string
}) {
  const uid = useId().replace(/:/g, '')
  const viewportRef = useRef<HTMLDivElement>(null)
  const [viewportWidth, setViewportWidth] = useState(0)
  const [focusedMonth, setFocusedMonth] = useState<string | null>(null)

  const max = Math.max(...bars.map((b) => b.value), 0)

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setViewportWidth(Math.floor(entry.contentRect.width))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [max > 0])

  if (max <= 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#c7d8ca] bg-[#f7fbf7] px-4 py-8 text-center text-sm text-muted-foreground dark:border-[#34453a] dark:bg-[#141d18]">
        Sin movimientos registrados en estos meses para {metricLabel.toLowerCase()}.
      </div>
    )
  }

  const defaultIndex = (() => {
    if (highlightMonth) {
      const idx = bars.findIndex((b) => b.month === highlightMonth)
      if (idx >= 0) return idx
    }
    for (let i = bars.length - 1; i >= 0; i -= 1) {
      if (bars[i].value > 0) return i
    }
    return bars.length - 1
  })()

  const focusedIndex = (() => {
    if (!focusedMonth) return defaultIndex
    const idx = bars.findIndex((b) => b.month === focusedMonth)
    return idx >= 0 ? idx : defaultIndex
  })()

  const focused = bars[focusedIndex]
  const prevBar = focusedIndex > 0 ? bars[focusedIndex - 1] : null
  const delta = prevBar ? focused.value - prevBar.value : null
  const deltaPct = prevBar && prevBar.value > 0 ? (delta! / prevBar.value) * 100 : null
  const deltaPositiveTone =
    delta !== null && delta !== 0 ? (lowerIsBetter ? delta < 0 : delta > 0) : null

  const nonZeroBars = bars.filter((b) => b.value > 0)
  const average =
    nonZeroBars.length > 0
      ? nonZeroBars.reduce((sum, b) => sum + b.value, 0) / nonZeroBars.length
      : 0
  const bestBar = bars.reduce((best, item) => (item.value > best.value ? item : best), bars[0])

  const height = 252
  const padLeft = 56
  const padRight = 20
  const padTop = 30
  const padBottom = 40
  const plotHeight = height - padTop - padBottom

  const minChartWidth = Math.max(460, bars.length * 64 + padLeft + padRight)
  const width = Math.max(viewportWidth || 640, minChartWidth)
  const plotWidth = width - padLeft - padRight

  const step = niceAxisStep(max * 1.08)
  const ceiling = step * 4
  const yFor = (val: number) => padTop + plotHeight - (Math.min(val, ceiling) / ceiling) * plotHeight

  const slotWidth = plotWidth / bars.length
  const barWidth = Math.min(54, Math.max(18, Math.floor(slotWidth * 0.56)))
  const showAllValueLabels = bars.length <= 12
  const labelEvery = Math.max(1, Math.ceil(bars.length / 12))
  const showAverageLine = nonZeroBars.length >= 3 && average > 0 && average < ceiling

  return (
    <div className="grid gap-3 rounded-2xl border border-[#dce8de] bg-[#f7fbf7] p-3.5 dark:border-[#2d3b32] dark:bg-[#141d18] sm:p-4">
      {/* Barra superior de detalle interactivo + métricas de apoyo */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {focused.fullLabel}
          </p>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
            <span className="text-xl font-bold tabular-nums text-foreground sm:text-2xl">
              {formatQty(focused.value, unit)}
            </span>
            {delta !== null && prevBar && (prevBar.value > 0 || focused.value > 0) && (
              <span
                className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                  delta === 0
                    ? 'bg-muted text-muted-foreground'
                    : deltaPositiveTone
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300'
                }`}
              >
                {delta > 0 ? (
                  <ArrowUpRight className="size-3.5" aria-hidden />
                ) : delta < 0 ? (
                  <ArrowDownRight className="size-3.5" aria-hidden />
                ) : null}
                {delta === 0
                  ? 'Igual que el mes anterior'
                  : `${delta > 0 ? '+' : ''}${numberFmt.format(delta)}${
                      deltaPct !== null ? ` (${delta > 0 ? '+' : ''}${percentFmt.format(deltaPct)} %)` : ''
                    } vs. ${prevBar.label}`}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          {nonZeroBars.length >= 2 && (
            <div className="rounded-xl border border-border/70 bg-background/80 px-2.5 py-1.5">
              <span className="text-muted-foreground">Promedio: </span>
              <strong className="tabular-nums text-foreground">
                {formatQty(Math.round(average * 100) / 100, unit)}
              </strong>
            </div>
          )}
          {bestBar.value > 0 && (
            <div className="rounded-xl border border-border/70 bg-background/80 px-2.5 py-1.5">
              <span className="text-muted-foreground">Mayor mes: </span>
              <strong className="tabular-nums text-foreground">
                {bestBar.label} ({numberFmt.format(bestBar.value)})
              </strong>
            </div>
          )}
        </div>
      </div>

      {/* Gráfica SVG con ejes, cuadrícula, línea promedio y degradado */}
      <div
        ref={viewportRef}
        className="overflow-x-auto pb-1"
        tabIndex={0}
        role="region"
        aria-label={`Gráfica de barras de ${metricLabel} en ${unit}`}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ minWidth: minChartWidth }}
          className="block w-full select-none"
          role="img"
          aria-label={`Comparación mensual de ${metricLabel} en ${unit}`}
        >
          <defs>
            <linearGradient id={`bar-active-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.top} />
              <stop offset="100%" stopColor={colors.bottom} />
            </linearGradient>
            <linearGradient id={`bar-muted-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.mutedTop} stopOpacity="0.72" />
              <stop offset="100%" stopColor={colors.mutedBottom} stopOpacity="0.62" />
            </linearGradient>
          </defs>

          {/* Guías horizontales y eje Y */}
          {[0, 1, 2, 3, 4].map((tick) => {
            const val = step * tick
            const y = yFor(val)
            const isBase = tick === 0
            return (
              <g key={tick} className="text-muted-foreground">
                <line
                  x1={padLeft}
                  x2={width - padRight}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity={isBase ? 0.34 : 0.14}
                  strokeWidth={isBase ? 1.5 : 1}
                  strokeDasharray={isBase ? undefined : '4 4'}
                />
                <text
                  x={padLeft - 10}
                  y={y + 4}
                  textAnchor="end"
                  fill="currentColor"
                  fontSize="11"
                  className="tabular-nums"
                >
                  {formatAxisTick(val)}
                </text>
              </g>
            )
          })}

          {/* Línea de promedio */}
          {showAverageLine && (
            <g>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={yFor(average)}
                y2={yFor(average)}
                stroke={colors.accent}
                strokeOpacity="0.55"
                strokeWidth="1.5"
                strokeDasharray="6 4"
              />
              <rect
                x={width - padRight - 84}
                y={yFor(average) - 18}
                width={82}
                height={16}
                rx={6}
                fill={colors.bottom}
                fillOpacity="0.88"
              />
              <text
                x={width - padRight - 43}
                y={yFor(average) - 7}
                textAnchor="middle"
                fill="#ffffff"
                fontSize="10"
                fontWeight="600"
              >
                Prom. {formatAxisTick(Math.round(average * 10) / 10)}
              </text>
            </g>
          )}

          {/* Columnas y barras */}
          {bars.map((bar, index) => {
            const centerX = padLeft + slotWidth * (index + 0.5)
            const barX = centerX - barWidth / 2
            const baseY = padTop + plotHeight
            const barY = bar.value > 0 ? Math.min(baseY - 4, yFor(bar.value)) : baseY
            const barH = Math.max(0, baseY - barY)
            const isHighlighted = highlightMonth ? bar.month === highlightMonth : true
            const isFocused = index === focusedIndex
            const showXLabel = index === bars.length - 1 || index % labelEvery === 0
            const showValue = bar.value > 0 && (showAllValueLabels || isFocused)

            return (
              <g
                key={bar.month}
                className="cursor-pointer"
                onMouseEnter={() => setFocusedMonth(bar.month)}
                onClick={() => setFocusedMonth(bar.month)}
              >
                {/* Franja interactiva sutil */}
                <rect
                  x={padLeft + slotWidth * index + 3}
                  y={padTop - 8}
                  width={Math.max(0, slotWidth - 6)}
                  height={plotHeight + 12}
                  rx={10}
                  fill="currentColor"
                  className="text-foreground"
                  fillOpacity={isFocused ? 0.06 : 0}
                />

                {/* Barra principal */}
                {barH > 0 ? (
                  <path
                    d={roundedTopBarPath(barX, barY, barWidth, barH, 7)}
                    fill={
                      isHighlighted || isFocused
                        ? `url(#bar-active-${uid})`
                        : `url(#bar-muted-${uid})`
                    }
                    stroke={isFocused ? colors.accent : 'none'}
                    strokeOpacity={isFocused ? 0.9 : 0}
                    strokeWidth={isFocused ? 1.5 : 0}
                  />
                ) : (
                  <line
                    x1={barX}
                    x2={barX + barWidth}
                    y1={baseY - 1}
                    y2={baseY - 1}
                    stroke="currentColor"
                    strokeOpacity="0.22"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                )}

                {/* Valor encima de la barra */}
                {showValue && (
                  <text
                    x={centerX}
                    y={barY - 8}
                    textAnchor="middle"
                    fontSize={isFocused ? '12' : '11'}
                    fontWeight={isFocused || isHighlighted ? '700' : '600'}
                    className={
                      isFocused || isHighlighted ? 'fill-foreground' : 'fill-muted-foreground'
                    }
                  >
                    {numberFmt.format(bar.value)}
                  </text>
                )}

                {/* Etiqueta del mes en eje X */}
                {showXLabel && (
                  <text
                    x={centerX}
                    y={baseY + 20}
                    textAnchor="middle"
                    fontSize="11.5"
                    fontWeight={isFocused || isHighlighted ? '700' : '500'}
                    className={
                      isFocused || isHighlighted ? 'fill-foreground' : 'fill-muted-foreground'
                    }
                  >
                    {bar.label}
                  </text>
                )}

                {/* Punto indicador del mes elegido */}
                {highlightMonth && bar.month === highlightMonth && (
                  <circle cx={centerX} cy={baseY + 31} r={3} fill={colors.accent} />
                )}

                <title>{`${bar.fullLabel}: ${formatQty(bar.value, unit)}`}</title>
              </g>
            )
          })}
        </svg>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {contextNote ?? 'Toca o pasa el cursor sobre una barra para ver el detalle del mes.'}
        </span>
        {unit && <span className="font-semibold">Cantidades en {unit}</span>}
      </div>
    </div>
  )
}

function MoneyComparisonChart({
  rows,
}: {
  rows: { month: string; costsUsd: number; deliveredUsd: number }[]
}) {
  const uid = useId().replace(/:/g, '')
  const viewportRef = useRef<HTMLDivElement>(null)
  const [viewportWidth, setViewportWidth] = useState(0)
  const [focusedMonth, setFocusedMonth] = useState<string | null>(null)

  const max = Math.max(...rows.flatMap((r) => [r.costsUsd, r.deliveredUsd]), 0)

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setViewportWidth(Math.floor(entry.contentRect.width))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [max > 0])

  if (rows.length < 2 || max <= 0) return null

  const spansYears = new Set(rows.map((r) => r.month.slice(0, 4))).size > 1
  const focusedIndex = (() => {
    if (focusedMonth) {
      const idx = rows.findIndex((r) => r.month === focusedMonth)
      if (idx >= 0) return idx
    }
    return rows.length - 1
  })()
  const focused = rows[focusedIndex]

  const height = 228
  const padLeft = 62
  const padRight = 18
  const padTop = 24
  const padBottom = 34
  const plotHeight = height - padTop - padBottom

  const minChartWidth = Math.max(440, rows.length * 76 + padLeft + padRight)
  const width = Math.max(viewportWidth || 640, minChartWidth)
  const plotWidth = width - padLeft - padRight

  const step = niceAxisStep(max * 1.1)
  const ceiling = step * 4
  const yFor = (val: number) => padTop + plotHeight - (Math.min(val, ceiling) / ceiling) * plotHeight

  const slotWidth = plotWidth / rows.length
  const singleBarW = Math.min(24, Math.max(10, Math.floor((slotWidth * 0.62) / 2)))
  const gapBetween = 4
  const labelEvery = Math.max(1, Math.ceil(rows.length / 10))

  return (
    <div className="mt-4 grid gap-3 rounded-2xl border border-[#dce8de] bg-[#f7fbf7] p-3.5 dark:border-[#2d3b32] dark:bg-[#141d18] sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Mes a mes · {formatMonthLong(focused.month)}
          </p>
          <p className="mt-0.5 text-sm font-bold text-foreground">
            Gastado: <span className="tabular-nums">{formatMoney(focused.costsUsd)}</span>
            {' · '}
            Entregado:{' '}
            <span className="tabular-nums text-[#2c6048] dark:text-[#a8d5b3]">
              {formatMoney(focused.deliveredUsd)}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-violet-500" aria-hidden />
            Gastado
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-emerald-500" aria-hidden />
            Entregado
          </span>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="overflow-x-auto pb-1"
        tabIndex={0}
        role="region"
        aria-label="Comparación mensual de gastos de finca y valor entregado a Agro Market en dólares"
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ minWidth: minChartWidth }}
          className="block w-full select-none"
          role="img"
          aria-label="Gastos de finca frente a entregas a Agro Market por mes en dólares"
        >
          <defs>
            <linearGradient id={`money-cost-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a78bfa" />
              <stop offset="100%" stopColor="#6d28d9" />
            </linearGradient>
            <linearGradient id={`money-sale-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#1f5e42" />
            </linearGradient>
          </defs>

          {[0, 1, 2, 3, 4].map((tick) => {
            const val = step * tick
            const y = yFor(val)
            const isBase = tick === 0
            return (
              <g key={tick} className="text-muted-foreground">
                <line
                  x1={padLeft}
                  x2={width - padRight}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity={isBase ? 0.34 : 0.14}
                  strokeWidth={isBase ? 1.5 : 1}
                  strokeDasharray={isBase ? undefined : '4 4'}
                />
                <text
                  x={padLeft - 10}
                  y={y + 4}
                  textAnchor="end"
                  fill="currentColor"
                  fontSize="11"
                >
                  {formatAxisTick(val, '$')}
                </text>
              </g>
            )
          })}

          {rows.map((row, index) => {
            const centerX = padLeft + slotWidth * (index + 0.5)
            const baseY = padTop + plotHeight
            const costX = centerX - singleBarW - gapBetween / 2
            const saleX = centerX + gapBetween / 2
            const costY = row.costsUsd > 0 ? Math.min(baseY - 4, yFor(row.costsUsd)) : baseY
            const saleY = row.deliveredUsd > 0 ? Math.min(baseY - 4, yFor(row.deliveredUsd)) : baseY
            const isFocused = index === focusedIndex
            const showLabel = index === rows.length - 1 || index % labelEvery === 0
            const monthLabel = spansYears
              ? `${formatMonthShort(row.month)} ${row.month.slice(2, 4)}`
              : formatMonthShort(row.month)

            return (
              <g
                key={row.month}
                className="cursor-pointer"
                onMouseEnter={() => setFocusedMonth(row.month)}
                onClick={() => setFocusedMonth(row.month)}
              >
                <rect
                  x={padLeft + slotWidth * index + 3}
                  y={padTop - 6}
                  width={Math.max(0, slotWidth - 6)}
                  height={plotHeight + 10}
                  rx={10}
                  fill="currentColor"
                  className="text-foreground"
                  fillOpacity={isFocused ? 0.06 : 0}
                />
                {row.costsUsd > 0 && (
                  <path
                    d={roundedTopBarPath(costX, costY, singleBarW, baseY - costY, 5)}
                    fill={`url(#money-cost-${uid})`}
                    fillOpacity={isFocused ? 1 : 0.82}
                  />
                )}
                {row.deliveredUsd > 0 && (
                  <path
                    d={roundedTopBarPath(saleX, saleY, singleBarW, baseY - saleY, 5)}
                    fill={`url(#money-sale-${uid})`}
                    fillOpacity={isFocused ? 1 : 0.82}
                  />
                )}
                {showLabel && (
                  <text
                    x={centerX}
                    y={baseY + 20}
                    textAnchor="middle"
                    fontSize="11.5"
                    fontWeight={isFocused ? '700' : '500'}
                    className={isFocused ? 'fill-foreground' : 'fill-muted-foreground'}
                  >
                    {monthLabel}
                  </text>
                )}
                <title>{`${formatMonthLong(row.month)} · Gastado: ${formatMoney(row.costsUsd)} · Entregado a Agro Market: ${formatMoney(row.deliveredUsd)}`}</title>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

export function ProductionEasySummary() {
  const todayStr = today()
  const currentMonth = todayStr.slice(0, 7)
  const currentYear = Number(currentMonth.slice(0, 4))

  const [preset, setPreset] = useState<PeriodPreset>('this_month')
  const [customRange, setCustomRange] = useState<MonthRange>({
    from: shiftMonth(currentMonth, -2),
    to: currentMonth,
  })
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerMode, setPickerMode] = useState<'single' | 'range'>('single')
  const [pickerYear, setPickerYear] = useState(currentYear)
  const [draftFrom, setDraftFrom] = useState(shiftMonth(currentMonth, -2))
  const [draftTo, setDraftTo] = useState(currentMonth)
  const [pickerError, setPickerError] = useState('')

  const [selectedCropKey, setSelectedCropKey] = useState<string>('')
  const [chartTab, setChartTab] = useState<ChartTab>('harvested')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const requestedRange = useMemo(
    () => (preset === 'custom' ? customRange : periodRangeFor(preset, currentMonth)),
    [preset, customRange, currentMonth],
  )

  const selectableYears = useMemo(() => {
    const years: number[] = []
    for (let y = currentYear; y >= 2000; y -= 1) years.push(y)
    return years
  }, [currentYear])

  function selectPreset(next: Exclude<PeriodPreset, 'custom'>) {
    setPreset(next)
    setPickerOpen(false)
    setPickerError('')
  }

  function openCustomPicker() {
    const activeRange = requestedRange
    const { year } = parseMonthParts(activeRange.to)
    setPickerYear(year)
    setDraftFrom(activeRange.from)
    setDraftTo(activeRange.to)
    setPickerMode(activeRange.from === activeRange.to ? 'single' : 'range')
    setPickerError('')
    setPickerOpen((open) => !open)
  }

  function pickSingleMonth(month: string) {
    if (month > currentMonth) return
    setCustomRange({ from: month, to: month })
    setPreset('custom')
    setPickerError('')
    setPickerOpen(false)
  }

  function applyCustomRange() {
    if (draftFrom > draftTo) {
      setPickerError('El mes inicial debe ser anterior o igual al mes final.')
      return
    }
    if (draftTo > currentMonth) {
      setPickerError('No puedes seleccionar un mes futuro.')
      return
    }
    if (monthDistance(draftFrom, draftTo) >= 60) {
      setPickerError('El rango máximo permitido es de 60 meses (5 años).')
      return
    }
    setCustomRange({ from: draftFrom, to: draftTo })
    setPreset('custom')
    setPickerError('')
    setPickerOpen(false)
  }

  const {
    data: report,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<AnalyticsReport>(
    `/api/production-summary?${new URLSearchParams(requestedRange)}`,
    productionFetch,
    { keepPreviousData: true },
  )

  const { data: availability = [] } = useSWR<AvailabilityItem[]>(
    `/api/shipments/availability?${new URLSearchParams({ asOf: todayStr })}`,
    productionFetch,
  )

  const availableByCropUnit = useMemo(() => {
    const map = new Map<string, { crop: string; unit: string; available: number }>()
    for (const item of availability) {
      const qty = Number(item.available)
      if (!Number.isFinite(qty) || qty <= 0) continue
      const unit = item.unitName || ''
      const key = `${item.cropName}::${unit}`
      const existing = map.get(key)
      if (existing) {
        existing.available = Math.round((existing.available + qty) * 100) / 100
      } else {
        map.set(key, { crop: item.cropName, unit, available: Math.round(qty * 100) / 100 })
      }
    }
    return map
  }, [availability])

  const cropCards = useMemo<CropCardData[]>(() => {
    if (!report) return []

    const financialsByCrop = new Map(
      (report.financials?.byCrop ?? []).map((item) => [item.crop, item]),
    )
    const seriesByKey = new Map<string, AnalyticsSeries>()
    for (const s of report.series) {
      seriesByKey.set(`${s.crop}::${s.unit}`, s)
    }

    const allKeys = new Set<string>([...seriesByKey.keys(), ...availableByCropUnit.keys()])
    const cards: CropCardData[] = []

    for (const key of allKeys) {
      const series = seriesByKey.get(key) ?? null
      const avail = availableByCropUnit.get(key)
      const crop = series?.crop ?? avail?.crop ?? ''
      const unit = series?.unit ?? avail?.unit ?? ''
      if (!crop) continue

      const harvested = series ? sumMetric(series, 'harvested', report.period) : 0
      const previousHarvested = series ? sumMetric(series, 'harvested', report.previous) : 0
      const harvestCount = series ? sumMetric(series, 'harvestCount', report.period) : 0
      const useful = series ? sumMetric(series, 'useful', report.period) : 0
      const losses = series ? sumMetric(series, 'losses', report.period) : 0
      const deducted = series ? sumMetric(series, 'deducted', report.period) : 0
      const shipped = series ? sumMetric(series, 'shipped', report.period) : 0
      const received = series ? sumMetric(series, 'received', report.period) : 0
      const sold = series ? sumMetric(series, 'sold', report.period) : 0
      const availableToday = avail?.available ?? 0
      const money = financialsByCrop.get(crop)

      const hasAnyActivity =
        harvested > 0 || losses > 0 || shipped > 0 || received > 0 || sold > 0 || availableToday > 0
      if (!hasAnyActivity) continue

      const lossBase = deducted > 0 ? deducted : losses
      const lossPercent = harvested > 0 && lossBase > 0 ? (lossBase / harvested) * 100 : null
      const topReason = series?.reasons[0] ?? null

      let status: CropCardData['status'] = 'quiet'
      let statusLabel = 'Sin cosechas'
      if (lossPercent !== null && lossPercent >= 10) {
        status = 'attention'
        statusLabel = 'Pérdidas altas'
      } else if (harvested > 0) {
        status = 'good'
        statusLabel = 'Buen ritmo'
      } else if (availableToday > 0) {
        status = 'ready'
        statusLabel = 'Listo para enviar'
      }

      cards.push({
        key,
        crop,
        unit,
        harvested,
        previousHarvested,
        harvestCount,
        useful,
        losses,
        deducted,
        lossPercent,
        topReason,
        shipped,
        received,
        sold,
        availableToday,
        deliveredUsd: money?.deliveredUsd ?? 0,
        directCostsUsd: money?.directCostsUsd ?? 0,
        status,
        statusLabel,
        series,
      })
    }

    return cards.sort(
      (a, b) =>
        Number(b.status === 'attention') - Number(a.status === 'attention') ||
        Number(b.harvested > 0) - Number(a.harvested > 0) ||
        b.harvested - a.harvested ||
        b.availableToday - a.availableToday ||
        a.crop.localeCompare(b.crop, 'es-EC'),
    )
  }, [report, availableByCropUnit])

  const selectedCrop =
    cropCards.find((card) => card.key === selectedCropKey) ?? cropCards[0] ?? null

  const periodLabel = useMemo(() => {
    const { from, to } = report?.period ?? requestedRange
    if (from === to) {
      return `${formatMonthLong(from)}${to === currentMonth ? ' (hasta hoy)' : ''}`
    }
    return `${formatMonthLong(from)} a ${formatMonthLong(to)}${to === currentMonth ? ' (hasta hoy)' : ''}`
  }, [report, requestedRange, currentMonth])

  const activeHarvestCrops = cropCards.filter((c) => c.harvested > 0)
  const attentionCrops = cropCards.filter((c) => c.status === 'attention')
  const readyCrops = cropCards.filter((c) => c.availableToday > 0)
  const topCrop = useMemo(
    () =>
      [...activeHarvestCrops].sort(
        (a, b) => b.harvestCount - a.harvestCount || b.harvested - a.harvested,
      )[0] ?? null,
    [activeHarvestCrops],
  )
  const worstLossCrop = useMemo(
    () =>
      [...attentionCrops].sort((a, b) => (b.lossPercent ?? 0) - (a.lossPercent ?? 0))[0] ?? null,
    [attentionCrops],
  )

  const financials = report?.financials
  const costsUsd = financials?.costsUsd ?? 0
  const deliveredUsd = financials?.deliveredUsd ?? 0
  const topCategory = financials?.topCategories[0] ?? null

  const chartBars = useMemo(() => {
    if (!report || !selectedCrop) return []
    const pointMap = new Map(
      (selectedCrop.series?.monthly ?? []).map((point) => [point.month, point]),
    )
    const isSingleMonth = report.period.from === report.period.to
    const sixMonthStart = shiftMonth(report.period.to, -5)
    const contextFrom = sixMonthStart < '2000-01' ? '2000-01' : sixMonthStart
    const months = isSingleMonth
      ? monthsBetween(contextFrom, report.period.to)
      : monthsBetween(report.period.from, report.period.to)
    const spansYears = new Set(months.map((m) => m.slice(0, 4))).size > 1

    return months.map((month) => ({
      month,
      label: spansYears
        ? `${formatMonthShort(month)} ${month.slice(2, 4)}`
        : formatMonthShort(month),
      fullLabel: formatMonthLong(month),
      value: pointMap.get(month)?.[chartTab] ?? 0,
    }))
  }, [report, selectedCrop, chartTab])

  const activeChartMeta = chartTabs.find((tab) => tab.id === chartTab) ?? chartTabs[0]

  return (
    <div className="grid gap-4 sm:gap-5">
      {/* Encabezado limpio con selector flexible de fechas */}
      <section className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Cómo va la finca
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {periodLabel}
            </p>
          </div>
          {isValidating && (
            <span role="status" className="rounded-full bg-[#eef5ef] px-3 py-1 text-xs font-semibold text-[#2c6048] dark:bg-[#223027] dark:text-[#a8d5b3]">
              Actualizando…
            </span>
          )}
        </div>

        {/* Botones rápidos de período + selector flexible de fechas */}
        <div
          role="group"
          aria-label="Elegir período"
          className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
        >
          {presetButtons.map((btn) => {
            const active = preset === btn.id && !pickerOpen
            return (
              <button
                key={btn.id}
                type="button"
                aria-pressed={active}
                onClick={() => selectPreset(btn.id)}
                className={`min-h-11 rounded-xl border-2 px-3 py-2 text-sm font-bold transition ${
                  active
                    ? 'border-[#2c6048] bg-[#2c6048] text-white shadow-sm'
                    : 'border-[#c7d8ca] bg-[#f7fbf7] text-foreground hover:border-[#2c6048] hover:bg-[#eef5ef] dark:border-[#34453a] dark:bg-[#141d18]'
                }`}
              >
                {btn.label}
              </button>
            )
          })}

          <button
            type="button"
            aria-pressed={preset === 'custom' || pickerOpen}
            aria-expanded={pickerOpen}
            onClick={openCustomPicker}
            className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-2 text-sm font-bold transition ${
              preset === 'custom' || pickerOpen
                ? 'border-[#2c6048] bg-[#2c6048] text-white shadow-sm'
                : 'border-dashed border-[#2c6048] bg-white text-[#2c6048] hover:bg-[#eef5ef] dark:bg-[#141d18] dark:text-[#a8d5b3]'
            }`}
          >
            <CalendarDays className="size-4 shrink-0" aria-hidden />
            Elegir fechas
          </button>
        </div>

        {/* Resumen del rango personalizado cuando el selector está cerrado */}
        {preset === 'custom' && !pickerOpen && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[#b7d3bc] bg-[#f7fbf7] px-4 py-2.5 dark:border-[#2d4537] dark:bg-[#141d18]">
            <div className="flex items-center gap-2 text-sm">
              <CalendarDays className="size-4 shrink-0 text-[#2c6048] dark:text-[#a8d5b3]" aria-hidden />
              <span className="text-muted-foreground">Fechas elegidas:</span>
              <strong className="text-foreground">{periodLabel}</strong>
            </div>
            <button
              type="button"
              onClick={openCustomPicker}
              className="rounded-lg border border-[#c7d8ca] bg-white px-3 py-1 text-xs font-bold text-foreground transition hover:bg-[#eef5ef] dark:border-[#34453a] dark:bg-[#18211c]"
            >
              Cambiar fechas
            </button>
          </div>
        )}

        {/* Selector visual para elegir cualquier mes o rango de meses */}
        {pickerOpen && (
          <div
            role="region"
            aria-label="Selector de fechas personalizadas"
            className="mt-3 grid gap-4 rounded-2xl border-2 border-[#b7d3bc] bg-[#f7fbf7] p-4 dark:border-[#2d4537] dark:bg-[#141d18]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div
                role="tablist"
                aria-label="Tipo de selección de fechas"
                className="inline-flex rounded-xl border border-[#c7d8ca] bg-white p-1 dark:border-[#34453a] dark:bg-[#18211c]"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={pickerMode === 'single'}
                  onClick={() => {
                    setPickerMode('single')
                    setPickerError('')
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    pickerMode === 'single'
                      ? 'bg-[#2c6048] text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Un mes específico
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={pickerMode === 'range'}
                  onClick={() => {
                    setPickerMode('range')
                    setPickerError('')
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    pickerMode === 'range'
                      ? 'bg-[#2c6048] text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Rango de meses
                </button>
              </div>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="text-xs font-bold text-[#2c6048] underline underline-offset-2 dark:text-[#a8d5b3]"
              >
                Cerrar
              </button>
            </div>

            {pickerMode === 'single' ? (
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    aria-label="Año anterior"
                    disabled={pickerYear <= 2000}
                    onClick={() => setPickerYear((y) => Math.max(2000, y - 1))}
                    className="flex min-h-10 min-w-10 items-center justify-center rounded-xl border-2 border-[#c7d8ca] bg-white text-foreground transition hover:border-[#2c6048] disabled:opacity-40 dark:border-[#34453a] dark:bg-[#18211c]"
                  >
                    <ChevronLeft className="size-5" aria-hidden />
                  </button>
                  <p className="text-lg font-bold tabular-nums text-foreground">{pickerYear}</p>
                  <button
                    type="button"
                    aria-label="Año siguiente"
                    disabled={pickerYear >= currentYear}
                    onClick={() => setPickerYear((y) => Math.min(currentYear, y + 1))}
                    className="flex min-h-10 min-w-10 items-center justify-center rounded-xl border-2 border-[#c7d8ca] bg-white text-foreground transition hover:border-[#2c6048] disabled:opacity-40 dark:border-[#34453a] dark:bg-[#18211c]"
                  >
                    <ChevronRight className="size-5" aria-hidden />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {calendarMonths.map((m) => {
                    const iso = `${pickerYear}-${m.num}`
                    const isFuture = iso > currentMonth
                    const isSelected =
                      requestedRange.from === iso && requestedRange.to === iso
                    return (
                      <button
                        key={iso}
                        type="button"
                        disabled={isFuture}
                        aria-pressed={isSelected}
                        onClick={() => pickSingleMonth(iso)}
                        className={`min-h-11 rounded-xl border-2 px-2 py-2 text-sm font-bold transition ${
                          isSelected
                            ? 'border-[#2c6048] bg-[#2c6048] text-white shadow-sm'
                            : isFuture
                              ? 'cursor-not-allowed border-transparent bg-muted/40 text-muted-foreground/40'
                              : 'border-[#c7d8ca] bg-white text-foreground hover:border-[#2c6048] hover:bg-[#eef5ef] dark:border-[#34453a] dark:bg-[#18211c]'
                        }`}
                      >
                        {m.full}
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Toca cualquier mes para ver cómo fue la finca en esa fecha.
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {/* Desde */}
                  <div className="grid gap-1.5">
                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Desde
                    </span>
                    <div className="grid grid-cols-[1.4fr_1fr] gap-2">
                      <select
                        aria-label="Mes inicial"
                        value={parseMonthParts(draftFrom).monthNum}
                        onChange={(e) => {
                          const { year } = parseMonthParts(draftFrom)
                          setDraftFrom(`${year}-${e.target.value}`)
                          setPickerError('')
                        }}
                        className="min-h-11 rounded-xl border-2 border-[#c7d8ca] bg-white px-3 py-2 text-sm font-semibold text-foreground dark:border-[#34453a] dark:bg-[#18211c]"
                      >
                        {calendarMonths.map((m) => (
                          <option key={m.num} value={m.num}>
                            {m.full}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Año inicial"
                        value={parseMonthParts(draftFrom).year}
                        onChange={(e) => {
                          const { monthNum } = parseMonthParts(draftFrom)
                          setDraftFrom(`${e.target.value}-${monthNum}`)
                          setPickerError('')
                        }}
                        className="min-h-11 rounded-xl border-2 border-[#c7d8ca] bg-white px-3 py-2 text-sm font-semibold text-foreground dark:border-[#34453a] dark:bg-[#18211c]"
                      >
                        {selectableYears.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Hasta */}
                  <div className="grid gap-1.5">
                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Hasta
                    </span>
                    <div className="grid grid-cols-[1.4fr_1fr] gap-2">
                      <select
                        aria-label="Mes final"
                        value={parseMonthParts(draftTo).monthNum}
                        onChange={(e) => {
                          const { year } = parseMonthParts(draftTo)
                          setDraftTo(`${year}-${e.target.value}`)
                          setPickerError('')
                        }}
                        className="min-h-11 rounded-xl border-2 border-[#c7d8ca] bg-white px-3 py-2 text-sm font-semibold text-foreground dark:border-[#34453a] dark:bg-[#18211c]"
                      >
                        {calendarMonths.map((m) => (
                          <option key={m.num} value={m.num}>
                            {m.full}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Año final"
                        value={parseMonthParts(draftTo).year}
                        onChange={(e) => {
                          const { monthNum } = parseMonthParts(draftTo)
                          setDraftTo(`${e.target.value}-${monthNum}`)
                          setPickerError('')
                        }}
                        className="min-h-11 rounded-xl border-2 border-[#c7d8ca] bg-white px-3 py-2 text-sm font-semibold text-foreground dark:border-[#34453a] dark:bg-[#18211c]"
                      >
                        {selectableYears.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {pickerError && (
                  <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-300">
                    {pickerError}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    Puedes consultar cualquier rango de hasta 5 años.
                  </span>
                  <button
                    type="button"
                    onClick={applyCustomRange}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#2c6048] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#234d39]"
                  >
                    Ver estas fechas
                    <ArrowRight className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
        >
          <span>{error.message}</span>
          <button type="button" onClick={() => void mutate()} className="font-bold underline">
            Reintentar
          </button>
        </div>
      )}

      {isLoading && !report && (
        <BrandLoader
          variant="section"
          message="Cargando resumen de la finca…"
          subtitle="Reuniendo cosechas, pérdidas, envíos y gastos"
        />
      )}

      {report && (
        <>
          {/* 1. Boletín claro en lenguaje simple (sin emojis) */}
          <section className={cardClass} aria-labelledby="bulletin-heading">
            <h3 id="bulletin-heading" className="text-lg font-bold">
              Resumen rápido
            </h3>
            <ul className="mt-3 grid gap-2.5 text-sm leading-relaxed sm:text-base">
              <li className="flex items-start gap-3 rounded-xl border border-[#dce8de] bg-[#f7fbf7] p-3.5 dark:border-[#2d3b32] dark:bg-[#141d18]">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                  <Wheat className="size-4.5" aria-hidden />
                </span>
                <p className="text-foreground">
                  {activeHarvestCrops.length > 0 && topCrop ? (
                    <>
                      Cosechaste en <strong>{activeHarvestCrops.length} cultivo(s)</strong>. El de
                      mayor actividad fue <strong>{topCrop.crop}</strong> con{' '}
                      <strong>{formatQty(topCrop.harvested, topCrop.unit)}</strong>.
                    </>
                  ) : (
                    <>
                      Todavía no hay cosechas registradas en este período.{' '}
                      <Link
                        href="/lodana?seccion=cosechas"
                        className="font-bold text-[#2c6048] underline underline-offset-2 dark:text-[#a8d5b3]"
                      >
                        Anotar una cosecha
                      </Link>
                    </>
                  )}
                </p>
              </li>

              <li
                className={`flex items-start gap-3 rounded-xl border p-3.5 ${
                  worstLossCrop
                    ? 'border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30'
                    : 'border-[#dce8de] bg-[#f7fbf7] dark:border-[#2d3b32] dark:bg-[#141d18]'
                }`}
              >
                <span
                  className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${
                    worstLossCrop
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
                  }`}
                >
                  {worstLossCrop ? (
                    <TriangleAlert className="size-4.5" aria-hidden />
                  ) : (
                    <CheckCircle2 className="size-4.5" aria-hidden />
                  )}
                </span>
                <p className="text-foreground">
                  {worstLossCrop ? (
                    <>
                      <strong>Atención con {worstLossCrop.crop}:</strong> se perdió el{' '}
                      <strong>{percentFmt.format(worstLossCrop.lossPercent ?? 0)} %</strong> (
                      {formatQty(worstLossCrop.losses, worstLossCrop.unit)})
                      {worstLossCrop.topReason ? (
                        <>
                          , sobre todo por <strong>{worstLossCrop.topReason.name}</strong>
                        </>
                      ) : null}
                      .
                    </>
                  ) : activeHarvestCrops.length > 0 ? (
                    <>
                      <strong>Pérdidas controladas:</strong> ningún cultivo supera el 10 % de
                      pérdida en este período.
                    </>
                  ) : (
                    <>Sin alertas de pérdidas en este período.</>
                  )}
                </p>
              </li>

              <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dce8de] bg-[#f7fbf7] p-3.5 dark:border-[#2d3b32] dark:bg-[#141d18]">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200">
                    <Truck className="size-4.5" aria-hidden />
                  </span>
                  <p className="text-foreground">
                    {readyCrops.length > 0 ? (
                      <>
                        <strong>Listo para enviar hoy:</strong>{' '}
                        {readyCrops
                          .slice(0, 3)
                          .map((item) => `${formatQty(item.availableToday, item.unit)} de ${item.crop}`)
                          .join(', ')}
                        {readyCrops.length > 3 ? ` y ${readyCrops.length - 3} cultivo(s) más` : ''}.
                      </>
                    ) : (
                      <>No tienes producto pendiente de envío en finca hoy.</>
                    )}
                  </p>
                </div>
                {readyCrops.length > 0 && (
                  <Link
                    href="/lodana?seccion=envios"
                    className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#2c6048] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[#234d39]"
                  >
                    Enviar ahora
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                )}
              </li>

              <li className="flex items-start gap-3 rounded-xl border border-[#dce8de] bg-[#f7fbf7] p-3.5 dark:border-[#2d3b32] dark:bg-[#141d18]">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200">
                  <DollarSign className="size-4.5" aria-hidden />
                </span>
                <p className="text-foreground">
                  En gastos de finca llevas <strong>{formatMoney(costsUsd)}</strong>
                  {topCategory ? (
                    <>
                      {' '}
                      (mayor gasto: <strong>{topCategory.name}</strong> con{' '}
                      {formatMoney(topCategory.amountUsd)})
                    </>
                  ) : null}
                  . Entregaste a Agro Market producto valorado en{' '}
                  <strong>{formatMoney(deliveredUsd)}</strong> (precio de finca).
                </p>
              </li>
            </ul>
          </section>

          {/* 2. Semáforo de cultivos */}
          <section className={cardClass} aria-labelledby="crops-status-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 id="crops-status-heading" className="text-lg font-bold">
                  Tus cultivos uno por uno
                </h3>
                <p className="text-sm text-muted-foreground">
                  Toca un cultivo para ver el recorrido completo de su cosecha.
                </p>
              </div>
              <span className="rounded-full border border-[#c7d8ca] bg-[#f7fbf7] px-3 py-1 text-xs font-semibold text-muted-foreground dark:border-[#34453a] dark:bg-[#141d18]">
                {cropCards.length} cultivo(s)
              </span>
            </div>

            {cropCards.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-[#c7d8ca] p-6 text-center text-sm text-muted-foreground dark:border-[#34453a]">
                No hay movimientos registrados en este período. Prueba tocando{' '}
                <strong>Mes pasado</strong> o <strong>Últimos 3 meses</strong>.
              </div>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {cropCards.map((card) => {
                  const isSelected = selectedCrop?.key === card.key
                  const style = statusStyles[card.status]
                  const lostRatio =
                    card.harvested > 0
                      ? Math.min(100, Math.round(((card.deducted || card.losses) / card.harvested) * 100))
                      : 0
                  const usefulRatio = card.harvested > 0 ? Math.max(0, 100 - lostRatio) : 0

                  return (
                    <button
                      key={card.key}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedCropKey(card.key)}
                      className={`grid gap-3 rounded-2xl border-2 p-4 text-left transition ${
                        isSelected
                          ? 'border-[#2c6048] bg-[#eef5ef] shadow-sm dark:border-emerald-500 dark:bg-[#1f3328]'
                          : 'border-[#d5e3d7] bg-[#f7fbf7] hover:border-[#2c6048] dark:border-[#2d3b32] dark:bg-[#141d18]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-base font-bold text-foreground">
                            {card.crop}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Medido en {card.unit || 'unidades'}
                          </p>
                        </div>
                        <span
                          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style.badge}`}
                        >
                          <span className={`size-2 rounded-full ${style.dot}`} aria-hidden />
                          {card.statusLabel}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">Cosechado</p>
                          <p className="mt-0.5 text-sm font-bold tabular-nums text-foreground">
                            {numberFmt.format(card.harvested)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Perdido</p>
                          <p
                            className={`mt-0.5 text-sm font-bold tabular-nums ${
                              card.status === 'attention'
                                ? 'text-amber-700 dark:text-amber-300'
                                : 'text-foreground'
                            }`}
                          >
                            {card.losses > 0
                              ? card.lossPercent !== null
                                ? `${percentFmt.format(card.lossPercent)} %`
                                : numberFmt.format(card.losses)
                              : '0'}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Listo hoy</p>
                          <p className="mt-0.5 text-sm font-bold tabular-nums text-[#2c6048] dark:text-[#a8d5b3]">
                            {numberFmt.format(card.availableToday)}
                          </p>
                        </div>
                      </div>

                      {card.harvested > 0 && (
                        <div className="grid gap-1">
                          <div
                            className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
                            aria-hidden
                          >
                            <div
                              className="h-full bg-[#2c6048] dark:bg-emerald-500"
                              style={{ width: `${usefulRatio}%` }}
                            />
                            {lostRatio > 0 && (
                              <div
                                className="h-full bg-amber-500"
                                style={{ width: `${lostRatio}%` }}
                              />
                            )}
                          </div>
                          <div className="flex justify-between text-[11px] text-muted-foreground">
                            <span>Aprovechado {usefulRatio} %</span>
                            {lostRatio > 0 && <span>Perdido {lostRatio} %</span>}
                          </div>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {/* 3. El camino de tu cosecha (flujo visual paso a paso del cultivo seleccionado) */}
          {selectedCrop && (
            <section className={cardClass} aria-labelledby="journey-heading">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-[#e4f0e7] text-[#2c6048] dark:bg-[#234634] dark:text-[#a8d5b3]">
                    <Sprout className="size-5" aria-hidden />
                  </span>
                  <div>
                    <h3 id="journey-heading" className="text-lg font-bold">
                      El camino de tu cosecha: {selectedCrop.crop}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Desde lo que cosechaste hasta lo que se vendió en Agro Market ({selectedCrop.unit})
                    </p>
                  </div>
                </div>
              </div>

              {/* 4 pasos conectados */}
              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] md:items-stretch">
                {/* Paso 1: Cosechaste */}
                <div className="flex flex-col justify-between rounded-2xl border border-[#dce8de] bg-[#f7fbf7] p-4 dark:border-[#2d3b32] dark:bg-[#141d18]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-[#2c6048] dark:text-[#a8d5b3]">
                      1. Cosechaste
                    </span>
                    <Wheat className="size-4 text-[#2c6048] dark:text-[#a8d5b3]" aria-hidden />
                  </div>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
                    {formatQty(selectedCrop.harvested, selectedCrop.unit)}
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {selectedCrop.harvestCount > 0
                      ? `${selectedCrop.harvestCount} cosecha(s) anotada(s)`
                      : 'Sin cosechas en este período'}
                    {selectedCrop.previousHarvested > 0 && selectedCrop.harvested > 0 && (
                      <span className="mt-1 flex items-center gap-1 font-semibold text-foreground">
                        {selectedCrop.harvested >= selectedCrop.previousHarvested ? (
                          <ArrowUpRight className="size-3.5 text-emerald-600" aria-hidden />
                        ) : (
                          <ArrowDownRight className="size-3.5 text-amber-600" aria-hidden />
                        )}
                        Antes: {formatQty(selectedCrop.previousHarvested, selectedCrop.unit)}
                      </span>
                    )}
                  </p>
                </div>

                <div className="hidden items-center justify-center text-muted-foreground md:flex" aria-hidden>
                  <ArrowRight className="size-5" />
                </div>

                {/* Paso 2: Se perdió */}
                <div
                  className={`flex flex-col justify-between rounded-2xl border p-4 ${
                    selectedCrop.status === 'attention'
                      ? 'border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30'
                      : 'border-[#dce8de] bg-[#f7fbf7] dark:border-[#2d3b32] dark:bg-[#141d18]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                      2. Se perdió
                    </span>
                    <TrendingDown className="size-4 text-amber-700 dark:text-amber-300" aria-hidden />
                  </div>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
                    {formatQty(selectedCrop.losses, selectedCrop.unit)}
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {selectedCrop.losses > 0 ? (
                      <>
                        {selectedCrop.lossPercent !== null
                          ? `${percentFmt.format(selectedCrop.lossPercent)} % de lo cosechado`
                          : 'Pérdida registrada'}
                        {selectedCrop.topReason && (
                          <span className="mt-1 block font-semibold text-foreground">
                            Motivo principal: {selectedCrop.topReason.name}
                          </span>
                        )}
                      </>
                    ) : (
                      'Sin pérdidas registradas'
                    )}
                  </p>
                </div>

                <div className="hidden items-center justify-center text-muted-foreground md:flex" aria-hidden>
                  <ArrowRight className="size-5" />
                </div>

                {/* Paso 3: Enviaste */}
                <div className="flex flex-col justify-between rounded-2xl border border-[#dce8de] bg-[#f7fbf7] p-4 dark:border-[#2d3b32] dark:bg-[#141d18]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-sky-800 dark:text-sky-300">
                      3. Enviaste
                    </span>
                    <Truck className="size-4 text-sky-700 dark:text-sky-300" aria-hidden />
                  </div>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
                    {formatQty(selectedCrop.shipped, selectedCrop.unit)}
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Recibido en tienda: <strong>{formatQty(selectedCrop.received, selectedCrop.unit)}</strong>
                    <span className="mt-1 block font-semibold text-[#2c6048] dark:text-[#a8d5b3]">
                      Aún en finca hoy: {formatQty(selectedCrop.availableToday, selectedCrop.unit)}
                    </span>
                  </p>
                </div>

                <div className="hidden items-center justify-center text-muted-foreground md:flex" aria-hidden>
                  <ArrowRight className="size-5" />
                </div>

                {/* Paso 4: Demanda en Agro Market y valor entregado */}
                <div className="flex flex-col justify-between rounded-2xl border border-[#dce8de] bg-[#f7fbf7] p-4 dark:border-[#2d3b32] dark:bg-[#141d18]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                      4. Demanda en tienda
                    </span>
                    <ShoppingBasket className="size-4 text-emerald-700 dark:text-emerald-300" aria-hidden />
                  </div>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
                    {formatQty(selectedCrop.sold, selectedCrop.unit)}
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {selectedCrop.deliveredUsd > 0 ? (
                      <>
                        Entregado a precio de finca:{' '}
                        <strong className="text-foreground">{formatMoney(selectedCrop.deliveredUsd)}</strong>
                      </>
                    ) : selectedCrop.sold > 0 ? (
                      'Rotación registrada en Agro Market'
                    ) : (
                      'Sin entregas valorizadas en este período'
                    )}
                    {selectedCrop.directCostsUsd > 0 && (
                      <span className="mt-1 block">
                        Gasto directo asignado: {formatMoney(selectedCrop.directCostsUsd)}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Gráfica simple de barras por mes */}
              <div className="mt-5 grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <BarChart3 className="size-4 text-[#2c6048] dark:text-[#a8d5b3]" aria-hidden />
                    Comparación por mes ({selectedCrop.crop})
                  </p>
                  <div role="tablist" aria-label="Elegir dato del gráfico" className="flex flex-wrap gap-1.5">
                    {chartTabs.map((tab) => {
                      const active = chartTab === tab.id
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setChartTab(tab.id)}
                          className={`min-h-9 rounded-full border-2 px-3 py-1 text-xs font-bold transition ${
                            active
                              ? tab.activeClass
                              : 'border-[#c7d8ca] bg-white text-foreground hover:border-[#2c6048] dark:border-[#34453a] dark:bg-[#141d18]'
                          }`}
                        >
                          {tab.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <SimpleBarChart
                  key={`${selectedCrop.key}:${chartTab}:${report.period.from}:${report.period.to}`}
                  bars={chartBars}
                  unit={selectedCrop.unit}
                  colors={activeChartMeta.colors}
                  metricLabel={activeChartMeta.label}
                  lowerIsBetter={activeChartMeta.lowerIsBetter}
                  highlightMonth={
                    report.period.from === report.period.to ? report.period.from : undefined
                  }
                  contextNote={
                    report.period.from === report.period.to
                      ? 'Se muestran los últimos 6 meses para ver la tendencia; el mes elegido está resaltado.'
                      : undefined
                  }
                />
              </div>
            </section>
          )}

          {/* 4. Dinero de la finca (gastos y entregas a Agro Market) */}
          <section className={cardClass} aria-labelledby="money-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="flex size-10 items-center justify-center rounded-xl bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200">
                  <DollarSign className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 id="money-heading" className="text-lg font-bold">
                    Gastos y entregas a Agro Market
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Dinero gastado en la finca frente al valor recibido por Agro Market a precio de finca.
                  </p>
                </div>
              </div>
              <Link
                href="/lodana?seccion=costos"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border-2 border-[#c7d8ca] bg-white px-3.5 py-2 text-sm font-semibold text-foreground transition hover:bg-[#eef5ef] dark:border-[#34453a] dark:bg-[#141d18]"
              >
                Anotar gasto
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-[#dce8de] bg-[#f7fbf7] p-4 dark:border-[#2d3b32] dark:bg-[#141d18]">
                <p className="text-sm font-semibold text-muted-foreground">Gastado en la finca</p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">
                  {formatMoney(costsUsd)}
                </p>
                {financials && financials.previousCostsUsd > 0 && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Período anterior: {formatMoney(financials.previousCostsUsd)}
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-[#dce8de] bg-[#f7fbf7] p-4 dark:border-[#2d3b32] dark:bg-[#141d18]">
                <p className="text-sm font-semibold text-muted-foreground">
                  Entregado a Agro Market
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-[#2c6048] dark:text-[#a8d5b3]">
                  {formatMoney(deliveredUsd)}
                </p>
                {financials && financials.previousDeliveredUsd > 0 && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Período anterior: {formatMoney(financials.previousDeliveredUsd)}
                  </p>
                )}
              </div>
            </div>

            {financials && financials.monthly.length >= 2 && (
              <MoneyComparisonChart
                key={`${report.period.from}:${report.period.to}`}
                rows={financials.monthly}
              />
            )}

            {financials && financials.topCategories.length > 0 && (
              <div className="mt-4 grid gap-2.5">
                <p className="text-sm font-bold text-foreground">En qué se fue el gasto</p>
                <div className="grid gap-2">
                  {financials.topCategories.map((cat) => {
                    const width =
                      costsUsd > 0 ? Math.max(6, Math.round((cat.amountUsd / costsUsd) * 100)) : 0
                    return (
                      <div key={cat.name} className="grid gap-1 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground">{cat.name}</span>
                          <span className="font-bold tabular-nums text-foreground">
                            {formatMoney(cat.amountUsd)}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted" aria-hidden>
                          <div
                            className="h-full rounded-full bg-violet-600 dark:bg-violet-400"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
              <PackageCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                El valor entregado refleja lo recibido por Agro Market multiplicado por el precio
                estimado de finca (no incluye el margen minorista que Agro Market cobra al público).
                La cosecha aún en finca todavía no cuenta como entrega.
              </span>
            </p>
          </section>

          {/* 5. Análisis avanzado opcional (plegado por defecto) */}
          <section className="rounded-2xl border-2 border-dashed border-[#c7d8ca] bg-white/70 p-4 dark:border-[#34453a] dark:bg-[#18211c]/70">
            <button
              type="button"
              aria-expanded={showAdvanced}
              onClick={() => setShowAdvanced((open) => !open)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <span className="flex items-center gap-2.5">
                <SlidersHorizontal className="size-5 text-[#2c6048] dark:text-[#a8d5b3]" aria-hidden />
                <span>
                  <span className="block text-base font-bold text-foreground">
                    Ver gráficas y estadísticas avanzadas
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Filtros exactos por fechas, comparación anual, estacionalidad y previsión.
                  </span>
                </span>
              </span>
              <ChevronDown
                className={`size-5 shrink-0 text-muted-foreground transition-transform ${
                  showAdvanced ? 'rotate-180' : ''
                }`}
                aria-hidden
              />
            </button>

            {showAdvanced && (
              <div className="mt-5 border-t border-border pt-5">
                <AnalyticsDashboard />
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
