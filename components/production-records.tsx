
'use client'

import useSWR from 'swr'
import { useMemo, useState, type FormEvent } from 'react'
import {
  CheckCircle2,
  Loader2,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react'

type Crop = {
  id: string
  name: string
  unit?: { id: string; name: string } | null
  varieties?: { id: string; name: string }[]
  productionAreas?: {
    id: string
    name: string
    type: 'LOT' | 'ZONE'
  }[]
}

type Unit = { id: string; name: string }

type ShipmentLine = {
  cropId: string
  varietyId: string
  productionAreaId: string
  unitId: string
  quantity: string
  unitPrice: string
  notes: string
}

type Message = {
  kind: 'success' | 'error'
  text: string
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || 'No se pudieron cargar los datos.')
  }

  return data
}

function today() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function emptyShipmentLine(): ShipmentLine {
  return {
    cropId: '',
    varietyId: '',
    productionAreaId: '',
    unitId: '',
    quantity: '',
    unitPrice: '',
    notes: '',
  }
}

function formatDate(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-EC')
}

function formatAmount(value: unknown) {
  const amount = Number(value || 0)
  return `$${amount.toFixed(2)}`
}

export function ProductionRecords({ active }: { active: string }) {
  const isHarvests = active === 'cosechas'
  const isShipments = active === 'envios'
  const isCosts = active === 'costos'

  const [harvestView, setHarvestView] = useState<'cosechas' | 'mermas'>(
    'cosechas'
  )
  const isLosses = isHarvests && harvestView === 'mermas'

  const { data: crops = [] } = useSWR<Crop[]>('/api/crops', fetcher)
  const { data: units = [] } = useSWR<Unit[]>('/api/units', fetcher)
  const { data: harvestOptions = [] } = useSWR<any[]>(
  isLosses ? '/api/harvests' : null,
  fetcher
)

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [filterCropId, setFilterCropId] = useState('')
  const [search, setSearch] = useState('')

  const [cropId, setCropId] = useState('')
  const selectedCrop = crops.find((crop) => crop.id === cropId)
  const [unitId, setUnitId] = useState('')

  const [shipmentLines, setShipmentLines] = useState<ShipmentLine[]>([
    emptyShipmentLine(),
  ])

  const [message, setMessage] = useState<Message | null>(null)
  const [saving, setSaving] = useState(false)

  const endpoint = isHarvests
  ? isLosses
    ? '/api/losses'
    : `/api/harvests?${new URLSearchParams({
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(filterCropId ? { cropId: filterCropId } : {}),
      }).toString()}`
  : isShipments
    ? '/api/shipments'
    : isCosts
      ? '/api/costs'
      : null

  const {
    data: rows = [],
    error: loadError,
    mutate,
  } = useSWR<any[]>(endpoint, fetcher)

  const visibleRows = useMemo(() => {
    return rows.filter((row) => {
      const textMatches = JSON.stringify(row)
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase())

      if (!textMatches) return false

      // Los filtros de fecha también se aplican localmente en envíos y costos.
      if (!isHarvests && from) {
        if (!row.date || new Date(row.date) < new Date(`${from}T00:00:00`)) {
          return false
        }
      }

      if (!isHarvests && to) {
        if (
          !row.date ||
          new Date(row.date) > new Date(`${to}T23:59:59.999`)
        ) {
          return false
        }
      }

      return true
    })
  }, [rows, search, from, to, isHarvests])

  function updateShipmentLine(
    index: number,
    changes: Partial<ShipmentLine>
  ) {
    setShipmentLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...changes } : line
      )
    )
  }

  function addShipmentLine() {
    setShipmentLines((current) => [...current, emptyShipmentLine()])
  }

  function removeShipmentLine(index: number) {
    setShipmentLines((current) =>
      current.length === 1
        ? current
        : current.filter((_, lineIndex) => lineIndex !== index)
    )
  }

  async function submitHarvest(form: HTMLFormElement) {
    const formData = new FormData(form)
    const payload: Record<string, unknown> = Object.fromEntries(
      formData.entries()
    )

    payload.cropId = cropId
    payload.unitId = unitId || selectedCrop?.unit?.id

    return fetch('/api/harvests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }
async function submitLoss(form: HTMLFormElement) {
  const formData = new FormData(form)

  const payload = {
    date: formData.get('date'),
    harvestId: formData.get('harvestId'),
    quantity: formData.get('quantity'),
    reason: formData.get('reason'),
    notes: formData.get('notes'),
  }

  return fetch('/api/losses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
  async function submitCost(form: HTMLFormElement) {
    const formData = new FormData(form)
    const payload = Object.fromEntries(formData.entries())

    return fetch('/api/costs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }

  async function submitShipment(form: HTMLFormElement) {
    const formData = new FormData(form)

    const items = shipmentLines.map((line) => ({
      cropId: line.cropId,
      varietyId: line.varietyId || null,
      productionAreaId: line.productionAreaId || null,
      unitId: line.unitId || null,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      notes: line.notes,
    }))

    return fetch('/api/shipments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: formData.get('date'),
        notes: formData.get('notes'),
        items,
      }),
    })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const form = event.currentTarget
    setSaving(true)
    setMessage(null)

    try {
      let response: Response

      if (isLosses) {
  response = await submitLoss(form)
} else if (isHarvests) {
  response = await submitHarvest(form)
} else if (isShipments) {
        response = await submitShipment(form)
      } else {
        response = await submitCost(form)
      }

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo guardar el registro.')
      }

      setMessage({
        kind: 'success',
        text: isHarvests
          ? 'Cosecha registrada correctamente.'
          : isShipments
            ? `Envío ${data.code || ''} registrado correctamente.`
            : 'Costo registrado correctamente.',
      })

      form.reset()
      setCropId('')
      setUnitId('')
      setShipmentLines([emptyShipmentLine()])

      await mutate()
    } catch (error) {
      setMessage({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Ocurrió un error al guardar el registro.',
      })
    } finally {
      setSaving(false)
    }
  }

  const totalShipment = shipmentLines.reduce(
    (total, line) =>
      total + Number(line.quantity || 0) * Number(line.unitPrice || 0),
    0
  )

  return (
    <div className="mt-7 grid items-start gap-5 xl:grid-cols-[minmax(340px,0.85fr)_minmax(0,1.15fr)]">
          {isHarvests && (
      <div className="flex gap-2 rounded-xl border border-[#e1e9e1] bg-white/80 p-2 dark:border-[#2d3b32] dark:bg-[#18211c] xl:col-span-2">
        <button
          type="button"
          onClick={() => setHarvestView('cosechas')}
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
            harvestView === 'cosechas'
              ? 'bg-[#2c6048] text-white'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          Cosechas
        </button>

        <button
          type="button"
          onClick={() => setHarvestView('mermas')}
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
            harvestView === 'mermas'
              ? 'bg-[#2c6048] text-white'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          Mermas
        </button>
      </div>
    )}
      <form
        onSubmit={submit}
        className="rounded-2xl border border-[#e1e9e1] bg-white/80 p-5 dark:border-[#2d3b32] dark:bg-[#18211c]"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#2c6048] dark:text-[#a8d5b3]">
          {isHarvests
            ? 'Registro de producción'
            : isShipments
              ? 'Salida de productos'
              : 'Registro de gastos'}
        </p>

        <h3 className="mt-1 text-xl font-semibold">
          {isHarvests
            ? 'Registrar cosecha'
            : isShipments
              ? 'Preparar envío'
              : 'Registrar costo'}
        </h3>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-1.5 text-sm font-medium">
            Fecha
            <input
              required
              type="date"
              name="date"
              defaultValue={today()}
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
            />
          </label>

          {isLosses && (
            <>
              <label className="grid gap-1.5 text-sm font-medium">
                Cosecha asociada
                <select
                  required
                  name="harvestId"
                  className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                >
                  <option value="">Seleccionar cosecha</option>
                  {harvestOptions.map((harvest) => (
                    <option key={harvest.id} value={harvest.id}>
                      {harvest.crop?.name || 'Cultivo'} — {formatDate(harvest.date)} — {harvest.quantity}{' '}
                      {harvest.unit?.name || ''}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1.5 text-sm font-medium">
                Cantidad de merma
                <input
                  required
                  min="0.01"
                  step="0.01"
                  type="number"
                  name="quantity"
                  className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                />
              </label>

              <label className="grid gap-1.5 text-sm font-medium">
                Motivo
                <input
                  required
                  name="reason"
                  placeholder="Ej. producto dañado"
                  className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                />
              </label>

              <label className="grid gap-1.5 text-sm font-medium">
                Observaciones
                <textarea
                  name="notes"
                  rows={2}
                  className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                />
              </label>
            </>
          )}

          {isHarvests && !isLosses && (
            <>
              <label className="grid gap-1.5 text-sm font-medium">
                Cultivo
                <select
                  required
                  value={cropId}
                  onChange={(event) => {
                    setCropId(event.target.value)
                    setUnitId('')
                  }}
                  className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                >
                  <option value="">Seleccionar cultivo</option>
                  {crops.map((crop) => (
                    <option key={crop.id} value={crop.id}>
                      {crop.name}
                    </option>
                  ))}
                </select>
              </label>

              {(selectedCrop?.varieties?.length ?? 0) > 0 && (
                <label className="grid gap-1.5 text-sm font-medium">
                  Variedad
                  <select
                    name="varietyId"
                    className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                  >
                    <option value="">Sin especificar</option>
                    {selectedCrop?.varieties?.map((variety) => (
                      <option key={variety.id} value={variety.id}>
                        {variety.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {(selectedCrop?.productionAreas?.length ?? 0) > 0 && (
                <label className="grid gap-1.5 text-sm font-medium">
                  Lote o zona
                  <select
                    name="productionAreaId"
                    className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                  >
                    <option value="">Sin especificar</option>
                    {selectedCrop?.productionAreas?.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="grid gap-1.5 text-sm font-medium">
                Cantidad cosechada
                <input
                  required
                  min="0.01"
                  step="0.01"
                  type="number"
                  name="quantity"
                  className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                />
              </label>

              <label className="grid gap-1.5 text-sm font-medium">
                Unidad
                <select
                  required
                  value={unitId || selectedCrop?.unit?.id || ''}
                  onChange={(event) => setUnitId(event.target.value)}
                  name="unitId"
                  className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                >
                  <option value="">Seleccionar unidad</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1.5 text-sm font-medium">
                Precio estimado por unidad (USD)
                <input
                  min="0.01"
                  step="0.01"
                  type="number"
                  name="estimatedUnitPrice"
                  placeholder="Opcional"
                  className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                />
                <span className="text-xs font-normal text-muted-foreground">
                  Precio de referencia del mercado, no costo de producción.
                </span>
              </label>

              <label className="grid gap-1.5 text-sm font-medium">
                Observaciones de la cosecha
                <textarea
                  name="notes"
                  rows={2}
                  className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                />
              </label>
            </>
          )}

          {isCosts && (
            <>
              <label className="grid gap-1.5 text-sm font-medium">
                Descripción del gasto
                <input
                  required
                  name="description"
                  placeholder="Ej. compra de fertilizantes"
                  className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                />
              </label>

              <label className="grid gap-1.5 text-sm font-medium">
                Categoría
                <input
                  required
                  name="category"
                  placeholder="Ej. insumos, transporte, mano de obra"
                  className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                />
              </label>

              <label className="grid gap-1.5 text-sm font-medium">
                Importe (USD)
                <input
                  required
                  min="0.01"
                  step="0.01"
                  type="number"
                  name="amountUsd"
                  className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                />
              </label>

              <label className="grid gap-1.5 text-sm font-medium">
                Aplicación
                <select
                  name="applicationType"
                  defaultValue="GENERAL"
                  className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                >
                  <option value="GENERAL">General</option>
                  <option value="CROP">Cultivo específico</option>
                </select>
              </label>

              <label className="grid gap-1.5 text-sm font-medium">
                Observaciones
                <textarea
                  name="notes"
                  rows={2}
                  className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                />
              </label>
            </>
          )}

          {isShipments && (
            <>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Productos del envío</p>
                  <p className="text-xs text-muted-foreground">
                    Puedes agregar varios cultivos al mismo envío.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={addShipmentLine}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"
                >
                  <Plus className="size-4" />
                  Agregar producto
                </button>
              </div>

              {shipmentLines.map((line, index) => {
                const crop = crops.find(
                  (item) => item.id === line.cropId
                )

                return (
                  <div
                    key={index}
                    className="rounded-xl border border-border/80 p-4"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold">
                        Producto {index + 1}
                      </p>

                      {shipmentLines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeShipmentLine(index)}
                          aria-label={`Eliminar producto ${index + 1}`}
                          className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid gap-3">
                      <label className="grid gap-1.5 text-sm font-medium">
                        Cultivo
                        <select
                          required
                          value={line.cropId}
                          onChange={(event) => {
                            const nextCrop = crops.find(
                              (item) => item.id === event.target.value
                            )

                            updateShipmentLine(index, {
                              cropId: event.target.value,
                              varietyId: '',
                              productionAreaId: '',
                              unitId: nextCrop?.unit?.id || '',
                            })
                          }}
                          className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                        >
                          <option value="">Seleccionar cultivo</option>
                          {crops.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      {(crop?.varieties?.length ?? 0) > 0 && (
                        <label className="grid gap-1.5 text-sm font-medium">
                          Variedad
                          <select
                            value={line.varietyId}
                            onChange={(event) =>
                              updateShipmentLine(index, {
                                varietyId: event.target.value,
                              })
                            }
                            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                          >
                            <option value="">Sin especificar</option>
                            {crop?.varieties?.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      {(crop?.productionAreas?.length ?? 0) > 0 && (
                        <label className="grid gap-1.5 text-sm font-medium">
                          Lote o zona
                          <select
                            value={line.productionAreaId}
                            onChange={(event) =>
                              updateShipmentLine(index, {
                                productionAreaId: event.target.value,
                              })
                            }
                            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                          >
                            <option value="">Sin especificar</option>
                            {crop?.productionAreas?.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      <label className="grid gap-1.5 text-sm font-medium">
                        Unidad
                        <select
                          required
                          value={line.unitId || crop?.unit?.id || ''}
                          onChange={(event) =>
                            updateShipmentLine(index, {
                              unitId: event.target.value,
                            })
                          }
                          className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                        >
                          <option value="">Seleccionar unidad</option>
                          {units.map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              {unit.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="grid grid-cols-2 gap-3">
                        <label className="grid gap-1.5 text-sm font-medium">
                          Cantidad
                          <input
                            required
                            min="0.01"
                            step="0.01"
                            type="number"
                            value={line.quantity}
                            onChange={(event) =>
                              updateShipmentLine(index, {
                                quantity: event.target.value,
                              })
                            }
                            className="min-w-0 rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                          />
                        </label>

                        <label className="grid gap-1.5 text-sm font-medium">
                          Precio unitario USD
                          <input
                            required
                            min="0.01"
                            step="0.01"
                            type="number"
                            value={line.unitPrice}
                            onChange={(event) =>
                              updateShipmentLine(index, {
                                unitPrice: event.target.value,
                              })
                            }
                            className="min-w-0 rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                          />
                        </label>
                      </div>

                      <p className="text-right text-xs text-muted-foreground">
                        Subtotal:{' '}
                        <strong>
                          {formatAmount(
                            Number(line.quantity || 0) *
                              Number(line.unitPrice || 0)
                          )}
                        </strong>
                      </p>

                      <label className="grid gap-1.5 text-sm font-medium">
                        Observaciones del producto
                        <input
                          value={line.notes}
                          onChange={(event) =>
                            updateShipmentLine(index, {
                              notes: event.target.value,
                            })
                          }
                          className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                        />
                      </label>
                    </div>
                  </div>
                )
              })}

              <div className="rounded-xl bg-[#eef5ef] p-4 dark:bg-[#1c3327]">
                <p className="text-xs text-muted-foreground">
                  Total estimado del envío
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {formatAmount(totalShipment)}
                </p>
              </div>

              <label className="grid gap-1.5 text-sm font-medium">
                Observaciones generales del envío
                <textarea
                  name="notes"
                  rows={2}
                  className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                />
              </label>
            </>
          )}
        </div>

        {message && (
          <p
            className={`mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
              message.kind === 'success'
                ? 'bg-[#eef5ef] text-[#24523b]'
                : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
            }`}
          >
            {message.kind === 'success' ? (
              <CheckCircle2 className="size-4 shrink-0" />
            ) : (
              <TriangleAlert className="size-4 shrink-0" />
            )}
            {message.text}
          </p>
        )}

        <button
          disabled={saving}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2c6048] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#234d39] disabled:opacity-60"
        >
          {saving && <Loader2 className="size-4 animate-spin" />}
          {saving
            ? 'Guardando…'
            : isHarvests
              ? 'Guardar cosecha'
              : isShipments
                ? 'Confirmar envío'
                : 'Guardar costo'}
        </button>
      </form>

      <section className="rounded-2xl border border-[#e1e9e1] bg-white/80 p-5 dark:border-[#2d3b32] dark:bg-[#18211c]">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#2c6048] dark:text-[#a8d5b3]">
              Historial
            </p>
            <h3 className="mt-1 text-xl font-semibold">
              {isHarvests
                ? 'Cosechas registradas'
                : isShipments
                  ? 'Envíos registrados'
                  : 'Costos registrados'}
            </h3>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Desde
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>

            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Hasta
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => setTo(event.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
          </div>

          {isHarvests && (
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Filtrar por cultivo
              <select
                value={filterCropId}
                onChange={(event) => setFilterCropId(event.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="">Todos los cultivos</option>
                {crops.map((crop) => (
                  <option key={crop.id} value={crop.id}>
                    {crop.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              aria-label="Buscar registros"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar en el historial"
              className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm"
            />
          </div>
        </div>

        {loadError && (
          <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
            {loadError.message}
          </p>
        )}

        <div className="mt-5 grid gap-3">
          {visibleRows.length > 0 ? (
            visibleRows.map((row) => (
              <HistoryCard
                key={row.id}
                row={row}
                active={active}
              />
            ))
          ) : (
            <div className="flex min-h-56 items-center justify-center rounded-xl border border-dashed border-border px-5 text-center text-sm text-muted-foreground">
              No hay registros que coincidan con los filtros.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function HistoryCard({
  row,
  active,
}: {
  row: any
  active: string
}) {
  if (active === 'cosechas') {
    const losses = row.losses || []
    const lossTotal = losses.reduce(
      (sum: number, loss: any) => sum + Number(loss.quantity || 0),
      0
    )
const available = Math.max(0, Number(row.quantity || 0) - lossTotal)
    return (
      <article className="rounded-xl border border-border/70 p-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{row.crop?.name || 'Cultivo'}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {row.variety?.name ? `${row.variety.name} · ` : ''}
              {row.productionArea?.name || 'Sin lote o zona'}
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {formatDate(row.date)}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Cosechado</p>
            <p className="font-semibold">
              {Number(row.quantity).toFixed(2)} {row.unit?.name || ''}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Merma</p>
            <p className="font-semibold">
              {lossTotal.toFixed(2)} {row.unit?.name || ''}
            </p>
          </div>
          <div>
  <p className="text-xs text-muted-foreground">Producción útil</p>
  <p className="font-semibold">
    {Number(row.quantity || 0).toFixed(2)} {row.unit?.name || ''}
  </p>
</div>
        </div>

        {row.estimatedUnitPrice != null && (
          <p className="mt-3 text-xs text-muted-foreground">
            Precio estimado: {formatAmount(row.estimatedUnitPrice)} por{' '}
            {row.unit?.name || 'unidad'}
          </p>
        )}

        {losses.length > 0 && (
          <div className="mt-4 border-t border-border/70 pt-3">
            <p className="mb-2 text-xs font-semibold">Mermas asociadas</p>
            <div className="grid gap-2">
              {losses.map((loss: any) => (
                <div
                  key={loss.id}
                  className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs"
                >
                  <span>
                    {loss.reason?.name || 'Sin motivo'} ·{' '}
                    {formatDate(loss.date)}
                  </span>
                  <strong>
                    {Number(loss.quantity).toFixed(2)} {row.unit?.name || ''}
                  </strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {row.notes && (
          <p className="mt-3 text-xs text-muted-foreground">{row.notes}</p>
        )}
      </article>
    )
  }

  if (active === 'envios') {
    const items = row.items || []
    const total = items.reduce(
      (sum: number, item: any) =>
        sum + Number(item.estimatedTotalAmount || 0),
      0
    )

    return (
      <article className="rounded-xl border border-border/70 p-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{row.code || 'Envío'}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {items.length} producto(s) · {row.status || 'Registrado'}
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {formatDate(row.date)}
          </span>
        </div>

        <div className="mt-3 grid gap-2">
          {items.map((item: any) => (
            <div
              key={item.id}
              className="rounded-lg bg-muted/40 px-3 py-2"
            >
              <div className="flex justify-between gap-3">
                <span className="font-medium">
                  {item.crop?.name || 'Cultivo'}
                  {item.variety?.name ? ` · ${item.variety.name}` : ''}
                </span>
                <strong className="whitespace-nowrap">
                  {Number(item.quantity).toFixed(2)} {item.unit?.name || ''}
                </strong>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.productionArea?.name || 'Sin lote'} · Precio:{' '}
                {formatAmount(item.estimatedUnitPrice)}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-3 flex justify-between border-t border-border/70 pt-3">
          <span className="text-xs text-muted-foreground">
            Total estimado
          </span>
          <strong>{formatAmount(total)}</strong>
        </div>

        {row.receptions?.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Recepciones registradas: {row.receptions.length}
          </p>
        )}

        {row.notes && (
          <p className="mt-2 text-xs text-muted-foreground">{row.notes}</p>
        )}
      </article>
    )
  }

  return (
    <article className="rounded-xl border border-border/70 p-4 text-sm">
      <div className="flex flex-wrap justify-between gap-2">
        <p className="font-semibold">{row.description || 'Costo'}</p>
        <span className="text-xs text-muted-foreground">
          {formatDate(row.date)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {row.category?.name || 'Sin categoría'}
        </span>
        <strong>{formatAmount(row.amountUsd)}</strong>
      </div>
      {row.notes && (
        <p className="mt-2 text-xs text-muted-foreground">{row.notes}</p>
      )}
    </article>
  )
}

export function ProductionSummary() {
  const { data, error } = useSWR<any>(
    '/api/production-summary',
    fetcher
  )

  const cards = [
    ['Cosechas', data?.harvests?._count ?? 0],
    ['Mermas', data?.losses?._count ?? 0],
    [
      'Costos',
      formatAmount(data?.costs?._sum?.amountUsd),
    ],
    ['Envíos', data?.shipments?._count ?? 0],
  ]

  return (
    <section className="mt-8">
      {error && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
          No se pudo cargar el resumen.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-2xl border border-[#e1e9e1] bg-white/80 p-5 dark:border-[#2d3b32] dark:bg-[#18211c]"
          >
            <p className="text-xs font-medium text-muted-foreground">
              {label}
            </p>
            <p className="mt-5 text-2xl font-semibold">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {data
                ? 'Datos confirmados en PostgreSQL'
                : 'Cargando datos…'}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
