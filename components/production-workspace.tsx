'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  BarChart3,
  DollarSign,
  Home,
  LayoutGrid,
  ShieldCheck,
  Sparkles,
  Sprout,
  Trash2,
  TrendingDown,
  Truck,
  Wheat,
} from 'lucide-react'
import { AgroWorkspace } from '@/components/agro-workspace'
import { AnalyticsDashboard } from '@/components/analytics-dashboard'
import { CropsManager } from '@/components/crops-manager'
import { ProductionEasyHome, ProductionEasySection, type EasySectionId } from '@/components/production-easy'
import { ProductionRecords } from '@/components/production-records'
import { ProductionTrash } from '@/components/production-trash'
import type { Profile } from '@/lib/profile-session'

type ViewMode = 'easy' | 'full'

const STORAGE_KEY = 'lodana-production-mode'

const easySections = [
  {
    id: 'inicio',
    label: 'Inicio',
    icon: Home,
    title: '¿Qué vas a hacer hoy?',
    description: 'Elige una tarea para anotar el trabajo diario de la finca.',
  },
  {
    id: 'cosechas',
    label: 'Anotar cosecha',
    icon: Wheat,
    title: 'Anotar cosecha',
    description: 'Registra lo que cosechaste hoy paso a paso.',
  },
  {
    id: 'mermas',
    label: 'Daños y pérdidas',
    icon: TrendingDown,
    title: 'Daños y pérdidas',
    description: 'Anota producto dañado, plagas o pérdidas en campo.',
  },
  {
    id: 'envios',
    label: 'Enviar a Agro Market',
    icon: Truck,
    title: 'Enviar a Agro Market',
    description: 'Selecciona el producto disponible y confirma el envío.',
  },
  {
    id: 'costos',
    label: 'Anotar gasto',
    icon: DollarSign,
    title: 'Anotar gasto',
    description: 'Registra compras de insumos, jornales o gastos de la finca.',
  },
  {
    id: 'resumen',
    label: 'Cómo va la finca',
    icon: BarChart3,
    title: 'Cómo va la finca',
    description: 'Consulta las gráficas y totales de cosechas, pérdidas y envíos.',
  },
  {
    id: 'cultivos',
    label: 'Mis cultivos y zonas',
    icon: Sprout,
    title: 'Mis cultivos y zonas',
    description: 'Administra los cultivos, variedades, unidades y zonas de la finca.',
  },
  {
    id: 'papelera',
    label: 'Borrados recientes',
    icon: Trash2,
    title: 'Borrados recientes',
    description: 'Recupera registros borrados por error hasta durante 60 días.',
  },
] as const

const fullSections = [
  {
    id: 'resumen',
    label: 'Resumen',
    icon: BarChart3,
    title: 'Análisis de producción',
    description: 'Consulta la evolución de la cosecha, las mermas y los movimientos de Agro Market por cultivo y unidad.',
  },
  {
    id: 'cosechas',
    label: 'Cosechas',
    icon: Wheat,
    description: 'Registra la producción obtenida, su precio estimado y las mermas asociadas. Consulta el historial por fechas y cultivo.',
  },
  {
    id: 'mermas',
    label: 'Pérdidas / Mermas',
    icon: TrendingDown,
    title: 'Pérdidas y mermas',
    description: 'Registra pérdidas asociadas a una cosecha y consulta su historial.',
  },
  {
    id: 'envios',
    label: 'Envíos',
    icon: Truck,
    description: 'Agrupa varios productos en un mismo envío y registra las cantidades y precios estimados de cada uno.',
  },
  {
    id: 'costos',
    label: 'Costos',
    icon: DollarSign,
    title: 'Costos de producción',
    description: 'Registra los gastos de la operación agrícola y consulta su historial.',
  },
  {
    id: 'cultivos',
    label: 'Cultivos y zonas',
    icon: Sprout,
    title: 'Cultivos',
    description: 'Administra los cultivos, variedades, unidades y zonas disponibles.',
  },
  {
    id: 'papelera',
    label: 'Papelera',
    icon: Trash2,
    description: 'Recupera los registros eliminados y consulta qué datos se restaurarán con ellos.',
  },
] as const

const mobileTabs = [
  { id: 'inicio', href: '/lodana', label: 'Inicio', icon: Home },
  { id: 'cosechas', href: '/lodana?seccion=cosechas', label: 'Cosecha', icon: Wheat },
  { id: 'mermas', href: '/lodana?seccion=mermas', label: 'Pérdidas', icon: TrendingDown },
  { id: 'envios', href: '/lodana?seccion=envios', label: 'Envíos', icon: Truck },
  { id: 'costos', href: '/lodana?seccion=costos', label: 'Gastos', icon: DollarSign },
] as const

