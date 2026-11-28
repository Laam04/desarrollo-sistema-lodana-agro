'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  DollarSign,
  FileBarChart2,
  FileSpreadsheet,
  FileText,
  Info,
  MapPin,
  Sprout,
  TrendingDown,
  TriangleAlert,
  Truck,
} from 'lucide-react'
import { BrandLoader } from '@/components/brand-loader'
import { navigateWithTransition } from '@/components/route-transition-overlay'
import type { FarmerImpactReportPayload } from '@/lib/farmer-impact-model'
import type { AutomaticPeriodOption } from '@/lib/farmer-impact-report'
import { productionFetch, today } from '@/lib/production-client'

type ModeTab = 'WEEKLY' | 'MONTHLY' | 'CUSTOM'

type FarmerReportsApiResponse = {
  periods: {
    weekly: AutomaticPeriodOption[]
    monthly: AutomaticPeriodOption[]
    today: string
  }
  report: FarmerImpactReportPayload
}

const numFmt = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 2 })
const usdFmt = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' })

const cardClass =
  'rounded-2xl border-2 border-[#d5e3d7] bg-white p-4 shadow-sm dark:border-[#2d3b32] dark:bg-[#18211c] sm:p-6'

function fmtNum(n: number, unit = '') {
  return unit ? `${numFmt.format(n)} ${unit}` : numFmt.format(n)
}

