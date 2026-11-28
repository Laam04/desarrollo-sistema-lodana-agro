'use client'

import Link from 'next/link'
import { useState } from 'react'
import { CalendarDays, ChevronRight, ClipboardCheck, History, ShoppingBasket } from 'lucide-react'
import useSWR from 'swr'
import { marketDay, marketWeek, units, usd, type MarketSalesSummary, type MarketShipment, type PageResult } from '@/lib/market-data'
import { formatDate, productionFetch } from '@/lib/production-client'
import { addDays } from '@/lib/report-periods'
import { MarketError, marketUi } from '@/components/market-ui'
import { AnalysisNote } from '@/components/analysis-note'

export function MarketSummary() {
  const [date, setDate] = useState(marketDay)
  const [receiptUnit, setReceiptUnit] = useState('')
  const { data, error, mutate } = useSWR<MarketSalesSummary>(
    '/api/market-sales?' + new URLSearchParams({ view: 'summary', date }), productionFetch,
  )
  const { data: pendingReceptions } = useSWR<PageResult<MarketShipment>>(
    '/api/receptions?' + new URLSearchParams({ view: 'pending', page: '1' }),
    productionFetch,
  )
  const pendingCount = pendingReceptions?.rows.length ?? 0
  const receipts = data?.comparison.receipts ?? []
  const received = receipts.find((row) => row.unitId === receiptUnit) ?? receipts[0]

  return (
    <div className="grid gap-4 sm:gap-5">
      {/* Acciones diarias directas para teléfono */}
      <section aria-label="Acciones diarias de Agro Market" className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/agro-market?seccion=ventas"
          prefetch={false}
          className="group flex items-center gap-3.5 rounded-2xl border-2 border-[#2c6048] bg-[#2c6048] p-4 text-white shadow-sm transition active:scale-[0.99] hover:bg-[#234d39] sm:p-5"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <ShoppingBasket className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold leading-tight">Registrar venta</h2>
            <p className="mt-0.5 text-sm text-emerald-100">Anota ventas del día y consulta existencias.</p>
          </div>
          <ChevronRight className="size-5 shrink-0 opacity-80 transition group-hover:translate-x-0.5" aria-hidden />
        </Link>

        <Link
          href="/agro-market?seccion=recepciones"
          prefetch={false}
          className="group flex items-center gap-3.5 rounded-2xl border-2 border-[#d5e3d7] bg-white p-4 shadow-sm transition active:scale-[0.99] hover:border-[#2c6048] hover:bg-[#f7fbf7] dark:border-[#2d3b32] dark:bg-[#18211c] sm:p-5"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            <ClipboardCheck className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold leading-tight">Recibir cosecha</h2>
              {pendingCount > 0 && (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
                  {pendingCount}{pendingReceptions?.hasNext ? '+' : ''} pendiente(s)
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">Confirma envíos que llegan de la finca.</p>
          </div>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground/70 transition group-hover:translate-x-0.5 group-hover:text-[#2c6048]" aria-hidden />
        </Link>
      </section>

      <section className={`${marketUi.panel} p-4 sm:p-5`} aria-label="Indicadores semanales">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="grid gap-1 text-sm font-medium">
            Fecha de la semana
            <input type="date" value={date} max={marketDay()} className={marketUi.input} onChange={(event) => { if (event.target.value) setDate(event.target.value) }} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Link href="/agro-market?seccion=historial" prefetch={false} className={marketUi.button}>
              <History className="size-4" aria-hidden /> Ver historial de recibos
            </Link>
          </div>
        </div>
        {error && <div className="mt-4"><MarketError message={error.message} retry={() => void mutate()} /></div>}
        {!error && !data && <p role="status" className="mt-4 text-sm text-muted-foreground">Cargando resumen…</p>}
        {data && (
          <>
            <section className="mt-5 grid gap-3" aria-labelledby="market-period-heading">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="market-period-heading" className="text-base font-semibold">Cómo cambió Agro Market</h3>
                {received && receipts.length > 1 && (
                  <label className="flex flex-wrap items-center gap-2 text-xs font-medium">
                    Unidad recibida
                    <select value={received.unitId} onChange={(event) => setReceiptUnit(event.target.value)} className={marketUi.input}>
                      {receipts.map(({ unitId, unit }) => <option key={unitId} value={unitId}>{unit}</option>)}
                    </select>
                  </label>
                )}
              </div>
              {data.comparison.through ? (
                <>
                  <p className="text-sm text-muted-foreground">Del {formatDate(data.from)} al {formatDate(data.comparison.through)} frente al {formatDate(data.comparison.previousFrom)} al {formatDate(data.comparison.previousTo)}.</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <AnalysisNote subject="facturación" current={Number(data.comparison.sales.current)} previous={Number(data.comparison.sales.previous)} formatValue={usd} />
                    {received ? (
                      <AnalysisNote subject="cosecha recibida" current={Number(received.current)} previous={Number(received.previous)} formatValue={(value) => `${units(value)} ${received.unit}`} />
                    ) : (
                      <p className="rounded-xl bg-muted px-3 py-2.5 text-sm text-muted-foreground">Sin cosecha recibida en los dos períodos.</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm text-muted-foreground">La semana seleccionada todavía no tiene días cerrados para comparar.</p>
                  <button type="button" className={marketUi.button} onClick={() => setDate(addDays(marketWeek(marketDay()).from, -1))}>Última semana cerrada</button>
                </div>
              )}
              {data.profit !== null && Number(data.profit) < 0 && (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-900 dark:bg-red-950/50 dark:text-red-200">Pérdida bruta estimada de {usd(Math.abs(Number(data.profit)))} en ventas con costo registrado.</p>
              )}
            </section>
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="size-4" aria-hidden /> Semana del {formatDate(data.from)} al {formatDate(data.to)}
            </p>
            <dl className="mt-3 grid gap-3 sm:grid-cols-3">
              {([
                ['Total vendido', usd(data.total)],
                ['Ventas registradas', units(data.count)],
                ['Ganancia bruta estimada', usd(data.profit)],
              ] as const).map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border bg-emerald-50/50 p-4 dark:bg-emerald-950/30">
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            {data.missingCost > 0 && <p className="mt-3 text-sm text-muted-foreground">La ganancia solo incluye ventas con precio de Producción registrado. Sin precio de referencia: {units(data.missingCost)}.</p>}
          </>
        )}
      </section>
      {!!data && (
        <section className={`${marketUi.panel} overflow-hidden`} aria-labelledby="summary-sales-days">
          <h3 id="summary-sales-days" className={`${marketUi.header} font-semibold`}>Ventas por día</h3>
          {data.days.length > 0 ? (
            <table className="w-full text-sm">
              <thead className={marketUi.tableHead}>
                <tr>{['Fecha', 'Ventas registradas', 'Total vendido'].map((label) => <th key={label} scope="col" className="px-3 py-3 font-semibold">{label}</th>)}</tr>
              </thead>
              <tbody>
                {data.days.map((day) => (
                  <tr key={day.date} className={marketUi.row}>
                    <th scope="row" className="px-3 py-3 text-left font-medium">{formatDate(day.date)}</th>
                    <td className="px-3 py-3 tabular-nums">{units(day.count)}</td>
                    <td className="px-3 py-3 font-semibold tabular-nums">{usd(day.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="p-4 text-sm text-muted-foreground">Todavía no hay ventas en esta semana.</p>}
        </section>
      )}
    </div>
  )
}
