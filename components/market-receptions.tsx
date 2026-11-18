'use client'

import { useDeferredValue, useRef, useState, type FormEvent } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { ClipboardCheck, Inbox, PackageCheck, Search, Truck } from 'lucide-react'
import { ApiError, formatDate, formatTimestampDate, invalidateProduction, productionFetch } from '@/lib/production-client'
import { cents, decimalInput, farmSupplier, receiptCode, units, usd, type MarketShipment, type MarketShipmentDetail, type PageResult } from '@/lib/market-data'
import { receivableStatuses, shipmentStatusLabels } from '@/lib/shipment-status'
import { MarketDialog, MarketError, MarketPagination, marketUi } from '@/components/market-ui'

type DraftLine = { quantity: string; notes: string }
type ReceiptRequest = {
  requestId: string
  shipmentId: string
  notes: string
  items: { shipmentItemId: string; receivedQuantity: string; notes: string }[]
}

function Status({ status }: { status: string }) {
  const tone = status === 'PARTIALLY_RECEIVED' ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
    : status === 'CANCELLED' ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
      : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
  return <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{shipmentStatusLabels[status] ?? 'Registrado'}</span>
}

export function MarketReceptions({ historical }: { historical: boolean }) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState('')
  const [notice, setNotice] = useState('')
  const detailRef = useRef<HTMLDivElement>(null)
  const search = useDeferredValue(query)
  const { data, error, mutate } = useSWR<PageResult<MarketShipment>>(
    '/api/receptions?' + new URLSearchParams({ view: historical ? 'history' : 'pending', q: search, page: String(page) }),
    productionFetch,
  )
  const { data: detail, error: detailError, mutate: reloadDetail } = useSWR<MarketShipmentDetail>(
    selected ? '/api/receptions?' + new URLSearchParams({ shipmentId: selected }) : null,
    productionFetch,
  )

  function received(number: number) {
    setNotice(`Recibo ${receiptCode(number)} registrado. Las cantidades recibidas quedaron disponibles para ventas.`)
    if (page > 1 && data?.rows.length === 1) setPage(1)
    void invalidateProduction('/api/receptions', '/api/market-sales', '/api/shipments', '/api/production-summary')
  }

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
      <section className={`${marketUi.panel} overflow-hidden`} aria-labelledby="market-shipment-list">
        <header className={marketUi.header}>
          <h3 id="market-shipment-list" className="flex items-center gap-2 font-semibold"><Truck className="size-5 text-emerald-700 dark:text-emerald-300" aria-hidden />{historical ? 'Envíos con recibos' : 'Envíos pendientes'}</h3>
        </header>
        <div className="grid gap-3 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
            <input type="search" aria-label="Buscar por código o producto" placeholder="Buscar código o producto" value={query} maxLength={120} onChange={(event) => { setQuery(event.target.value); setPage(1) }} className={`${marketUi.input} pl-9`} />
          </div>
          {error && <MarketError message={error.message} retry={() => void mutate()} />}
          {!error && !data && <p role="status" className="text-sm text-muted-foreground">Cargando envíos…</p>}
          {data?.rows.length === 0 && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">{query ? 'La búsqueda no encontró envíos.' : historical ? 'Las recepciones confirmadas aparecerán aquí.' : 'Todos los envíos registrados están al día.'}</p>}
          {data?.rows.length ? (
            <ul className="grid gap-2">
              {data.rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    aria-pressed={selected === row.id}
                    onClick={() => {
                      setSelected(row.id)
                      setNotice('')
                      if (window.matchMedia('(width < 80rem)').matches) {
                        requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: 'start' }))
                      }
                    }}
                    className={`grid w-full gap-1 rounded-xl border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-emerald-600 ${selected === row.id
                      ? 'border-emerald-600 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40'
                      : 'border-border hover:bg-muted/60'}`}
                  >
                    <span className="flex flex-wrap items-center justify-between gap-1">
                      <strong className="text-sm">{row.code}</strong>
                      <span className="text-xs text-muted-foreground">{formatDate(row.date)}</span>
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{[...new Set(row.items.map((item) => item.crop.name))].join(', ')}</span>
                    <Status status={row.status} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <MarketPagination page={page} hasNext={data?.hasNext} selectPage={setPage} />
        </div>
      </section>
      <div ref={detailRef} className="grid min-w-0 scroll-mt-24 gap-4">
        {notice && <p role="status" className="flex gap-2 rounded-xl bg-emerald-100 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"><PackageCheck className="size-5 shrink-0" aria-hidden />{notice}</p>}
        {detailError && <MarketError message={detailError.message} retry={() => void reloadDetail()} />}
        {detail ? (
          <>
            <ReceiptDetail key={detail.id} shipment={detail} historical={historical} onReceived={received} onRefresh={() => void reloadDetail()} />
            {!!detail.receptions.length && (
              <section className={`${marketUi.panel} overflow-hidden`} aria-label="Recibos del envío">
                <h3 className={`${marketUi.header} font-semibold`}>Recibos del envío</h3>
                <ul className="divide-y divide-border px-4 sm:px-5">
                  {detail.receptions.map((receipt) => (
                    <li key={receipt.id} className="py-3">
                      <details>
                        <summary className="cursor-pointer text-sm font-medium">{receiptCode(receipt.receiptNumber)} · {formatTimestampDate(receipt.receivedAt)}</summary>
                        {receipt.notes && <p className="mt-2 break-words text-sm text-muted-foreground">{receipt.notes}</p>}
                        <ul className="mt-2 grid gap-2 text-sm">
                          {receipt.items.map((entry) => {
                            const item = detail.items.find((product) => product.id === entry.shipmentItemId)
                            return (
                              <li key={entry.id} className="rounded-lg bg-muted/50 px-3 py-2">
                                <strong>{item?.crop.name ?? 'Producto'}</strong> · {units(entry.receivedQuantity)} {item?.unit.name}
                                {entry.notes && <p className="break-words text-xs text-muted-foreground">{entry.notes}</p>}
                              </li>
                            )
                          })}
                        </ul>
                      </details>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : !detailError && (
          <section className={`${marketUi.panel} grid min-h-56 place-items-center p-6 text-center`}>
            <div className="grid justify-items-center gap-2">
              <Inbox className="size-8 text-emerald-700 dark:text-emerald-300" aria-hidden />
              <p className="text-sm text-muted-foreground">{selected ? 'Cargando detalle del envío…' : 'Selecciona un envío para ver sus productos.'}</p>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function ReceiptDetail({ shipment, historical, onReceived, onRefresh }: {
  shipment: MarketShipmentDetail; historical: boolean; onReceived: (number: number) => void; onRefresh: () => void
}) {
  const canReceive = !historical && receivableStatuses.includes(shipment.status) && shipment.items.some((item) => Number(item.pendingQuantity) > 0)
  const [lines, setLines] = useState<Partial<Record<string, DraftLine>>>({})
  const [notes, setNotes] = useState('')
  const [review, setReview] = useState<ReceiptRequest | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retryError, setRetryError] = useState('')

  function line(id: string) {
    return lines[id] ?? { quantity: '', notes: '' }
  }

  function change(id: string, value: Partial<DraftLine>) {
    setLines((current) => ({ ...current, [id]: { quantity: '', notes: '', ...current[id], ...value } }))
  }

  function prepare(event: FormEvent) {
    event.preventDefault()
    setError('')
    const items: ReceiptRequest['items'] = []
    for (const item of shipment.items) {
      const value = line(item.id)
      if (!value.quantity.trim()) continue
      const quantity = cents(value.quantity)
      const maximum = cents(item.pendingQuantity) ?? 0
      if (quantity === null || quantity > maximum) {
        setError(`Revisa la cantidad de ${item.crop.name}. El saldo pendiente es de ${units(item.pendingQuantity)} ${item.unit.name}.`)
        return
      }
      if (quantity > 0) items.push({ shipmentItemId: item.id, receivedQuantity: decimalInput(value.quantity), notes: value.notes })
    }
    if (!items.length) {
      setError('Indica una cantidad recibida mayor que cero en al menos un producto.')
      return
    }
    setRetryError('')
    setReview({ requestId: crypto.randomUUID(), shipmentId: shipment.id, notes, items })
  }

  async function confirm() {
    if (!review || busy) return
    setBusy(true)
    setRetryError('')
    try {
      const result = await productionFetch<{ reception: { receiptNumber: number } }>('/api/receptions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(review),
      })
      setLines({})
      setNotes('')
      setReview(null)
      onReceived(result.reception.receiptNumber)
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'No se pudo confirmar la recepción.'
      if (failure instanceof ApiError && failure.status >= 400 && failure.status < 500) {
        setError(message)
        setReview(null)
        onRefresh()
      } else {
        setRetryError(message + ' Reintenta desde esta confirmación.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`${marketUi.panel} overflow-hidden`} aria-labelledby="market-shipment-heading">
      <form onSubmit={prepare}>
        <header className={`${marketUi.header} flex flex-wrap items-start justify-between gap-3`}>
          <div>
            <h3 id="market-shipment-heading" className="text-lg font-semibold">{shipment.code}</h3>
            <p className="text-sm text-muted-foreground">{farmSupplier} · Enviado el {formatDate(shipment.date)}</p>
          </div>
          <Status status={shipment.status} />
        </header>
        {shipment.notes && <p className="break-words px-4 pt-4 text-sm text-muted-foreground sm:px-5">{shipment.notes}</p>}
        {canReceive && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
            <p className="text-xs text-muted-foreground">Ingresa lo que llegó físicamente, en la unidad del envío.</p>
            <button type="button" className={marketUi.button} onClick={() => {
              setLines(Object.fromEntries(shipment.items.filter((item) => Number(item.pendingQuantity) > 0).map((item) => [item.id, { ...line(item.id), quantity: item.pendingQuantity }])))
              setError('')
            }}>Completar con el saldo pendiente</button>
          </div>
        )}
        <div className={canReceive ? 'overflow-x-auto' : 'mt-4 overflow-x-auto'} tabIndex={0} aria-label="Productos en el envío">
          <table className="w-full text-sm">
            <thead className={marketUi.tableHead}>
              <tr>
                {['Producto', 'Unidad', 'Enviado', 'Recibido', 'Pendiente', 'Precio ref. ($)'].map((label) => <th key={label} scope="col" className="whitespace-nowrap px-3 py-3 font-semibold">{label}</th>)}
                {canReceive && <th scope="col" className="min-w-44 whitespace-nowrap px-3 py-3 font-semibold">Recibir ahora</th>}
              </tr>
            </thead>
            <tbody>
              {shipment.items.map((item) => (
                <tr key={item.id} className={marketUi.row}>
                  <th scope="row" className="min-w-34 px-3 py-3 text-left align-top">
                    <span className="font-semibold">{item.crop.name}</span>
                    <span className="block text-xs font-normal text-muted-foreground">{[item.variety?.name, item.productionArea?.name].filter(Boolean).join(' · ')}</span>
                    {item.notes && <span className="block break-words text-xs font-normal text-muted-foreground">{item.notes}</span>}
                  </th>
                  <td className="px-3 py-3 align-top">{item.unit.name}</td>
                  <td className="px-3 py-3 align-top tabular-nums">{units(item.quantity)}</td>
                  <td className="px-3 py-3 align-top tabular-nums">{units(item.receivedQuantity)}</td>
                  <td className="px-3 py-3 align-top font-medium tabular-nums">{units(item.pendingQuantity)}</td>
                  <td className="whitespace-nowrap px-3 py-3 align-top tabular-nums">{usd(item.estimatedUnitPrice)}</td>
                  {canReceive && <td className="space-y-1.5 px-3 py-2">
                    {Number(item.pendingQuantity) > 0 ? (
                      <>
                        <input inputMode="decimal" maxLength={13} placeholder="0" aria-label={`Cantidad a recibir de ${item.crop.name}`} value={line(item.id).quantity} onChange={(event) => change(item.id, { quantity: event.target.value })} className={marketUi.input} />
                        <input placeholder="Observación" maxLength={500} aria-label={`Observación de ${item.crop.name}`} value={line(item.id).notes} onChange={(event) => change(item.id, { notes: event.target.value })} className={marketUi.input} />
                      </>
                    ) : <span className="text-xs text-muted-foreground">Completo</span>}
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canReceive && (
          <div className="grid gap-3 p-4 sm:p-5">
            <label className="grid gap-1.5 text-sm font-medium">
              Observación del recibo
              <textarea className={marketUi.input} rows={2} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
            {error && <MarketError message={error} />}
            <button type="submit" className={`${marketUi.primary} justify-self-start`}><ClipboardCheck className="size-4" aria-hidden /> Revisar recepción</button>
          </div>
        )}
        {!canReceive && shipment.receptions.length > 0 && (
          <div className="p-4 sm:p-5">
            <Link className={marketUi.button} href="/agro-market?seccion=ventas">Ir al registro de ventas</Link>
          </div>
        )}
      </form>
      {review && (
        <MarketDialog title={`Confirmar recepción de ${shipment.code}`} action="Confirmar recepción" busy={busy} onConfirm={() => void confirm()} onCancel={() => setReview(null)}>
          <p className="text-muted-foreground">Se generará un recibo por las cantidades indicadas. El saldo restante seguirá pendiente en el envío.</p>
          <ul className="grid gap-1.5">
            {review.items.map((row) => {
              const item = shipment.items.find((product) => product.id === row.shipmentItemId)
              return <li key={row.shipmentItemId} className="flex justify-between gap-3 rounded-lg bg-muted/60 p-2"><span>{item?.crop.name}{item?.productionArea ? ' · ' + item.productionArea.name : ''}</span><strong className="text-right">{units(row.receivedQuantity)} {item?.unit.name}</strong></li>
            })}
          </ul>
          {retryError && <MarketError message={retryError} />}
        </MarketDialog>
      )}
    </section>
  )
}
