'use client'

import Link from 'next/link'
import { useState } from 'react'
import { CalendarDays, ClipboardCheck, ShoppingBasket } from 'lucide-react'
import useSWR from 'swr'
import { marketDay, units, usd, type MarketSalesSummary } from '@/lib/market-data'
import { formatDate, productionFetch } from '@/lib/production-client'
import { MarketError, marketUi } from '@/components/market-ui'

export function MarketSummary() {
  const [date, setDate] = useState(marketDay)
  const { data, error, mutate } = useSWR<MarketSalesSummary>(
    '/api/market-sales?' + new URLSearchParams({ view: 'summary', date }), productionFetch,
  )

  return (
    <div className="grid gap-5">
      <section className={`${marketUi.panel} p-4 sm:p-5`} aria-label="Indicadores semanales">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="grid gap-1 text-sm font-medium">
            Fecha de la semana
            <input type="date" value={date} max={marketDay()} className={marketUi.input} onChange={(event) => { if (event.target.value) setDate(event.target.value) }} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Link href="/agro-market?seccion=recepciones" className={marketUi.button}><ClipboardCheck className="size-4" aria-hidden /> Recibir cosecha</Link>
            <Link href="/agro-market?seccion=ventas" className={marketUi.primary}><ShoppingBasket className="size-4" aria-hidden /> Registrar venta</Link>
          </div>
        </div>
        {error && <div className="mt-4"><MarketError message={error.message} retry={() => void mutate()} /></div>}
        {!error && !data && <p role="status" className="mt-4 text-sm text-muted-foreground">Cargando resumen…</p>}
        {data && (
          <>
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
