import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'

const percentage = new Intl.NumberFormat('es-EC', { style: 'percent', maximumFractionDigits: 1 })

export function AnalysisNote({ change, subject, unit, lowerIsBetter = false }: {
  change: number
  subject: string
  unit?: string
  lowerIsBetter?: boolean
}) {
  const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus
  const tone = change === 0 ? 'bg-muted text-foreground'
    : (change < 0) === lowerIsBetter
      ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'
      : 'bg-red-50 text-red-900 dark:bg-red-950/50 dark:text-red-200'
  return (
    <p className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${tone}`}>
      <Icon className="size-4 shrink-0" aria-hidden />
      {change === 0
        ? `Sin variación en ${subject}${unit ? ` (${unit})` : ''}`
        : `${percentage.format(Math.abs(change))} ${change > 0 ? 'más' : 'menos'} de ${subject}${unit ? ` (${unit})` : ''}`}
    </p>
  )
}
