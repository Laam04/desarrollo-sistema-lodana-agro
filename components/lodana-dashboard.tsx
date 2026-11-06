'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  Boxes,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Leaf,
  Menu,
  PackageCheck,
  Plus,
  Search,
  Settings,
  Sprout,
  TrendingUp,
  Truck,
  Users,
  Warehouse,
  X,
} from 'lucide-react'

const navigation = [
  { label: 'Inicio', icon: LayoutDashboard, active: true },
  { label: 'Lodana', icon: Sprout, badge: '6' },
  { label: 'Agro Market', icon: Warehouse },
  { label: 'Consultas', icon: Search },
  { label: 'Reportes', icon: BarChart3 },
  { label: 'Administración', icon: Settings },
]

const quickActions = [
  { label: 'Nueva cosecha', icon: Sprout, tone: 'green' },
  { label: 'Registrar merma', icon: Activity, tone: 'amber' },
  { label: 'Registrar costo', icon: ClipboardList, tone: 'blue' },
  { label: 'Nuevo envío', icon: Truck, tone: 'violet' },
]

function EmptyCard({ title, description, icon: Icon }: { title: string; description: string; icon: typeof Sprout }) {
  return (
    <div className="flex min-h-35 flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/20 px-5 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-background text-muted-foreground shadow-sm ring-1 ring-border/60">
        <Icon data-icon="inline-start" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-55 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  )
}

