
'use client'

import useSWR from 'swr'
import { useState } from 'react'
import {
  Archive,
  CircleHelp,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Sprout,
  X,
} from 'lucide-react'

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

const emptyArea: AreaDraft = {
  name: '',
  type: 'LOT',
  surface: '',
  surfaceUnit: 'ha',
  notes: '',
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error('No se pudieron cargar los datos.')
  return response.json()
}

function YesNo({
  value,
  onChange,
}: {
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex gap-2" role="group" aria-label="Seleccionar sí o no">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
          value
            ? 'border-[#6d9c7a] bg-[#e4f0e7] text-[#24523b]'
            : 'border-border text-muted-foreground'
        }`}
      >
        Sí
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
          !value
            ? 'border-[#6d9c7a] bg-[#e4f0e7] text-[#24523b]'
            : 'border-border text-muted-foreground'
        }`}
      >
        No
      </button>
    </div>
  )
}

function TagInput({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string
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
    <div className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>

      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1 rounded-full bg-[#e4f0e7] px-2.5 py-1 text-xs text-[#24523b]"
          >
            {value}
            <button
              type="button"
              aria-label={`Quitar ${value}`}
              onClick={() => onChange(values.filter((item) => item !== value))}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>

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
          className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
        />

        <button
          type="button"
          onClick={add}
          className="rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted"
        >
          <Plus className="mr-1 inline size-4" />
          Agregar
        </button>
      </div>
    </div>
  )
}

export function CropsManager() {
  const {
    data: crops = [],
    mutate: refreshCrops,
    error: cropsError,
    isLoading: loadingCrops,
  } = useSWR<Crop[]>('/api/crops?includeInactive=true', fetcher)

  const {
    data: units = [],
    mutate: refreshUnits,
  } = useSWR<Unit[]>('/api/units', fetcher)

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
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const activeCrops = crops.filter((crop) => crop.active !== false)
  const inactiveCrops = crops.filter((crop) => crop.active === false)
  const displayedCrops = showInactive ? inactiveCrops : activeCrops

  function clearFeedback() {
    setError('')
    setMessage('')
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
  }

  function startEditing(crop: Crop) {
    clearFeedback()

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

  async function addUnit() {
    const clean = newUnit.trim()
    if (!clean) return

    clearFeedback()

    try {
      const response = await fetch('/api/units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clean }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'No se pudo registrar la unidad.')
        return
      }

      await refreshUnits()
      setUnitId(data.id)
      setNewUnit('')
      setMessage('Unidad registrada correctamente.')
    } catch {
      setError('No se pudo conectar con el servidor.')
    }
  }

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

    clearFeedback()
    setAreas((current) => [...current, { ...areaDraft, name: clean }])
    setAreaDraft({ ...emptyArea })
  }

  async function saveCrop(event: React.FormEvent<HTMLFormElement>) {
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

    setLoading(true)
    clearFeedback()

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
        setError(data.error ?? 'No se pudo guardar el cultivo.')
        return
      }

      resetForm()
      setMessage(
        editingCrop
          ? 'Cultivo actualizado correctamente.'
          : 'Cultivo guardado correctamente.',
      )

      await refreshCrops()
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setLoading(false)
    }
  }

  async function deactivateCrop(crop: Crop) {
  if (!window.confirm(`¿Deseas desactivar el cultivo "${crop.name}"?`)) {
    return
  }

  setBusyId(crop.id)
  setError('')
  setMessage('')

  try {
    const response = await fetch('/api/crops', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: crop.id,
        active: false,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'No se pudo desactivar el cultivo.')
    }

    setMessage(`Cultivo "${crop.name}" desactivado correctamente.`)
    await refreshCrops()
  } catch (err) {
    setError(
      err instanceof Error ? err.message : 'Error al desactivar el cultivo.'
    )
  } finally {
    setBusyId(null)
  }
}

  async function reactivateCrop(crop: Crop) {
    const confirmed = window.confirm(
      `¿Deseas reactivar "${crop.name}"? Volverá a estar disponible para nuevos registros.`,
    )

    if (!confirmed) return

    clearFeedback()
    setBusyId(crop.id)

    try {
      const response = await fetch('/api/crops', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: crop.id, active: true }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'No se pudo reactivar el cultivo.')
        return
      }

      setMessage(`El cultivo "${crop.name}" fue reactivado.`)
      setShowInactive(false)
      await refreshCrops()
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mt-8 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <section
        id="crop-form"
        className="rounded-2xl border border-[#e1e9e1] bg-white/80 p-5 dark:border-[#2d3b32] dark:bg-[#18211c]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#2c6048] dark:text-[#a8d5b3]">
              Configuración
            </p>
            <h3 className="mt-1 text-xl font-semibold">
              {editingCrop ? 'Editar cultivo' : 'Nuevo cultivo'}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Configura las características y los datos que se utilizarán al
              registrar cosechas.
            </p>
          </div>

          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#e4f0e7] text-[#2c6048] dark:text-[#a8d5b3]">
            <Sprout />
          </div>
        </div>

        <form onSubmit={saveCrop} className="mt-6 grid gap-5">
          <label className="grid gap-1.5 text-sm font-medium">
            Nombre del cultivo
            <input
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej. Plátano"
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-normal outline-none focus:ring-2 focus:ring-[#b8d8bf]"
            />
          </label>

          <div className="grid gap-2">
            <span className="text-sm font-medium">
              ¿Se organiza por lotes o zonas?
            </span>
            <YesNo
              value={hasProductionAreas}
              onChange={setHasProductionAreas}
            />
          </div>

          {hasProductionAreas && (
            <div className="grid gap-3 rounded-xl border border-border/70 p-3">
              <div>
                <span className="text-sm font-medium">Áreas productivas</span>
                <p className="text-xs text-muted-foreground">
                  Puedes registrar lotes, zonas o ambos. La superficie es
                  opcional.
                </p>
              </div>

              {areas.map((area, index) => (
                <div
                  key={`${area.name}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-xs"
                >
                  <div>
                    <span className="font-medium">{area.name}</span>
                    <span className="ml-2 text-muted-foreground">
                      {area.type === 'LOT' ? 'Lote' : 'Zona'}
                      {area.surface
                        ? ` · ${area.surface} ${area.surfaceUnit}`
                        : ''}
                    </span>
                    {area.notes && (
                      <p className="mt-1 text-muted-foreground">
                        {area.notes}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    aria-label={`Quitar ${area.name}`}
                    onClick={() =>
                      setAreas((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}

              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={areaDraft.name}
                  onChange={(event) =>
                    setAreaDraft({ ...areaDraft, name: event.target.value })
                  }
                  placeholder="Nombre del área"
                  className="rounded-lg border border-border bg-background px-2.5 py-2 text-sm"
                />

                <select
                  value={areaDraft.type}
                  onChange={(event) =>
                    setAreaDraft({
                      ...areaDraft,
                      type: event.target.value as 'LOT' | 'ZONE',
                    })
                  }
                  className="rounded-lg border border-border bg-background px-2.5 py-2 text-sm"
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
                      className="rounded-lg border border-border bg-background px-2.5 py-2 text-sm"
                    />

                    <select
                      value={areaDraft.surfaceUnit}
                      onChange={(event) =>
                        setAreaDraft({
                          ...areaDraft,
                          surfaceUnit: event.target.value,
                        })
                      }
                      className="rounded-lg border border-border bg-background px-2.5 py-2 text-sm"
                    >
                      <option value="ha">Hectáreas (ha)</option>
                      <option value="m²">Metros cuadrados (m²)</option>
                    </select>
                  </>
                )}

                <input
                  value={areaDraft.notes}
                  onChange={(event) =>
                    setAreaDraft({
                      ...areaDraft,
                      notes: event.target.value,
                    })
                  }
                  placeholder="Observaciones (opcional)"
                  className="rounded-lg border border-border bg-background px-2.5 py-2 text-sm sm:col-span-2"
                />
              </div>

              <button
                type="button"
                onClick={addArea}
                disabled={!areaDraft.name.trim()}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                <Plus className="size-4" />
                Agregar área
              </button>
            </div>
          )}

          <div className="grid gap-2">
            <span className="text-sm font-medium">¿Tiene variedades?</span>
            <YesNo value={hasVarieties} onChange={setHasVarieties} />
          </div>

          {hasVarieties && (
            <TagInput
              label="Variedades"
              values={varieties}
              onChange={setVarieties}
              placeholder="Ej. Dominico"
            />
          )}

          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="crop-unit">
              Unidad para registrar cosechas
            </label>

            <div className="flex flex-wrap gap-2">
              <select
                id="crop-unit"
                required
                value={unitId}
                onChange={(event) => setUnitId(event.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              >
                <option value="">Seleccionar unidad</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>

              <input
                value={newUnit}
                onChange={(event) => setNewUnit(event.target.value)}
                placeholder="Nueva unidad"
                className="w-36 rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              />

              <button
                type="button"
                onClick={addUnit}
                disabled={!newUnit.trim()}
                className="rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
                aria-label="Agregar unidad"
              >
                <Plus />
              </button>
            </div>

            <span className="text-xs text-muted-foreground">
              Las unidades son reutilizables y no se eliminan para proteger el
              historial.
            </span>
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </p>
          )}

          {message && (
            <p className="rounded-xl bg-[#eef5ef] px-3 py-2 text-sm text-[#24523b]">
              {message}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              disabled={loading}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#2c6048] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#234d39] disabled:opacity-60"
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

            {editingCrop && (
              <button
                type="button"
                onClick={resetForm}
                disabled={loading}
                className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-[#e1e9e1] bg-white/80 p-5 dark:border-[#2d3b32] dark:bg-[#18211c]">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#2c6048] dark:text-[#a8d5b3]">
          Catálogo
        </p>
        <h3 className="mt-1 text-xl font-semibold">Cultivos registrados</h3>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setShowInactive(false)}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              !showInactive
                ? 'bg-[#e4f0e7] text-[#24523b]'
                : 'border border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            Activos ({activeCrops.length})
          </button>

          <button
            type="button"
            onClick={() => setShowInactive(true)}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              showInactive
                ? 'bg-[#e4f0e7] text-[#24523b]'
                : 'border border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            Inactivos ({inactiveCrops.length})
          </button>
        </div>

        {cropsError ? (
          <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            No se pudo cargar el catálogo de cultivos.
          </p>
        ) : loadingCrops ? (
          <div className="flex min-h-44 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-[#2c6048]" />
          </div>
        ) : displayedCrops.length === 0 ? (
          <div className="mt-6 flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-border px-5 text-center">
            <CircleHelp className="mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">
              {showInactive
                ? 'No hay cultivos inactivos'
                : 'Aún no hay cultivos'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {showInactive
                ? 'Los cultivos que desactives aparecerán aquí.'
                : 'El primer cultivo que guardes aparecerá aquí.'}
            </p>
          </div>
        ) : (
          <div className="mt-5 grid gap-2">
            {displayedCrops.map((crop) => (
              <div
                key={crop.id}
                className="rounded-xl border border-border/70 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{crop.name}</span>

                    {crop.unit && (
                      <span className="rounded-full bg-[#e4f0e7] px-2 py-1 text-[11px] text-[#24523b]">
                        {crop.unit.name}
                      </span>
                    )}

                    {!crop.active && (
                      <span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                        Inactivo
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {crop.active ? (
                      <>
                        <button
                          type="button"
                          onClick={() => startEditing(crop)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                        >
                          <Pencil className="size-3.5" />
                          Editar
                        </button>

                        <button
                          type="button"
                          disabled={busyId === crop.id}
                          onClick={() => deactivateCrop(crop)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {busyId === crop.id ? (
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
                        disabled={busyId === crop.id}
                        onClick={() => reactivateCrop(crop)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#b8d8bf] px-3 py-1.5 text-xs font-medium text-[#24523b] hover:bg-[#eef5ef] disabled:opacity-50"
                      >
                        {busyId === crop.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="size-3.5" />
                        )}
                        Reactivar
                      </button>
                    )}
                  </div>
                </div>

                {crop.hasProductionAreas && (
                  <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                    {(crop.productionAreas || [])
                      .filter((area) => area.active !== false)
                      .map((area) => (
                        <span key={area.id}>
                          {area.type === 'LOT' ? 'Lote' : 'Zona'}: {area.name}
                          {area.surface
                            ? ` · ${area.surface} ${area.surfaceUnit || 'ha'}`
                            : ''}
                        </span>
                      ))}
                    {crop.productionAreas.filter(
                      (area) => area.active !== false,
                    ).length === 0 && <span>Sin áreas registradas</span>}
                  </div>
                )}

                {crop.hasVarieties && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Variedades:{' '}
                    {crop.varieties
                      .filter((variety) => variety.active !== false)
                      .map((variety) => variety.name)
                      .join(', ') || 'Sin variedades registradas'}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {message && (
          <p className="mt-4 rounded-xl bg-[#eef5ef] px-3 py-2 text-sm text-[#24523b]">
            {message}
          </p>
        )}
      </section>
    </div>
  )
}
