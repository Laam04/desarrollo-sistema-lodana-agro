'use client'

import { BarChart3, ClipboardCheck, History, ShoppingBasket } from 'lucide-react'
import { AgroWorkspace } from '@/components/agro-workspace'
import { MarketReceptions } from '@/components/market-receptions'
import { MarketSales } from '@/components/market-sales'
import { MarketSummary } from '@/components/market-summary'

const sections = [
  { id: 'resumen', label: 'Resumen', icon: BarChart3, title: 'Resumen de ventas', description: 'Consulta lo vendido y la ganancia bruta estimada de cada semana.' },
  { id: 'recepciones', label: 'Recepciones', icon: ClipboardCheck, title: 'Recibir cosecha', description: 'Confirma las cantidades que llegaron de Producción Agrícola y genera el recibo para venderlas.' },
  { id: 'ventas', label: 'Ventas', icon: ShoppingBasket, title: 'Registro de ventas', description: 'Registra ventas por recibo y consulta o exporta las hojas por día o semana.' },
  { id: 'historial', label: 'Historial', icon: History, title: 'Historial de recepciones', description: 'Consulta los recibos, sus cantidades y el envío de origen.' },
] as const

function renderSection(active: string) {
  if (active === 'resumen') return <MarketSummary />
  if (active === 'ventas') return <MarketSales />
  return <MarketReceptions key={active} historical={active === 'historial'} />
}

export function MarketWorkspace() {
  return <AgroWorkspace title="Agro Market" path="/agro-market" sections={sections} renderSection={renderSection} />
}