function fmtUsd(n: number) {
  return usdFmt.format(n)
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ProductionFarmerReports() {
  const todayStr = today()
  const [tab, setTab] = useState<ModeTab>('WEEKLY')
  const [selectedRange, setSelectedRange] = useState<{ from: string; to: string; cadence: ModeTab } | null>(null)
  const [customFrom, setCustomFrom] = useState(`${todayStr.slice(0, 7)}-01`)
  const [customTo, setCustomTo] = useState(todayStr)
  const [customError, setCustomError] = useState('')
  const [downloading, setDownloading] = useState<'pdf' | 'csv' | null>(null)
  const [downloadError, setDownloadError] = useState('')
  const [copiedWa, setCopiedWa] = useState(false)

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams()
    if (selectedRange) {
      params.set('from', selectedRange.from)
      params.set('to', selectedRange.to)
      params.set('cadence', selectedRange.cadence)
    } else {
      params.set('cadence', tab === 'CUSTOM' ? 'WEEKLY' : tab)
    }
    return `/api/production-summary/farmer-reports?${params.toString()}`
  }, [selectedRange, tab])

  const { data, error, isLoading, isValidating, mutate } = useSWR<FarmerReportsApiResponse>(
    queryUrl,
    productionFetch,
    { keepPreviousData: true },
  )

  const report = data?.report ?? null
  const periods = data?.periods

  function switchTab(next: ModeTab) {
    setTab(next)
    setCustomError('')
    setDownloadError('')
    if (next === 'WEEKLY') {
      const first = periods?.weekly[0]
      setSelectedRange(first ? { from: first.from, to: first.to, cadence: 'WEEKLY' } : null)
    } else if (next === 'MONTHLY') {
      const first = periods?.monthly[0]
      setSelectedRange(first ? { from: first.from, to: first.to, cadence: 'MONTHLY' } : null)
    }
  }

  function applyCustomDates() {
    if (!customFrom || !customTo) {
      setCustomError('Selecciona fecha inicial y final.')
      return
    }
    if (customFrom > customTo) {
      setCustomError('La fecha inicial debe ser anterior o igual a la fecha final.')
      return
    }
    if (customTo > todayStr) {
      setCustomError('No puedes consultar fechas futuras.')
      return
    }
    const fromMs = Date.parse(`${customFrom}T00:00:00Z`)
    const toMs = Date.parse(`${customTo}T00:00:00Z`)
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
      setCustomError('Selecciona fechas válidas.')
      return
    }
    const spanDays = Math.floor((toMs - fromMs) / 86_400_000) + 1
    if (spanDays > 366 * 5) {
      setCustomError('El rango máximo permitido por reporte es de 5 años.')
      return
    }
    setCustomError('')
    setSelectedRange({ from: customFrom, to: customTo, cadence: 'CUSTOM' })
  }

  async function handleExport(format: 'pdf' | 'csv') {
    if (!report || downloading) return
    setDownloading(format)
    setDownloadError('')
    try {
      const params = new URLSearchParams({
        from: report.period.from,
        to: report.period.to,
        cadence: report.cadence,
        format,
      })
      const response = await fetch(`/api/production-summary/farmer-reports/export?${params.toString()}`)
      if (response.status === 401) {
        navigateWithTransition('/', { replace: true, label: 'Tu sesión expiró…' })
        return
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? 'No se pudo descargar el archivo.')
      }
      const blob = await response.blob()
      const fileBase = `lodana-agricultor-${report.cadence.toLowerCase()}-${report.period.from}_${report.period.to}`
      triggerDownload(blob, `${fileBase}.${format}`)
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Error al exportar el reporte.')
    } finally {
      setDownloading(null)
    }
  }

  async function handleCopyWhatsApp() {
    if (!report) return
    const text = report.whatsappText
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        setDownloadError('')
        setCopiedWa(true)
        setTimeout(() => setCopiedWa(false), 2600)
        return
      }
    } catch {
      // Fallback para contextos no seguros (p. ej. acceso por IP de red local HTTP)
    }

    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.top = '-9999px'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      const copied = document.execCommand('copy')
      textarea.remove()
      if (copied) {
        setDownloadError('')
        setCopiedWa(true)
        setTimeout(() => setCopiedWa(false), 2600)
        return
      }
    } catch {
      // Fall through to error message
    }

    setDownloadError('No se pudo copiar al portapapeles en este navegador.')
  }

  const maxZoneYield = useMemo(
    () => Math.max(...(report?.zoneYields.map((z) => z.yieldPerHa) ?? [0]), 0),
    [report],
  )

  return (
    <div className="grid gap-4 sm:gap-5">
      {/* Encabezado + selector de reportes automáticos / personalizados */}
      <section className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#e4f0e7] text-[#2c6048] dark:bg-[#234634] dark:text-[#a8d5b3]">
              <FileBarChart2 className="size-6" aria-hidden />
            </span>
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Reportes e impacto de tu finca
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Productividad, ventas de finca a Agro Market, impacto económico de pérdidas y acciones sugeridas.
              </p>
            </div>
          </div>

          {isValidating && (
            <span
              role="status"
              className="rounded-full bg-[#eef5ef] px-3 py-1 text-xs font-semibold text-[#2c6048] dark:bg-[#223027] dark:text-[#a8d5b3]"
            >
              Actualizando…
            </span>
          )}
        </div>

        {/* Pestañas de periodicidad */}
        <div
          role="tablist"
          aria-label="Tipo de reporte"
          className="mt-4 grid grid-cols-3 gap-2"
        >
          {(
            [
              { id: 'WEEKLY', label: 'Semanales automáticos' },
              { id: 'MONTHLY', label: 'Mensuales automáticos' },
              { id: 'CUSTOM', label: 'Elegir fechas' },
            ] as const
          ).map((item) => {
            const active = tab === item.id
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(item.id)}
                className={`min-h-11 rounded-xl border-2 px-3 py-2 text-xs font-bold transition sm:text-sm ${
                  active
                    ? 'border-[#2c6048] bg-[#2c6048] text-white shadow-sm'
                    : 'border-[#c7d8ca] bg-[#f7fbf7] text-foreground hover:border-[#2c6048] hover:bg-[#eef5ef] dark:border-[#34453a] dark:bg-[#141d18]'
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </div>

        {/* Chips de períodos automáticos cerrados */}
        {tab === 'WEEKLY' && periods && (
          <div className="mt-3 flex flex-wrap gap-2">
            {periods.weekly.map((opt) => {
              const active = report?.period.from === opt.from && report?.period.to === opt.to
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedRange({ from: opt.from, to: opt.to, cadence: 'WEEKLY' })}
                  className={`min-h-10 rounded-full border-2 px-3.5 py-1.5 text-xs font-bold transition sm:text-sm ${
                    active
                      ? 'border-[#2c6048] bg-[#e4f0e7] text-[#1f4834] dark:border-emerald-500 dark:bg-[#213a2c] dark:text-[#d5f0dc]'
                      : 'border-[#d5e3d7] bg-white text-muted-foreground hover:border-[#2c6048] hover:text-foreground dark:border-[#2d3b32] dark:bg-[#141d18]'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        )}

        {tab === 'MONTHLY' && periods && (
          <div className="mt-3 flex flex-wrap gap-2">
            {periods.monthly.map((opt) => {
              const active = report?.period.from === opt.from && report?.period.to === opt.to
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedRange({ from: opt.from, to: opt.to, cadence: 'MONTHLY' })}
                  className={`min-h-10 rounded-full border-2 px-3.5 py-1.5 text-xs font-bold transition sm:text-sm ${
                    active
                      ? 'border-[#2c6048] bg-[#e4f0e7] text-[#1f4834] dark:border-emerald-500 dark:bg-[#213a2c] dark:text-[#d5f0dc]'
                      : 'border-[#d5e3d7] bg-white text-muted-foreground hover:border-[#2c6048] hover:text-foreground dark:border-[#2d3b32] dark:bg-[#141d18]'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        )}

        {tab === 'CUSTOM' && (
          <div className="mt-3 grid gap-3 rounded-2xl border-2 border-[#b7d3bc] bg-[#f7fbf7] p-4 dark:border-[#2d4537] dark:bg-[#141d18]">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Desde
                <input
                  type="date"
                  max={todayStr}
                  value={customFrom}
                  onChange={(e) => {
                    setCustomFrom(e.target.value)
                    setCustomError('')
                  }}
                  className="min-h-11 rounded-xl border-2 border-[#c7d8ca] bg-white px-3 py-2 text-sm font-semibold text-foreground dark:border-[#34453a] dark:bg-[#18211c]"
                />
              </label>
              <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Hasta
                <input
                  type="date"
                  min={customFrom}
                  max={todayStr}
                  value={customTo}
                  onChange={(e) => {
                    setCustomTo(e.target.value)
                    setCustomError('')
                  }}
                  className="min-h-11 rounded-xl border-2 border-[#c7d8ca] bg-white px-3 py-2 text-sm font-semibold text-foreground dark:border-[#34453a] dark:bg-[#18211c]"
                />
              </label>
              <button
                type="button"
                onClick={applyCustomDates}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#2c6048] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#234d39]"
              >
                Ver reporte
                <ArrowRight className="size-4" aria-hidden />
              </button>
            </div>
            {customError && (
              <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-300">
                {customError}
              </p>
            )}
          </div>
        )}

        {/* Barra de período activo + acciones de descarga / compartir */}
        {report && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <CalendarDays className="size-4 text-[#2c6048] dark:text-[#a8d5b3]" aria-hidden />
              <strong className="text-foreground">{report.period.label}</strong>
              <span className="text-xs text-muted-foreground">
                ({report.period.from} al {report.period.to})
              </span>
              <span className="rounded-full bg-[#e4f0e7] px-2.5 py-0.5 text-xs font-semibold text-[#1f4834] dark:bg-[#234634] dark:text-[#d5f0dc]">
                {report.automatic ? 'Cierre automático' : 'Personalizado'}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={Boolean(downloading)}
                onClick={() => void handleExport('pdf')}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#2c6048] px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#234d39] disabled:opacity-60 sm:text-sm"
              >
                <FileText className="size-4" aria-hidden />
                {downloading === 'pdf' ? 'Generando PDF…' : 'Descargar PDF'}
              </button>
              <button
                type="button"
                disabled={Boolean(downloading)}
                onClick={() => void handleExport('csv')}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border-2 border-[#c7d8ca] bg-white px-3 py-2 text-xs font-bold text-foreground transition hover:bg-[#eef5ef] disabled:opacity-60 dark:border-[#34453a] dark:bg-[#141d18] sm:text-sm"
              >
                <FileSpreadsheet className="size-4" aria-hidden />
                {downloading === 'csv' ? 'Exportando…' : 'Excel / CSV'}
              </button>
              <button
                type="button"
                onClick={() => void handleCopyWhatsApp()}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border-2 border-[#c7d8ca] bg-white px-3 py-2 text-xs font-bold text-foreground transition hover:bg-[#eef5ef] dark:border-[#34453a] dark:bg-[#141d18] sm:text-sm"
              >
                {copiedWa ? (
                  <>
                    <Check className="size-4 text-emerald-600" aria-hidden />
                    Resumen copiado
                  </>
                ) : (
                  <>
                    <Copy className="size-4" aria-hidden />
                    Copiar para WhatsApp
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {downloadError && (
          <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
            {downloadError}
          </p>
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
          message="Preparando tu reporte de productividad e impacto…"
          subtitle="Calculando entregas a Agro Market, gastos, pérdidas y rendimiento por zona"
        />
      )}

      {report && (
        <>
          {!report.hasData && (
            <div className="flex items-start gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <CalendarDays className="mt-0.5 size-5 shrink-0" aria-hidden />
              <div>
                <p className="font-bold">Sin movimientos registrados en este período</p>
                <p className="mt-0.5 text-xs">
                  Prueba seleccionando otra semana, un cierre mensual anterior o un rango personalizado.
                </p>
              </div>
            </div>
          )}

          {/* 1. Balance económico real del agricultor (Finca → Agro Market) */}
          <section className={cardClass} aria-labelledby="farmer-econ-heading">
            <div className="flex items-center gap-2.5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-[#e4f0e7] text-[#2c6048] dark:bg-[#234634] dark:text-[#a8d5b3]">
                <DollarSign className="size-5" aria-hidden />
              </span>
              <div>
                <h3 id="farmer-econ-heading" className="text-lg font-bold">
                  Balance económico de la finca
                </h3>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  Lo que entregaste y te recibió Agro Market (a precio de finca) frente a tus gastos.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#dce8de] bg-[#f7fbf7] p-4 dark:border-[#2d3b32] dark:bg-[#141d18]">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Vendido a Agro Market
                </p>
                <p className="mt-1.5 text-2xl font-bold tabular-nums text-[#2c6048] dark:text-[#a8d5b3] sm:text-3xl">
                  {fmtUsd(report.economics.deliveredToMarketUsd)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {report.economics.inTransitValueUsd > 0
                    ? `Más ${fmtUsd(report.economics.inTransitValueUsd)} aún en tránsito`
                    : 'Recibido conforme a precio de finca'}
                </p>
              </div>

              <div className="rounded-2xl border border-[#dce8de] bg-[#f7fbf7] p-4 dark:border-[#2d3b32] dark:bg-[#141d18]">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Gastos de la finca
                </p>
                <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground sm:text-3xl">
                  {fmtUsd(report.economics.farmCostsUsd)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Directos: {fmtUsd(report.economics.directCostsUsd)} · Generales:{' '}
                  {fmtUsd(report.economics.generalCostsUsd)}
                </p>
              </div>

              <div
                className={`rounded-2xl border p-4 ${
                  report.economics.estimatedBalanceUsd >= 0
                    ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30'
                    : 'border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30'
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Balance estimado de finca
                </p>
                <p
                  className={`mt-1.5 text-2xl font-bold tabular-nums sm:text-3xl ${
                    report.economics.estimatedBalanceUsd >= 0
                      ? 'text-emerald-800 dark:text-emerald-300'
                      : 'text-amber-900 dark:text-amber-300'
                  }`}
                >
                  {fmtUsd(report.economics.estimatedBalanceUsd)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Entregas recibidas menos gastos del período
                </p>
              </div>
            </div>
          </section>

          {/* 2. Impacto económico de pérdidas y diferencias */}
          <section className={cardClass} aria-labelledby="farmer-loss-impact-heading">
            <div className="flex items-center gap-2.5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                <TrendingDown className="size-5" aria-hidden />
              </span>
              <div>
                <h3 id="farmer-loss-impact-heading" className="text-lg font-bold">
                  Impacto económico de pérdidas y diferencias
                </h3>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  Cuánto dinero dejaste de poder venderle a Agro Market por mermas o diferencias en entrega.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/60 dark:bg-amber-950/25">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
                  Pérdidas en campo (valor estimado)
                </p>
                <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground sm:text-3xl">
                  {report.economics.estimatedFieldLossUsd !== null
                    ? fmtUsd(report.economics.estimatedFieldLossUsd)
                    : 'Sin pérdidas valorizadas'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {report.topLossCauses[0]
                    ? `Mayor impacto: ${report.topLossCauses[0].reason} en ${report.topLossCauses[0].crop} (${fmtNum(report.topLossCauses[0].quantity, report.topLossCauses[0].unit)})`
                    : 'No se registraron mermas en este período.'}
                </p>
              </div>

              <div className="rounded-2xl border border-[#dce8de] bg-[#f7fbf7] p-4 dark:border-[#2d3b32] dark:bg-[#141d18]">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Diferencias en entregas a Agro Market
                </p>
                <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground sm:text-3xl">
                  {fmtUsd(report.economics.deliveryDifferenceUsd)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {report.economics.deliveryDifferenceUsd > 0
                    ? 'Producto despachado que cerró con menor cantidad recibida.'
                    : 'Sin diferencias de entrega cerradas en este período.'}
                </p>
              </div>
            </div>

            {report.topLossCauses.length > 0 && (
              <div className="mt-4 grid gap-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Principales causas de pérdida
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {report.topLossCauses.map((cause) => (
                    <div
                      key={`${cause.crop}-${cause.unit}-${cause.reason}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[#dce8de] bg-[#f7fbf7] px-3.5 py-2.5 text-sm dark:border-[#2d3b32] dark:bg-[#141d18]"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{cause.reason}</p>
                        <p className="text-xs text-muted-foreground">
                          {cause.crop} · {fmtNum(cause.quantity, cause.unit)}
                          {cause.lossRatePct !== null ? ` (${numFmt.format(cause.lossRatePct)} %)` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 font-bold tabular-nums text-amber-800 dark:text-amber-300">
                        {cause.estimatedUsd !== null ? fmtUsd(cause.estimatedUsd) : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 3. Evolución de impacto: Antes vs. Ahora */}
          {report.beforeAfter.length > 0 && (
            <section className={cardClass} aria-labelledby="farmer-before-after-heading">
              <h3 id="farmer-before-after-heading" className="text-lg font-bold">
                Evolución de impacto: Antes vs. Ahora
              </h3>
              {report.period.previousLabel && (
                <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                  Comparado frente a <strong>{report.period.previousLabel}</strong>
                </p>
              )}
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {report.beforeAfter.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-[#dce8de] bg-[#f7fbf7] p-4 dark:border-[#2d3b32] dark:bg-[#141d18]"
                  >
                    <p className="text-xs font-semibold text-muted-foreground">{item.label}</p>
                    <p className="mt-1.5 text-xl font-bold tabular-nums text-foreground">
                      {item.current}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-xs">
                      <span className="text-muted-foreground">Antes: {item.previous}</span>
                      {item.deltaPct !== null && (
                        <span
                          className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-bold tabular-nums ${
                            item.favorable === true
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : item.favorable === false
                                ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {item.deltaPct > 0 ? (
                            <ArrowUpRight className="size-3.5" aria-hidden />
                          ) : item.deltaPct < 0 ? (
                            <ArrowDownRight className="size-3.5" aria-hidden />
                          ) : null}
                          {item.deltaPct > 0 ? '+' : ''}
                          {numFmt.format(item.deltaPct)} %
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 4. Recomendaciones prácticas para el agricultor */}
          {report.recommendations.length > 0 && (
            <section className={cardClass} aria-labelledby="farmer-recs-heading">
              <h3 id="farmer-recs-heading" className="text-lg font-bold">
                Qué conviene revisar
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                Recomendaciones generadas automáticamente con los datos de este período.
              </p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {report.recommendations.map((rec) => {
                  const isHigh = rec.priority === 'high'
                  const isMedium = rec.priority === 'medium'
                  return (
                    <li
                      key={rec.title}
                      className={`flex items-start gap-3 rounded-2xl border p-4 ${
                        isHigh
                          ? 'border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30'
                          : 'border-[#dce8de] bg-[#f7fbf7] dark:border-[#2d3b32] dark:bg-[#141d18]'
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl ${
                          isHigh
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
                            : isMedium
                              ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
                        }`}
                      >
                        {isHigh ? (
                          <TriangleAlert className="size-4.5" aria-hidden />
                        ) : isMedium ? (
                          <Truck className="size-4.5" aria-hidden />
                        ) : (
                          <CheckCircle2 className="size-4.5" aria-hidden />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground">{rec.title}</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                          {rec.detail}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* 5. Productividad por cultivo y rendimiento por zona/hectárea */}
          <div className="grid gap-4 lg:grid-cols-2">
            <section className={cardClass} aria-labelledby="farmer-crops-heading">
              <div className="flex items-center gap-2">
                <Sprout className="size-5 text-[#2c6048] dark:text-[#a8d5b3]" aria-hidden />
                <h3 id="farmer-crops-heading" className="text-lg font-bold">
                  Productividad y entregas por cultivo
                </h3>
              </div>
              {report.crops.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Sin movimientos por cultivo en este período.
                </p>
              ) : (
                <div className="mt-4 grid gap-3">
                  {report.crops.map((c) => (
                    <div
                      key={`${c.crop}-${c.unit}`}
                      className="rounded-2xl border border-[#dce8de] bg-[#f7fbf7] p-3.5 dark:border-[#2d3b32] dark:bg-[#141d18]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-base font-bold text-foreground">
                            {c.crop}{' '}
                            <span className="text-xs font-normal text-muted-foreground">
                              ({c.unit})
                            </span>
                          </p>
                          {c.topReason && (
                            <p className="text-xs text-muted-foreground">
                              Motivo principal de merma: {c.topReason}
                            </p>
                          )}
                        </div>
                        <span className="rounded-xl bg-[#e4f0e7] px-2.5 py-1 text-xs font-bold tabular-nums text-[#1f4834] dark:bg-[#234634] dark:text-[#d5f0dc]">
                          Valor finca: {fmtUsd(c.deliveredValueUsd)}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                        <div>
                          <span className="text-muted-foreground">Útil</span>
                          <p className="font-bold tabular-nums text-foreground">
                            {numFmt.format(c.useful)}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Pérdidas</span>
                          <p className="font-bold tabular-nums text-amber-800 dark:text-amber-300">
                            {numFmt.format(c.losses)} ({numFmt.format(c.lossRatePct ?? 0)} %)
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Recibido AM</span>
                          <p className="font-bold tabular-nums text-foreground">
                            {numFmt.format(c.received)}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Demanda AM</span>
                          <p className="font-bold tabular-nums text-[#2c6048] dark:text-[#a8d5b3]">
                            {c.marketRotationPct !== null
                              ? `${numFmt.format(c.marketRotationPct)} % rotado`
                              : '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className={cardClass} aria-labelledby="farmer-zones-heading">
              <div className="flex items-center gap-2">
                <MapPin className="size-5 text-[#2c6048] dark:text-[#a8d5b3]" aria-hidden />
                <h3 id="farmer-zones-heading" className="text-lg font-bold">
                  Rendimiento por zona (por hectárea)
                </h3>
              </div>
              {report.zoneYields.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Para calcular el rendimiento por hectárea, asigna superficie en hectáreas a tus zonas en{' '}
                  <strong>Mis cultivos y zonas</strong>.
                </p>
              ) : (
                <div className="mt-4 grid gap-3">
                  {report.zoneYields.map((z) => {
                    const pct =
                      maxZoneYield > 0 ? Math.max(8, Math.round((z.yieldPerHa / maxZoneYield) * 100)) : 0
                    return (
                      <div
                        key={`${z.zone}-${z.crop}-${z.unit}`}
                        className="grid gap-1.5 rounded-xl border border-[#dce8de] bg-[#f7fbf7] p-3.5 dark:border-[#2d3b32] dark:bg-[#141d18]"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                          <span className="font-bold text-foreground">
                            {z.zone}{' '}
                            <span className="font-normal text-muted-foreground">· {z.crop}</span>
                          </span>
                          <span className="font-bold tabular-nums text-[#2c6048] dark:text-[#a8d5b3]">
                            {numFmt.format(z.yieldPerHa)} {z.unit}/ha
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted" aria-hidden>
                          <div
                            className="h-full rounded-full bg-[#2c6048] dark:bg-emerald-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {fmtNum(z.useful, z.unit)} útiles en {numFmt.format(z.surfaceHa)} ha
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>

          {/* 6. Criterios de cálculo (transparencia metodológica) */}
          <section className="rounded-2xl border border-dashed border-[#c7d8ca] bg-white/70 p-4 text-xs text-muted-foreground dark:border-[#34453a] dark:bg-[#18211c]/70">
            <p className="flex items-center gap-1.5 font-semibold text-foreground">
              <Info className="size-4 text-[#2c6048] dark:text-[#a8d5b3]" aria-hidden />
              Criterios de cálculo de este reporte
            </p>
            <ul className="mt-2 grid gap-1 pl-5 list-disc">
              {report.limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
