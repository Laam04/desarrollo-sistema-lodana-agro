import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'

const percentage = new Intl.NumberFormat('es-EC', { style: 'percent', maximumFractionDigits: 1 })

export function AnalysisNote({ current, previous, subject, formatValue, lowerIsBetter = false }: {
  current: number | null
  previous: number | null
  subject: string
  formatValue: (value: number) => string
  lowerIsBetter?: boolean
}) {
  const comparable = current !== null && previous !== null
  const difference = comparable ? Math.round((current - previous) * 100) / 100 : 0
  const Icon = difference > 0 ? ArrowUpRight : difference < 0 ? ArrowDownRight : Minus
  const tone = difference === 0 ? 'bg-muted text-foreground'
    : (difference < 0) === lowerIsBetter
      ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'
      : 'bg-red-50 text-red-900 dark:bg-red-950/50 dark:text-red-200'
  const relative = previous && previous > 0 ? Math.abs(difference) / previous : 0
  const change = relative >= 0.001 ? percentage.format(relative) : formatValue(Math.abs(difference))
  const title = !comparable ? subject.charAt(0).toUpperCase() + subject.slice(1)
    : difference === 0 ? `Sin cambios en ${subject}`
      : `${difference > 0 ? 'Mayor' : 'Menor'} ${subject}`

  return (
    <div className={`rounded-xl px-3 py-2.5 ${tone}`}>
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 shrink-0" aria-hidden />
        {title}
      </p>
      {comparable ? (
        <>
          {difference !== 0 && <p className="mt-1 text-sm font-medium">{change} {difference > 0 ? 'más' : 'menos'}</p>}
          <p className="mt-1 text-xs tabular-nums">{formatValue(current)} en el período actual · {formatValue(previous)} en el anterior</p>
        </>
      ) : <p className="mt-1 text-xs">Datos insuficientes para comparar.</p>}
    </div>
  )
}
