import { NextResponse } from 'next/server'
import { ProductionError, productionError, readBody, requireProfile } from '@/lib/production-api'
import { runScheduledReports } from '@/lib/report-automation'
import { isValidMonthKey } from '@/lib/report-periods'
import { isValidIsoDay } from '@/lib/market-data'

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } as const

export async function POST(request: Request) {
  try {
    const actor = await requireProfile(['admin'])
    const body = await readBody(request, 16 * 1024).catch(() => ({} as Record<string, unknown>))

    const targetMonth = typeof body.targetMonth === 'string' && body.targetMonth.trim()
      ? body.targetMonth.trim()
      : undefined
    const targetWeekDay = typeof body.targetWeekDay === 'string' && body.targetWeekDay.trim()
      ? body.targetWeekDay.trim()
      : undefined

    if (targetMonth && !isValidMonthKey(targetMonth)) {
      throw new ProductionError('Indica un mes válido en formato AAAA-MM.', 400)
    }
    if (targetWeekDay && !isValidIsoDay(targetWeekDay)) {
      throw new ProductionError('Indica una fecha de semana válida en formato AAAA-MM-DD.', 400)
    }

    const result = await runScheduledReports({
      source: 'ADMIN_MANUAL',
      actor,
      targetMonth,
      targetWeekDay,
    })

    return NextResponse.json(result, { headers })
  } catch (error) {
    return productionError(error, 'No se pudo ejecutar la generación automática de reportes.')
  }
}
