'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { ArchiveRestore, Trash2 } from 'lucide-react'
import { formatDate, formatTimestampDate, invalidateProduction, productionFetch } from '@/lib/production-client'

type TrashGroup = {
  groupId: string
  deletedAt: string
  purgeAt: string
  items: {
    id: string
    entityType: string
    snapshot?: { name?: string; description?: string; date?: string; quantity?: string; notes?: string }
  }[]
}

const names: Record<string, string> = {
  crop: 'Cultivo', variety: 'Variedad', productionArea: 'Área productiva', harvest: 'Cosecha',
  loss: 'Merma', lossReason: 'Motivo de merma', cost: 'Costo', unit: 'Unidad', costCategory: 'Categoría',
  costSubcategory: 'Subcategoría', costAllocation: 'Asignación de costo', shipment: 'Envío',
  shipmentItem: 'Producto del envío', shipmentAllocation: 'Asignación del envío',
  reception: 'Recepción', receptionItem: 'Producto recibido',
}

const rootOrder = ['crop', 'harvest', 'loss', 'cost', 'unit']
const actionClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50'

function titleFor(item: TrashGroup['items'][number]) {
  const type = names[item.entityType] ?? 'Registro'
  return [type, item.snapshot?.name || item.snapshot?.description || (item.snapshot?.date && formatDate(item.snapshot.date))]
    .filter(Boolean).join(' · ')
}

export function ProductionTrash() {
  const { data, error, mutate } = useSWR<TrashGroup[]>('/api/trash', productionFetch)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null)

  async function restore(groupId: string) {
    if (restoringId) return
    setRestoringId(groupId)
    setNotice(null)
    try {
      const result = await productionFetch<{ restoredCount: number }>('/api/trash/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId }),
      })
      setNotice({ text: `Registros recuperados: ${result.restoredCount}.`, error: false })
      void mutate((current) => current?.filter((group) => group.groupId !== groupId))
      void invalidateProduction('/api/crops', '/api/units', '/api/zones', '/api/cost-categories', '/api/harvests', '/api/losses', '/api/costs', '/api/shipments', '/api/production-summary', '/api/shipments/availability')
    } catch (failure) {
      setNotice({ text: failure instanceof Error ? failure.message : 'No se pudo restaurar el registro.', error: true })
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-900/10 bg-white shadow-sm dark:border-emerald-100/10 dark:bg-[#18211c]">
      <header className="flex items-center gap-3 border-b border-border/60 bg-emerald-50/50 p-5 dark:bg-emerald-950/20">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
          <Trash2 className="size-5" aria-hidden />
        </span>
        <div>
          <h3 className="font-semibold">Registros eliminados</h3>
          <p className="text-xs text-muted-foreground">Puedes recuperarlos durante 60 días.</p>
        </div>
      </header>
      <div className="grid gap-3 p-5">
        {notice && (
          <p role={notice.error ? 'alert' : 'status'} className={`rounded-xl p-3 text-sm ${notice.error
            ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
            : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200'}`}>
            {notice.text}
          </p>
        )}
        {error && (
          <div role="alert" className="flex items-center justify-between gap-3 text-sm text-red-700 dark:text-red-300">
            {error.message}
            <button type="button" className={actionClass} onClick={() => void mutate()}>Reintentar</button>
          </div>
        )}
        {!data && !error && <p role="status" className="text-sm text-muted-foreground">Cargando papelera…</p>}
        {data?.length === 0 && <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">La papelera está vacía.</p>}
        {data?.map((group) => {
          const main = rootOrder.map((type) => group.items.find((item) => item.entityType === type)).find(Boolean) ?? group.items[0]
          const related = group.items.filter((item) => item.id !== main.id)
          return (
            <article key={group.groupId} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-muted/20 p-4">
              <div className="min-w-0 flex-1">
                <h4 className="break-words text-sm font-semibold">{titleFor(main)}</h4>
                <p className="mt-1 text-xs text-muted-foreground">Eliminado el {formatTimestampDate(group.deletedAt)} · Disponible hasta el {formatTimestampDate(group.purgeAt)}</p>
                {!!related.length && (
                  <details className="mt-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer">{related.length} registros relacionados</summary>
                    <ul className="mt-1 list-disc pl-4">{related.map((item) => <li key={item.id}>{titleFor(item)}</li>)}</ul>
                  </details>
                )}
              </div>
              <button type="button" className={actionClass} disabled={Boolean(restoringId)} onClick={() => void restore(group.groupId)}>
                <ArchiveRestore className="size-4" aria-hidden /> {restoringId === group.groupId ? 'Restaurando…' : 'Restaurar'}
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )
}
