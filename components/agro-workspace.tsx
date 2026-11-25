'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ChevronRight,
  LogOut,
  Menu,
  Moon,
  Repeat,
  Sprout,
  Sun,
  X,
  type LucideIcon,
} from 'lucide-react'
import { productionFetch } from '@/lib/production-client'

/* ───────────────────────── Datos ───────────────────────── */

type Section = {
  id: string
  label: string
  icon: LucideIcon
  title?: string
  description?: string
}

/* ───────────────────── Estilos reutilizables ───────────────────── */

const ui = {
  chip: 'bg-[#e4f0e7] text-[#24523b] dark:bg-[#234634] dark:text-[#c9e7d0]',
  iconBtn:
    'rounded-xl p-2 text-muted-foreground transition hover:bg-[#e9f1ea] hover:text-foreground focus:outline-none focus:ring-2 focus:ring-[#b8d8bf] dark:hover:bg-[#223027]',
}

/* ───────────────────── Diálogo de confirmación ───────────────────── */

type ConfirmState = {
  title: string
  description: string
  confirmLabel: string
} | null

function ConfirmDialog({
  state,
  onCancel,
  onConfirm,
  busy,
  error,
}: {
  state: NonNullable<ConfirmState>
  onCancel: () => void
  onConfirm: () => void
  busy: boolean
  error: string
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-labelledby="ws-confirm-title"
      aria-describedby="ws-confirm-desc"
      className="m-auto w-[calc(100%-2rem)] max-w-md bg-transparent p-0 text-foreground backdrop:bg-black/50 backdrop:backdrop-blur-sm"
      onCancel={(event) => { event.preventDefault(); if (!busy) onCancel() }}
      onClick={(event) => { if (event.target === event.currentTarget && !busy) onCancel() }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[#dbe7dd] bg-white p-6 shadow-xl dark:border-[#2d3b32] dark:bg-[#18211c]"
      >
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
            <AlertTriangle className="size-5" />
          </div>
          <div>
            <h4 id="ws-confirm-title" className="text-base font-semibold">
              {state.title}
            </h4>
            <p
              id="ws-confirm-desc"
              className="mt-1 text-sm text-muted-foreground"
            >
              {state.description}
            </p>
          </div>
        </div>

        {error && <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">{error}</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={onCancel}
            className="rounded-xl border border-[#cfdcd1] px-4 py-2 text-sm font-medium transition hover:bg-[#eef5ef] dark:border-[#34453a] dark:hover:bg-[#223027]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded-xl bg-[#2c6048] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#234d39] focus:outline-none focus:ring-2 focus:ring-[#b8d8bf] disabled:opacity-60"
          >
            {busy ? 'Cerrando…' : state.confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}

/* ───────────────────── Componente principal ───────────────────── */

export function AgroWorkspace({
  title, path, sections, renderSection,
}: {
  title: string
  path: string
  sections: readonly [Section, ...Section[]]
  renderSection: (sectionId: string) => ReactNode
}) {
  const params = useSearchParams()
  const { resolvedTheme, setTheme } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState('')
  const closeMenu = useRef<HTMLButtonElement>(null)

  const current = sections.find((item) => item.id === params.get('seccion')) ?? sections[0]
  const active = current.id
  const ActiveIcon = current.icon

  /* Bloquea el scroll del fondo y permite cerrar el menú con Esc */
  useEffect(() => {
    if (!mobileOpen) return

    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeMenu.current?.focus()
    const desktop = window.matchMedia('(min-width: 64rem)')

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    function onResize() {
      if (desktop.matches) setMobileOpen(false)
    }
    window.addEventListener('keydown', onKey)
    desktop.addEventListener('change', onResize)

    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
      desktop.removeEventListener('change', onResize)
    }
  }, [mobileOpen])

  function leave(config: { title: string; description: string; label: string }) {
    setMobileOpen(false)
    setLeaveError('')
    setConfirm({
      title: config.title,
      description: config.description,
      confirmLabel: config.label,
    })
  }

  async function confirmLeave() {
    if (leaving) return
    setLeaving(true)
    setLeaveError('')
    try {
      await productionFetch('/api/profile-logout', { method: 'POST' })
      window.location.replace('/')
    } catch (error) {
      setLeaveError(error instanceof Error ? error.message : 'No se pudo cerrar la sesión.')
      setLeaving(false)
    }
  }

  function requestSwitchProfile() {
    leave({
      title: 'Cambiar de perfil',
      description:
        'Volverás a la selección de perfil.',
      label: 'Cambiar de perfil',
    })
  }

  function requestLogout() {
    leave({
      title: 'Cerrar sesión',
      description:
        'Se cerrará tu sesión en este espacio de trabajo. Los datos ya registrados se conservan.',
      label: 'Cerrar sesión',
    })
  }

  return (
    <div className="min-h-screen bg-[#f4f7f3] text-[#20302b] dark:bg-[#0f1512] dark:text-[#edf2ed]">
      {/* ───── Barra lateral ───── */}
      <aside
        id="production-navigation"
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[88vw] flex-col overflow-y-auto border-r border-[#dbe5db] bg-white px-4 py-5 shadow-xl transition-transform dark:border-[#29362f] dark:bg-[#141c18] lg:visible lg:translate-x-0 lg:shadow-none ${
          mobileOpen ? 'translate-x-0' : 'invisible -translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3b7a5c] to-[#24523b] text-white shadow-md shadow-[#2c6048]/30">
              <Sprout className="size-6" />
            </div>
            <div>
              <p className="font-semibold leading-tight">Lodana Agro</p>
              <p className="text-[11px] text-muted-foreground">
                {title}
              </p>
            </div>
          </div>

          <button
            type="button"
            ref={closeMenu}
            aria-label="Cerrar menú"
            onClick={() => setMobileOpen(false)}
            className={`${ui.iconBtn} lg:hidden`}
          >
            <X className="size-5" />
          </button>
        </div>

        <button
          type="button"
          onClick={requestSwitchProfile}
          className="mt-7 flex items-center gap-2.5 rounded-xl border border-dashed border-[#cfdcd1] px-3 py-2.5 text-sm text-muted-foreground transition hover:border-[#2c6048] hover:bg-[#eef5ef] hover:text-foreground dark:border-[#34453a] dark:hover:bg-[#223027]"
        >
          <Repeat className="size-4" />
          Cambiar de perfil
        </button>

        <div className="mt-7 flex items-center gap-3 px-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Menú
          </span>
          <span className="h-px flex-1 bg-[#e3ece4] dark:bg-[#2d3b32]" />
        </div>

        <nav
          className="mt-3 flex flex-col gap-1"
          aria-label={title}
        >
          {sections.map(({ id, label, icon: Icon }) => {
            const isActive = active === id

            return (
              <Link
                key={id}
                href={id === sections[0].id ? path : `${path}?seccion=${id}`}
                prefetch={false}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => {
                  setMobileOpen(false)
                }}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#b8d8bf] ${
                  isActive
                    ? `${ui.chip} font-semibold`
                    : 'text-muted-foreground hover:bg-[#eef5ef] hover:text-foreground dark:hover:bg-[#223027]'
                }`}
              >
                {isActive && (
                  <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-[#2c6048] dark:bg-[#a8d5b3]" />
                )}
                <span
                  className={`flex size-8 items-center justify-center rounded-lg transition ${
                    isActive
                      ? 'bg-white text-[#2c6048] shadow-sm dark:bg-[#2d5640] dark:text-[#c9e7d0]'
                      : 'bg-[#f1f6f2] group-hover:bg-white dark:bg-[#1d2820] dark:group-hover:bg-[#2d3b32]'
                  }`}
                >
                  <Icon className="size-4" />
                </span>
                <span className="flex-1">{label}</span>
                {isActive && <ChevronRight className="size-4" />}
              </Link>
            )
          })}
        </nav>

      </aside>

      {mobileOpen && (
        <button
          type="button"
          aria-label="Cerrar navegación"
          tabIndex={-1}
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] lg:hidden"
        />
      )}

      {/* ───── Contenido ───── */}
      <div className="lg:pl-72" inert={mobileOpen}>
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[#dbe5db] bg-[#f4f7f3]/85 px-5 backdrop-blur-xl dark:border-[#29362f] dark:bg-[#0f1512]/85 sm:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Abrir menú"
              aria-controls="production-navigation"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
              className={`${ui.iconBtn} lg:hidden`}
            >
              <Menu className="size-5" />
            </button>
            <div>
              <nav
                aria-label="Ruta de navegación"
                className="flex items-center gap-1 text-xs text-muted-foreground"
              >
                <span>Espacio de trabajo</span>
                <ChevronRight className="size-3" />
                <span className="font-medium text-foreground">
                  {current?.label}
                </span>
              </nav>
              <h1 className="text-lg font-semibold sm:text-xl">
                {title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTheme(resolvedTheme === 'dark' || resolvedTheme === 'custom' ? 'light' : 'dark')}
              className={ui.iconBtn}
              title="Alternar tema"
            >
              <Moon aria-hidden="true" className="size-5 dark:hidden" />
              <Sun aria-hidden="true" className="hidden size-5 dark:block" />
              <span className="sr-only dark:hidden">Activar modo oscuro</span>
              <span className="sr-only hidden dark:block">Activar modo claro</span>
            </button>
            <button
              type="button"
              onClick={requestLogout}
              className={ui.iconBtn}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <LogOut className="size-5" />
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1400px] px-5 py-7 sm:px-8 lg:px-10">
          {/* Encabezado de sección */}
          <div className="relative mb-7 overflow-hidden rounded-3xl border border-[#dbe7dd] bg-gradient-to-br from-white via-[#f3f8f4] to-[#e4f0e7] p-6 shadow-sm dark:border-[#2d3b32] dark:from-[#18211c] dark:via-[#17231c] dark:to-[#1c3327] sm:p-8">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-10 size-44 rounded-full bg-[#2c6048]/10 dark:bg-[#a8d5b3]/10"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-14 right-24 size-32 rounded-full bg-[#2c6048]/5 dark:bg-[#a8d5b3]/5"
            />
            <ActiveIcon
              aria-hidden
              className="pointer-events-none absolute right-6 top-1/2 hidden size-24 -translate-y-1/2 text-[#2c6048]/10 dark:text-[#a8d5b3]/10 sm:block"
            />

            <div className="relative flex items-start gap-4">
              <div
                className={`hidden size-12 shrink-0 items-center justify-center rounded-2xl shadow-sm sm:flex ${ui.chip}`}
              >
                <ActiveIcon className="size-6" />
              </div>

              <div className="max-w-3xl">
                <h2 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                  {current.title ?? current.label}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {current.description}
                </p>
              </div>
            </div>
          </div>

          {renderSection(active)}
        </main>
      </div>

      {confirm && (
        <ConfirmDialog state={confirm} onCancel={() => setConfirm(null)} onConfirm={confirmLeave} busy={leaving} error={leaveError} />
      )}
    </div>
  )
}
