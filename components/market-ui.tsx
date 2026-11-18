'use client'

import { useEffect, useRef, type ReactNode } from 'react'

export const marketUi = {
  panel: 'min-w-0 rounded-2xl border border-[#dbe7dd] bg-white shadow-sm dark:border-[#2d3b32] dark:bg-[#18211c]',
  header: 'border-b border-[#dbe7dd] bg-emerald-50/50 px-4 py-4 sm:px-5 dark:border-[#2d3b32] dark:bg-emerald-950/20',
  input: 'min-w-0 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:opacity-60',
  button: 'inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-50',
  primary: 'inline-flex items-center justify-center gap-2 rounded-xl bg-[#2c6048] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#234d39] focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-50',
  tableHead: 'bg-[#2c6048] text-left text-xs text-white dark:bg-[#234634] dark:text-[#d7efdd]',
  row: 'border-b border-border/70 even:bg-emerald-50/30 dark:even:bg-emerald-950/20',
}

export function MarketError({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
      <span>{message}</span>
      {retry && <button type="button" className="font-semibold underline" onClick={retry}>Reintentar</button>}
    </div>
  )
}

export function MarketPagination({ page, hasNext, selectPage }: {
  page: number; hasNext?: boolean; selectPage: (page: number) => void
}) {
  if (page === 1 && !hasNext) return null
  return (
    <nav aria-label="Páginas de resultados" className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <button type="button" className={marketUi.button} disabled={page === 1} onClick={() => selectPage(page - 1)}>Anterior</button>
      <span>Página {page}</span>
      <button type="button" className={marketUi.button} disabled={!hasNext} onClick={() => selectPage(page + 1)}>Siguiente</button>
    </nav>
  )
}

export function MarketDialog({ title, action, children, busy, danger = false, onCancel, onConfirm }: {
  title: string; action: string; children: ReactNode; busy: boolean; danger?: boolean; onCancel: () => void; onConfirm: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  return (
    <dialog
      ref={ref}
      aria-labelledby="market-dialog-title"
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-border bg-background p-5 text-foreground shadow-xl backdrop:bg-black/55 sm:p-6"
      onCancel={(event) => { event.preventDefault(); if (!busy) onCancel() }}
    >
      <h2 id="market-dialog-title" className="text-lg font-semibold">{title}</h2>
      <div className="mt-3 grid gap-3 text-sm">{children}</div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" autoFocus disabled={busy} className={marketUi.button} onClick={onCancel}>Volver</button>
        <button type="button" disabled={busy} className={danger ? `${marketUi.button} text-red-700 dark:text-red-300` : marketUi.primary} onClick={onConfirm}>
          {busy ? 'Guardando…' : action}
        </button>
      </div>
    </dialog>
  )
}
