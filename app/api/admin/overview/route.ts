import { NextResponse } from 'next/server'
import { productionError, requireProfile } from '@/lib/production-api'
import { getAdminOverview } from '@/lib/admin-service'
import { getPendingScheduledPeriods } from '@/lib/report-automation'

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } as const

export async function GET() {
  try {
    await requireProfile(['admin'])
    const [overview, pending] = await Promise.all([
      getAdminOverview(),
      getPendingScheduledPeriods(),
    ])
    return NextResponse.json(
      {
        ...overview,
        pendingAutomatedPeriods: pending.pending.length,
      },
      { headers },
    )
  } catch (error) {
    return productionError(error, 'No se pudo cargar el resumen administrativo.')
  }
}
