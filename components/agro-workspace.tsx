'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  ChevronRight,
  Home,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Repeat,
  Sun,
  X,
  type LucideIcon,
} from 'lucide-react'
import { FacivitecHorizontal, FacivitecMark } from '@/components/brand-logo'
import {
  hideBrandTransition,
  triggerBrandTransition,
} from '@/components/route-transition-overlay'
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
  kind: 'logout' | 'switch'
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

  const isSwitch = state.kind === 'switch'
  const ActionIcon = isSwitch ? Repeat : LogOut

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-labelledby="ws-confirm-title"
      aria-describedby="ws-confirm-desc"
      className="m-auto w-[calc(100%-2rem)] max-w-md bg-transparent p-0 text-foreground backdrop:bg-black/55 backdrop:backdrop-blur-sm"
      onCancel={(event) => { event.preventDefault(); if (!busy) onCancel() }}
      onClick={(event) => { if (event.target === event.currentTarget && !busy) onCancel() }}
    >
      <div className="relative overflow-hidden rounded-3xl border border-[#d5e3d7] bg-white shadow-[0_24px_60px_rgba(16,32,24,0.22)] dark:border-[#2a3b31] dark:bg-[#141d18] dark:shadow-[0_24px_60px_rgba(0,0,0,0.55)]">
        {/* Línea superior sutil de marca FACIVITEC (verde → índigo) */}
        <div
          aria-hidden
          className="h-1 w-full bg-gradient-to-r from-[#079341] via-[#2c6048] to-[#2a2361] dark:from-[#1acc72] dark:via-[#2c6048] dark:to-[#8b95f6]"
        />

        <div className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-[#cfe0d2] bg-[#eef6f0] text-[#1f5e42] dark:border-[#2d4537] dark:bg-[#1b2d23] dark:text-[#8fd1a6]">
                <ActionIcon className="size-5" aria-hidden />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2c6048] dark:text-[#8fd1a6]">
                  Lodana Agro
                </p>
                <h4 id="ws-confirm-title" className="mt-0.5 text-lg font-bold tracking-tight text-foreground">
                  {state.title}
                </h4>
              </div>
            </div>

            <button
              type="button"
              disabled={busy}
              aria-label="Cerrar ventana"
              onClick={onCancel}
              className="rounded-xl p-2 text-muted-foreground transition hover:bg-[#eef5ef] hover:text-foreground disabled:opacity-50 dark:hover:bg-[#223027]"
            >
              <X className="size-4.5" aria-hidden />
            </button>
          </div>

          <p
            id="ws-confirm-desc"
            className="mt-4 text-sm leading-6 text-muted-foreground"
          >
            {state.description}
          </p>

          {error && (
            <p role="alert" className="mt-4 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2.5 border-t border-[#e3ece4] bg-[#f7fbf8] px-6 py-4 dark:border-[#243229] dark:bg-[#101713] sm:flex-row sm:justify-end">
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={onCancel}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#cfdcd1] bg-white px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-[#eef5ef] disabled:opacity-60 dark:border-[#34453a] dark:bg-[#18211c] dark:hover:bg-[#223027]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#2c6048] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#234d39] focus:outline-none focus:ring-2 focus:ring-[#b8d8bf] disabled:opacity-60"
          >
            <ActionIcon className="size-4" aria-hidden />
            {busy ? (isSwitch ? 'Cambiando…' : 'Cerrando…') : state.confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}

/* ───────────────────── Componente principal ───────────────────── */

const SIDEBAR_STORAGE_KEY = 'lodana-sidebar-collapsed'

export function AgroWorkspace({
  title, path, sections, renderSection, headerExtra, sidebarExtra, mobileDock, hideHero = false,
}: {
  title: string
  path: string
  sections: readonly [Section, ...Section[]]
  renderSection: (sectionId: string) => ReactNode
  headerExtra?: ReactNode
  sidebarExtra?: ReactNode
  mobileDock?: ReactNode
  hideHero?: boolean
}) {
  const params = useSearchParams()
  const { resolvedTheme, setTheme } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [desktopCollapsed, setDesktopCollapsed] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState('')
  const closeMenu = useRef<HTMLButtonElement>(null)

  const current = sections.find((item) => item.id === params.get('seccion')) ?? sections[0]
  const active = current.id
  const ActiveIcon = current.icon

  useEffect(() => {
    try {
      if (window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true') {
        setDesktopCollapsed(true)
      }
    } catch {
      // Ignora restricciones de almacenamiento local
    }
  }, [])

  function setSidebarCollapsed(next: boolean) {
    setDesktopCollapsed(next)
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next))
    } catch {
      // Ignora restricciones de almacenamiento local
    }
  }

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

  function leave(config: { kind: 'logout' | 'switch'; title: string; description: string; label: string }) {
    setMobileOpen(false)
    setLeaveError('')
    setConfirm({
      kind: config.kind,
      title: config.title,
      description: config.description,
      confirmLabel: config.label,
    })
  }

  async function confirmLeave() {
    if (leaving) return
    const pendingConfirm = confirm
    const transitionLabel =
      pendingConfirm?.kind === 'switch'
        ? 'Cambiando de perfil…'
        : 'Cerrando sesión…'
    setLeaving(true)
    setLeaveError('')
    setConfirm(null)
    triggerBrandTransition(transitionLabel)
    try {
      await productionFetch('/api/profile-logout', { method: 'POST' })
      window.location.replace('/')
    } catch (error) {
      hideBrandTransition()
      setConfirm(pendingConfirm)
      setLeaveError(error instanceof Error ? error.message : 'No se pudo cerrar la sesión.')
      setLeaving(false)
    }
  }

  function requestSwitchProfile() {
    leave({
      kind: 'switch',
      title: 'Cambiar de perfil',
      description: 'Saldrás de este espacio de trabajo para elegir otro perfil en la portada.',
      label: 'Cambiar de perfil',
    })
  }

  function requestLogout() {
    leave({
      kind: 'logout',
      title: 'Cerrar sesión',
      description: 'Se cerrará tu sesión actual en este espacio de trabajo y volverás al inicio.',
      label: 'Cerrar sesión',
    })
  }

  return (
    <div className="min-h-screen bg-[#f4f7f3] text-[#20302b] dark:bg-[#0f1512] dark:text-[#edf2ed]">
      {/* ───── Barra lateral (ocultable en teléfono y escritorio) ───── */}
      <aside
        id="production-navigation"
        aria-label={`Menú de ${title}`}
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[88vw] flex-col overflow-y-auto border-r border-[#dbe5db] bg-white px-4 py-5 shadow-xl transition-transform duration-200 dark:border-[#29362f] dark:bg-[#141c18] lg:shadow-none ${
          mobileOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'
        } ${
          desktopCollapsed ? 'lg:invisible lg:-translate-x-full' : 'lg:visible lg:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between px-2">
          <Link
            href={path}
            prefetch={false}
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#b8d8bf]"
          >
            <FacivitecMark size="md" glow />
            <div>
              <p className="font-semibold leading-tight">Lodana Agro</p>
              <p className="text-[11px] text-muted-foreground">
                {title}
              </p>
            </div>
          </Link>

          <button
            type="button"
            ref={closeMenu}
            aria-label="Cerrar menú"
            title="Cerrar menú"
            onClick={() => setMobileOpen(false)}
            className={`${ui.iconBtn} lg:hidden`}
          >
            <X className="size-5" />
          </button>

          <button
            type="button"
            aria-label="Ocultar menú lateral"
            title="Ocultar menú lateral"
            onClick={() => setSidebarCollapsed(true)}
            className={`${ui.iconBtn} hidden lg:inline-flex`}
          >
            <PanelLeftClose className="size-5" />
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

        {sidebarExtra && <div className="mt-3">{sidebarExtra}</div>}

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

        <div className="mt-auto pt-6">
          <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-[#e3ece4] bg-[#f7fbf7]/80 px-3 py-3 dark:border-[#243229] dark:bg-[#111915]">
            <FacivitecHorizontal className="h-7 w-auto opacity-95" />
          </div>
        </div>
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
      <div
        className={`transition-[padding] duration-200 ${desktopCollapsed ? 'lg:pl-0' : 'lg:pl-72'}`}
        inert={mobileOpen}
      >
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-[#dbe5db] bg-[#f4f7f3]/90 px-3.5 backdrop-blur-xl dark:border-[#29362f] dark:bg-[#0f1512]/90 sm:h-[72px] sm:px-8">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <button
              type="button"
              aria-label="Abrir menú"
              aria-controls="production-navigation"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#cfdcd1] bg-white px-2.5 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-[#eef5ef] focus:outline-none focus:ring-2 focus:ring-[#b8d8bf] dark:border-[#34453a] dark:bg-[#18211c] dark:hover:bg-[#223027] lg:hidden"
            >
              <Menu className="size-5 shrink-0" aria-hidden />
              <span>Menú</span>
            </button>

            <button
              type="button"
              aria-label={desktopCollapsed ? 'Mostrar menú lateral' : 'Ocultar menú lateral'}
              title={desktopCollapsed ? 'Mostrar menú lateral' : 'Ocultar menú lateral'}
              aria-controls="production-navigation"
              aria-expanded={!desktopCollapsed}
              onClick={() => setSidebarCollapsed(!desktopCollapsed)}
              className="hidden min-h-10 items-center gap-1.5 rounded-xl border border-[#cfdcd1] bg-white px-3 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-[#eef5ef] focus:outline-none focus:ring-2 focus:ring-[#b8d8bf] dark:border-[#34453a] dark:bg-[#18211c] dark:hover:bg-[#223027] lg:inline-flex"
            >
              {desktopCollapsed ? (
                <>
                  <PanelLeftOpen className="size-4 shrink-0" aria-hidden />
                  <span>Menú</span>
                </>
              ) : (
                <>
                  <PanelLeftClose className="size-4 shrink-0" aria-hidden />
                  <span className="sr-only">Ocultar menú</span>
                </>
              )}
            </button>

            {active !== sections[0].id && (
              <Link
                href={path}
                prefetch={false}
                aria-label={sections[0].id === 'inicio' ? 'Volver al inicio' : `Volver a ${sections[0].label}`}
                className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border-2 border-[#2c6048] bg-[#e4f0e7] px-3 py-1.5 text-sm font-bold text-[#1f4834] shadow-sm transition hover:bg-[#2c6048] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#b8d8bf] dark:border-[#3d7a5b] dark:bg-[#1f3b2c] dark:text-[#d5f0dc] dark:hover:bg-[#2c6048] dark:hover:text-white"
              >
                {sections[0].id === 'inicio' ? (
                  <>
                    <Home className="size-4 shrink-0" aria-hidden />
                    <span className="hidden sm:inline">Volver al inicio</span>
                    <span className="sm:hidden">Inicio</span>
                  </>
                ) : (
                  <>
                    <ArrowLeft className="size-4 shrink-0" aria-hidden />
                    <span className="hidden sm:inline">{sections[0].label}</span>
                  </>
                )}
              </Link>
            )}

            <div className="min-w-0">
              <nav
                aria-label="Ruta de navegación"
                className="flex items-center gap-1 text-xs text-muted-foreground"
              >
                {active !== sections[0].id ? (
                  <Link
                    href={path}
                    prefetch={false}
                    className="truncate hover:text-foreground hover:underline"
                  >
                    {sections[0].label}
                  </Link>
                ) : (
                  <span className="truncate">Espacio de trabajo</span>
                )}
                <ChevronRight className="size-3 shrink-0" />
                <span className="truncate font-medium text-foreground">
                  {current?.label}
                </span>
              </nav>
              <h1 className="truncate text-base font-semibold sm:text-xl">
                {title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {headerExtra}
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

        <main className={`mx-auto max-w-[1400px] px-4 py-5 sm:px-8 sm:py-7 lg:px-10 ${mobileDock ? 'pb-28 lg:pb-10' : ''}`}>
          {/* Encabezado de sección */}
          {!hideHero && (
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
          )}

          {renderSection(active)}
        </main>
      </div>

      {mobileDock}

      {confirm && (
        <ConfirmDialog state={confirm} onCancel={() => setConfirm(null)} onConfirm={confirmLeave} busy={leaving} error={leaveError} />
      )}
    </div>
  )
}
