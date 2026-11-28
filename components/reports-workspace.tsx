'use client'

import Link from 'next/link'
import { useState } from 'react'
import useSWR from 'swr'
import {
  Clock,
  Eye,
  FileBarChart2,
  FileSpreadsheet,
  FileText,
  History,
  Play,
  RefreshCw,
  Save,
  Shield,
} from 'lucide-react'
import { AgroWorkspace } from '@/components/agro-workspace'
import { BrandLoader } from '@/components/brand-loader'
import { navigateWithTransition } from '@/components/route-transition-overlay'
import { ReportPreview } from '@/components/report-preview'
import { MarketError, MarketPagination, marketUi } from '@/components/market-ui'
import { productionFetch } from '@/lib/production-client'
import { lastClosedMonth, lastClosedWeek } from '@/lib/report-periods'
import type { ReportPayload, ReportType } from '@/lib/report-generator'

type ReportListItem = {
  id: string
  type: ReportType
  title: string
  trigger: 'AUTOMATIC' | 'MANUAL'
  cadence: 'WEEKLY' | 'MONTHLY' | 'CUSTOM'
  status: 'READY' | 'FAILED' | 'GENERATING'
  periodFrom: string
  periodTo: string
  periodLabel: string
  filtersJson: { cropName?: string | null; unitName?: string | null } | null
  errorMessage: string | null
  attempts: number
  generatedBy: string
  generatedAt: string
}

type ReportsIndexResponse = {
  actor: 'queries' | 'admin'
  page: number
  pageSize: number
  total: number
  hasNext: boolean
  rows: ReportListItem[]
  catalogs: {
    crops: { id: string; name: string; active: boolean }[]
    units: { id: string; name: string; active: boolean }[]
  }
  automation: {
    config: {
      autoWeeklyEnabled: boolean
      autoMonthlyEnabled: boolean
      maxBackfillWeeks: number
      maxBackfillMonths: number
      includeEmptyAutoPeriods: boolean
      timezone: string
    }
    pendingCount: number
    pendingPeriods: {
      dedupeKey: string
      type: ReportType
      cadence: 'WEEKLY' | 'MONTHLY'
      from: string
      to: string
      label: string
      existingStatus: 'MISSING' | 'FAILED'
    }[]
    existingReady: number
    recentRuns: {
      id: string
      source: string
      status: string
      checkedPeriods: number
      createdCount: number
      skippedCount: number
      failedCount: number
      startedAt: string
      finishedAt: string | null
    }[]
  }
}

const reportTypeOptions: { id: ReportType; label: string; desc: string }[] = [
  {
    id: 'CONSOLIDATED_IMPACT',
    label: 'Consolidado de productividad y análisis de impacto',
    desc: 'Indicadores integrados, comparaciones, estacionalidad, previsiones y observaciones automáticas.',
  },
  {
    id: 'PRODUCTION',
    label: 'Producción agrícola',
    desc: 'Cosechas, producción útil, mermas por motivo, distribución por cultivo y zona.',
  },
  {
    id: 'COSTS',
    label: 'Costos de producción',
    desc: 'Costos por categoría, asignados por cultivo, gastos generales e indicadores económicos.',
  },
  {
    id: 'SHIPMENTS_RECEPTIONS',
    label: 'Despachos y recepciones',
    desc: 'Balance enviado vs recibido, diferencias de entrega y despachos pendientes o parciales.',
  },
  {
    id: 'MARKET_SALES',
    label: 'Comercial de Agro Market',
    desc: 'Total vendido, ventas por producto, cantidades por unidad y ganancia bruta estimada.',
  },
  {
    id: 'WEEKLY_OPERATIONAL',
    label: 'Semanal de producción y comercialización',
    desc: 'Resumen operativo de lunes a domingo de producción, envíos y ventas de Agro Market.',
  },
]

