
'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  ArrowLeft,
  BarChart3,
  ChevronRight,
  CircleHelp,
  DollarSign,
  Menu,
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

const sections = [
  { id: 'resumen', label: 'Resumen', icon: BarChart3 },
  { id: 'cosechas', label: 'Cosechas', icon: Wheat },
  { id: 'envios', label: 'Envíos', icon: Truck },
  { id: 'costos', label: 'Costos', icon: DollarSign },
  { id: 'cultivos', label: 'Cultivos y lotes', icon: Sprout },
]

const sectionCopy: Record<
  string,
  { title: string; description: string }
> = {
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
    title: 'Cultivos y lotes',
    description:
      'Administra los cultivos, variedades, unidades y áreas productivas disponibles.',
  },
}

export function ProductionWorkspace() {
  const [active, setActive] = useState('resumen')
  const [mobileOpen, setMobileOpen] = useState(false)

  const copy = sectionCopy[active]
  const activeLabel = sections.find((item) => item.id === active)?.label

  return (
    <div className="min-h-screen bg-[#f7f8f5] text-[#20302b] dark:bg-[#111715] dark:text-[#edf2ed]">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-[#dfe7df] bg-[#fbfcfa] px-4 py-5 transition-transform dark:border-[#29362f] dark:bg-[#151d19] lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#2c6048] text-white">
              <Sprout />
            </div>
            <div>
              <p className="font-semibold">Lodana Agro</p>
              <p className="text-[11px] text-muted-foreground">
                Producción agrícola
              </p>
            </div>
          </div>

          <button
            aria-label="Cerrar menú"
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted lg:hidden"
          >
            <X />
          </button>
        </div>

        <Link
          href="/"
          className="mt-8 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft />
          Cambiar de perfil
        </Link>

        <div className="mt-7 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Producción agrícola
        </div>

        <nav
          className="mt-3 flex flex-col gap-1"
          aria-label="Navegación de producción"
        >
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setActive(id)
                setMobileOpen(false)
              }}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                active === id
                  ? 'bg-[#e4f0e7] font-semibold text-[#24583f] dark:bg-[#234634] dark:text-[#c9e7d0]'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon />
              <span className="flex-1">{label}</span>
              {active === id && <ChevronRight className="size-4" />}
            </button>
          ))}
        </nav>

        <div className="mt-auto rounded-2xl bg-[#eef5ef] p-4 dark:bg-[#1c3327]">
          <div className="mb-3 flex size-9 items-center justify-center rounded-xl bg-white text-[#2c6048] dark:bg-[#284935]">
            <CircleHelp />
          </div>
          <p className="text-sm font-semibold">¿Necesitas ayuda?</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Los registros se mantienen separados por tipo de movimiento.
            Las mermas quedan vinculadas a su cosecha de origen.
          </p>
        </div>
      </aside>

      {mobileOpen && (
        <button
          aria-label="Cerrar navegación"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/25 lg:hidden"
        />
      )}

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[#e4ebe4] bg-[#f7f8f5]/90 px-5 backdrop-blur-xl dark:border-[#29362f] dark:bg-[#111715]/90 sm:px-8">
          <div className="flex items-center gap-3">
            <button
              aria-label="Abrir menú"
              onClick={() => setMobileOpen(true)}
              className="rounded-xl p-2 text-muted-foreground hover:bg-muted lg:hidden"
            >
              <Menu />
            </button>
            <div>
              <p className="text-sm text-muted-foreground">
                Espacio de trabajo
              </p>
              <h1 className="text-lg font-semibold sm:text-xl">
                Producción agrícola
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden rounded-full bg-[#e4f0e7] px-3 py-1.5 text-xs font-medium text-[#24583f] dark:bg-[#234634] dark:text-[#c9e7d0] sm:block">
              Perfil activo
            </span>
            <Link
              href="/"
              className="rounded-xl p-2 text-muted-foreground hover:bg-muted"
              aria-label="Cerrar sesión"
            >
              <ArrowLeft />
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-[1400px] px-5 py-7 sm:px-8 lg:px-10">
          <div className="mb-7">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#2c6048]">
              {activeLabel}
            </p>
            <h2 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              {copy.title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              {copy.description}
            </p>
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
    </div>
  )
}