function isEasyDailySection(id: string): id is EasySectionId {
  return id === 'cosechas' || id === 'mermas' || id === 'envios' || id === 'costos'
}

function ModeToggle({
  mode,
  onChange,
  compact = false,
}: {
  mode: ViewMode
  onChange: (next: ViewMode) => void
  compact?: boolean
}) {
  return (
    <div
      role="group"
      aria-label="Modo de pantalla de producción agrícola"
      className={`inline-flex rounded-xl border border-[#cfdcd1] bg-[#eef5ef] p-1 dark:border-[#34453a] dark:bg-[#141d18] ${
        compact ? '' : 'w-full'
      }`}
    >
      <button
        type="button"
        aria-pressed={mode === 'easy'}
        onClick={() => onChange('easy')}
        className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
          compact ? '' : 'flex-1'
        } ${
          mode === 'easy'
            ? 'bg-[#2c6048] text-white shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Sparkles className="size-3.5" aria-hidden />
        Fácil
      </button>
      <button
        type="button"
        aria-pressed={mode === 'full'}
        onClick={() => onChange('full')}
        className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
          compact ? '' : 'flex-1'
        } ${
          mode === 'full'
            ? 'bg-[#2c6048] text-white shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <LayoutGrid className="size-3.5" aria-hidden />
        Completo
      </button>
    </div>
  )
}

export function ProductionWorkspace({ profile = 'production' }: { profile?: Profile }) {
  const params = useSearchParams()
  const [mode, setMode] = useState<ViewMode>('easy')

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved === 'easy' || saved === 'full') setMode(saved)
    } catch {
      // Ignora restricciones de almacenamiento local
    }
  }, [])

  function updateMode(next: ViewMode) {
    setMode(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Ignora restricciones de almacenamiento local
    }
  }

  const sections = mode === 'easy' ? easySections : fullSections
  const currentId =
    sections.find((item) => item.id === params.get('seccion'))?.id ?? sections[0].id
  const preselectedHarvestId = params.get('cosecha')

  const hideHero = mode === 'easy' && (currentId === 'inicio' || isEasyDailySection(currentId))

  function renderSection(active: string) {
    if (mode === 'easy') {
      if (active === 'inicio') return <ProductionEasyHome />
      if (isEasyDailySection(active)) {
        return (
          <ProductionEasySection
            key={`${active}:${preselectedHarvestId ?? ''}`}
            section={active}
            preselectedHarvestId={active === 'mermas' ? preselectedHarvestId : null}
          />
        )
      }
    }

    if (active === 'resumen') return <AnalyticsDashboard />
    if (active === 'cultivos') return <CropsManager />
    if (active === 'papelera') return <ProductionTrash />
    return <ProductionRecords key={active} active={active} />
  }

  const mobileDock =
    mode === 'easy' ? (
      <nav
        aria-label="Acceso rápido de producción"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t-2 border-[#d5e3d7] bg-white/95 px-1 py-1.5 backdrop-blur-md dark:border-[#29362f] dark:bg-[#141c18]/95 lg:hidden"
      >
        {mobileTabs.map(({ id, href, label, icon: Icon }) => {
          const isActive = currentId === id
          return (
            <Link
              key={id}
              href={href}
              prefetch={false}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold transition ${
                isActive
                  ? 'bg-[#e4f0e7] text-[#1f4834] dark:bg-[#234634] dark:text-[#d5f0dc]'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="size-5" aria-hidden />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>
    ) : undefined

  const sidebarExtra = (
    <div className="grid gap-2.5">
      <div className="grid gap-1.5">
        <span className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Vista de pantalla
        </span>
        <ModeToggle mode={mode} onChange={updateMode} />
      </div>
      {profile === 'admin' && (
        <Link
          href="/administracion"
          prefetch={false}
          className="flex items-center gap-2 rounded-xl border border-[#cfdcd1] bg-[#f7fbf7] px-3 py-2 text-xs font-semibold text-[#24523b] transition hover:bg-[#e4f0e7] dark:border-[#34453a] dark:bg-[#1a2620] dark:text-[#a8d5b3]"
        >
          <ShieldCheck className="size-4 shrink-0" aria-hidden />
          Volver a Administración
        </Link>
      )}
    </div>
  )

  return (
    <AgroWorkspace
      title="Producción agrícola"
      path="/lodana"
      sections={sections}
      renderSection={renderSection}
      hideHero={hideHero}
      headerExtra={
        <div className="hidden sm:block">
          <ModeToggle mode={mode} onChange={updateMode} compact />
        </div>
      }
      sidebarExtra={sidebarExtra}
      mobileDock={mobileDock}
    />
  )
}
