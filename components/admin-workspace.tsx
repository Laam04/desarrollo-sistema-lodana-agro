'use client'

import Link from 'next/link'
import useSWR from 'swr'
import {
  Activity,
  ArrowRight,
  BarChart3,
  FileBarChart2,
  FileSearch,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Store,
  Trash2,
  Truck,
  Wheat,
} from 'lucide-react'
import { AgroWorkspace } from '@/components/agro-workspace'
import { BrandLoader } from '@/components/brand-loader'
import { AdminAccessPanel } from '@/components/admin-access'
import { AdminAuditPanel } from '@/components/admin-audit'
import { AdminOperationsPanel } from '@/components/admin-operations'
import { AdminSettingsPanel } from '@/components/admin-settings'
import { MarketError, marketUi } from '@/components/market-ui'
import { productionFetch } from '@/lib/production-client'
import { units, usd } from '@/lib/market-data'

type OverviewResponse = {
  generatedAt: string
  ecuadorDate: string
  pendingAutomatedPeriods: number
  kpis: {
    crops: { active: number; inactive: number; units: number; zones: number }
    harvests: { total: number; last30Days: number; activeLosses: number }
    costs: { currentMonthUsd: number; currentMonthCount: number }
    shipments: { pending: number; partial: number; received: number; withDifferences: number; cancelled: number }
    market: { sales30dUsd: number; sales30dCount: number; cancelled30dCount: number }
    trash: { recoverable: number }
    security: { totalProfiles: number; disabledProfiles: number; activeSessions: number; lockedClients: number }
    reports: {
      total: number
      automatic: number
      manual: number
      failed: number
      autoWeeklyEnabled: boolean
      autoMonthlyEnabled: boolean
      lastRun: {
        id: string
        source: string
        status: string
        createdCount: number
        failedCount: number
        startedAt: string
      } | null
    }
  }
  modules: { id: string; name: string; href: string; status: string; detail: string }[]
  recentActivity: { id: string; entity: string; entityId: string; action: string; actorLabel: string; createdAt: string }[]
}

