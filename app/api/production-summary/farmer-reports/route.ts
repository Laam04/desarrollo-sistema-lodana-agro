import { NextResponse } from 'next/server'
import { productionError, requireProfile } from '@/lib/production-api'
import {
  buildFarmerImpactReport,
  getFarmerAutomaticPeriods,
} from '@/lib/farmer-impact-report'

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
} as const

export async function GET(request: Request) {
  try {
    await requireProfile(['production', 'admin'])
    const params = new URL(request.url).searchParams
    const periods = getFarmerAutomaticPeriods()

    const cadenceParam = params.get('cadence')
    const cadence =
      cadenceParam === 'WEEKLY' || cadenceParam === 'MONTHLY' || cadenceParam === 'CUSTOM'
        ? cadenceParam
        : undefined

    let from = params.get('from')?.trim() || ''
    let to = params.get('to')?.trim() || ''
    let resolvedCadence: 'WEEKLY' | 'MONTHLY' | 'CUSTOM' = cadence ?? 'WEEKLY'
    let automatic = resolvedCadence !== 'CUSTOM'

    if (!from || !to) {
      const defaultPeriod =
        resolvedCadence === 'MONTHLY' ? periods.monthly[0] : periods.weekly[0]
      if (defaultPeriod) {
        from = defaultPeriod.from
        to = defaultPeriod.to
        resolvedCadence = defaultPeriod.cadence
        automatic = true
      } else {
        from = `${periods.today.slice(0, 7)}-01`
        to = periods.today
        resolvedCadence = 'CUSTOM'
        automatic = false
      }
    }

    const report = await buildFarmerImpactReport({
      from,
      to,
      cadence: resolvedCadence,
      automatic,
    })

    return NextResponse.json({ periods, report }, { headers })
  } catch (error) {
    return productionError(error, 'No se pudo generar el reporte de productividad e impacto.')
  }
}
