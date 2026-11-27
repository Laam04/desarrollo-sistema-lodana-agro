'use client'

import Link from 'next/link'

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold">Ocurrió un error inesperado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No se pudo completar la operación en pantalla. Puedes reintentar o volver al inicio.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Reintentar
          </button>
          <Link
            href="/"
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </main>
  )
}
