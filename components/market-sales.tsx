'use client'

import { useDeferredValue, useRef, useState, type FormEvent } from 'react'
import { Banknote, Download, Pencil, Plus, Search, ShoppingBasket, Trash2 } from 'lucide-react'
import useSWR from 'swr'
import { ApiError, formatDate, invalidateProduction, productionFetch } from '@/lib/production-client'
import { cents, decimalInput, farmSupplier, formatMarkup, marketDay, marketWeek, markupPercent, receiptCode, salesValue, sheetColumns, units, usd, type PageResult, type SaleRow, type SalesDay, type StockRow } from '@/lib/market-data'
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
  const [notice, setNotice] = useState('')
  const editorRef = useRef<HTMLDivElement>(null)

  const { data, error, mutate } = useSWR<SalesDay>(salesApi + '?' + new URLSearchParams({ date, period, page: String(page) }), productionFetch)
  const week = period === 'week' ? marketWeek(date) : null
  const dateLabel = week ? `${formatDate(week.from)} al ${formatDate(week.to)}` : formatDate(date)

  function changeDate(value: string) {
    if (!value) return
    setDate(value)
    setPage(1)
    setEditing(null)
    setNotice('')
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
          <a download className={marketUi.button} href={salesApi + '?' + new URLSearchParams({ date, period, export: 'csv' })}>
            <Download className="size-4" aria-hidden /> Exportar a Excel (CSV)
          </a>
        </div>
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

  const stockParams = { view: 'stock', date, ...(editing ? { excludeSaleId: editing.id } : {}) }
  const { data, error: stockError, mutate: reloadStock } = useSWR<PageResult<StockRow>>(
    salesApi + '?' + new URLSearchParams({ ...stockParams, q: search, page: String(page) }), productionFetch,
  )
  const { data: selection, error: selectionError, mutate: reloadSelection } = useSWR<PageResult<StockRow>>(
    product ? salesApi + '?' + new URLSearchParams({ ...stockParams, itemId: product.id, page: '1' }) : null,
    productionFetch,
  )

  const products = data?.rows ?? []
  const available = selection?.rows[0]?.available
  const estimate = salesValue(quantity, price)
  const amount = cents(quantity)
  const exceeds = available !== undefined && amount !== null && amount > (cents(available) ?? 0)
  const payload = { date, receptionItemId: product?.id, quantity: decimalInput(quantity), unitPrice: decimalInput(price) }
  const snapshot = JSON.stringify(payload)
  const canRetry = retrying && replay.current?.draft === snapshot

  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError('')
    if (!product || (!canRetry && (available === undefined || exceeds)) || !amount || !cents(price) || estimate === null) {
      setError('Selecciona un producto disponible e ingresa una cantidad y un precio positivos de hasta dos decimales.')
      return
    }
    if (replay.current?.draft !== snapshot) replay.current = { draft: snapshot, id: crypto.randomUUID() }
    setBusy(true)
    try {
      await productionFetch(salesApi, {
        method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { ...payload, id: editing.id, updatedAt: editing.updatedAt } : { ...payload, requestId: replay.current.id }),
      })
      replay.current = null
      setRetrying(false)
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
              setPrice(item?.customerUnitPrice ?? '')
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
          <p className="text-xs text-muted-foreground">
            {farmSupplier} · {product.shipmentCode}
            {available !== undefined ? ` · Saldo de ${units(available)} ${product.unit}`
              : selection ? ' · Producto sin saldo para esta fecha' : ' · Consultando saldo…'}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-sm font-medium">
            Cantidad
            <input required inputMode="decimal" maxLength={13} value={quantity} onChange={(event) => setQuantity(event.target.value)} aria-invalid={exceeds} className={marketUi.input} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Precio al cliente ($)
            <input required inputMode="decimal" maxLength={13} value={price} onChange={(event) => setPrice(event.target.value)} className={marketUi.input} />
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
        {exceeds && !canRetry && <MarketError message="La cantidad supera el saldo del producto en este recibo." />}
        {error && <MarketError message={error} />}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={marketUi.primary} disabled={busy || (!canRetry && (available === undefined || exceeds))}>
            <Plus className="size-4" aria-hidden /> {busy ? 'Guardando…' : canRetry ? 'Reintentar' : editing ? 'Guardar cambios' : 'Guardar venta'}
          </button>
          {editing && <button type="button" disabled={busy} className={marketUi.button} onClick={stopEditing}>Cancelar edición</button>}
        </div>
      </form>
    </section>
  )
}
