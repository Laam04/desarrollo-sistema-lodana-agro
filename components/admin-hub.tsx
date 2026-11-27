'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BarChart3, Leaf, LogOut, Store, Wheat } from 'lucide-react'

const modules = [
  {
    href: '/lodana',
    title: 'Producción agrícola',
    description: 'Cosechas, mermas, envíos, costos, cultivos, zonas, papelera y resumen interno.',
    icon: Wheat,
  },
  {
    href: '/agro-market',
    title: 'Agro Market',
    description: 'Recepción de envíos, registro y exportación de ventas, y resumen comercial semanal.',
    icon: Store,
  },
  {
    href: '/consultas',
    title: 'Consultas públicas',
    description: 'Visualización abierta de series mensuales cerradas, estacionalidad y pronósticos.',
    icon: BarChart3,
  },
] as const

export function AdminHub() {
  const [loggingOut, setLoggingOut] = useState(false)

  async function logout() {
    setLoggingOut(true)
    try {
      await fetch('/api/profile-logout', { method: 'POST' })
    } finally {
      window.location.replace('/')
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Leaf className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="font-semibold">Lodana Agro</p>
              <p className="text-xs text-muted-foreground">Panel de administración</p>
            </div>
          </div>
          <button
            type="button"
            disabled={loggingOut}
            onClick={logout}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
          >
            <LogOut className="size-4" aria-hidden="true" />
            {loggingOut ? 'Saliendo…' : 'Cerrar sesión'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Acceso administrativo</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tu sesión de administración habilita el acceso completo a todos los módulos operativos.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {modules.map(({ href, title, description, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col rounded-2xl border border-border bg-card p-6 transition hover:border-primary/50 hover:shadow-sm"
            >
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-base font-semibold group-hover:text-primary">{title}</h2>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{description}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}
