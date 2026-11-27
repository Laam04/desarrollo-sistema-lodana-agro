'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { BarChart3, ClipboardCheck, History, ShoppingBasket, Tag } from 'lucide-react'
import { AgroWorkspace } from '@/components/agro-workspace'
import { MarketPrices } from '@/components/market-prices'
import { MarketReceptions } from '@/components/market-receptions'
import { MarketSales } from '@/components/market-sales'
import { MarketSummary } from '@/components/market-summary'

const sections = [
  { id: 'resumen', label: 'Inicio', icon: BarChart3, title: 'Agro Market', description: 'Acciones diarias y resumen de ventas de la semana.' },
  { id: 'recepciones', label: 'Recepciones', icon: ClipboardCheck, title: 'Recibir cosecha', description: 'Confirma las cantidades que llegaron de Producción Agrícola y, si hace falta, ajusta su presentación de venta.' },
  { id: 'ventas', label: 'Ventas', icon: ShoppingBasket, title: 'Registro de ventas', description: 'Registra ventas con guía del precio real del mercado, cambia presentación de stock y exporta hojas por día o semana.' },
  { id: 'precios', label: 'Precios de mercado', icon: Tag, title: 'Precios de mercado real', description: 'Consulta y actualiza los precios de referencia del mercado actual para sugerir valores en Agro Market.' },
  { id: 'historial', label: 'Historial', icon: History, title: 'Historial de recepciones', description: 'Consulta los recibos, sus cantidades, conversiones y el envío de origen.' },
] as const

const mobileTabs = [
  { id: 'resumen', href: '/agro-market', label: 'Inicio', icon: BarChart3 },
  { id: 'ventas', href: '/agro-market?seccion=ventas', label: 'Ventas', icon: ShoppingBasket },
  { id: 'recepciones', href: '/agro-market?seccion=recepciones', label: 'Recibir', icon: ClipboardCheck },
  { id: 'precios', href: '/agro-market?seccion=precios', label: 'Mercado', icon: Tag },
  { id: 'historial', href: '/agro-market?seccion=historial', label: 'Historial', icon: History },
] as const

function renderSection(active: string) {
  if (active === 'resumen') return <MarketSummary />
  if (active === 'ventas') return <MarketSales />
  if (active === 'precios') return <MarketPrices />
  return <MarketReceptions key={active} historical={active === 'historial'} />
}

export function MarketWorkspace() {
  const params = useSearchParams()
  const currentId = sections.find((item) => item.id === params.get('seccion'))?.id ?? sections[0].id

  const mobileDock = (
    <nav
      aria-label="Acceso rápido de Agro Market"
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
  )

  return (
    <AgroWorkspace
      title="Agro Market"
      path="/agro-market"
      sections={sections}
      renderSection={renderSection}
      hideHero={currentId === 'resumen'}
      mobileDock={mobileDock}
    />
  )
}
