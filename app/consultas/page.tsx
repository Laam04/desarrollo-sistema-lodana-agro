import Link from 'next/link'
import { ArrowLeft, BarChart3, Sprout } from 'lucide-react'
import { AnalyticsDashboard } from '@/components/analytics-dashboard'

export const metadata = {
  title: 'Consultas públicas | Lodana Agro',
  description: 'Series mensuales y estadísticas agregadas de Lodana Agro y Agro Market.',
}

export default function ConsultasPage() {
  return (
    <div className="min-h-screen bg-[#f4f7f3] text-[#20302b] dark:bg-[#0f1512] dark:text-[#edf2ed]">
      <header className="border-b border-[#dbe5db] bg-white dark:border-[#29362f] dark:bg-[#141c18]">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#2c6048] text-white"><Sprout className="size-5" aria-hidden /></span>
            <div><p className="font-semibold">Lodana Agro</p><p className="text-xs text-muted-foreground">Datos para investigación</p></div>
          </div>
          <Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-emerald-600">
            <ArrowLeft className="size-4" aria-hidden /> Inicio
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-8 lg:px-10">
        <header className="mb-6 flex items-start gap-4 rounded-3xl border border-[#dbe7dd] bg-gradient-to-br from-white to-[#e4f0e7] p-5 dark:border-[#2d3b32] dark:from-[#18211c] dark:to-[#1c3327] sm:p-8">
          <span className="hidden size-12 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-800 dark:bg-[#234634] dark:text-emerald-200 sm:grid">
            <BarChart3 className="size-6" aria-hidden />
          </span>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Consultas públicas</h1>
            <p className="mt-2 text-sm text-muted-foreground">Explora la producción agrícola de Lodana y los movimientos de Agro Market por cultivo y unidad.</p>
          </div>
        </header>
        <AnalyticsDashboard publicView />
      </main>
    </div>
  )
}
