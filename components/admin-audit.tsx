'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { ChevronDown, ChevronUp, FileSearch, Filter } from 'lucide-react'
import { productionFetch } from '@/lib/production-client'
import { MarketError, MarketPagination, marketUi } from '@/components/market-ui'

type AuditRow = {
  id: string
  entity: string
  entityId: string
  action: string
  actor: string
  actorLabel: string
  beforeJson: unknown
  afterJson: unknown
  createdAt: string
}

type AuditResponse = {
  page: number
  pageSize: number
  total: number
  hasNext: boolean
  entities: string[]
  actions: string[]
  rows: AuditRow[]
}

const dtFmt = new Intl.DateTimeFormat('es-EC', {
  timeZone: 'America/Guayaquil',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function fmtTimestamp(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : dtFmt.format(d)
}

export function AdminAuditPanel() {
  const [page, setPage] = useState(1)
  const [entity, setEntity] = useState('')
  const [action, setAction] = useState('')
  const [actor, setActor] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [q, setQ] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const params = new URLSearchParams({ page: String(page), pageSize: '25' })
  if (entity) params.set('entity', entity)
  if (action) params.set('action', action)
  if (actor) params.set('actor', actor)
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (q.trim()) params.set('q', q.trim())

  const { data, error, isLoading, mutate } = useSWR<AuditResponse>(
    `/api/admin/audit?${params.toString()}`,
    productionFetch,
  )

  function clearFilters() {
    setEntity('')
    setAction('')
    setActor('')
    setFrom('')
    setTo('')
    setQ('')
    setPage(1)
  }

  return (
    <div className="grid gap-5">
      <section className={`${marketUi.panel} p-4 sm:p-5`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-[#2c6048] dark:text-[#a8d5b3]" />
            <h3 className="text-sm font-semibold">Filtros de auditoría (solo lectura)</h3>
          </div>
          <button type="button" onClick={clearFilters} className="text-xs font-semibold text-[#2c6048] hover:underline dark:text-[#a8d5b3]">
            Limpiar filtros
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <input
            type="search"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            placeholder="Buscar ID, entidad, acción…"
            className={`${marketUi.input} lg:col-span-2`}
          />
          <select value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1) }} className={marketUi.input}>
            <option value="">Todas las entidades</option>
            {(data?.entities ?? []).map((ent) => (
              <option key={ent} value={ent}>{ent}</option>
            ))}
          </select>
          <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1) }} className={marketUi.input}>
            <option value="">Todas las acciones</option>
            {(data?.actions ?? []).map((act) => (
              <option key={act} value={act}>{act}</option>
            ))}
          </select>
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1) }} className={marketUi.input} aria-label="Desde" />
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1) }} className={marketUi.input} aria-label="Hasta" />
        </div>
      </section>

      {error && <MarketError message={error.message} retry={() => mutate()} />}

      <section className={marketUi.panel}>
        <div className={`${marketUi.header} flex flex-wrap items-center justify-between gap-2`}>
          <div className="flex items-center gap-2">
            <FileSearch className="size-4 text-[#2c6048] dark:text-[#a8d5b3]" />
            <h3 className="text-base font-semibold">Registros de auditoría</h3>
          </div>
          <span className="text-xs text-muted-foreground">
            {data ? `${data.total} registro(s) encontrados · Registro inmutable` : 'Cargando…'}
          </span>
        </div>

        <div className="p-4">
          {isLoading || !data ? (
            <p className="text-sm text-muted-foreground">Cargando registros de auditoría…</p>
          ) : data.rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No se encontraron registros de auditoría con los filtros aplicados.
            </p>
          ) : (
            <div className="grid gap-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={marketUi.tableHead}>
                      <th className="px-3 py-2">Fecha y hora</th>
                      <th className="px-3 py-2">Perfil</th>
                      <th className="px-3 py-2">Operación</th>
                      <th className="px-3 py-2">Entidad</th>
                      <th className="px-3 py-2">ID registro</th>
                      <th className="px-3 py-2 text-right">Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => {
                      const hasDetail = row.beforeJson !== null || row.afterJson !== null
                      const expanded = expandedId === row.id
                      return (
                        <tr key={row.id} className={marketUi.row}>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{fmtTimestamp(row.createdAt)}</td>
                          <td className="px-3 py-2 font-medium">{row.actorLabel}</td>
                          <td className="px-3 py-2">
                            <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-xs text-[#2c6048] dark:bg-[#234634] dark:text-[#c9e7d0]">
                              {row.action}
                            </span>
                          </td>
                          <td className="px-3 py-2">{row.entity}</td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{row.entityId}</td>
                          <td className="px-3 py-2 text-right">
                            {hasDetail ? (
                              <button
                                type="button"
                                onClick={() => setExpandedId(expanded ? null : row.id)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[#2c6048] hover:underline dark:text-[#a8d5b3]"
                              >
                                {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                                {expanded ? 'Ocultar' : 'Ver cambio'}
                              </button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {expandedId && (() => {
                const selected = data.rows.find((r) => r.id === expandedId)
                if (!selected) return null
                return (
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Detalle de operación · {selected.entity} ({selected.entityId})
                    </p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">Estado anterior</p>
                        <pre className="max-h-56 overflow-auto rounded-lg border border-border bg-background p-3 text-xs">
                          {selected.beforeJson ? JSON.stringify(selected.beforeJson, null, 2) : 'Sin registro previo'}
                        </pre>
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">Estado posterior</p>
                        <pre className="max-h-56 overflow-auto rounded-lg border border-border bg-background p-3 text-xs">
                          {selected.afterJson ? JSON.stringify(selected.afterJson, null, 2) : 'Sin detalle posterior'}
                        </pre>
                      </div>
                    </div>
                  </div>
                )
              })()}

              <MarketPagination page={data.page} hasNext={data.hasNext} selectPage={setPage} />
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
