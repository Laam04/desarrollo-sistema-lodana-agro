'use client'

import useSWR from 'swr'
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  CircleHelp,
  Layers,
  Leaf,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Ruler,
  Search,
  Sprout,
  X,
} from 'lucide-react'

/* ───────────────────────── Tipos ───────────────────────── */

type Unit = {
  id: string
  name: string
}

type Variety = {
  id: string
  name: string
  active?: boolean
}

type ProductionArea = {
  id: string
  name: string
  type: 'LOT' | 'ZONE'
  surface: string | number | null
  surfaceUnit?: string | null
  notes?: string | null
  active?: boolean
}

type Crop = {
  id: string
  name: string
  active: boolean
  hasVarieties: boolean
  hasProductionAreas: boolean
  tracksSurface?: boolean
  hasOtherDetails?: boolean
  unit?: Unit | null
  unitId?: string | null
  varieties: Variety[]
  productionAreas: ProductionArea[]
}

type AreaDraft = {
  name: string
  type: 'LOT' | 'ZONE'
  surface: string
  surfaceUnit: string
  notes: string
}

type Toast = { type: 'success' | 'error'; text: string } | null

type ConfirmState = {
  title: string
  description: string
  confirmLabel: string
  tone: 'default' | 'danger'
  onConfirm: () => void | Promise<void>
} | null

const emptyArea: AreaDraft = {
  name: '',
  type: 'LOT',
  surface: '',
  surfaceUnit: 'ha',
  notes: '',
}

/* ───────────────────── Estilos reutilizables ───────────────────── */

const ui = {
  card: 'rounded-2xl border border-[#dbe7dd] bg-white shadow-sm dark:border-[#2d3b32] dark:bg-[#18211c]',
  inner:
    'rounded-xl border border-[#e3ece4] bg-[#f6faf6] dark:border-[#2d3b32] dark:bg-[#1d2820]',
  chip: 'bg-[#e4f0e7] text-[#24523b] dark:bg-[#24382c] dark:text-[#a8d5b3]',
  eyebrow:
    'text-xs font-semibold uppercase tracking-[0.15em] text-[#2c6048] dark:text-[#a8d5b3]',
  input:
    'w-full rounded-xl border border-[#cfdcd1] bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-[#2c6048] focus:ring-2 focus:ring-[#b8d8bf] dark:border-[#34453a] dark:bg-[#141b17] dark:focus:ring-[#2c6048]',
  btnPrimary:
    'inline-flex items-center justify-center gap-2 rounded-xl bg-[#2c6048] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#234d39] focus:outline-none focus:ring-2 focus:ring-[#b8d8bf] disabled:cursor-not-allowed disabled:opacity-60',
  btnGhost:
    'inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#cfdcd1] px-3 py-2 text-sm font-medium transition hover:bg-[#eef5ef] disabled:opacity-50 dark:border-[#34453a] dark:hover:bg-[#223027]',
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error('No se pudieron cargar los datos.')
  return response.json()
}

/* ───────────────────── Componentes auxiliares ───────────────────── */