const dtFmt = new Intl.DateTimeFormat('es-EC', {
  timeZone: 'America/Guayaquil',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function triggerDownloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function ReportsGeneratorSection({ data, onRefresh }: { data: ReportsIndexResponse; onRefresh: () => void }) {
  const defaultMonth = lastClosedMonth()
  const [type, setType] = useState<ReportType>('CONSOLIDATED_IMPACT')
  const [cadence, setCadence] = useState<'MONTHLY' | 'WEEKLY' | 'CUSTOM'>('MONTHLY')
  const [from, setFrom] = useState(defaultMonth.from)
  const [to, setTo] = useState(defaultMonth.to)
  const [cropId, setCropId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [preview, setPreview] = useState<{ payload: ReportPayload; savedId?: string } | null>(null)
  const [busy, setBusy] = useState<'preview' | 'save' | null>(null)
  const [downloading, setDownloading] = useState<'pdf' | 'csv' | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  function applyPreset(preset: 'last-month' | 'last-week' | 'last-3-months') {
    if (preset === 'last-month') {
      const m = lastClosedMonth()
      setFrom(m.from)
      setTo(m.to)
      setCadence('MONTHLY')
    } else if (preset === 'last-week') {
      const w = lastClosedWeek()
      setFrom(w.from)
      setTo(w.to)
      setCadence('WEEKLY')
    } else {
      const m = lastClosedMonth()
      const end = m.to
      const [y, mm] = m.month.split('-').map(Number)
      const start = new Date(Date.UTC(y, mm - 3, 1)).toISOString().slice(0, 10)
      setFrom(start)
      setTo(end)
      setCadence('CUSTOM')
    }
  }

  async function generate(save: boolean) {
    if (busy) return
    setBusy(save ? 'save' : 'preview')
    setFeedback(null)
    try {
      const res = await productionFetch<{ saved: boolean; report?: { id: string }; payload: ReportPayload }>(
        '/api/reports',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type,
            from,
            to,
            cadence,
            cropId: cropId || null,
            unitId: unitId || null,
            save,
          }),
        },
      )
      setPreview({ payload: res.payload, savedId: res.report?.id })
      if (save) {
        onRefresh()
        setFeedback({ kind: 'ok', text: 'Reporte generado y guardado en el historial.' })
      }
    } catch (err) {
      setFeedback({ kind: 'error', text: err instanceof Error ? err.message : 'No se pudo generar el reporte.' })
    } finally {
      setBusy(null)
    }
  }

  const currentPreview = preview?.payload.type === type && preview.payload.period.from === from && preview.payload.period.to === to
    && preview.payload.cadence === cadence && (preview.payload.filters.cropId ?? '') === cropId
    && (preview.payload.filters.unitId ?? '') === unitId ? preview : null

  async function downloadReport(format: 'pdf' | 'csv') {
    if (downloading) return
    setDownloading(format)
    setFeedback(null)
    try {
      const url = currentPreview?.savedId
        ? `/api/reports/${currentPreview.savedId}/export?format=${format}`
        : '/api/reports/export'
      const init: RequestInit = currentPreview?.savedId
        ? { method: 'GET' }
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              format,
              type,
              from,
              to,
              cadence,
              cropId: cropId || null,
              unitId: unitId || null,
            }),
          }
      const response = await fetch(url, init)
      if (response.status === 401) {
        navigateWithTransition('/', { replace: true, label: 'Tu sesión expiró…' })
        return
      }
      if (!response.ok) {
        const err = await response.json().catch(() => null)
        throw new Error(err?.error ?? 'No se pudo exportar el documento.')
      }
      const blob = await response.blob()
      const slug = type.toLowerCase().replaceAll('_', '-')
      triggerDownloadBlob(blob, `lodana-${slug}-${from}_${to}.${format}`)
    } catch (err) {
      setFeedback({ kind: 'error', text: err instanceof Error ? err.message : 'Error al descargar el reporte.' })
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="grid gap-6">
      <section className={marketUi.panel}>
        <div className={marketUi.header}>
          <h3 className="text-base font-semibold">Parámetros del reporte</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Selecciona el tipo de informe, el período y filtros opcionales. Puedes ver una vista previa o guardarlo directamente en el historial.
          </p>
        </div>

        <div className="grid gap-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {reportTypeOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={type === opt.id}
                onClick={() => setType(opt.id)}
                className={`rounded-2xl border p-3.5 text-left transition ${
                  type === opt.id
                    ? 'border-[#2c6048] bg-emerald-50/70 ring-1 ring-[#2c6048] dark:border-[#a8d5b3] dark:bg-[#1e3529]'
                    : 'border-border bg-background hover:bg-muted/40'
                }`}
              >
                <p className="text-sm font-semibold">{opt.label}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{opt.desc}</p>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-muted-foreground">Períodos rápidos:</span>
            <button type="button" onClick={() => applyPreset('last-month')} className={marketUi.button}>Último mes cerrado</button>
            <button type="button" onClick={() => applyPreset('last-week')} className={marketUi.button}>Última semana (lun–dom)</button>
            <button type="button" onClick={() => applyPreset('last-3-months')} className={marketUi.button}>Últimos 3 meses cerrados</button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-xs">
              <span className="font-medium text-muted-foreground">Desde</span>
              <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setCadence('CUSTOM') }} className={marketUi.input} />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="font-medium text-muted-foreground">Hasta</span>
              <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setCadence('CUSTOM') }} className={marketUi.input} />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="font-medium text-muted-foreground">Cultivo (opcional)</span>
              <select value={cropId} onChange={(e) => setCropId(e.target.value)} className={marketUi.input}>
                <option value="">Todos los cultivos</option>
                {data.catalogs.crops.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.active ? '' : ' (inactivo)'}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs">
              <span className="font-medium text-muted-foreground">Unidad de medida (opcional)</span>
              <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className={marketUi.input}>
                <option value="">Todas (desagregadas por unidad)</option>
                {data.catalogs.units.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" disabled={Boolean(busy || downloading)} onClick={() => void downloadReport('pdf')} className={marketUi.primary}>
              <FileText className="size-4" aria-hidden />
              {downloading === 'pdf' ? 'Preparando PDF…' : 'Descargar PDF'}
            </button>
            <button type="button" disabled={Boolean(busy)} onClick={() => generate(false)} className={marketUi.button}>
              <Eye className="size-4" />
              {busy === 'preview' ? 'Calculando…' : 'Vista previa'}
            </button>
            <button type="button" disabled={Boolean(busy)} onClick={() => generate(true)} className={marketUi.button}>
              <Save className="size-4" />
              {busy === 'save' ? 'Generando y guardando…' : 'Generar y guardar en historial'}
            </button>
          </div>

          {feedback && (
            <div
              role="status"
              className={`rounded-xl border px-4 py-2.5 text-sm ${
                feedback.kind === 'ok'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                  : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200'
              }`}
            >
              {feedback.text}
            </div>
          )}
        </div>
      </section>

      {currentPreview && (
        <ReportPreview
          payload={currentPreview.payload}
          trigger="MANUAL"
          onDownloadPdf={() => downloadReport('pdf')}
          onDownloadCsv={() => downloadReport('csv')}
          downloading={downloading}
        />
      )}
    </div>
  )
}

