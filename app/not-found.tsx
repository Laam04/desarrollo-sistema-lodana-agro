import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold">Página no encontrada</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          La ruta solicitada no existe dentro de Lodana Agro.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Volver al inicio
        </Link>
      </div>
    </main>
  )
}
