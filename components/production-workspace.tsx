'use client'

import { BarChart3, DollarSign, Sprout, Trash2, Truck, Wheat } from 'lucide-react'
import { AgroWorkspace } from '@/components/agro-workspace'
import { CropsManager } from '@/components/crops-manager'
import { ProductionRecords, ProductionSummary } from '@/components/production-records'
import { ProductionTrash } from '@/components/production-trash'

const sections = [
  { id: 'resumen', label: 'Resumen', icon: BarChart3, title: 'Resumen de producción', description: 'Indicadores generales de producción agrícola y movimientos registrados.' },
  { id: 'cosechas', label: 'Cosechas', icon: Wheat, description: 'Registra la producción obtenida, su precio estimado y las mermas asociadas. Consulta el historial por fechas y cultivo.' },
  { id: 'envios', label: 'Envíos', icon: Truck, description: 'Agrupa varios productos en un mismo envío y registra las cantidades y precios estimados de cada uno.' },
  { id: 'costos', label: 'Costos', icon: DollarSign, title: 'Costos de producción', description: 'Registra los gastos de la operación agrícola y consulta su historial.' },
  { id: 'cultivos', label: 'Cultivos y lotes', icon: Sprout, title: 'Cultivos', description: 'Administra los cultivos, variedades, unidades y áreas productivas disponibles.' },
  { id: 'papelera', label: 'Papelera', icon: Trash2, description: 'Recupera los registros eliminados y consulta qué datos se restaurarán con ellos.' },
] as const

function renderSection(active: string) {
  if (active === 'resumen') return <ProductionSummary />
  if (active === 'cultivos') return <CropsManager />
  if (active === 'papelera') return <ProductionTrash />
  return <ProductionRecords key={active} active={active} />
}

export function ProductionWorkspace() {
  return <AgroWorkspace title="Producción agrícola" path="/lodana" sections={sections} renderSection={renderSection} />
}
