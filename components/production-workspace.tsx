'use client'

import { BarChart3, DollarSign, Sprout, Trash2, Truck, Wheat } from 'lucide-react'
import { AgroWorkspace } from '@/components/agro-workspace'
import { AnalyticsDashboard } from '@/components/analytics-dashboard'
import { CropsManager } from '@/components/crops-manager'
import { ProductionRecords } from '@/components/production-records'
import { ProductionTrash } from '@/components/production-trash'

const sections = [
  { id: 'resumen', label: 'Resumen', icon: BarChart3, title: 'Análisis de producción', description: 'Consulta la evolución de la cosecha, las mermas y los movimientos de Agro Market por cultivo y unidad.' },
  { id: 'cosechas', label: 'Cosechas', icon: Wheat, description: 'Registra la producción obtenida, su precio estimado y las mermas asociadas. Consulta el historial por fechas y cultivo.' },
  { id: 'envios', label: 'Envíos', icon: Truck, description: 'Agrupa varios productos en un mismo envío y registra las cantidades y precios estimados de cada uno.' },
  { id: 'costos', label: 'Costos', icon: DollarSign, title: 'Costos de producción', description: 'Registra los gastos de la operación agrícola y consulta su historial.' },
  { id: 'cultivos', label: 'Cultivos y zonas', icon: Sprout, title: 'Cultivos', description: 'Administra los cultivos, variedades, unidades y zonas disponibles.' },
  { id: 'papelera', label: 'Papelera', icon: Trash2, description: 'Recupera los registros eliminados y consulta qué datos se restaurarán con ellos.' },
] as const

function renderSection(active: string) {
  if (active === 'resumen') return <AnalyticsDashboard />
  if (active === 'cultivos') return <CropsManager />
  if (active === 'papelera') return <ProductionTrash />
  return <ProductionRecords key={active} active={active} />
}

export function ProductionWorkspace() {
  return <AgroWorkspace title="Producción agrícola" path="/lodana" sections={sections} renderSection={renderSection} />
}
