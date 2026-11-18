'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  ChevronRight,
  CircleHelp,
  DollarSign,
  LogOut,
  Menu,
  Repeat,
  Sprout,
  Truck,
  Wheat,
  X,
} from 'lucide-react'
import { CropsManager } from '@/components/crops-manager'
import {
  ProductionRecords,
  ProductionSummary,
} from '@/components/production-records'

/* ───────────────────────── Datos ───────────────────────── */

const sections = [
  { id: 'resumen', label: 'Resumen', icon: BarChart3 },
  { id: 'cosechas', label: 'Cosechas', icon: Wheat },
  { id: 'envios', label: 'Envíos', icon: Truck },
  { id: 'costos', label: 'Costos', icon: DollarSign },
  { id: 'cultivos', label: 'Cultivos y lotes', icon: Sprout },
]

const sectionCopy: Record<string, { title: string; description: string }> = {
  resumen: {
    title: 'Resumen de producción',
    description:
      'Indicadores generales de producción agrícola y movimientos registrados.',
  },
  cosechas: {
    title: 'Cosechas',
    description:
      'Registra la producción obtenida, su precio estimado y las mermas asociadas. Consulta el historial por fechas y cultivo.',
  },
  costos: {
    title: 'Costos de producción',
    description:
      'Registra los gastos de la operación agrícola y consulta su historial.',
  },
  envios: {
    title: 'Envíos',
    description:
      'Agrupa varios productos en un mismo envío y registra las cantidades y precios estimados de cada uno.',
  },
  cultivos: {
    title: 'Cultivos',
    description:
      'Administra los cultivos, variedades, unidades y áreas productivas disponibles.',
  },
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
  onConfirm: () => void
} | null

function ConfirmDialog({
  state,
  onCancel,
}: {
  state: NonNullable<ConfirmState>
  onCancel: () => void
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ws-confirm-title"
        aria-describedby="ws-confirm-desc"
        onClick={(event) => event.stopPropagation()}
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

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-[#cfdcd1] px-4 py-2 text-sm font-medium transition hover:bg-[#eef5ef] dark:border-[#34453a] dark:hover:bg-[#223027]"
          >
            Cancelar
          </button>
          <button
            type="button"
            autoFocus
            onClick={state.onConfirm}
            className="rounded-xl bg-[#2c6048] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#234d39] focus:outline-none focus:ring-2 focus:ring-[#b8d8bf]"
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────── Componente principal ───────────────────── */

export function ProductionWorkspace() {
  const router = useRouter()
  const [active, setActive] = useState('resumen')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmState>(null)

  const copy = sectionCopy[active]
  const current = sections.find((item) => item.id === active)
  const ActiveIcon = current?.icon ?? BarChart3

  /* Bloquea el scroll del fondo y permite cerrar el menú con Esc */
  useEffect(() => {
    if (!mobileOpen) return

    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', onKey)

    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [mobileOpen])

  function leave(config: { title: string; description: string; label: string }) {
    setMobileOpen(false)
    setConfirm({
      title: config.title,
      description: config.description,
      confirmLabel: config.label,
      onConfirm: () => {
        setConfirm(null)
        router.push('/')
      },
    })
  }

  function requestSwitchProfile() {
    leave({
      title: 'Cambiar de perfil',
      description:
        'Saldrás de la producción agrícola y volverás a la selección de perfil. Los datos ya registrados se conservan.',
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
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-[#dbe5db] bg-white px-4 py-5 shadow-xl transition-transform dark:border-[#29362f] dark:bg-[#141c18] lg:translate-x-0 lg:shadow-none ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
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
                Producción agrícola
              </p>
            </div>
          </div>

          <button
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
          aria-label="Navegación de producción"
        >
          {sections.map(({ id, label, icon: Icon }) => {
            const isActive = active === id

            return (
              <button
                key={id}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => {
                  setActive(id)
                  setMobileOpen(false)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
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
              </button>
            )
          })}
        </nav>

        <div className="mt-auto rounded-2xl border border-[#dbe7dd] bg-gradient-to-br from-[#eef5ef] to-[#e1eee4] p-4 dark:border-[#2d3b32] dark:from-[#1c3327] dark:to-[#18281f]">
          <div className="mb-3 flex size-9 items-center justify-center rounded-xl bg-white text-[#2c6048] shadow-sm dark:bg-[#284935] dark:text-[#c9e7d0]">
            <CircleHelp className="size-5" />
          </div>
          <p className="text-sm font-semibold">¿Necesitas ayuda?</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Los registros se mantienen separados por tipo de movimiento. Las
            mermas quedan vinculadas a su cosecha de origen.
          </p>
        </div>
      </aside>

      {mobileOpen && (
        <button
          aria-label="Cerrar navegación"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] lg:hidden"
        />
      )}

      {/* ───── Contenido ───── */}
      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[#dbe5db] bg-[#f4f7f3]/85 px-5 backdrop-blur-xl dark:border-[#29362f] dark:bg-[#0f1512]/85 sm:px-8">
          <div className="flex items-center gap-3">
            <button
              aria-label="Abrir menú"
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
                Producción agrícola
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium sm:inline-flex ${ui.chip}`}
            >
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#2c6048] opacity-50 dark:bg-[#a8d5b3]" />
                <span className="relative inline-flex size-2 rounded-full bg-[#2c6048] dark:bg-[#a8d5b3]" />
              </span>
              Perfil activo
            </span>

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
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#2c6048] dark:text-[#a8d5b3]">
                  {current?.label}
                </p>
                <h2 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                  {copy.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {copy.description}
                </p>
              </div>
            </div>
          </div>

          {active === 'resumen' ? (
            <ProductionSummary />
          ) : active === 'cultivos' ? (
            <CropsManager />
          ) : (
            <ProductionRecords active={active} />
          )}
        </main>
      </div>

      {confirm && (
        <ConfirmDialog state={confirm} onCancel={() => setConfirm(null)} />
      )}
    </div>
  )
}