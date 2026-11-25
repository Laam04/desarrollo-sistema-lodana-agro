'use client'

import Link from 'next/link'
import { useState } from 'react'
import useSWR from 'swr'
import { AlertTriangle, CheckCircle2, ExternalLink, ShieldAlert, Trash2, Truck, XCircle } from 'lucide-react'
import { formatDate, productionFetch } from '@/lib/production-client'
import { receiptCode, units, usd } from '@/lib/market-data'
import { MarketError, marketUi } from '@/components/market-ui'

type ShipmentMonitorRow = {
  id: string
  code: string
  date: string
  status: string
  statusLabel: string
  notes: string | null
  items: { id: string; crop: string; variety: string | null; unit: string; sent: number; received: number; difference: number }[]
}

type OperationsResponse = {
  pendingShipments: ShipmentMonitorRow[]
  differenceShipments: ShipmentMonitorRow[]
  cancelledShipments: { id: string; code: string; date: string; notes: string | null; createdBy: string | null; updatedAt: string }[]
  cancelledSales: { id: string; date: string; cancelledAt: string | null; receiptNumber: number; crop: string; unit: string; quantity: number; totalUsd: number; createdBy: string | null }[]
  trashEntries: { id: string; entityType: string; entityId: string; groupId: string; deletedBy: string | null; deletedAt: string; purgeAt: string }[]
  integrityChecks: { id: string; severity: 'ok' | 'warning' | 'error'; title: string; description: string; count: number; samples: string[] }[]
}

const tabs = [
  { id: 'integridad', label: 'Integridad' },
  { id: 'pendientes', label: 'Despachos pendientes / parciales' },
  { id: 'diferencias', label: 'Cerrados con diferencias' },
  { id: 'anulaciones', label: 'Operaciones anuladas' },
  { id: 'papelera', label: 'Papelera recuperable' },
] as const

