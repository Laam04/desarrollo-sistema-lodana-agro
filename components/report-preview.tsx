'use client'

import { AlertCircle, ArrowDownRight, ArrowUpRight, CalendarDays, Download, FileSpreadsheet, FileText, Info, Sparkles } from 'lucide-react'
import { AnalyticsChart } from '@/components/analytics-chart'
import { marketUi } from '@/components/market-ui'
import type { ReportPayload } from '@/lib/report-generator'

const numFmt = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 2 })
const dtFmt = new Intl.DateTimeFormat('es-EC', {
  timeZone: 'America/Guayaquil',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const monthNames = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export function ReportPreview({
  payload,
  trigger = 'MANUAL',
  generatedAt,
  onDownloadPdf,
  onDownloadCsv,
  downloading,
}: {
  payload: ReportPayload
  trigger?: string
  generatedAt?: string
  onDownloadPdf?: () => void
  onDownloadCsv?: () => void
  downloading?: 'pdf' | 'csv' | null
}) {
  const genDate = new Date(generatedAt ?? payload.generatedAt)
  const genLabel = Number.isNaN(genDate.getTime()) ? '—' : `${dtFmt.format(genDate)} (Ecuador)`

  return (
    <div className="grid gap-5">
      {/* Encabezado institucional del informe */}
      <section className={`${marketUi.panel} overflow-hidden`}>
        <div className="bg-[#2c6048] px-5 py-5 text-white dark:bg-[#204534]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100">
                {payload.institution.universityName}
              </p>
              <p className="mt-1 text-xs text-emerald-100/90">
                {payload.institution.organizationName} · {payload.scope}
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{payload.title}</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {onDownloadPdf && (
                <button
                  type="button"
                  disabled={Boolean(downloading)}
                  onClick={onDownloadPdf}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-xs font-semibold text-[#24523b] shadow-sm transition hover:bg-emerald-50 disabled:opacity-60"
                >
                  <FileText className="size-4" />
                  {downloading === 'pdf' ? 'Generando PDF…' : 'Descargar PDF'}
                </button>
              )}
              {onDownloadCsv && (
                <button
                  type="button"
                  disabled={Boolean(downloading)}
                  onClick={onDownloadCsv}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-200/40 bg-emerald-950/30 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-950/50 disabled:opacity-60"
                >
                  <FileSpreadsheet className="size-4" />
                  {downloading === 'csv' ? 'Generando CSV…' : 'Descargar CSV'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-3 bg-emerald-50/40 px-5 py-3.5 text-xs dark:bg-emerald-950/20 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="text-muted-foreground">Período analizado</span>
            <p className="mt-0.5 font-semibold text-foreground">{payload.period.label}</p>
            <p className="text-[11px] text-muted-foreground">{payload.period.from} al {payload.period.to}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Fecha de generación</span>
            <p className="mt-0.5 font-semibold text-foreground">{genLabel}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Origen</span>
            <p className="mt-0.5">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  trigger === 'AUTOMATIC'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                    : 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200'
                }`}
              >
                {trigger === 'AUTOMATIC' ? 'Automático' : 'Manual'}
              </span>
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Filtros aplicados</span>
            <p className="mt-0.5 font-medium text-foreground">
              {payload.filters.cropName ? `Cultivo: ${payload.filters.cropName}` : 'Todos los cultivos'} ·{' '}
              {payload.filters.unitName ? `Unidad: ${payload.filters.unitName}` : 'Todas las unidades'}
            </p>
          </div>
        </div>
      </section>

      {!payload.hasData && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <CalendarDays className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Período sin registros operativos</p>
            <p className="mt-0.5 text-xs">
              No se encontraron movimientos activos en el rango y filtros seleccionados. La ausencia de registros no se interpreta como cero sin evidencia operativa.
            </p>
          </div>
        </div>
      )}

      {/* Indicadores principales */}
      {payload.kpis.length > 0 && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {payload.kpis.map((kpi) => (
            <article key={kpi.label} className={`${marketUi.panel} p-4`}>
              <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">{kpi.value}</p>
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{kpi.detail ?? ''}</span>
                {kpi.delta !== undefined && kpi.delta !== null && (
                  <span
                    className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${
                      kpi.delta > 0 ? 'text-emerald-700 dark:text-emerald-300' : kpi.delta < 0 ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'
                    }`}
                  >
                    {kpi.delta > 0 ? <ArrowUpRight className="size-3.5" /> : kpi.delta < 0 ? <ArrowDownRight className="size-3.5" /> : null}
                    {kpi.delta > 0 ? '+' : ''}{numFmt.format(kpi.delta)}%
                  </span>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      {/* Gráficos */}
      {payload.charts.length > 0 && (
        <section className="grid gap-4">
          {payload.charts.map((chart) => (
            <div key={chart.title} className={`${marketUi.panel} p-4 sm:p-5`}>
              <h4 className="mb-3 text-sm font-semibold">{chart.title}</h4>
              <AnalyticsChart
                label={chart.title}
                unit={chart.unit}
                months={chart.labels}
                lines={chart.series.map((s) => ({
                  label: s.label,
                  color: s.color,
                  values: s.values,
                }))}
              />
            </div>
          ))}
        </section>
      )}

      {/* Tablas del informe */}
      {payload.tables.map((table) => (
        <section key={table.title} className={marketUi.panel}>
          <div className={marketUi.header}>
            <h4 className="text-sm font-semibold sm:text-base">{table.title}</h4>
            {table.subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{table.subtitle}</p>}
          </div>
          <div className="overflow-x-auto p-4">
            {table.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{table.emptyMessage ?? 'Sin registros para mostrar.'}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className={marketUi.tableHead}>
                    {table.columns.map((col) => (
                      <th key={col.key} className={`px-3 py-2 ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, idx) => (
                    <tr key={idx} className={marketUi.row}>
                      {table.columns.map((col) => (
                        <td
                          key={col.key}
                          className={`px-3 py-2 ${col.align === 'right' ? 'text-right tabular-nums' : 'text-left'}`}
                        >
                          {row[col.key] === null || row[col.key] === undefined || row[col.key] === '' ? '—' : String(row[col.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      ))}

      {/* Estacionalidad y previsiones (Reporte consolidado) */}
      {payload.type === 'CONSOLIDATED_IMPACT' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={marketUi.panel}>
            <div className={marketUi.header}>
              <h4 className="text-sm font-semibold">Comportamiento estacional</h4>
              <p className="mt-0.5 text-xs text-muted-foreground">Exige al menos 2 años calendario completos con consistencia interanual.</p>
            </div>
            <div className="p-4">
              {!payload.seasonality || payload.seasonality.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin series suficientes para evaluar estacionalidad.</p>
              ) : (
                <div className="grid gap-3">
                  {payload.seasonality.map((s) => (
                    <div key={`${s.crop}-${s.unit}`} className="rounded-xl border border-border p-3 text-xs">
                      <p className="font-semibold">{s.crop} ({s.unit}) · {s.completeYears} año(s) completos</p>
                      {s.completeYears < 2 ? (
                        <p className="mt-1 text-muted-foreground">Histórico insuficiente (&lt;2 años completos).</p>
                      ) : (
                        <p className="mt-1 text-muted-foreground">
                          Altos: {s.higherMonths.length ? s.higherMonths.map((m) => monthNames[m - 1]).join(', ') : 'Sin patrón'} ·{' '}
                          Bajos: {s.lowerMonths.length ? s.lowerMonths.map((m) => monthNames[m - 1]).join(', ') : 'Sin patrón'}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className={marketUi.panel}>
            <div className={marketUi.header}>
              <h4 className="text-sm font-semibold">Previsiones de producción (6 meses)</h4>
              <p className="mt-0.5 text-xs text-muted-foreground">Exige 24 meses calendario cerrados consecutivos por cultivo y unidad.</p>
            </div>
            <div className="p-4">
              {!payload.forecasts || payload.forecasts.filter((f) => f.estimates.length > 0).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No se emitieron previsiones: ninguna serie cumple aún con 24 meses cerrados consecutivos.
                </p>
              ) : (
                <div className="grid gap-3">
                  {payload.forecasts
                    .filter((f) => f.estimates.length > 0)
                    .map((f) => (
                      <div key={`${f.crop}-${f.unit}`} className="rounded-xl border border-border p-3 text-xs">
                        <p className="font-semibold">{f.crop} ({f.unit}) · {f.consecutiveMonths} meses consecutivos</p>
                        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                          {f.estimates.map((e) => (
                            <div key={e.month} className="rounded-lg bg-muted/40 px-2.5 py-1.5">
                              <p className="font-medium">{e.month}</p>
                              <p className="font-semibold tabular-nums">{numFmt.format(e.value)} {f.unit}</p>
                              {e.low !== null && e.high !== null && (
                                <p className="text-[10px] text-muted-foreground">
                                  [{numFmt.format(e.low)} – {numFmt.format(e.high)}]
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Observaciones automáticas y limitaciones */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${marketUi.panel} p-5`}>
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-[#2c6048] dark:text-[#a8d5b3]" />
            <h4 className="text-sm font-semibold">Observaciones automáticas (deterministas)</h4>
          </div>
          <ul className="mt-3 grid gap-2 text-sm text-foreground">
            {payload.observations.map((obs) => (
              <li key={obs} className="flex items-start gap-2 rounded-xl bg-emerald-50/50 p-3 text-xs leading-5 dark:bg-emerald-950/20">
                <Info className="mt-0.5 size-3.5 shrink-0 text-[#2c6048] dark:text-[#a8d5b3]" />
                <span>{obs}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className={`${marketUi.panel} p-5`}>
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 text-amber-700 dark:text-amber-300" />
            <h4 className="text-sm font-semibold">Limitaciones y alcance metodológico</h4>
          </div>
          <ul className="mt-3 grid gap-2 text-sm text-foreground">
            {payload.limitations.map((lim) => (
              <li key={lim} className="flex items-start gap-2 rounded-xl bg-amber-50/60 p-3 text-xs leading-5 dark:bg-amber-950/20">
                <Download className="mt-0.5 hidden size-3.5" aria-hidden />
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-600 dark:bg-amber-400" />
                <span>{lim}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
