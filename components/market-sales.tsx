'use client'

import Link from 'next/link'
import { useDeferredValue, useRef, useState, type FormEvent } from 'react'
import { ArrowLeftRight, Banknote, Download, Pencil, Plus, Search, ShoppingBasket, Tag, Trash2 } from 'lucide-react'
import useSWR from 'swr'
import { ApiError, createRequestId, formatDate, invalidateProduction, productionFetch } from '@/lib/production-client'
import { cents, decimalInput, farmSupplier, formatMarkup, isValidIsoDay, marketDay, marketWeek, markupPercent, receiptCode, salesValue, sheetColumns, suggestRetailSalePrice, units, usd, type PageResult, type SaleRow, type SalesDay, type StockRow } from '@/lib/market-data'
import { MarketDialog, MarketError, MarketPagination, marketUi } from '@/components/market-ui'

const salesApi = '/api/market-sales'

export function MarketSales() {
  const [date, setDate] = useState(marketDay)
  const [period, setPeriod] = useState<'day' | 'week'>('week')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<SaleRow | null>(null)
  const [cancelling, setCancelling] = useState<SaleRow | null>(null)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [notice, setNotice] = useState('')
  const editorRef = useRef<HTMLDivElement>(null)

  const { data, error, mutate } = useSWR<SalesDay>(salesApi + '?' + new URLSearchParams({ date, period, page: String(page) }), productionFetch)
  const week = period === 'week' ? marketWeek(date) : null
  const dateLabel = week ? `${formatDate(week.from)} al ${formatDate(week.to)}` : formatDate(date)

  function changeDate(value: string) {
    if (!value || !isValidIsoDay(value)) return
    setDate(value)
    setPage(1)
    setEditing(null)
    setNotice('')
  }

  async function exportCsv() {
    if (exporting) return
    setExporting(true)
    setExportError('')
    try {
      const response = await fetch(salesApi + '?' + new URLSearchParams({ date, period, export: 'csv' }))
      if (response.status === 401) {
        window.location.replace('/')
        return
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? 'No se pudo exportar el archivo CSV.')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `agro-market-${week ? `${week.from}_a_${week.to}` : date}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (failure) {
      setExportError(failure instanceof Error ? failure.message : 'No se pudo exportar el archivo CSV.')
    } finally {
      setExporting(false)
    }
  }

  function saved(message: string) {
    setEditing(null)
    setNotice(message)
    setPage(1)
    void invalidateProduction(salesApi, '/api/production-summary')
  }

  async function cancelSale() {
    if (!cancelling || cancelBusy) return
    setCancelBusy(true)
    setCancelError('')
    try {
      await productionFetch(salesApi, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cancelling.id, updatedAt: cancelling.updatedAt }),
      })
      setCancelling(null)
      saved('Venta anulada. La cantidad volvió al saldo del recibo.')
    } catch (failure) {
      setCancelError(failure instanceof Error ? failure.message : 'No se pudo anular la venta.')
      void mutate()
    } finally {
      setCancelBusy(false)
    }
  }

  return (
    <div className="grid gap-5">
      <section className={`${marketUi.panel} p-4 sm:p-5`} aria-label="Período de ventas">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="grid gap-1 text-sm font-medium">
            Fecha de venta
            <input type="date" value={date} max={marketDay()} className={marketUi.input} onChange={(event) => changeDate(event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Ver registros por
            <select className={marketUi.input} value={period} onChange={(event) => {
              setPeriod(event.target.value === 'day' ? 'day' : 'week')
              setPage(1)
            }}>
              <option value="week">Semana</option>
              <option value="day">Día</option>
            </select>
          </label>
          <button type="button" disabled={exporting} onClick={exportCsv} className={marketUi.button}>
            <Download className="size-4" aria-hidden /> {exporting ? 'Exportando…' : 'Exportar a Excel (CSV)'}
          </button>
        </div>
        {exportError && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">{exportError}</p>}
        <dl className="mt-4 grid gap-2 sm:grid-cols-2">
          {([
            ['Ventas registradas', data ? units(data.totals.count) : undefined],
            ['Total vendido', data ? usd(data.totals.total) : undefined],
          ] as const).map(([label, total], index) => (
            <div key={label} className={`rounded-xl border border-border px-4 py-3 ${index === 1 ? 'bg-emerald-50 dark:bg-emerald-950/35' : 'bg-muted/40'}`}>
              <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{total ?? '—'}</dd>
            </div>
          ))}
        </dl>
      </section>

      {notice && <p role="status" className="rounded-xl bg-emerald-100 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{notice}</p>}
      <div ref={editorRef} className="scroll-mt-24">
        <SaleEditor key={date + ':' + (editing?.id ?? 'new')} date={editing?.date.slice(0, 10) ?? date} editing={editing} onSaved={saved} stopEditing={() => setEditing(null)} />
      </div>

      <section className={`${marketUi.panel} overflow-hidden`} aria-labelledby="market-day-heading">
        <header className={marketUi.header}>
          <h3 id="market-day-heading" className="flex items-center gap-2 font-semibold"><Banknote className="size-5 text-emerald-700 dark:text-emerald-300" aria-hidden /> Ventas del {dateLabel}</h3>
        </header>
        {error && <div className="p-4"><MarketError message={error.message} retry={() => void mutate()} /></div>}
        {!error && !data && <p role="status" className="p-4 text-sm text-muted-foreground">Cargando ventas…</p>}
        {data?.rows.length === 0 && <p className="p-5 text-sm text-muted-foreground">Todavía no hay ventas en este período.</p>}
        {data?.rows.length ? (
          <div className="overflow-x-auto" tabIndex={0} aria-label="Hoja de ventas">
            <table className="w-full text-sm">
              <thead className={marketUi.tableHead}>
                <tr>
                  {[...sheetColumns, 'Precio de Producción', 'Ganancia sobre costo', 'Acciones'].map((label) => <th key={label} scope="col" className="whitespace-nowrap px-3 py-3 font-semibold">{label}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((sale) => (
                  <tr key={sale.id} className={marketUi.row}>
                    <td className="whitespace-nowrap px-3 py-3">{formatDate(sale.date)}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold">{receiptCode(sale.product.receiptNumber)}</td>
                    <td className="whitespace-nowrap px-3 py-3">{farmSupplier}</td>
                    <th scope="row" className="min-w-36 px-3 py-3 text-left">
                      <span className="font-semibold">{sale.product.crop}</span>
                      <span className="block text-xs font-normal text-muted-foreground">{[sale.product.variety, sale.product.area].filter(Boolean).join(' · ')}</span>
                    </th>
                    <td className="px-3 py-3 tabular-nums">{units(sale.quantity)}</td>
                    <td className="px-3 py-3">{sale.product.unit}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums">{usd(sale.unitPrice)}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums">{usd(sale.total)}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums">{usd(sale.product.productionUnitPrice)}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums">{formatMarkup(markupPercent(sale.unitPrice, sale.product.productionUnitPrice))}</td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1">
                        <button type="button" title="Editar venta" aria-label={`Editar venta de ${sale.product.crop}`} className={`${marketUi.button} px-2`} onClick={() => {
                          setEditing(sale)
                          setNotice('')
                          editorRef.current?.scrollIntoView({ block: 'start' })
                        }}><Pencil className="size-4" aria-hidden /></button>
                        <button type="button" title="Anular venta" aria-label={`Anular venta de ${sale.product.crop}`} className={`${marketUi.button} px-2 text-red-700 dark:text-red-300`} onClick={() => { setCancelling(sale); setCancelError('') }}><Trash2 className="size-4" aria-hidden /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {(data?.hasNext || page > 1) && <div className="p-4"><MarketPagination page={page} hasNext={data?.hasNext} selectPage={setPage} /></div>}
      </section>

      {cancelling && (
        <MarketDialog title="Anular venta" action="Anular venta" danger busy={cancelBusy} onCancel={() => setCancelling(null)} onConfirm={() => void cancelSale()}>
          <p>Se devolverán <strong>{units(cancelling.quantity)} {cancelling.product.unit}</strong> de {cancelling.product.crop} al saldo de {receiptCode(cancelling.product.receiptNumber)}.</p>
          {cancelError && <MarketError message={cancelError} />}
        </MarketDialog>
      )}
    </div>
  )
}

function SaleEditor({ date, editing, onSaved, stopEditing }: {
  date: string; editing: SaleRow | null; onSaved: (message: string) => void; stopEditing: () => void
}) {
  const [query, setQuery] = useState('')
  const search = useDeferredValue(query)
  const [page, setPage] = useState(1)
  const [product, setProduct] = useState<SaleRow['product'] | null>(editing?.product ?? null)
  const [quantity, setQuantity] = useState(editing?.quantity ?? '')
  const [price, setPrice] = useState(editing?.unitPrice ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retrying, setRetrying] = useState(false)
  const replay = useRef<{ draft: string; id: string } | null>(null)

  const [convertOpen, setConvertOpen] = useState(false)
  const [convertUnitId, setConvertUnitId] = useState('')
  const [convertUnitName, setConvertUnitName] = useState('')
  const [convertQty, setConvertQty] = useState('')
  const [convertBusy, setConvertBusy] = useState(false)
  const [convertError, setConvertError] = useState('')

  const stockParams = { view: 'stock', date, ...(editing ? { excludeSaleId: editing.id } : {}) }
  const { data, error: stockError, mutate: reloadStock } = useSWR<PageResult<StockRow>>(
    salesApi + '?' + new URLSearchParams({ ...stockParams, q: search, page: String(page) }), productionFetch,
  )
  const { data: selection, error: selectionError, mutate: reloadSelection } = useSWR<PageResult<StockRow>>(
    product ? salesApi + '?' + new URLSearchParams({ ...stockParams, itemId: product.id, page: '1' }) : null,
    productionFetch,
  )
  const { data: priceCatalog } = useSWR<{ units: { id: string; name: string }[] }>(
    convertOpen ? '/api/market-prices' : null,
    productionFetch,
  )

  const products = data?.rows ?? []
  const liveSelection = selection?.rows[0] ?? null
  const available = liveSelection?.available
  const activeMarketPrice = liveSelection?.marketPrice ?? product?.marketPrice ?? null
  const retailSuggestion = suggestRetailSalePrice(
    activeMarketPrice,
    product?.productionUnitPrice ?? null,
    product?.customerUnitPrice ?? null,
  )
  const suggestedSalePrice = retailSuggestion?.price ?? null
  const belowProductionCost =
    Boolean(price.trim()) &&
    product?.productionUnitPrice != null &&
    Number(price) > 0 &&
    Number(price) < Number(product.productionUnitPrice)
  const estimate = salesValue(quantity, price)
  const amount = cents(quantity)
  const exceeds = available !== undefined && amount !== null && amount > (cents(available) ?? 0)
  const payload = { date, receptionItemId: product?.id, quantity: decimalInput(quantity), unitPrice: decimalInput(price) }
  const snapshot = JSON.stringify(payload)
  const canRetry = retrying && replay.current?.draft === snapshot

  async function confirmUnitConversion() {
    if (!product || convertBusy) return
    setConvertError('')
    const hasUnit = convertUnitId === '__custom__' ? Boolean(convertUnitName.trim()) : Boolean(convertUnitId)
    if (!hasUnit || !cents(convertQty)) {
      setConvertError('Elige la nueva unidad e indica cuántas unidades equivalentes resultan.')
      return
    }
    setConvertBusy(true)
    try {
      const converted = await productionFetch<{
        id: string
        crop: string
        fromQuantity: string
        fromUnit: string
        toQuantity: string
        toUnit: string
      }>('/api/receptions/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receptionItemId: product.id,
          ...(convertUnitId === '__custom__' ? { targetUnitName: convertUnitName.trim() } : { targetUnitId: convertUnitId }),
          targetQuantity: decimalInput(convertQty),
        }),
      })
      setConvertOpen(false)
      setConvertUnitId('')
      setConvertUnitName('')
      setConvertQty('')
      setProduct(null)
      setQuantity('')
      setPrice('')
      void reloadStock()
      void invalidateProduction(salesApi, '/api/receptions', '/api/market-prices')
      onSaved(
        `Presentación cambiada: ${converted.fromQuantity} ${converted.fromUnit} → ${converted.toQuantity} ${converted.toUnit} de ${converted.crop}.`,
      )
    } catch (failure) {
      setConvertError(failure instanceof Error ? failure.message : 'No se pudo cambiar la presentación.')
    } finally {
      setConvertBusy(false)
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError('')
    if (!product || (!canRetry && (available === undefined || exceeds)) || !amount || !cents(price) || estimate === null) {
      setError('Selecciona un producto disponible e ingresa una cantidad y un precio positivos de hasta dos decimales.')
      return
    }
    if (replay.current?.draft !== snapshot) replay.current = { draft: snapshot, id: createRequestId() }
    setBusy(true)
    try {
      await productionFetch(salesApi, {
        method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { ...payload, id: editing.id, updatedAt: editing.updatedAt } : { ...payload, requestId: replay.current.id }),
      })
      replay.current = null
      setRetrying(false)
      if (!editing) setProduct(null)
      setQuantity('')
      setPrice('')
      onSaved(editing ? 'Cambios guardados en la venta.' : 'Venta registrada.')
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'No se pudo guardar la venta.'
      const uncertain = !editing && (!(failure instanceof ApiError) || failure.status < 400 || failure.status >= 500)
      setRetrying(uncertain)
      setError(uncertain ? message + ' Usa Reintentar para verificar el mismo registro.' : message)
      if (!uncertain) {
        void reloadSelection()
        void reloadStock()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`${marketUi.panel} overflow-hidden`} aria-labelledby="market-sale-editor">
      <header className={marketUi.header}>
        <h3 id="market-sale-editor" className="flex items-center gap-2 font-semibold"><ShoppingBasket className="size-5 text-emerald-700 dark:text-emerald-300" aria-hidden />{editing ? 'Editar venta' : 'Registrar venta'} · {formatDate(date)}</h3>
      </header>
      <form onSubmit={save} className="grid gap-4 p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="relative grid gap-1 text-sm font-medium">
            Buscar productos con saldo
            <Search className="pointer-events-none absolute bottom-2.5 left-3 size-4 text-muted-foreground" aria-hidden />
            <input type="search" placeholder="Ej. Plátano, REC-001 o ENV-…" aria-describedby="market-stock-search-help" value={query} maxLength={120} onChange={(event) => { setQuery(event.target.value); setPage(1) }} className={`${marketUi.input} pl-9`} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Producto del recibo
            <select required value={product?.id ?? ''} className={marketUi.input} onChange={(event) => {
              const item = products.find((item) => item.id === event.target.value) ?? null
              setProduct(item)
              if (!editing) setPrice('')
              setError('')
            }}>
              <option value="">Selecciona un producto</option>
              {product && !products.some((item) => item.id === product.id) && (
                <option value={product.id}>{receiptCode(product.receiptNumber)} · {product.crop} · {product.unit}</option>
              )}
              {products.map((item) => <option key={item.id} value={item.id}>{[receiptCode(item.receiptNumber), item.crop, item.variety, item.area, item.unit].filter(Boolean).join(' · ')}</option>)}
            </select>
          </label>
        </div>
        <p id="market-stock-search-help" role="status" className="text-xs text-muted-foreground">
          {query ? (data ? `${products.length} coincidencias en esta página. Selecciona el producto del recibo para vender.` : 'Buscando productos con saldo…')
            : 'El buscador filtra el selector por producto, código de recibo o código de envío.'}
        </p>
        <MarketPagination page={page} hasNext={data?.hasNext} selectPage={setPage} />
        {stockError && <MarketError message={stockError.message} retry={() => void reloadStock()} />}
        {selectionError && <MarketError message={selectionError.message} retry={() => void reloadSelection()} />}
        {data?.rows.length === 0 && !product && <p className="text-xs text-muted-foreground">{query ? 'No se encontraron productos con saldo para esa búsqueda.' : 'Confirma una recepción para registrar ventas de sus productos.'}</p>}
        {product && (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <p>
                {farmSupplier} · {product.shipmentCode}
                {product.isConverted && product.originalUnit ? ` (recibido originalmente en ${product.originalUnit})` : ''}
                {available !== undefined ? ` · Saldo de ${units(available)} ${product.unit}`
                  : selection ? ' · Producto sin saldo para esta fecha' : ' · Consultando saldo…'}
              </p>
              {!editing && available !== undefined && Number(available) > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setConvertError('')
                    setConvertUnitId('')
                    setConvertUnitName('')
                    setConvertQty('')
                    setConvertOpen(true)
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#b7d3bc] bg-emerald-50/70 px-3 py-1.5 text-xs font-semibold text-[#1f4834] transition hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                >
                  <ArrowLeftRight className="size-3.5" aria-hidden />
                  Cambiar presentación (ej. fundas → unidades)
                </button>
              )}
            </div>

            {/* Guía de precio del mercado real (solo referencia, nunca impone el valor) */}
            <div className="rounded-xl border border-[#cfe0d2] bg-[#f5faf6] p-3.5 text-sm dark:border-[#2d4537] dark:bg-[#142019]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold text-[#1f4834] dark:text-[#c9e7d0]">
                  <Tag className="size-4 shrink-0" aria-hidden />
                  <span>Referencia del mercado actual ({product.crop} · {product.unit})</span>
                </div>
                <Link
                  href="/agro-market?seccion=precios"
                  prefetch={false}
                  className="text-xs font-semibold text-[#2c6048] underline underline-offset-2 dark:text-[#a8d5b3]"
                >
                  Actualizar precios
                </Link>
              </div>
              {activeMarketPrice ? (
                <div className="mt-2 grid gap-1 text-xs sm:text-sm">
                  <p className="text-foreground">
                    Precio real del mercado: <strong className="text-base text-emerald-800 dark:text-emerald-300">{usd(activeMarketPrice.priceUsd)}</strong> por {product.unit}
                    {(activeMarketPrice.minPriceUsd || activeMarketPrice.maxPriceUsd) && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        (rango {activeMarketPrice.minPriceUsd ? usd(activeMarketPrice.minPriceUsd) : '—'} – {activeMarketPrice.maxPriceUsd ? usd(activeMarketPrice.maxPriceUsd) : '—'})
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {activeMarketPrice.marketName} · {activeMarketPrice.source} · actualizado {formatDate(activeMarketPrice.effectiveDate)}
                  </p>
                </div>
              ) : (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  No hay un precio de mercado registrado para <strong>{product.crop}</strong> en <strong>{product.unit}</strong>.
                  {product.customerUnitPrice && (
                    <> Referencia anotada en recepción: <strong className="text-foreground">{usd(product.customerUnitPrice)}</strong>.</>
                  )}
                </p>
              )}
              <p className="mt-1.5 text-xs text-muted-foreground">
                {retailSuggestion
                  ? <>Precio sugerido de venta: <strong className="text-foreground">{usd(retailSuggestion.price)}</strong> ({retailSuggestion.reason}). El sistema solo sugiere este valor; ingresa tú el precio final de venta.</>
                  : 'El sistema no fija el precio: escribe libremente el precio final al cliente.'}
              </p>
            </div>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-sm font-medium">
            Cantidad ({product?.unit ?? 'unidad'})
            <input required inputMode="decimal" maxLength={13} value={quantity} onChange={(event) => setQuantity(event.target.value)} aria-invalid={exceeds} className={marketUi.input} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Precio al cliente ($)
            <input
              required
              inputMode="decimal"
              maxLength={13}
              placeholder={suggestedSalePrice ? `Sugerido: ${suggestedSalePrice}` : 'Ej. 5.00'}
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              className={marketUi.input}
            />
          </label>
          <div className="grid gap-1 text-sm font-medium">
            <span>Ganancia sobre costo</span>
            <output className="rounded-xl bg-muted/50 px-3 py-2 font-semibold tabular-nums">
              {formatMarkup(markupPercent(price, product?.productionUnitPrice ?? null))}
              {product?.productionUnitPrice != null && <span className="ml-2 text-xs font-normal text-muted-foreground">Producción {usd(product.productionUnitPrice)}</span>}
            </output>
          </div>
          <div className="grid gap-1 text-sm font-medium">
            <span>Valor total ($)</span>
            <output className="rounded-xl bg-emerald-50 px-3 py-2 font-semibold tabular-nums dark:bg-emerald-950/35">{usd(estimate)}</output>
          </div>
        </div>
        {belowProductionCost && (
          <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            Aviso: el precio ingresado ({usd(price)}) está por debajo del costo referencial de producción ({usd(product?.productionUnitPrice)}). Puedes guardarlo igual si así lo decides.
          </p>
        )}
        {exceeds && !canRetry && <MarketError message="La cantidad supera el saldo del producto en este recibo." />}
        {error && <MarketError message={error} />}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={marketUi.primary} disabled={busy || (!canRetry && (available === undefined || exceeds))}>
            <Plus className="size-4" aria-hidden /> {busy ? 'Guardando…' : canRetry ? 'Reintentar' : editing ? 'Guardar cambios' : 'Guardar venta'}
          </button>
          {editing && <button type="button" disabled={busy} className={marketUi.button} onClick={stopEditing}>Cancelar edición</button>}
        </div>
      </form>

      {convertOpen && product && available !== undefined && (
        <MarketDialog
          title={`Cambiar presentación de ${product.crop}`}
          action="Guardar cambio de unidad"
          busy={convertBusy}
          onCancel={() => setConvertOpen(false)}
          onConfirm={() => void confirmUnitConversion()}
        >
          <p className="text-muted-foreground">
            Saldo actual: <strong className="text-foreground">{units(available)} {product.unit}</strong> ({receiptCode(product.receiptNumber)}). El envío original de Producción se mantiene intacto.
          </p>
          <label className="grid gap-1 text-sm font-medium">
            Nueva unidad de venta
            <select
              value={convertUnitId}
              onChange={(e) => setConvertUnitId(e.target.value)}
              className={marketUi.input}
            >
              <option value="">Selecciona nueva unidad</option>
              {(priceCatalog?.units ?? [])
                .filter((u) => u.name.toLowerCase() !== product.unit.toLowerCase())
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              <option value="__custom__">+ Otra unidad (ej. unidades, libras, fundas)</option>
            </select>
          </label>
          {convertUnitId === '__custom__' && (
            <label className="grid gap-1 text-sm font-medium">
              Escribe la nueva unidad
              <input
                maxLength={40}
                placeholder="Ej. unidades, libras"
                value={convertUnitName}
                onChange={(e) => setConvertUnitName(e.target.value)}
                className={marketUi.input}
              />
            </label>
          )}
          <label className="grid gap-1 text-sm font-medium">
            ¿Cuántas salen en total en la nueva unidad?
            <input
              inputMode="decimal"
              maxLength={13}
              placeholder="Ej. 100"
              value={convertQty}
              onChange={(e) => setConvertQty(e.target.value)}
              className={marketUi.input}
            />
          </label>
          {product.productionUnitPrice && Number(convertQty) > 0 && Number(available) > 0 && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              Costo base proporcional:{' '}
              <strong>
                {usd(((Number(product.productionUnitPrice) * Number(available)) / Number(convertQty)).toFixed(2))}
              </strong>{' '}
              por nueva unidad.
            </p>
          )}
          {convertError && <MarketError message={convertError} />}
        </MarketDialog>
      )}
    </section>
  )
}