export function AdminOperationsPanel() {
  const { data, error, isLoading, mutate } = useSWR<OperationsResponse>('/api/admin/operations', productionFetch)
  const [tab, setTab] = useState<(typeof tabs)[number]['id']>('integridad')

  if (error) return <MarketError message={error.message} retry={() => mutate()} />
  if (isLoading || !data) {
    return <div className={`${marketUi.panel} p-6 text-sm text-muted-foreground`}>Analizando operaciones e integridad del sistema…</div>
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={tab === item.id ? marketUi.primary : marketUi.button}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => mutate()} className={marketUi.button}>
          Actualizar verificación
        </button>
      </div>

      {tab === 'integridad' && (
        <section className="grid gap-4 md:grid-cols-2">
          {data.integrityChecks.map((check) => {
            const Icon = check.severity === 'error' ? XCircle : check.severity === 'warning' ? AlertTriangle : CheckCircle2
            const badgeClass =
              check.severity === 'error'
                ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200'
                : check.severity === 'warning'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
            return (
              <article key={check.id} className={`${marketUi.panel} p-5`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Icon className={`size-5 shrink-0 ${check.severity === 'error' ? 'text-red-600' : check.severity === 'warning' ? 'text-amber-600' : 'text-emerald-600'}`} />
                    <h3 className="text-sm font-semibold">{check.title}</h3>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}>
                    {check.count === 0 ? 'Correcto' : `${check.count} hallazgo(s)`}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{check.description}</p>
                {check.samples.length > 0 && (
                  <ul className="mt-3 grid gap-1 rounded-xl bg-muted/40 p-3 text-xs">
                    {check.samples.map((sample) => (
                      <li key={sample} className="font-mono">{sample}</li>
                    ))}
                  </ul>
                )}
              </article>
            )
          })}
        </section>
      )}

      {tab === 'pendientes' && (
        <section className={marketUi.panel}>
          <div className={`${marketUi.header} flex flex-wrap items-center justify-between gap-2`}>
            <div className="flex items-center gap-2">
              <Truck className="size-4 text-[#2c6048] dark:text-[#a8d5b3]" />
              <h3 className="text-base font-semibold">Despachos en tránsito o con recepción parcial ({data.pendingShipments.length})</h3>
            </div>
            <Link href="/agro-market?seccion=recepciones" className="inline-flex items-center gap-1 text-xs font-semibold text-[#2c6048] hover:underline dark:text-[#a8d5b3]">
              Ir a Recepciones <ExternalLink className="size-3.5" />
            </Link>
          </div>
          <div className="p-4">
            {data.pendingShipments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No existen despachos pendientes ni parciales.</p>
            ) : (
              <div className="grid gap-3">
                {data.pendingShipments.map((s) => (
                  <div key={s.id} className="rounded-xl border border-border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{s.code} · {formatDate(s.date)}</p>
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                        {s.statusLabel}
                      </span>
                    </div>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border text-left text-muted-foreground">
                            <th className="py-1.5 pr-3">Producto</th>
                            <th className="py-1.5 px-3 text-right">Enviado</th>
                            <th className="py-1.5 px-3 text-right">Recibido</th>
                            <th className="py-1.5 pl-3 text-right">Pendiente</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.items.map((item) => (
                            <tr key={item.id} className="border-b border-border/50">
                              <td className="py-1.5 pr-3 font-medium">{item.crop}{item.variety ? ` · ${item.variety}` : ''}</td>
                              <td className="py-1.5 px-3 text-right tabular-nums">{units(item.sent)} {item.unit}</td>
                              <td className="py-1.5 px-3 text-right tabular-nums">{units(item.received)} {item.unit}</td>
                              <td className="py-1.5 pl-3 text-right font-semibold tabular-nums">{units(item.difference)} {item.unit}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'diferencias' && (
        <section className={marketUi.panel}>
          <div className={marketUi.header}>
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-[#2c6048] dark:text-[#a8d5b3]" />
              <h3 className="text-base font-semibold">Despachos cerrados con diferencias ({data.differenceShipments.length})</h3>
            </div>
          </div>
          <div className="p-4">
            {data.differenceShipments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No se registran despachos cerrados con diferencias.</p>
            ) : (
              <div className="grid gap-3">
                {data.differenceShipments.map((s) => (
                  <div key={s.id} className="rounded-xl border border-border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{s.code} · {formatDate(s.date)}</p>
                      <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950/60 dark:text-red-200">
                        {s.statusLabel}
                      </span>
                    </div>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border text-left text-muted-foreground">
                            <th className="py-1.5 pr-3">Producto</th>
                            <th className="py-1.5 px-3 text-right">Enviado</th>
                            <th className="py-1.5 px-3 text-right">Recibido</th>
                            <th className="py-1.5 pl-3 text-right">Diferencia</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.items.map((item) => (
                            <tr key={item.id} className="border-b border-border/50">
                              <td className="py-1.5 pr-3 font-medium">{item.crop}{item.variety ? ` · ${item.variety}` : ''}</td>
                              <td className="py-1.5 px-3 text-right tabular-nums">{units(item.sent)} {item.unit}</td>
                              <td className="py-1.5 px-3 text-right tabular-nums">{units(item.received)} {item.unit}</td>
                              <td className="py-1.5 pl-3 text-right font-semibold text-red-700 tabular-nums dark:text-red-300">{units(item.difference)} {item.unit}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'anulaciones' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className={marketUi.panel}>
            <div className={marketUi.header}>
              <h3 className="text-base font-semibold">Despachos cancelados ({data.cancelledShipments.length})</h3>
            </div>
            <div className="overflow-x-auto p-4">
              {data.cancelledShipments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin despachos cancelados.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className={marketUi.tableHead}>
                      <th className="px-3 py-2">Código</th>
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Observación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cancelledShipments.map((s) => (
                      <tr key={s.id} className={marketUi.row}>
                        <td className="px-3 py-2 font-medium">{s.code}</td>
                        <td className="px-3 py-2 text-xs">{formatDate(s.date)}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{s.notes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className={marketUi.panel}>
            <div className={marketUi.header}>
              <h3 className="text-base font-semibold">Ventas anuladas en Agro Market ({data.cancelledSales.length})</h3>
            </div>
            <div className="overflow-x-auto p-4">
              {data.cancelledSales.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin ventas anuladas.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className={marketUi.tableHead}>
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Recibo</th>
                      <th className="px-3 py-2">Producto</th>
                      <th className="px-3 py-2 text-right">Cantidad</th>
                      <th className="px-3 py-2 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cancelledSales.map((s) => (
                      <tr key={s.id} className={marketUi.row}>
                        <td className="px-3 py-2 text-xs">{formatDate(s.date)}</td>
                        <td className="px-3 py-2 font-mono text-xs">{receiptCode(s.receiptNumber)}</td>
                        <td className="px-3 py-2">{s.crop}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{units(s.quantity)} {s.unit}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{usd(s.totalUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      )}

      {tab === 'papelera' && (
        <section className={marketUi.panel}>
          <div className={`${marketUi.header} flex flex-wrap items-center justify-between gap-2`}>
            <div className="flex items-center gap-2">
              <Trash2 className="size-4 text-[#2c6048] dark:text-[#a8d5b3]" />
              <h3 className="text-base font-semibold">Registros recuperables en papelera ({data.trashEntries.length})</h3>
            </div>
            <Link href="/lodana?seccion=papelera" className="inline-flex items-center gap-1 text-xs font-semibold text-[#2c6048] hover:underline dark:text-[#a8d5b3]">
              Gestionar restauración en Producción <ExternalLink className="size-3.5" />
            </Link>
          </div>
          <div className="overflow-x-auto p-4">
            {data.trashEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">La papelera no contiene registros pendientes de purga.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className={marketUi.tableHead}>
                    <th className="px-3 py-2">Tipo de entidad</th>
                    <th className="px-3 py-2">ID registro</th>
                    <th className="px-3 py-2">Eliminado por</th>
                    <th className="px-3 py-2">Eliminado</th>
                    <th className="px-3 py-2">Expira</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trashEntries.map((row) => (
                    <tr key={row.id} className={marketUi.row}>
                      <td className="px-3 py-2 font-medium">{row.entityType}</td>
                      <td className="px-3 py-2 font-mono text-xs">{row.entityId}</td>
                      <td className="px-3 py-2 text-xs">{row.deletedBy ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(row.deletedAt)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(row.purgeAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
