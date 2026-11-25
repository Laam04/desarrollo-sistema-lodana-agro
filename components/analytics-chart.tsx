'use client'

import { useEffect, useId, useRef, useState } from 'react'

const palette = {
  green: '#16815d',
  blue: '#3685b8',
  amber: '#b36421',
  purple: '#9168bc',
  gray: '#738094',
} as const

export const analyticsNumber = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 2 })
const axisNumber = new Intl.NumberFormat('es-EC', { notation: 'compact', maximumFractionDigits: 1 })
const shortMonth = new Intl.DateTimeFormat('es-EC', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const fullMonth = new Intl.DateTimeFormat('es-EC', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export function formatMonth(month: string) {
  return fullMonth.format(new Date(month + '-01T00:00:00Z'))
}

type Line = {
  label: string
  color: keyof typeof palette
  values: (number | null)[]
  dashed?: boolean
  bridgeFrom?: { index: number; value: number }
}

type Band = { low: (number | null)[]; high: (number | null)[] }

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function segments<T>(values: (T | null | undefined)[]) {
  const result: { value: T; index: number }[][] = []
  let current: { value: T; index: number }[] = []
  values.forEach((value, index) => {
    if (value == null) {
      if (current.length) result.push(current)
      current = []
    } else {
      current.push({ value, index })
    }
  })
  if (current.length) result.push(current)
  return result
}

export function AnalyticsChart({ label, unit, months, lines, band }: {
  label: string
  unit: string
  months: string[]
  lines: Line[]
  band?: Band
}) {
  const titleId = useId()
  const hasValues = lines.some((line) => line.values.some(isFiniteNumber))
  const viewportRef = useRef<HTMLDivElement>(null)
  const [viewportWidth, setViewportWidth] = useState(0)
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const observer = new ResizeObserver(([entry]) => setViewportWidth(Math.floor(entry.contentRect.width)))
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [hasValues])

  if (!hasValues) {
    return <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Sin datos disponibles para esta gráfica en el período seleccionado.</p>
  }

  const width = Math.max(viewportWidth, 620, months.length * 26 + 74)
  const height = 240
  const left = 68
  const bottom = 203
  const top = 15
  const maximum = Math.max(
    0,
    ...lines.flatMap((line) => [
      ...line.values.map((value) => isFiniteNumber(value) ? value : 0),
      ...(line.bridgeFrom && isFiniteNumber(line.bridgeFrom.value) ? [line.bridgeFrom.value] : []),
    ]),
    ...(band?.high.map((value) => isFiniteNumber(value) ? value : 0) ?? []),
  )
  const magnitude = maximum > 0 ? 10 ** Math.floor(Math.log10(maximum / 4)) : 1
  const step = maximum > 0 ? Math.max(0.01, Math.ceil(maximum / 4 / magnitude) * magnitude) : 1
  const x = (index: number) => left + (width - left - 14) * (months.length === 1 ? 0.5 : index / (months.length - 1))
  const y = (value: number) => bottom - (bottom - top) * value / (step * 4)
  const labelEvery = Math.max(1, Math.ceil(months.length / 12))
  const lastX = x(months.length - 1)
  const bandPoints = band ? segments(months.map((_, index) => {
    const low = band.low[index]
    const high = band.high[index]
    return !isFiniteNumber(low) || !isFiniteNumber(high) ? null : { low, high }
  })) : []

  return (
    <figure className="grid min-w-0 gap-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-label="Leyenda del gráfico">
        {lines.map(({ label: lineLabel, color, dashed }) => (
          <li key={lineLabel} className="flex items-center gap-1.5">
            <span className="w-5 border-t-[3px]" style={{ borderColor: palette[color], borderStyle: dashed ? 'dashed' : 'solid' }} aria-hidden />
            {lineLabel}
          </li>
        ))}
        {!!bandPoints.length && <li className="flex items-center gap-1.5"><span className="h-2 w-5 rounded-sm bg-purple-400/30" aria-hidden /> Rango orientativo</li>}
      </ul>
      <div ref={viewportRef} className="overflow-x-auto rounded-xl border border-border bg-background/40" tabIndex={0} role="region" aria-label={label}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ minWidth: width }} className="block w-full" role="img" aria-labelledby={titleId}>
          <title id={titleId}>{label} en {unit}</title>
          {[0, 1, 2, 3, 4].map((tick) => (
            <g key={tick} className="text-muted-foreground">
              <line x1={left} x2={width - 14} y1={y(step * tick)} y2={y(step * tick)} stroke="currentColor" strokeOpacity="0.18" />
              <text x={left - 8} y={y(step * tick) + 4} textAnchor="end" fill="currentColor" fontSize="11">{(step * tick >= 1000 ? axisNumber : analyticsNumber).format(step * tick)}</text>
            </g>
          ))}
          {months.map((month, index) => {
            const isLast = index === months.length - 1
            const show = isLast || (index % labelEvery === 0 && lastX - x(index) >= 48)
            return show ? (
              <text key={month} x={x(index)} y={bottom + 22} textAnchor={isLast ? 'end' : index === 0 ? 'start' : 'middle'} className="fill-muted-foreground" fontSize="10.5">
                {shortMonth.format(new Date(month + '-01T00:00:00Z'))}
              </text>
            ) : null
          })}
          {bandPoints.map((part) => part.length > 1 ? (
            <polygon key={part[0].index}
              points={[...part.map(({ index, value }) => `${x(index)},${y(value.high)}`),
                ...part.toReversed().map(({ index, value }) => `${x(index)},${y(value.low)}`)].join(' ')}
              fill={palette.purple} fillOpacity="0.2" />
          ) : (
            <line key={part[0].index} x1={x(part[0].index)} x2={x(part[0].index)} y1={y(part[0].value.high)} y2={y(part[0].value.low)}
              stroke={palette.purple} strokeOpacity="0.45" strokeWidth="6" />
          ))}
          {lines.map(({ label: name, color, values, dashed, bridgeFrom }) => {
            const sanitized = months.map((_, index) => isFiniteNumber(values[index]) ? values[index] : null)
            const polyValues = bridgeFrom && isFiniteNumber(bridgeFrom.value) && sanitized[bridgeFrom.index] === null
              ? sanitized.map((v, i) => (i === bridgeFrom.index ? bridgeFrom.value : v))
              : sanitized
            return (
              <g key={name} stroke={palette[color]}>
                {segments(polyValues).filter((part) => part.length > 1).map((part) => (
                  <polyline key={part[0].index} points={part.map(({ index, value }) => `${x(index)},${y(value)}`).join(' ')}
                    fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dashed ? '6 5' : undefined} />
                ))}
                {sanitized.map((value, index) => value === null ? null : (
                  <circle key={months[index]} cx={x(index)} cy={y(value)} r="3.4" fill={palette[color]}>
                    <title>{formatMonth(months[index])} · {name} · {analyticsNumber.format(value)} {unit}</title>
                  </circle>
                ))}
              </g>
            )
          })}
        </svg>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-emerald-800 dark:text-emerald-300">Ver valores de {label.toLowerCase()}</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-border" tabIndex={0} role="region" aria-label={`Valores de ${label} en ${unit}`}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted">
              <tr><th scope="col" className="p-2 text-left font-medium">Mes</th>
                {lines.map(({ label: colLabel }) => <th key={colLabel} scope="col" className="p-2 text-right font-medium">{colLabel}</th>)}
                {!!bandPoints.length && <th scope="col" className="p-2 text-right font-medium">Rango</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {months.map((month, index) => (
                <tr key={month}>
                  <th scope="row" className="whitespace-nowrap p-2 text-left font-medium">{formatMonth(month)}</th>
                  {lines.map(({ label: colLabel, values }) => (
                    <td key={colLabel} className="whitespace-nowrap p-2 text-right tabular-nums">{!isFiniteNumber(values[index]) ? '—' : analyticsNumber.format(values[index])}</td>
                  ))}
                  {!!bandPoints.length && (
                    <td className="whitespace-nowrap p-2 text-right tabular-nums">
                      {isFiniteNumber(band?.low[index]) && isFiniteNumber(band?.high[index]) ? `${analyticsNumber.format(band.low[index])} a ${analyticsNumber.format(band.high[index])}` : '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}
