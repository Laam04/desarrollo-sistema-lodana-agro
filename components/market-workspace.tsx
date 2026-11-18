'use client'

import { ClipboardCheck, History, ShoppingBasket } from 'lucide-react'
import { AgroWorkspace } from '@/components/agro-workspace'
import { MarketReceptions } from '@/components/market-receptions'
import { MarketSales } from '@/components/market-sales'

const sections = [
  { id: 'recepciones', label: 'Recepciones', icon: ClipboardCheck, title: 'Recibir cosecha', description: 'Confirma las cantidades que llegaron de Producción Agrícola y genera el recibo para venderlas.' },
  { id: 'ventas', label: 'Ventas', icon: ShoppingBasket, title: 'Registro diario de ventas', description: 'Registra ventas por recibo y consulta el cierre diario de efectivo y transferencias.' },
  { id: 'historial', label: 'Historial', icon: History, title: 'Historial de recepciones', description: 'Consulta los recibos, sus cantidades y el envío de origen.' },
] as const

function renderSection(active: string) {
  if (active === 'ventas') return <MarketSales />
  return <MarketReceptions key={active} historical={active === 'historial'} />
}

export function MarketWorkspace() {
  return <AgroWorkspace title="Agro Market" path="/agro-market" sections={sections} renderSection={renderSection} />
}