const dtFmt = new Intl.DateTimeFormat('es-EC', {
  timeZone: 'America/Guayaquil',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function AdminOverviewSection() {
  const { data, error, isLoading, mutate } = useSWR<OverviewResponse>('/api/admin/overview', productionFetch)

  if (error) return <MarketError message={error.message} retry={() => mutate()} />
  if (isLoading || !data) {
    return (
      <BrandLoader
        variant="section"
        message="Cargando indicadores administrativos…"
        subtitle="Supervisión e integridad del sistema"
      />
    )
  }

  const { kpis } = data
  const cards = [
    {
      label: 'Cultivos registrados',
      value: `${kpis.crops.active} activos`,
      detail: `${kpis.crops.inactive} inactivos · ${kpis.crops.zones} zonas · ${kpis.crops.units} unidades`,
      icon: Wheat,
    },
    {
      label: 'Cosechas y mermas',
      value: units(kpis.harvests.total),
      detail: `${kpis.harvests.last30Days} cosechas (30d) · ${kpis.harvests.activeLosses} mermas activas`,
      icon: Activity,
    },
    {
      label: 'Despachos por atender',
      value: String(kpis.shipments.pending + kpis.shipments.partial),
      detail: `${kpis.shipments.pending} en tránsito · ${kpis.shipments.partial} parciales · ${kpis.shipments.withDifferences} con dif.`,
      icon: Truck,
    },
    {
      label: 'Ventas Agro Market (30d)',
      value: usd(kpis.market.sales30dUsd),
      detail: `${kpis.market.sales30dCount} activas · ${kpis.market.cancelled30dCount} anuladas`,
      icon: Store,
    },
    {
      label: 'Reportes automáticos',
      value: `${kpis.reports.total} informes`,
      detail: `${kpis.reports.automatic} auto · ${kpis.reports.manual} manuales · ${data.pendingAutomatedPeriods} pendientes`,
      icon: FileBarChart2,
    },
    {
      label: 'Seguridad y papelera',
      value: `${kpis.security.activeSessions} sesiones`,
      detail: `${kpis.security.lockedClients} bloqueos · ${kpis.trash.recoverable} en papelera`,
      icon: Trash2,
    },
  ]

  return (
    <div className="grid gap-6">
      {/* Tarjetas KPI de supervisión */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ label, value, detail, icon: Icon }) => (
          <article key={label} className={`${marketUi.panel} p-5`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
              </div>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[#2c6048] dark:bg-[#234634] dark:text-[#c9e7d0]">
                <Icon className="size-5" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-2.5 text-xs text-muted-foreground">{detail}</p>
          </article>
        ))}
      </section>

      {/* Estado de módulos + accesos directos */}
      <section className={marketUi.panel}>
        <div className={`${marketUi.header} flex flex-wrap items-center justify-between gap-2`}>
          <h3 className="text-base font-semibold">Estado general y acceso a módulos</h3>
          <span className="text-xs text-muted-foreground">Fecha operativa (Ecuador): {data.ecuadorDate}</span>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {data.modules.map((mod) => (
            <Link
              key={mod.id}
              href={mod.href}
              className="group flex flex-col justify-between rounded-2xl border border-border bg-background/60 p-4 transition hover:border-[#2c6048]/60 hover:bg-emerald-50/30 dark:hover:bg-[#1f2e25]"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-semibold group-hover:text-[#2c6048] dark:group-hover:text-[#a8d5b3]">{mod.name}</h4>
                  <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-[#2c6048]" />
                </div>
                <span className="mt-2 inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                  {mod.status}
                </span>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{mod.detail}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Actividad reciente */}
      <section className={marketUi.panel}>
        <div className={`${marketUi.header} flex flex-wrap items-center justify-between gap-2`}>
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-[#2c6048] dark:text-[#a8d5b3]" />
            <h3 className="text-base font-semibold">Actividad reciente del sistema</h3>
          </div>
          <Link href="/administracion?seccion=auditoria" className="text-xs font-semibold text-[#2c6048] hover:underline dark:text-[#a8d5b3]">
            Ver auditoría completa
          </Link>
        </div>
        <div className="overflow-x-auto p-4">
          {data.recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin registros recientes en auditoría.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className={marketUi.tableHead}>
                  <th className="px-3 py-2">Fecha y hora</th>
                  <th className="px-3 py-2">Perfil</th>
                  <th className="px-3 py-2">Acción</th>
                  <th className="px-3 py-2">Entidad</th>
                  <th className="px-3 py-2">Referencia</th>
                </tr>
              </thead>
              <tbody>
                {data.recentActivity.map((item) => (
                  <tr key={item.id} className={marketUi.row}>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{dtFmt.format(new Date(item.createdAt))}</td>
                    <td className="px-3 py-2 font-medium">{item.actorLabel}</td>
                    <td className="px-3 py-2 font-mono text-xs">{item.action}</td>
                    <td className="px-3 py-2">{item.entity}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{item.entityId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}

const sections = [
  {
    id: 'resumen',
    label: 'Dashboard',
    icon: LayoutDashboard,
    title: 'Supervisión administrativa',
    description: 'Estado general de Lodana Agro, indicadores operativos, accesos directos a módulos y actividad reciente.',
  },
  {
    id: 'operaciones',
    label: 'Operaciones',
    icon: Truck,
    title: 'Supervisión de operaciones e integridad',
    description: 'Control de despachos pendientes, diferencias de entrega, operaciones anuladas, papelera y verificaciones de integridad.',
  },
  {
    id: 'accesos',
    label: 'Accesos y perfiles',
    icon: ShieldCheck,
    title: 'Gestión de acceso y perfiles',
    description: 'Administra el estado de habilitación, actualización segura de PIN, sesiones activas y bloqueos por intentos fallidos.',
  },
  {
    id: 'auditoria',
    label: 'Auditoría',
    icon: FileSearch,
    title: 'Registro de auditoría',
    description: 'Consulta inmutable de operaciones registradas por entidad, perfil y fecha.',
  },
  {
    id: 'configuracion',
    label: 'Configuración',
    icon: Settings,
    title: 'Configuración general',
    description: 'Identidad institucional para reportes y parámetros de generación automática periódica.',
  },
] as const

function renderSection(active: string) {
  if (active === 'operaciones') return <AdminOperationsPanel />
  if (active === 'accesos') return <AdminAccessPanel />
  if (active === 'auditoria') return <AdminAuditPanel />
  if (active === 'configuracion') return <AdminSettingsPanel />
  return <AdminOverviewSection />
}

export function AdminWorkspace() {
  return (
    <AgroWorkspace
      title="Administración"
      path="/administracion"
      sections={sections}
      renderSection={renderSection}
    />
  )
}