function ReportsHistorySection({
  actor,
  onSelectSaved,
}: {
  actor: 'queries' | 'admin'
  onSelectSaved: () => void
}) {
  const [page, setPage] = useState(1)
  const [type, setType] = useState('')
  const [trigger, setTrigger] = useState('')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<{
    id: string
    trigger: string
    generatedAt: string
    payload: ReportPayload
  } | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [retryingId, setRetryingId] = useState('')
  const [downloading, setDownloading] = useState<'pdf' | 'csv' | null>(null)
  const [feedback, setFeedback] = useState('')

  const params = new URLSearchParams({ page: String(page), pageSize: '15' })
  if (type) params.set('type', type)
  if (trigger) params.set('trigger', trigger)
  if (status) params.set('status', status)
  if (q.trim()) params.set('q', q.trim())

  const { data, error, isLoading, mutate } = useSWR<ReportsIndexResponse>(
    `/api/reports?${params.toString()}`,
    productionFetch,
  )

  async function openReport(id: string) {
    setLoadingDetail(true)
    setFeedback('')
    try {
      const detail = await productionFetch<{ id: string; trigger: string; generatedAt: string; payloadJson: ReportPayload }>(
        `/api/reports/${id}`,
      )
      setSelected({ id: detail.id, trigger: detail.trigger, generatedAt: detail.generatedAt, payload: detail.payloadJson })
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'No se pudo cargar el reporte.')
    } finally {
      setLoadingDetail(false)
    }
  }

  async function downloadSaved(id: string, format: 'pdf' | 'csv', filenameBase: string) {
    setDownloading(format)
    setFeedback('')
    try {
      const response = await fetch(`/api/reports/${id}/export?format=${format}`)
      if (response.status === 401) {
        navigateWithTransition('/', { replace: true, label: 'Tu sesión expiró…' })
        return
      }
      if (!response.ok) {
        const err = await response.json().catch(() => null)
        throw new Error(err?.error ?? 'No se pudo descargar el reporte.')
      }
      const blob = await response.blob()
      triggerDownloadBlob(blob, `${filenameBase}.${format}`)
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Error al exportar el documento.')
    } finally {
      setDownloading(null)
    }
  }

  async function retryReport(id: string) {
    setRetryingId(id)
    setFeedback('')
    try {
      await productionFetch(`/api/reports/${id}`, { method: 'POST' })
      await mutate()
      onSelectSaved()
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'No se pudo reintentar el reporte.')
    } finally {
      setRetryingId('')
    }
  }

  return (
    <div className="grid gap-5">
      <section className={`${marketUi.panel} p-4`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input
            type="search"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            placeholder="Buscar por título o período…"
            className={`${marketUi.input} lg:col-span-2`}
          />
          <select value={type} onChange={(e) => { setType(e.target.value); setPage(1) }} className={marketUi.input}>
            <option value="">Todos los tipos</option>
            {reportTypeOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <select value={trigger} onChange={(e) => { setTrigger(e.target.value); setPage(1) }} className={marketUi.input}>
            <option value="">Automáticos y manuales</option>
            <option value="AUTOMATIC">Solo automáticos</option>
            <option value="MANUAL">Solo manuales</option>
          </select>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className={marketUi.input}>
            <option value="">Todos los estados</option>
            <option value="READY">Listos</option>
            <option value="FAILED">Con error</option>
          </select>
        </div>
      </section>

      {error && <MarketError message={error.message} retry={() => mutate()} />}
      {feedback && <MarketError message={feedback} />}

      <section className={marketUi.panel}>
        <div className={`${marketUi.header} flex flex-wrap items-center justify-between gap-2`}>
          <h3 className="text-base font-semibold">Reportes almacenados</h3>
          <span className="text-xs text-muted-foreground">{data ? `${data.total} reporte(s)` : 'Cargando…'}</span>
        </div>
        <div className="p-4">
          {isLoading || !data ? (
            <p className="text-sm text-muted-foreground">Cargando historial de reportes…</p>
          ) : data.rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Aún no hay reportes guardados con estos criterios. Genera uno manual o ejecuta la automatización de períodos cerrados.
            </p>
          ) : (
            <div className="grid gap-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={marketUi.tableHead}>
                      <th className="px-3 py-2">Reporte</th>
                      <th className="px-3 py-2">Período</th>
                      <th className="px-3 py-2">Origen</th>
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2">Generado</th>
                      <th className="px-3 py-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <tr key={row.id} className={marketUi.row}>
                        <td className="px-3 py-2">
                          <p className="font-medium">{row.title}</p>
                          {(row.filtersJson?.cropName || row.filtersJson?.unitName) && (
                            <p className="text-xs text-muted-foreground">
                              {[row.filtersJson?.cropName, row.filtersJson?.unitName].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-medium">{row.periodLabel}</p>
                          <p className="text-[11px] text-muted-foreground">{row.periodFrom} a {row.periodTo}</p>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${row.trigger === 'AUTOMATIC' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200' : 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200'}`}>
                            {row.trigger === 'AUTOMATIC' ? 'Automático' : 'Manual'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${row.status === 'READY' ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200'}`}>
                            {row.status === 'READY' ? 'Listo' : `Error (${row.attempts})`}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                          {dtFmt.format(new Date(row.generatedAt))}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex flex-wrap justify-end gap-1.5">
                            {row.status === 'READY' ? (
                              <>
                                <button
                                  type="button"
                                  disabled={loadingDetail}
                                  onClick={() => openReport(row.id)}
                                  className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted"
                                >
                                  Ver
                                </button>
                                <button
                                  type="button"
                                  onClick={() => downloadSaved(row.id, 'pdf', `lodana-${row.type.toLowerCase()}-${row.periodFrom}`)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-[#2c6048] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#234d39]"
                                >
                                  <FileText className="size-3.5" /> PDF
                                </button>
                                <button
                                  type="button"
                                  onClick={() => downloadSaved(row.id, 'csv', `lodana-${row.type.toLowerCase()}-${row.periodFrom}`)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted"
                                >
                                  <FileSpreadsheet className="size-3.5" /> CSV
                                </button>
                              </>
                            ) : (
                              actor === 'admin' && (
                                <button
                                  type="button"
                                  disabled={retryingId === row.id}
                                  onClick={() => retryReport(row.id)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted"
                                >
                                  <RefreshCw className="size-3.5" />
                                  {retryingId === row.id ? 'Reintentando…' : 'Reintentar'}
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <MarketPagination page={data.page} hasNext={data.hasNext} selectPage={setPage} />
            </div>
          )}
        </div>
      </section>

      {selected && (
        <div className="grid gap-3">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-semibold">Detalle del reporte guardado</h4>
            <button type="button" onClick={() => setSelected(null)} className={marketUi.button}>
              Cerrar vista
            </button>
          </div>
          <ReportPreview
            payload={selected.payload}
            trigger={selected.trigger}
            generatedAt={selected.generatedAt}
            onDownloadPdf={() => downloadSaved(selected.id, 'pdf', `lodana-${selected.payload.type.toLowerCase()}-${selected.payload.period.from}`)}
            onDownloadCsv={() => downloadSaved(selected.id, 'csv', `lodana-${selected.payload.type.toLowerCase()}-${selected.payload.period.from}`)}
            downloading={downloading}
          />
        </div>
      )}
    </div>
  )
}

function ReportsAutomationSection({ data, onRefresh }: { data: ReportsIndexResponse; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false)
  const [targetMonth, setTargetMonth] = useState(lastClosedMonth().month)
  const [targetWeekDay, setTargetWeekDay] = useState(lastClosedWeek().from)
  const [resultMsg, setResultMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const isAdmin = data.actor === 'admin'
  const { automation } = data
  const runStatuses: Record<string, string> = { SUCCESS: 'Completada', RUNNING: 'Iniciada', PARTIAL: 'Completada con errores', FAILED: 'Fallida' }

  async function runAutomation(body: Record<string, unknown>, label: string) {
    if (busy) return
    setBusy(true)
    setResultMsg(null)
    try {
      const res = await productionFetch<{
        status: string
        checkedPeriods: number
        createdCount: number
        skippedCount: number
        failedCount: number
      }>('/api/reports/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      onRefresh()
      setResultMsg({
        kind: res.failedCount > 0 ? 'error' : 'ok',
        text: `${label} · ${res.createdCount} creados, ${res.skippedCount} omitidos y ${res.failedCount} fallidos.`,
      })
    } catch (err) {
      setResultMsg({ kind: 'error', text: err instanceof Error ? err.message : 'Error al ejecutar la automatización.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6">
      <section className={`${marketUi.panel} flex flex-wrap items-center justify-between gap-3 p-4`}>
        <div>
          <h3 className="text-sm font-semibold">Programación de reportes</h3>
          <p className="mt-1 text-xs text-muted-foreground">Horario diario en Vercel 00:15 (Ecuador). Los reportes generados aparecen en Historial.</p>
        </div>
        {isAdmin && (
          <Link href="/administracion?seccion=configuracion" className={marketUi.button}>
            <Shield className="size-4" aria-hidden /> Configurar periodicidad
          </Link>
        )}
      </section>
      {resultMsg && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            resultMsg.kind === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200'
          }`}
        >
          {resultMsg.text}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <article className={`${marketUi.panel} p-4`}>
          <p className="text-xs text-muted-foreground">Reportes semanales (lun–dom)</p>
          <p className="mt-1 text-lg font-semibold">{automation.config.autoWeeklyEnabled ? 'Activos' : 'Pausados'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Recuperación: últimas {automation.config.maxBackfillWeeks} semanas cerradas</p>
        </article>
        <article className={`${marketUi.panel} p-4`}>
          <p className="text-xs text-muted-foreground">Reportes mensuales consolidados</p>
          <p className="mt-1 text-lg font-semibold">{automation.config.autoMonthlyEnabled ? 'Activos' : 'Pausados'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Recuperación: últimos {automation.config.maxBackfillMonths} meses cerrados</p>
        </article>
        <article className={`${marketUi.panel} p-4`}>
          <p className="text-xs text-muted-foreground">Períodos cerrados pendientes</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{automation.pendingCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">Zona horaria: {automation.config.timezone} · {automation.existingReady} al día</p>
        </article>
      </div>

      {/* Recuperación de períodos pendientes y ejecución controlada */}
      <section className={marketUi.panel}>
        <div className={`${marketUi.header} flex flex-wrap items-center justify-between gap-2`}>
          <div>
            <h3 className="text-base font-semibold">Períodos pendientes de generación automática</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Recupera cierres semanales o mensuales. Si se excluyen períodos vacíos, se vuelven a revisar en la próxima ejecución.
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              disabled={busy}
              onClick={() => runAutomation({}, 'Recuperación de períodos pendientes')}
              className={marketUi.primary}
            >
              <Play className="size-4" />
              {busy ? 'Ejecutando…' : 'Generar períodos pendientes ahora'}
            </button>
          )}
        </div>
        <div className="p-4">
          {automation.pendingPeriods.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todos los períodos cerrados configurados se encuentran procesados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={marketUi.tableHead}>
                    <th className="px-3 py-2">Periodicidad</th>
                    <th className="px-3 py-2">Período</th>
                    <th className="px-3 py-2">Rango</th>
                    <th className="px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {automation.pendingPeriods.map((p) => (
                    <tr key={p.dedupeKey} className={marketUi.row}>
                      <td className="px-3 py-2 font-medium">{p.cadence === 'MONTHLY' ? 'Mensual consolidado' : 'Semanal operativo'}</td>
                      <td className="px-3 py-2">{p.label}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{p.from} a {p.to}</td>
                      <td className="px-3 py-2">
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                          {p.existingStatus === 'FAILED' ? 'Pendiente de reintento' : 'Pendiente'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {isAdmin && (
            <div className="mt-5 grid gap-4 border-t border-border pt-4 md:grid-cols-2">
              <div className="rounded-xl border border-border p-3.5">
                <p className="text-xs font-semibold">Ejecutar cierre automático de un mes específico</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    type="month"
                    max={lastClosedMonth().month}
                    aria-label="Mes cerrado"
                    value={targetMonth}
                    onChange={(e) => setTargetMonth(e.target.value)}
                    className={`${marketUi.input} flex-1`}
                  />
                  <button
                    type="button"
                    disabled={busy || !targetMonth}
                    onClick={() => runAutomation({ targetMonth }, `Cierre mensual (${targetMonth})`)}
                    className={marketUi.button}
                  >
                    Ejecutar mes
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-border p-3.5">
                <p className="text-xs font-semibold">Ejecutar cierre automático de una semana (lun–dom)</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    type="date"
                    max={lastClosedWeek().to}
                    aria-label="Fecha de una semana cerrada"
                    value={targetWeekDay}
                    onChange={(e) => setTargetWeekDay(e.target.value)}
                    className={`${marketUi.input} flex-1`}
                  />
                  <button
                    type="button"
                    disabled={busy || !targetWeekDay}
                    onClick={() => runAutomation({ targetWeekDay }, `Cierre semanal (${targetWeekDay})`)}
                    className={marketUi.button}
                  >
                    Ejecutar semana
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Historial de ejecuciones de automatización */}
      <section className={marketUi.panel}>
        <div className={`${marketUi.header} flex flex-wrap items-center justify-between gap-2`}>
          <h3 className="text-base font-semibold">Historial de ejecuciones automáticas</h3>
        </div>
        <div className="overflow-x-auto p-4">
          {automation.recentRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no se registran ejecuciones automáticas.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className={marketUi.tableHead}>
                  <th className="px-3 py-2">Inicio</th>
                  <th className="px-3 py-2">Origen</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2 text-right">Evaluados</th>
                  <th className="px-3 py-2 text-right">Creados</th>
                  <th className="px-3 py-2 text-right">Omitidos</th>
                  <th className="px-3 py-2 text-right">Errores</th>
                </tr>
              </thead>
              <tbody>
                {automation.recentRuns.map((r) => (
                  <tr key={r.id} className={marketUi.row}>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{dtFmt.format(new Date(r.startedAt))}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.source}</td>
                    <td className="px-3 py-2 font-semibold">{runStatuses[r.status] ?? r.status}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.checkedPeriods}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.createdCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.skippedCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.failedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}

const sections = [
  {
    id: 'generar',
    label: 'Generar reporte',
    icon: FileBarChart2,
    title: 'Centro de reportes automáticos',
    description: 'Genera vistas previas, informes estructurados de productividad y descargas institucionales en PDF y CSV.',
  },
  {
    id: 'historial',
    label: 'Historial',
    icon: History,
    title: 'Historial de reportes generados',
    description: 'Consulta, visualiza y descarga reportes automáticos y manuales almacenados en el sistema.',
  },
  {
    id: 'automatizacion',
    label: 'Automatización',
    icon: Clock,
    title: 'Programación y recuperación automática',
    description: 'Supervisa la generación semanal (lunes a domingo) y mensual (meses cerrados) en hora de Ecuador.',
  },
] as const

export function ReportsWorkspace() {
  const { data, error, isLoading, mutate } = useSWR<ReportsIndexResponse>('/api/reports?page=1&pageSize=10', productionFetch)

  return (
    <AgroWorkspace
      title="Reportes"
      path="/reportes"
      sections={sections}
      renderSection={(active) => {
        if (error) return <MarketError message={error.message} retry={() => mutate()} />
        if (isLoading || !data) {
          return (
            <BrandLoader
              variant="section"
              message="Cargando centro de reportes…"
              subtitle="Historial, filtros y automatización"
            />
          )
        }
        if (active === 'historial') return <ReportsHistorySection actor={data.actor} onSelectSaved={() => mutate()} />
        if (active === 'automatizacion') return <ReportsAutomationSection data={data} onRefresh={() => mutate()} />
        return <ReportsGeneratorSection data={data} onRefresh={() => mutate()} />
      }}
    />
  )
}