function SectionTitle({
  step,
  icon,
  title,
  hint,
}: {
  step: number
  icon: React.ReactNode
  title: string
  hint?: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${ui.chip}`}
      >
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold">
          <span className="mr-1.5 text-muted-foreground">{step}.</span>
          {title}
        </p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
}

function YesNo({
  value,
  onChange,
}: {
  value: boolean
  onChange: (value: boolean) => void
}) {
  const base =
    'flex-1 rounded-lg px-4 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#b8d8bf]'
  const on = 'bg-[#2c6048] text-white shadow-sm'
  const off = 'text-muted-foreground hover:text-foreground'

  return (
    <div
      className="inline-flex w-40 gap-1 rounded-xl border border-[#cfdcd1] bg-[#f1f6f2] p-1 dark:border-[#34453a] dark:bg-[#141b17]"
      role="group"
      aria-label="Seleccionar sí o no"
    >
      <button
        type="button"
        aria-pressed={value}
        onClick={() => onChange(true)}
        className={`${base} ${value ? on : off}`}
      >
        Sí
      </button>
      <button
        type="button"
        aria-pressed={!value}
        onClick={() => onChange(false)}
        className={`${base} ${!value ? on : off}`}
      >
        No
      </button>
    </div>
  )
}

function TagInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[]
  onChange: (values: string[]) => void
  placeholder: string
}) {
  const [draft, setDraft] = useState('')

  function add() {
    const clean = draft.trim().replace(/\s+/g, ' ')

    if (
      clean &&
      !values.some((value) => value.toLowerCase() === clean.toLowerCase())
    ) {
      onChange([...values, clean])
    }

    setDraft('')
  }

  return (
    <div className={`grid gap-3 p-3 ${ui.inner}`}>
      {values.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {values.map((value) => (
            <span
              key={value}
              className={`inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1.5 text-xs font-medium ${ui.chip}`}
            >
              {value}
              <button
                type="button"
                aria-label={`Quitar ${value}`}
                onClick={() =>
                  onChange(values.filter((item) => item !== value))
                }
                className="rounded-full p-0.5 transition hover:bg-black/10 dark:hover:bg-white/10"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Aún no agregaste variedades.
        </p>
      )}

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              add()
            }
          }}
          placeholder={placeholder}
          className={ui.input}
        />

        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className={`${ui.btnGhost} shrink-0`}
        >
          <Plus className="size-4" />
          Agregar
        </button>
      </div>
    </div>
  )
}

function ConfirmDialog({
  state,
  busy,
  onCancel,
}: {
  state: NonNullable<ConfirmState>
  busy: boolean
  onCancel: () => void
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  const danger = state.tone === 'danger'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={() => !busy && onCancel()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        onClick={(event) => event.stopPropagation()}
        className={`w-full max-w-md p-6 shadow-xl ${ui.card}`}
      >
        <div className="flex items-start gap-4">
          <div
            className={`flex size-11 shrink-0 items-center justify-center rounded-full ${
              danger
                ? 'bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-300'
                : ui.chip
            }`}
          >
            {danger ? (
              <AlertTriangle className="size-5" />
            ) : (
              <CheckCircle2 className="size-5" />
            )}
          </div>
          <div>
            <h4 id="confirm-title" className="text-base font-semibold">
              {state.title}
            </h4>
            <p
              id="confirm-desc"
              className="mt-1 text-sm text-muted-foreground"
            >
              {state.description}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className={ui.btnGhost}
          >
            Cancelar
          </button>
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={() => state.onConfirm()}
            className={
              danger
                ? 'inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60'
                : ui.btnPrimary
            }
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: number
}) {
  return (
    <div className={`flex items-center gap-3 p-4 ${ui.card}`}>
      <div
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${ui.chip}`}
      >
        {icon}
      </div>
      <div>
        <p className="text-2xl font-semibold leading-none">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

/* ───────────────────── Componente principal ───────────────────── */

export function CropsManager() {
  const {
    data: crops = [],
    mutate: refreshCrops,
    error: cropsError,
    isLoading: loadingCrops,
  } = useSWR<Crop[]>('/api/crops?includeInactive=true', fetcher)

  const { data: units = [], mutate: refreshUnits } = useSWR<Unit[]>(
    '/api/units',
    fetcher,
  )

  const [name, setName] = useState('')
  const [hasProductionAreas, setHasProductionAreas] = useState(false)
  const [hasVarieties, setHasVarieties] = useState(false)
  const [varieties, setVarieties] = useState<string[]>([])
  const [areas, setAreas] = useState<AreaDraft[]>([])
  const [areaDraft, setAreaDraft] = useState<AreaDraft>({ ...emptyArea })

  const [unitId, setUnitId] = useState('')
  const [newUnit, setNewUnit] = useState('')
  const [editingCrop, setEditingCrop] = useState<Crop | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<Toast>(null)
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  const activeCrops = crops.filter((crop) => crop.active !== false)
  const inactiveCrops = crops.filter((crop) => crop.active === false)

  const displayedCrops = useMemo(() => {
    const base = showInactive ? inactiveCrops : activeCrops
    const term = search.trim().toLowerCase()
    return term
      ? base.filter((crop) => crop.name.toLowerCase().includes(term))
      : base
  }, [showInactive, inactiveCrops, activeCrops, search])

  const totalAreas = activeCrops.reduce(
    (sum, crop) =>
      sum + (crop.productionAreas || []).filter((a) => a.active !== false).length,
    0,
  )
  const totalVarieties = activeCrops.reduce(
    (sum, crop) =>
      sum + (crop.varieties || []).filter((v) => v.active !== false).length,
    0,
  )

  const isDirty =
    !!editingCrop ||
    name.trim() !== '' ||
    areas.length > 0 ||
    varieties.length > 0 ||
    unitId !== ''

  /* Cierre automático del aviso */
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4500)
    return () => clearTimeout(timer)
  }, [toast])

  function notify(type: 'success' | 'error', text: string) {
    setToast({ type, text })
  }

  function resetForm() {
    setName('')
    setHasProductionAreas(false)
    setHasVarieties(false)
    setVarieties([])
    setAreas([])
    setAreaDraft({ ...emptyArea })
    setUnitId('')
    setNewUnit('')
    setEditingCrop(null)
    setError('')
  }

  function startEditing(crop: Crop) {
    setError('')
    setEditingCrop(crop)
    setName(crop.name)
    setHasProductionAreas(crop.hasProductionAreas)
    setHasVarieties(crop.hasVarieties)
    setUnitId(crop.unitId || crop.unit?.id || '')

    setVarieties(
      (crop.varieties || [])
        .filter((variety) => variety.active !== false)
        .map((variety) => variety.name),
    )

    setAreas(
      (crop.productionAreas || [])
        .filter((area) => area.active !== false)
        .map((area) => ({
          name: area.name,
          type: area.type,
          surface: area.surface == null ? '' : String(area.surface),
          surfaceUnit: area.surfaceUnit || 'ha',
          notes: area.notes || '',
        })),
    )

    setAreaDraft({ ...emptyArea })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /* Ejecuta una acción confirmada y cierra el diálogo */
  async function runConfirmed(action: () => Promise<void> | void) {
    setConfirmBusy(true)
    try {
      await action()
    } finally {
      setConfirmBusy(false)
      setConfirm(null)
    }
  }

  function askConfirm(config: Omit<NonNullable<ConfirmState>, 'onConfirm'> & {
    action: () => Promise<void> | void
  }) {
    const { action, ...rest } = config
    setConfirm({ ...rest, onConfirm: () => runConfirmed(action) })
  }

  /* ─── Unidades ─── */

  function requestAddUnit() {
    const clean = newUnit.trim()
    if (!clean) return

    askConfirm({
      title: 'Registrar nueva unidad',
      description: `Se agregará la unidad "${clean}". Las unidades no se pueden eliminar para proteger el historial de cosechas.`,
      confirmLabel: 'Registrar unidad',
      tone: 'default',
      action: () => addUnit(clean),
    })
  }

  async function addUnit(clean: string) {
    try {
      const response = await fetch('/api/units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clean }),
      })

      const data = await response.json()

      if (!response.ok) {
        notify('error', data.error ?? 'No se pudo registrar la unidad.')
        return
      }

      await refreshUnits()
      setUnitId(data.id)
      setNewUnit('')
      notify('success', `Unidad "${clean}" registrada correctamente.`)
    } catch {
      notify('error', 'No se pudo conectar con el servidor.')
    }
  }

  /* ─── Áreas productivas ─── */

  function addArea() {
    const clean = areaDraft.name.trim().replace(/\s+/g, ' ')
    if (!clean) return

    const duplicate = areas.some(
      (area) => area.name.toLowerCase() === clean.toLowerCase(),
    )

    if (duplicate) {
      setError('Ya agregaste un área con ese nombre.')
      return
    }

    if (
      areaDraft.surface &&
      (!Number.isFinite(Number(areaDraft.surface)) ||
        Number(areaDraft.surface) < 0)
    ) {
      setError('La superficie debe ser un número válido.')
      return
    }

    setError('')
    setAreas((current) => [...current, { ...areaDraft, name: clean }])
    setAreaDraft({ ...emptyArea })
  }

  /* ─── Guardar cultivo ─── */

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!unitId) {
      setError('Selecciona una unidad de medida.')
      return
    }

    if (hasVarieties && varieties.length === 0) {
      setError('Agrega al menos una variedad o selecciona No.')
      return
    }

    if (hasProductionAreas && areas.length === 0) {
      setError('Agrega al menos un lote o zona, o selecciona No.')
      return
    }

    setError('')

    askConfirm({
      title: editingCrop ? 'Guardar cambios' : 'Guardar nuevo cultivo',
      description: editingCrop
        ? `Se actualizará la configuración de "${editingCrop.name}". Los registros anteriores no se modificarán.`
        : `Se creará el cultivo "${name.trim()}" y quedará disponible para registrar cosechas.`,
      confirmLabel: editingCrop ? 'Guardar cambios' : 'Guardar cultivo',
      tone: 'default',
      action: saveCrop,
    })
  }

  async function saveCrop() {
    setLoading(true)

    const payload = {
      ...(editingCrop ? { id: editingCrop.id } : {}),
      name,
      hasVarieties,
      hasProductionAreas,
      varieties: hasVarieties ? varieties : [],
      productionAreas: hasProductionAreas
        ? areas.map((area) => ({
            name: area.name,
            type: area.type,
            surface: area.type === 'LOT' ? area.surface || null : null,
            surfaceUnit: area.surfaceUnit,
            notes: area.notes,
          }))
        : [],
      unitId,
    }

    try {
      const response = await fetch('/api/crops', {
        method: editingCrop ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        notify('error', data.error ?? 'No se pudo guardar el cultivo.')
        return
      }

      const wasEditing = !!editingCrop
      resetForm()
      notify(
        'success',
        wasEditing
          ? 'Cultivo actualizado correctamente.'
          : 'Cultivo guardado correctamente.',
      )

      await refreshCrops()
    } catch {
      notify('error', 'No se pudo conectar con el servidor.')
    } finally {
      setLoading(false)
    }
  }

  function requestCancel() {
    if (!isDirty) return resetForm()

    askConfirm({
      title: editingCrop ? 'Cancelar edición' : 'Descartar formulario',
      description:
        'Se perderán los cambios que no hayas guardado. ¿Deseas continuar?',
      confirmLabel: 'Sí, descartar',
      tone: 'danger',
      action: resetForm,
    })
  }

  /* ─── Activar / desactivar ─── */

  function requestToggleActive(crop: Crop, active: boolean) {
    askConfirm({
      title: active ? 'Reactivar cultivo' : 'Desactivar cultivo',
      description: active
        ? `"${crop.name}" volverá a estar disponible para nuevos registros.`
        : `"${crop.name}" dejará de estar disponible para nuevos registros. El historial se conserva y podrás reactivarlo cuando quieras.`,
      confirmLabel: active ? 'Reactivar' : 'Desactivar',
      tone: active ? 'default' : 'danger',
      action: () => setCropActive(crop, active),
    })
  }

  async function setCropActive(crop: Crop, active: boolean) {
    setBusyId(crop.id)

    try {
      const response = await fetch('/api/crops', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: crop.id, active }),
      })

      const data = await response.json()

      if (!response.ok) {
        notify(
          'error',
          data.error ??
            (active
              ? 'No se pudo reactivar el cultivo.'
              : 'No se pudo desactivar el cultivo.'),
        )
        return
      }

      if (active) setShowInactive(false)
      notify(
        'success',
        active
          ? `El cultivo "${crop.name}" fue reactivado.`
          : `Cultivo "${crop.name}" desactivado correctamente.`,
      )
      await refreshCrops()
    } catch {
      notify('error', 'No se pudo conectar con el servidor.')
    } finally {
      setBusyId(null)
    }
  }

  /* ───────────────────── Render ───────────────────── */

  return (
    <div className="mt-8 grid gap-5">
      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<Sprout className="size-5" />}
          label="Cultivos activos"
          value={activeCrops.length}
        />
        <StatCard
          icon={<Archive className="size-5" />}
          label="Cultivos inactivos"
          value={inactiveCrops.length}
        />
        <StatCard
          icon={<MapPin className="size-5" />}
          label="Lotes y zonas"
          value={totalAreas}
        />
        <StatCard
          icon={<Leaf className="size-5" />}
          label="Variedades"
          value={totalVarieties}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        {/* ───── Formulario ───── */}
        <section id="crop-form" className={`p-5 sm:p-6 ${ui.card}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className={ui.eyebrow}>Configuración</p>
              <h3 className="mt-1 text-xl font-semibold">
                {editingCrop ? 'Editar cultivo' : 'Nuevo cultivo'}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Configura las características y los datos que se utilizarán al
                registrar cosechas.
              </p>
            </div>

            <div
              className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${ui.chip}`}
            >
              {editingCrop ? (
                <Pencil className="size-5" />
              ) : (
                <Sprout className="size-5" />
              )}
            </div>
          </div>

          {editingCrop && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              <Pencil className="size-3.5 shrink-0" />
              Estás editando <strong>{editingCrop.name}</strong>. Los cambios se
              aplican al confirmar.
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-6 grid gap-6">
            {/* 1. Nombre */}
            <div className="grid gap-3">
              <SectionTitle
                step={1}
                icon={<Sprout className="size-4" />}
                title="Nombre del cultivo"
              />
              <input
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ej. Plátano"
                aria-label="Nombre del cultivo"
                className={ui.input}
              />
            </div>

            <hr className="border-[#e3ece4] dark:border-[#2d3b32]" />

            {/* 2. Áreas */}
            <div className="grid gap-3">
              <SectionTitle
                step={2}
                icon={<MapPin className="size-4" />}
                title="¿Se organiza por lotes o zonas?"
                hint="Útil para ubicar de dónde proviene cada cosecha."
              />
              <YesNo
                value={hasProductionAreas}
                onChange={setHasProductionAreas}
              />

              {hasProductionAreas && (
                <div className={`grid gap-3 p-3 ${ui.inner}`}>
                  <p className="text-xs text-muted-foreground">
                    Puedes registrar lotes, zonas o ambos. La superficie es
                    opcional.
                  </p>

                  {areas.length > 0 && (
                    <div className="grid gap-2">
                      {areas.map((area, index) => (
                        <div
                          key={`${area.name}-${index}`}
                          className="flex items-center justify-between gap-3 rounded-lg border border-[#e3ece4] bg-white px-3 py-2 text-xs dark:border-[#2d3b32] dark:bg-[#141b17]"
                        >
                          <div className="flex items-start gap-2.5">
                            <span
                              className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md ${ui.chip}`}
                            >
                              {area.type === 'LOT' ? (
                                <Ruler className="size-3.5" />
                              ) : (
                                <Layers className="size-3.5" />
                              )}
                            </span>
                            <div>
                              <span className="text-sm font-medium">
                                {area.name}
                              </span>
                              <span className="ml-2 text-muted-foreground">
                                {area.type === 'LOT' ? 'Lote' : 'Zona'}
                                {area.type === 'LOT' && area.surface
                                  ? ` · ${area.surface} ${area.surfaceUnit}`
                                  : ''}
                              </span>
                              {area.notes && (
                                <p className="mt-0.5 text-muted-foreground">
                                  {area.notes}
                                </p>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            aria-label={`Quitar ${area.name}`}
                            onClick={() =>
                              setAreas((current) =>
                                current.filter((_, i) => i !== index),
                              )
                            }
                            className="rounded-md p-1 text-muted-foreground transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid gap-2 rounded-lg border border-dashed border-[#cfdcd1] p-3 dark:border-[#34453a] sm:grid-cols-2">
                    <input
                      value={areaDraft.name}
                      onChange={(event) =>
                        setAreaDraft({ ...areaDraft, name: event.target.value })
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          addArea()
                        }
                      }}
                      placeholder="Nombre del área"
                      className={ui.input}
                    />

                    <select
                      value={areaDraft.type}
                      onChange={(event) =>
                        setAreaDraft({
                          ...areaDraft,
                          type: event.target.value as 'LOT' | 'ZONE',
                        })
                      }
                      className={ui.input}
                    >
                      <option value="LOT">Lote</option>
                      <option value="ZONE">Zona</option>
                    </select>

                    {areaDraft.type === 'LOT' && (
                      <>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={areaDraft.surface}
                          onChange={(event) =>
                            setAreaDraft({
                              ...areaDraft,
                              surface: event.target.value,
                            })
                          }
                          placeholder="Superficie"
                          className={ui.input}
                        />

                        <select
                          value={areaDraft.surfaceUnit}
                          onChange={(event) =>
                            setAreaDraft({
                              ...areaDraft,
                              surfaceUnit: event.target.value,
                            })
                          }
                          className={ui.input}
                        >
                          <option value="ha">Hectáreas (ha)</option>
                          <option value="m²">Metros cuadrados (m²)</option>
                        </select>
                      </>
                    )}

                    <input
                      value={areaDraft.notes}
                      onChange={(event) =>
                        setAreaDraft({ ...areaDraft, notes: event.target.value })
                      }
                      placeholder="Observaciones (opcional)"
                      className={`${ui.input} sm:col-span-2`}
                    />

                    <button
                      type="button"
                      onClick={addArea}
                      disabled={!areaDraft.name.trim()}
                      className={`${ui.btnGhost} sm:col-span-2`}
                    >
                      <Plus className="size-4" />
                      Agregar área
                    </button>
                  </div>
                </div>
              )}
            </div>

            <hr className="border-[#e3ece4] dark:border-[#2d3b32]" />

            {/* 3. Variedades */}
            <div className="grid gap-3">
              <SectionTitle
                step={3}
                icon={<Leaf className="size-4" />}
                title="¿Tiene variedades?"
                hint="Ej. distintas especies o tipos del mismo cultivo."
              />
              <YesNo value={hasVarieties} onChange={setHasVarieties} />

              {hasVarieties && (
                <TagInput
                  values={varieties}
                  onChange={setVarieties}
                  placeholder="Ej. Dominico"
                />
              )}
            </div>

            <hr className="border-[#e3ece4] dark:border-[#2d3b32]" />

            {/* 4. Unidad */}
            <div className="grid gap-3">
              <SectionTitle
                step={4}
                icon={<Package className="size-4" />}
                title="Unidad para registrar cosechas"
              />

              <div className={`grid gap-3 p-3 ${ui.inner}`}>
                <select
                  id="crop-unit"
                  required
                  aria-label="Unidad para registrar cosechas"
                  value={unitId}
                  onChange={(event) => setUnitId(event.target.value)}
                  className={ui.input}
                >
                  <option value="">Seleccionar unidad</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>

                <div className="flex gap-2">
                  <input
                    value={newUnit}
                    onChange={(event) => setNewUnit(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        requestAddUnit()
                      }
                    }}
                    placeholder="¿No está en la lista? Crea una nueva"
                    className={ui.input}
                  />

                  <button
                    type="button"
                    onClick={requestAddUnit}
                    disabled={!newUnit.trim()}
                    className={`${ui.btnGhost} shrink-0`}
                    aria-label="Agregar unidad"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>

                <span className="text-xs text-muted-foreground">
                  Las unidades son reutilizables y no se eliminan para proteger
                  el historial.
                </span>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-t border-[#e3ece4] pt-5 dark:border-[#2d3b32]">
              <button
                type="submit"
                disabled={loading}
                className={`${ui.btnPrimary} flex-1`}
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : editingCrop ? (
                  <Pencil className="size-4" />
                ) : (
                  <Plus className="size-4" />
                )}
                {editingCrop ? 'Guardar cambios' : 'Guardar cultivo'}
              </button>

              {isDirty && (
                <button
                  type="button"
                  onClick={requestCancel}
                  disabled={loading}
                  className={ui.btnGhost}
                >
                  {editingCrop ? 'Cancelar' : 'Limpiar'}
                </button>
              )}
            </div>
          </form>
        </section>

        {/* ───── Catálogo ───── */}
        <section className={`h-fit p-5 sm:p-6 ${ui.card}`}>
          <p className={ui.eyebrow}>Catálogo</p>
          <h3 className="mt-1 text-xl font-semibold">Cultivos registrados</h3>

          <div className="mt-4 flex gap-1 rounded-xl border border-[#cfdcd1] bg-[#f1f6f2] p-1 dark:border-[#34453a] dark:bg-[#141b17]">
            {[
              { label: 'Activos', count: activeCrops.length, inactive: false },
              {
                label: 'Inactivos',
                count: inactiveCrops.length,
                inactive: true,
              },
            ].map((tab) => (
              <button
                key={tab.label}
                type="button"
                aria-pressed={showInactive === tab.inactive}
                onClick={() => setShowInactive(tab.inactive)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  showInactive === tab.inactive
                    ? 'bg-white text-[#24523b] shadow-sm dark:bg-[#24382c] dark:text-[#a8d5b3]'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar cultivo…"
              aria-label="Buscar cultivo"
              className={`${ui.input} pl-9`}
            />
          </div>

          {cropsError ? (
            <p className="mt-5 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              <AlertTriangle className="size-4 shrink-0" />
              No se pudo cargar el catálogo de cultivos.
            </p>
          ) : loadingCrops ? (
            <div className="flex min-h-44 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-[#2c6048] dark:text-[#a8d5b3]" />
            </div>
          ) : displayedCrops.length === 0 ? (
            <div className="mt-5 flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-[#cfdcd1] px-5 text-center dark:border-[#34453a]">
              <div
                className={`mb-3 flex size-12 items-center justify-center rounded-full ${ui.chip}`}
              >
                <CircleHelp className="size-6" />
              </div>
              <p className="text-sm font-medium">
                {search
                  ? 'Sin resultados para tu búsqueda'
                  : showInactive
                    ? 'No hay cultivos inactivos'
                    : 'Aún no hay cultivos'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {search
                  ? 'Prueba con otro nombre.'
                  : showInactive
                    ? 'Los cultivos que desactives aparecerán aquí.'
                    : 'El primer cultivo que guardes aparecerá aquí.'}
              </p>
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {displayedCrops.map((crop) => {
                const cropAreas = (crop.productionAreas || []).filter(
                  (area) => area.active !== false,
                )
                const cropVarieties = (crop.varieties || []).filter(
                  (variety) => variety.active !== false,
                )
                const isBusy = busyId === crop.id
                const isEditing = editingCrop?.id === crop.id

                return (
                  <div
                    key={crop.id}
                    className={`rounded-xl border p-4 transition ${
                      isEditing
                        ? 'border-[#2c6048] bg-[#eef5ef] dark:bg-[#1d2820]'
                        : 'border-[#e3ece4] bg-white hover:border-[#b8d8bf] dark:border-[#2d3b32] dark:bg-[#141b17]'
                    } ${crop.active ? '' : 'opacity-80'}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
                            crop.active
                              ? ui.chip
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          <Sprout className="size-5" />
                        </div>
                        <div>
                          <p className="font-semibold leading-tight">
                            {crop.name}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {crop.unit && (
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${ui.chip}`}
                              >
                                <Package className="size-3" />
                                {crop.unit.name}
                              </span>
                            )}
                            {!crop.active && (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                Inactivo
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {crop.active ? (
                          <>
                            <button
                              type="button"
                              onClick={() => startEditing(crop)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#cfdcd1] px-3 py-1.5 text-xs font-medium transition hover:bg-[#eef5ef] dark:border-[#34453a] dark:hover:bg-[#223027]"
                            >
                              <Pencil className="size-3.5" />
                              Editar
                            </button>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => requestToggleActive(crop, false)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/40"
                            >
                              {isBusy ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Archive className="size-3.5" />
                              )}
                              Desactivar
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => requestToggleActive(crop, true)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#b8d8bf] px-3 py-1.5 text-xs font-medium text-[#24523b] transition hover:bg-[#eef5ef] disabled:opacity-50 dark:border-[#34453a] dark:text-[#a8d5b3] dark:hover:bg-[#223027]"
                          >
                            {isBusy ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="size-3.5" />
                            )}
                            Reactivar
                          </button>
                        )}
                      </div>
                    </div>

                    {(crop.hasProductionAreas || crop.hasVarieties) && (
                      <div className="mt-3 grid gap-2 border-t border-[#e3ece4] pt-3 text-xs dark:border-[#2d3b32]">
                        {crop.hasProductionAreas && (
                          <div className="flex items-start gap-2">
                            <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                            {cropAreas.length === 0 ? (
                              <span className="text-muted-foreground">
                                Sin áreas registradas
                              </span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {cropAreas.map((area) => (
                                  <span
                                    key={area.id}
                                    className="rounded-md border border-[#e3ece4] bg-[#f6faf6] px-2 py-0.5 dark:border-[#2d3b32] dark:bg-[#1d2820]"
                                  >
                                    {area.type === 'LOT' ? 'Lote' : 'Zona'}:{' '}
                                    <strong className="font-medium">
                                      {area.name}
                                    </strong>
                                    {area.surface
                                      ? ` · ${area.surface} ${area.surfaceUnit || 'ha'}`
                                      : ''}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {crop.hasVarieties && (
                          <div className="flex items-start gap-2">
                            <Leaf className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                            {cropVarieties.length === 0 ? (
                              <span className="text-muted-foreground">
                                Sin variedades registradas
                              </span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {cropVarieties.map((variety) => (
                                  <span
                                    key={variety.id}
                                    className={`rounded-full px-2 py-0.5 ${ui.chip}`}
                                  >
                                    {variety.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {/* Aviso flotante */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 right-5 z-50 flex max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${
            toast.type === 'success'
              ? 'border-[#b8d8bf] bg-[#eef5ef] text-[#24523b] dark:border-[#34453a] dark:bg-[#1d2820] dark:text-[#a8d5b3]'
              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/60 dark:text-red-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          )}
          <p className="flex-1">{toast.text}</p>
          <button
            type="button"
            aria-label="Cerrar aviso"
            onClick={() => setToast(null)}
            className="opacity-70 transition hover:opacity-100"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Diálogo de confirmación */}
      {confirm && (
        <ConfirmDialog
          state={confirm}
          busy={confirmBusy}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}