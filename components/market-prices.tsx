'use client'

import { useRef, useState, type FormEvent } from 'react'
import { Download, Plus, Tag, Trash2, Upload } from 'lucide-react'
import useSWR from 'swr'
import { formatDate, invalidateProduction, productionFetch } from '@/lib/production-client'
import { marketDay, usd, type MarketReferencePriceRow } from '@/lib/market-data'
import { MarketError, marketUi } from '@/components/market-ui'

type MarketPricesResponse = {
  rows: MarketReferencePriceRow[]
  crops: { id: string; name: string; unitId: string | null; unit: { id: string; name: string } | null }[]
  units: { id: string; name: string }[]
}

const templateCsv = [
  'cultivo,unidad,precio,minimo,maximo,mercado,fuente,fecha',
  'Banano,racimos,7.20,6.80,7.60,Portoviejo (Manabí),SIPA-MAG,2026-11-26',
  'Tomate,cajas,13.50,12.00,15.00,Portoviejo (Manabí),SIPA-MAG,2026-11-26',
  'Tomate,unidades,0.25,0.20,0.30,Agro Market / Local,Mercado local,2026-11-26',
].join('\r\n')

export function MarketPrices() {
  const { data, error, mutate } = useSWR<MarketPricesResponse>('/api/market-prices', productionFetch)
  const [cropId, setCropId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [customUnitName, setCustomUnitName] = useState('')
  const [priceUsd, setPriceUsd] = useState('')
  const [minPriceUsd, setMinPriceUsd] = useState('')
  const [maxPriceUsd, setMaxPriceUsd] = useState('')
  const [marketName, setMarketName] = useState('Portoviejo (Manabí)')
  const [source, setSource] = useState('SIPA-MAG / Mercado local')
  const [effectiveDate, setEffectiveDate] = useState(marketDay)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')

  const [showImport, setShowImport] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const rows = data?.rows ?? []
  const crops = data?.crops ?? []
  const unitList = data?.units ?? []

  function downloadTemplate() {
    const blob = new Blob(['\uFEFF' + templateCsv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'plantilla-precios-mercado.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function savePrice(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    setFormError('')
    setNotice('')
    setSaving(true)
    try {
      await productionFetch('/api/market-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cropId,
          ...(unitId === '__custom__' ? { unitName: customUnitName } : { unitId }),
          priceUsd,
          minPriceUsd: minPriceUsd || null,
          maxPriceUsd: maxPriceUsd || null,
          marketName,
          source,
          effectiveDate,
          notes,
        }),
      })
      setPriceUsd('')
      setMinPriceUsd('')
      setMaxPriceUsd('')
      setCustomUnitName('')
      setNotes('')
      setNotice('Precio de referencia del mercado actualizado.')
      void mutate()
      void invalidateProduction('/api/market-prices', '/api/market-sales')
    } catch (failure) {
      setFormError(failure instanceof Error ? failure.message : 'No se pudo guardar el precio.')
    } finally {
      setSaving(false)
    }
  }

  async function removePrice(id: string) {
    setFormError('')
    setNotice('')
    try {
      await productionFetch('/api/market-prices', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setNotice('Precio de referencia eliminado.')
      void mutate()
      void invalidateProduction('/api/market-prices', '/api/market-sales')
    } catch (failure) {
      setFormError(failure instanceof Error ? failure.message : 'No se pudo eliminar el precio.')
    }
  }

  async function importCsv(event: FormEvent) {
    event.preventDefault()
    if (importing || !csvText.trim()) return
    setImporting(true)
    setFormError('')
    setImportResult(null)
    try {
      const res = await productionFetch<{ imported: number; skipped: number; errors: string[] }>(
        '/api/market-prices',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csv: csvText }),
        },
      )
      setImportResult(res)
      if (res.imported > 0) {
        setCsvText('')
        void mutate()
        void invalidateProduction('/api/market-prices', '/api/market-sales')
      }
    } catch (failure) {
      setFormError(failure instanceof Error ? failure.message : 'No se pudo importar el CSV.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="grid gap-5">
      <section className={`${marketUi.panel} overflow-hidden`} aria-labelledby="market-prices-form">
        <header className={`${marketUi.header} flex flex-wrap items-center justify-between gap-2`}>
          <div>
            <h3 id="market-prices-form" className="flex items-center gap-2 font-semibold">
              <Tag className="size-5 text-emerald-700 dark:text-emerald-300" aria-hidden />
              Registrar o actualizar precio de mercado real
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Estos valores se muestran como guía de mercado al recibir y vender. El usuario siempre decide el precio final.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowImport((v) => !v)}
            className={marketUi.button}
          >
            <Upload className="size-4" aria-hidden />
            {showImport ? 'Ocultar importación CSV' : 'Importar CSV (SIPA-MAG)'}
          </button>
        </header>

        {showImport && (
          <form onSubmit={importCsv} className="grid gap-3 border-b border-border bg-muted/25 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Carga masiva desde archivo CSV (SIPA-MAG / mercado local)</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={downloadTemplate} className={marketUi.button}>
                  <Download className="size-4" aria-hidden />
                  Descargar plantilla
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setCsvText(await file.text())
                    e.target.value = ''
                  }}
                />
                <button type="button" onClick={() => fileRef.current?.click()} className={marketUi.button}>
                  <Upload className="size-4" aria-hidden />
                  Elegir archivo CSV
                </button>
              </div>
            </div>
            <textarea
              rows={4}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="cultivo,unidad,precio,minimo,maximo,mercado,fuente,fecha"
              className={`${marketUi.input} font-mono text-xs`}
            />
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={importing || !csvText.trim()} className={marketUi.primary}>
                {importing ? 'Importando…' : 'Importar precios'}
              </button>
              {importResult && (
                <p role="status" className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                  Importados: {importResult.imported} · Omitidos: {importResult.skipped}
                </p>
              )}
            </div>
            {importResult && importResult.errors.length > 0 && (
              <ul className="grid gap-1 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                {importResult.errors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            )}
          </form>
        )}

        <form onSubmit={savePrice} className="grid gap-4 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-sm font-medium">
              Cultivo
              <select
                required
                value={cropId}
                onChange={(e) => {
                  const id = e.target.value
                  setCropId(id)
                  const crop = crops.find((c) => c.id === id)
                  if (crop?.unitId) setUnitId(crop.unitId)
                }}
                className={marketUi.input}
              >
                <option value="">Selecciona un cultivo</option>
                {crops.map((crop) => (
                  <option key={crop.id} value={crop.id}>
                    {crop.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium">
              Unidad de venta
              <select
                required
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                className={marketUi.input}
              >
                <option value="">Selecciona unidad</option>
                {unitList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
                <option value="__custom__">+ Otra unidad (ej. fundas, libras)</option>
              </select>
            </label>

            {unitId === '__custom__' && (
              <label className="grid gap-1 text-sm font-medium">
                Nombre de la nueva unidad
                <input
                  required
                  maxLength={40}
                  placeholder="Ej. fundas, libras"
                  value={customUnitName}
                  onChange={(e) => setCustomUnitName(e.target.value)}
                  className={marketUi.input}
                />
              </label>
            )}

            <label className="grid gap-1 text-sm font-medium">
              Precio de mercado ($)
              <input
                required
                inputMode="decimal"
                placeholder="Ej. 7.20"
                value={priceUsd}
                onChange={(e) => setPriceUsd(e.target.value)}
                className={marketUi.input}
              />
            </label>

            <label className="grid gap-1 text-sm font-medium">
              Fecha de referencia
              <input
                required
                type="date"
                max={marketDay()}
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className={marketUi.input}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-sm font-medium">
              Precio mínimo ($, opcional)
              <input
                inputMode="decimal"
                placeholder="Ej. 6.80"
                value={minPriceUsd}
                onChange={(e) => setMinPriceUsd(e.target.value)}
                className={marketUi.input}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Precio máximo ($, opcional)
              <input
                inputMode="decimal"
                placeholder="Ej. 7.60"
                value={maxPriceUsd}
                onChange={(e) => setMaxPriceUsd(e.target.value)}
                className={marketUi.input}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Mercado / ciudad
              <input
                maxLength={120}
                value={marketName}
                onChange={(e) => setMarketName(e.target.value)}
                className={marketUi.input}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Fuente
              <input
                maxLength={120}
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className={marketUi.input}
              />
            </label>
          </div>

          {formError && <MarketError message={formError} />}
          {notice && (
            <p role="status" className="rounded-xl bg-emerald-100 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
              {notice}
            </p>
          )}

          <div>
            <button type="submit" disabled={saving} className={marketUi.primary}>
              <Plus className="size-4" aria-hidden />
              {saving ? 'Guardando…' : 'Guardar precio de mercado'}
            </button>
          </div>
        </form>
      </section>

      <section className={`${marketUi.panel} overflow-hidden`} aria-labelledby="market-prices-list">
        <header className={marketUi.header}>
          <h3 id="market-prices-list" className="font-semibold">
            Precios de referencia vigentes ({rows.length})
          </h3>
        </header>
        {error && <div className="p-4"><MarketError message={error.message} retry={() => void mutate()} /></div>}
        {!error && !data && <p role="status" className="p-4 text-sm text-muted-foreground">Cargando precios de mercado…</p>}
        {data && rows.length === 0 && (
          <p className="p-5 text-sm text-muted-foreground">
            Todavía no hay precios de referencia cargados. Registra el primero arriba o importa un CSV.
          </p>
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={marketUi.tableHead}>
                <tr>
                  {['Producto', 'Unidad', 'Precio mercado', 'Rango', 'Mercado / Fuente', 'Actualizado', 'Acción'].map((label) => (
                    <th key={label} scope="col" className="whitespace-nowrap px-3 py-3 font-semibold">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={marketUi.row}>
                    <th scope="row" className="px-3 py-3 text-left font-semibold">{row.cropName}</th>
                    <td className="px-3 py-3">{row.unitName}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-bold tabular-nums text-emerald-800 dark:text-emerald-300">
                      {usd(row.priceUsd)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground tabular-nums">
                      {row.minPriceUsd || row.maxPriceUsd
                        ? `${row.minPriceUsd ? usd(row.minPriceUsd) : '—'} – ${row.maxPriceUsd ? usd(row.maxPriceUsd) : '—'}`
                        : '—'}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      <span className="block font-medium text-foreground">{row.marketName}</span>
                      <span>{row.source}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                      {formatDate(row.effectiveDate)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setCropId(row.cropId)
                            setUnitId(row.unitId)
                            setPriceUsd(row.priceUsd)
                            setMinPriceUsd(row.minPriceUsd ?? '')
                            setMaxPriceUsd(row.maxPriceUsd ?? '')
                            setMarketName(row.marketName)
                            setSource(row.source)
                            setEffectiveDate(row.effectiveDate)
                            window.scrollTo({ top: 0, behavior: 'smooth' })
                          }}
                          className={`${marketUi.button} px-2.5 py-1.5 text-xs`}
                        >
                          Actualizar
                        </button>
                        <button
                          type="button"
                          aria-label={`Eliminar precio de ${row.cropName}`}
                          onClick={() => void removePrice(row.id)}
                          className={`${marketUi.button} px-2 py-1.5 text-red-700 dark:text-red-300`}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