export function LodanaDashboard() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeNav, setActiveNav] = useState('Inicio')
  const [dialog, setDialog] = useState<string | null>(null)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[#f7f8f5] text-[#20302b] dark:bg-[#111715] dark:text-[#edf2ed]">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-70 flex-col border-r border-[#dfe7df] bg-[#fbfcfa] px-4 py-5 transition-transform dark:border-[#29362f] dark:bg-[#151d19] lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#2c6048] text-white shadow-sm"><Leaf data-icon="inline-start" /></div>
            <div><p className="text-base font-semibold tracking-tight">Lodana Agro</p><p className="text-[11px] text-muted-foreground">Gestión agrícola</p></div>
          </div>
          <button aria-label="Cerrar menú" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted lg:hidden"><X data-icon="inline-start" /></button>
        </div>

        <div className="mt-9 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Espacios de trabajo</div>
        <nav className="mt-3 flex flex-col gap-1" aria-label="Navegación principal">
          {navigation.map(({ label, icon: Icon, badge }) => (
            <Link key={label} href={label === 'Inicio' ? '/' : `/${label.toLowerCase().replace(' ', '-')}`} onClick={() => { setActiveNav(label); setMobileOpen(false) }} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${activeNav === label ? 'bg-[#e4f0e7] font-semibold text-[#24583f] dark:bg-[#234634] dark:text-[#c9e7d0]' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
              <Icon data-icon="inline-start" /><span className="flex-1">{label}</span>{badge && <span className="rounded-md bg-background px-2 py-0.5 text-[10px] font-semibold ring-1 ring-border">{badge}</span>}
            </Link>
          ))}
        </nav>

        <div className="mt-auto rounded-2xl bg-[#eef5ef] p-4 dark:bg-[#1c3327]">
          <div className="mb-3 flex size-9 items-center justify-center rounded-xl bg-white text-[#2c6048] shadow-sm dark:bg-[#284935]"><CircleHelp data-icon="inline-start" /></div>
          <p className="text-sm font-semibold">¿Necesitas ayuda?</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Consulta la guía para registrar y consultar información.</p>
          <button className="mt-3 text-xs font-semibold text-[#2c6048] hover:underline dark:text-[#b8dfc1]">Abrir guía <ArrowUpRight className="ml-1 inline size-3" /></button>
        </div>
      </aside>

      {mobileOpen && <button aria-label="Cerrar navegación" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-black/25 lg:hidden" />}

      <div className="lg:pl-70">
        <header className="sticky top-0 z-20 flex h-18 items-center justify-between border-b border-[#e4ebe4] bg-[#f7f8f5]/90 px-5 backdrop-blur-xl dark:border-[#29362f] dark:bg-[#111715]/90 sm:px-8">
          <div className="flex items-center gap-3"><button aria-label="Abrir menú" onClick={() => setMobileOpen(true)} className="rounded-xl p-2 text-muted-foreground hover:bg-muted lg:hidden"><Menu data-icon="inline-start" /></button><div><p className="text-sm text-muted-foreground">Miércoles, 05 de noviembre de 2026</p><h1 className="text-lg font-semibold tracking-tight sm:text-xl">Buenos días, equipo</h1></div></div>
          <div className="relative flex items-center gap-2 sm:gap-4"><button aria-label="Notificaciones" onClick={() => setNotificationsOpen(!notificationsOpen)} className="relative rounded-xl p-2.5 text-muted-foreground hover:bg-muted"><Bell data-icon="inline-start" /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-[#d28b38]" /></button><div className="hidden h-8 w-px bg-border sm:block" /><button onClick={() => setUserOpen(!userOpen)} className="flex items-center gap-2 rounded-xl p-1.5 pr-2 hover:bg-muted"><div className="flex size-8 items-center justify-center rounded-lg bg-[#dcebe0] text-xs font-semibold text-[#2c6048]">EA</div><span className="hidden text-sm font-medium sm:block">Equipo admin</span><ChevronDown className="hidden size-4 text-muted-foreground sm:block" /></button>{notificationsOpen && <div className="absolute right-14 top-12 w-64 rounded-2xl border border-border bg-background p-4 shadow-xl"><p className="text-sm font-semibold">Notificaciones</p><p className="mt-2 text-xs text-muted-foreground">No hay notificaciones nuevas.</p></div>}{userOpen && <div className="absolute right-0 top-12 w-48 rounded-2xl border border-border bg-background p-2 shadow-xl"><button onClick={() => setDialog('Perfil')} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted">Mi perfil</button><button onClick={() => setDialog('Configuración')} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted">Configuración</button></div>}</div>
        </header>

        <main className="mx-auto max-w-350 px-5 py-7 sm:px-8 lg:px-10">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#2c6048]">Resumen operativo</p><h2 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Panel general</h2><p className="mt-2 max-w-xl text-sm text-muted-foreground">Una vista clara del estado de la producción y los registros compartidos.</p></div><button onClick={() => setDialog('Nuevo registro')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2c6048] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#234d39]"><Plus data-icon="inline-start" />Nuevo registro</button></div>

          <section aria-label="Indicadores principales" className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[['Producción registrada', '0 kg', 'Sin cosechas este periodo', Sprout], ['Mermas registradas', '0 kg', 'Sin pérdidas reportadas', Activity], ['Costos del periodo', '$0.00', 'Sin costos registrados', TrendingUp], ['Recepciones Agro Market', '0', 'Sin recepciones este periodo', PackageCheck]].map(([label, value, note, Icon]) => <div key={label as string} className="rounded-2xl border border-[#e1e9e1] bg-white/80 p-5 shadow-[0_1px_2px_rgba(22,50,35,0.03)] dark:border-[#2d3b32] dark:bg-[#18211c]"><div className="flex items-start justify-between"><p className="text-xs font-medium text-muted-foreground">{label as string}</p><Icon className="size-4 text-[#588467]" /></div><p className="mt-4 text-2xl font-semibold tracking-tight">{value as string}</p><p className="mt-1 text-xs text-muted-foreground">{note as string}</p></div>)}
          </section>

          <section className="mt-7 grid gap-5 xl:grid-cols-[1.45fr_1fr]"><div className="rounded-2xl border border-[#e1e9e1] bg-white/80 p-5 dark:border-[#2d3b32] dark:bg-[#18211c]"><div className="flex items-start justify-between"><div><h3 className="font-semibold">Producción por periodo</h3><p className="mt-1 text-xs text-muted-foreground">Kilogramos de cosecha registrados</p></div><button className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Más opciones"><ChevronDown data-icon="inline-start" /></button></div><div className="mt-7"><EmptyCard title="Aún no hay datos de producción" description="Registra tu primera cosecha para comenzar a visualizar la evolución." icon={BarChart3} /></div></div><div className="rounded-2xl border border-[#e1e9e1] bg-white/80 p-5 dark:border-[#2d3b32] dark:bg-[#18211c]"><div className="flex items-start justify-between"><div><h3 className="font-semibold">Actividad reciente</h3><p className="mt-1 text-xs text-muted-foreground">Últimos movimientos del sistema</p></div><button className="text-xs font-semibold text-[#2c6048] hover:underline">Ver todo</button></div><div className="mt-7"><EmptyCard title="Sin actividad reciente" description="Las acciones registradas aparecerán aquí." icon={ClipboardList} /></div></div></section>

          <section className="mt-7"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-semibold">Accesos rápidos</h3><p className="mt-1 text-xs text-muted-foreground">Registra información sin salir del panel</p></div></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{quickActions.map(({ label, icon: Icon, tone }) => <button key={label} onClick={() => setDialog(label)} className="group flex items-center gap-3 rounded-2xl border border-[#e1e9e1] bg-white/80 p-4 text-left transition hover:-translate-y-0.5 hover:border-[#bdd5c2] hover:shadow-md dark:border-[#2d3b32] dark:bg-[#18211c]"><div className={`flex size-10 items-center justify-center rounded-xl ${tone === 'green' ? 'bg-[#e4f0e7] text-[#2c6048]' : tone === 'amber' ? 'bg-[#f8eedf] text-[#a56b23]' : tone === 'blue' ? 'bg-[#e6edf5] text-[#4d6f95]' : 'bg-[#eee8f7] text-[#77609a]'}`}><Icon data-icon="inline-start" /></div><span className="flex-1 text-sm font-medium">{label}</span><ArrowUpRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></button>)}</div></section>

          {dialog && <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-5"><div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#2c6048]">Acción</p><h2 className="mt-1 text-xl font-semibold">{dialog}</h2></div><button aria-label="Cerrar" onClick={() => setDialog(null)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><X /></button></div><p className="mt-3 text-sm leading-6 text-muted-foreground">Esta acción está conectada a la interfaz. El guardado de datos reales quedará disponible cuando el módulo y su persistencia sean implementados.</p><button onClick={() => setDialog(null)} className="mt-6 w-full rounded-xl bg-[#2c6048] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#234d39]">Entendido</button></div></div>}
+
+          <section className="mt-7 grid gap-5 md:grid-cols-3"><div className="rounded-2xl border border-[#e1e9e1] bg-white/80 p-5 dark:border-[#2d3b32] dark:bg-[#18211c]"><div className="flex size-9 items-center justify-center rounded-xl bg-[#e7eef5] text-[#56789b]"><Boxes data-icon="inline-start" /></div><h3 className="mt-4 font-semibold">Catálogos agrícolas</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Administra cultivos, variedades, lotes y unidades de medida.</p><button className="mt-4 text-xs font-semibold text-[#2c6048]">Administrar catálogos <ArrowUpRight className="ml-1 inline size-3" /></button></div><div className="rounded-2xl border border-[#e1e9e1] bg-white/80 p-5 dark:border-[#2d3b32] dark:bg-[#18211c]"><div className="flex size-9 items-center justify-center rounded-xl bg-[#f6eadb] text-[#ae732e]"><FileText data-icon="inline-start" /></div><h3 className="mt-4 font-semibold">Consultas compartidas</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Explora la información de Lodana y Agro Market en un solo lugar.</p><button className="mt-4 text-xs font-semibold text-[#2c6048]">Ir a consultas <ArrowUpRight className="ml-1 inline size-3" /></button></div><div className="rounded-2xl border border-[#e1e9e1] bg-white/80 p-5 dark:border-[#2d3b32] dark:bg-[#18211c]"><div className="flex size-9 items-center justify-center rounded-xl bg-[#e9e5f2] text-[#725e99]"><CalendarDays data-icon="inline-start" /></div><h3 className="mt-4 font-semibold">Reportes y análisis</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Genera indicadores y exporta reportes para seguimiento.</p><button className="mt-4 text-xs font-semibold text-[#2c6048]">Ver reportes <ArrowUpRight className="ml-1 inline size-3" /></button></div></section>
        </main>
      </div>
    </div>
  )
}
