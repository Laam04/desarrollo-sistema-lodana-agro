'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { Building2, Clock, Play, Save } from 'lucide-react'
import { productionFetch } from '@/lib/production-client'
import { MarketError, marketUi } from '@/components/market-ui'

type SettingsResponse = {
  institution: {
    organizationName: string
    universityName: string
    farmName: string
    marketName: string
    location: string
  }
  reporting: {
    autoWeeklyEnabled: boolean
    autoMonthlyEnabled: boolean
    maxBackfillWeeks: number
    maxBackfillMonths: number
    includeEmptyAutoPeriods: boolean
    timezone: 'America/Guayaquil'
  }
}

export function AdminSettingsPanel() {
  const { data, error, isLoading, mutate } = useSWR<SettingsResponse>('/api/admin/settings', productionFetch)
  const [form, setForm] = useState<SettingsResponse | null>(null)
  const [saving, setSaving] = useState(false)
  const [runningAuto, setRunningAuto] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (data && !form) setForm(data)
  }, [data, form])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!form || saving) return
    setSaving(true)
    setFeedback(null)
    try {
      const updated = await productionFetch<SettingsResponse>('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      setForm(updated)
      await mutate(updated, false)
      setFeedback({ kind: 'ok', text: 'Configuración institucional y de reportes guardada y auditada.' })
    } catch (err) {
      setFeedback({ kind: 'error', text: err instanceof Error ? err.message : 'No se pudo guardar la configuración.' })
    } finally {
      setSaving(false)
    }
  }

  async function runPendingAutomation() {
    if (runningAuto) return
    setRunningAuto(true)
    setFeedback(null)
    try {
      const res = await productionFetch<{ createdCount: number; skippedCount: number; failedCount: number }>(
        '/api/reports/automation',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) },
      )
      setFeedback({
        kind: res.failedCount > 0 ? 'error' : 'ok',
        text: `Automatización ejecutada: ${res.createdCount} reporte(s) creados, ${res.skippedCount} omitidos (existentes o sin datos), ${res.failedCount} con error.`,
      })
    } catch (err) {
      setFeedback({ kind: 'error', text: err instanceof Error ? err.message : 'No se pudo ejecutar la automatización.' })
    } finally {
      setRunningAuto(false)
    }
  }

  if (error) return <MarketError message={error.message} retry={() => mutate()} />
  if (isLoading || !form) {
    return <div className={`${marketUi.panel} p-6 text-sm text-muted-foreground`}>Cargando configuración general…</div>
  }

  return (
    <form onSubmit={save} className="grid gap-6">
      {feedback && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedback.kind === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <section className={marketUi.panel}>
        <div className={marketUi.header}>
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-[#2c6048] dark:text-[#a8d5b3]" />
            <h3 className="text-base font-semibold">Identidad institucional para reportes</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Estos datos se imprimen en los encabezados y pies de página de los documentos PDF y exportaciones CSV.
          </p>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Nombre del sistema</span>
            <input
              required
              maxLength={80}
              value={form.institution.organizationName}
              onChange={(e) => setForm({ ...form, institution: { ...form.institution, organizationName: e.target.value } })}
              className={marketUi.input}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Universidad / Institución</span>
            <input
              required
              maxLength={140}
              value={form.institution.universityName}
              onChange={(e) => setForm({ ...form, institution: { ...form.institution, universityName: e.target.value } })}
              className={marketUi.input}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Unidad de producción</span>
            <input
              required
              maxLength={100}
              value={form.institution.farmName}
              onChange={(e) => setForm({ ...form, institution: { ...form.institution, farmName: e.target.value } })}
              className={marketUi.input}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Unidad comercial</span>
            <input
              required
              maxLength={100}
              value={form.institution.marketName}
              onChange={(e) => setForm({ ...form, institution: { ...form.institution, marketName: e.target.value } })}
              className={marketUi.input}
            />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-medium">Ubicación</span>
            <input
              maxLength={100}
              value={form.institution.location}
              onChange={(e) => setForm({ ...form, institution: { ...form.institution, location: e.target.value } })}
              className={marketUi.input}
            />
          </label>
        </div>
      </section>

      <section className={marketUi.panel}>
        <div className={marketUi.header}>
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-[#2c6048] dark:text-[#a8d5b3]" />
            <h3 className="text-base font-semibold">Parámetros de generación automática de reportes</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Zona horaria operativa fija: <strong>America/Guayaquil</strong>. Los reportes semanales abarcan lunes a domingo y los mensuales abarcan meses calendario cerrados.
          </p>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
            <input
              type="checkbox"
              checked={form.reporting.autoWeeklyEnabled}
              onChange={(e) => setForm({ ...form, reporting: { ...form.reporting, autoWeeklyEnabled: e.target.checked } })}
              className="mt-1 size-4 accent-[#2c6048]"
            />
            <span>
              <strong className="block">Reportes semanales automáticos</strong>
              <span className="text-xs text-muted-foreground">Producción y comercialización de cada semana cerrada (lunes a domingo).</span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
            <input
              type="checkbox"
              checked={form.reporting.autoMonthlyEnabled}
              onChange={(e) => setForm({ ...form, reporting: { ...form.reporting, autoMonthlyEnabled: e.target.checked } })}
              className="mt-1 size-4 accent-[#2c6048]"
            />
            <span>
              <strong className="block">Reportes mensuales consolidados automáticos</strong>
              <span className="text-xs text-muted-foreground">Productividad y análisis de impacto al cierre de cada mes calendario.</span>
            </span>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium">Ventana de recuperación semanal (1–26 semanas)</span>
            <input
              type="number"
              min={1}
              max={26}
              value={form.reporting.maxBackfillWeeks}
              onChange={(e) => setForm({ ...form, reporting: { ...form.reporting, maxBackfillWeeks: Number(e.target.value) } })}
              className={marketUi.input}
            />
            <span className="text-xs text-muted-foreground">Semanas cerradas pasadas que el sistema recupera si el servidor estuvo apagado.</span>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium">Ventana de recuperación mensual (1–24 meses)</span>
            <input
              type="number"
              min={1}
              max={24}
              value={form.reporting.maxBackfillMonths}
              onChange={(e) => setForm({ ...form, reporting: { ...form.reporting, maxBackfillMonths: Number(e.target.value) } })}
              className={marketUi.input}
            />
            <span className="text-xs text-muted-foreground">Meses calendario cerrados evaluados al ejecutar la recuperación automática.</span>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.reporting.includeEmptyAutoPeriods}
              onChange={(e) => setForm({ ...form, reporting: { ...form.reporting, includeEmptyAutoPeriods: e.target.checked } })}
              className="mt-1 size-4 accent-[#2c6048]"
            />
            <span>
              <strong className="block">Guardar también reportes automáticos de períodos sin actividad</strong>
              <span className="text-xs text-muted-foreground">Si está desactivado, los períodos cerrados sin registros se omiten en la generación masiva.</span>
            </span>
          </label>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={runPendingAutomation} disabled={runningAuto} className={marketUi.button}>
          <Play className="size-4" />
          {runningAuto ? 'Ejecutando recuperación…' : 'Verificar y generar períodos pendientes ahora'}
        </button>

        <button type="submit" disabled={saving} className={marketUi.primary}>
          <Save className="size-4" />
          {saving ? 'Guardando…' : 'Guardar configuración'}
        </button>
      </div>
    </form>
  )
}
