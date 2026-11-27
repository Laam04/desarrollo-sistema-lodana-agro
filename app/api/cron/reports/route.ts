import { NextResponse } from 'next/server'
import { ProductionError, productionError } from '@/lib/production-api'
import { sameValue } from '@/lib/profile-session'
import { runScheduledReports } from '@/lib/report-automation'
import { isValidIsoDay } from '@/lib/market-data'
import { isValidMonthKey } from '@/lib/report-periods'

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } as const

function verifyCronSecret(request: Request): { ok: boolean; status: number; error?: string } {
  const configured = process.env.CRON_SECRET?.trim() || process.env.LODANA_CRON_SECRET?.trim()
  if (!configured || configured.length < 32) {
    return { ok: false, status: 503, error: 'Configura CRON_SECRET con al menos 32 caracteres para la ejecución programada.' }
  }
  const auth = request.headers.get('authorization') ?? ''
  const prefix = 'Bearer '
  if (!auth.startsWith(prefix)) {
    return { ok: false, status: 401, error: 'Autorización Bearer requerida.' }
  }
  const token = auth.slice(prefix.length).trim()
  if (!token || !sameValue(token, configured)) {
    return { ok: false, status: 401, error: 'Token de cron inválido.' }
  }
  return { ok: true, status: 200 }
}

async function handleCron(request: Request) {
  try {
    const auth = verifyCronSecret(request)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status, headers })
    }

    const params = new URL(request.url).searchParams
    const asOfParam = params.get('asOf')?.trim()
    const targetMonth = params.get('targetMonth')?.trim()
    const targetWeekDay = params.get('targetWeekDay')?.trim()

    if (asOfParam && !isValidIsoDay(asOfParam)) throw new ProductionError('Indica una fecha de ejecución válida.')
    if (targetMonth && !isValidMonthKey(targetMonth)) throw new ProductionError('Indica un mes válido en formato AAAA-MM.')
    if (targetWeekDay && !isValidIsoDay(targetWeekDay)) throw new ProductionError('Indica una fecha de semana válida.')

    const result = await runScheduledReports({
      source: 'CRON_ENDPOINT',
      actor: 'system-cron',
      now: asOfParam ? new Date(`${asOfParam}T12:00:00.000Z`) : undefined,
      targetMonth: targetMonth || undefined,
      targetWeekDay: targetWeekDay || undefined,
    })

    return NextResponse.json(result, { headers, status: result.failedCount > 0 ? 500 : 200 })
  } catch (error) {
    return productionError(error, 'Error al ejecutar la automatización programada de reportes.')
  }
}

export async function GET(request: Request) {
  return handleCron(request)
}

export async function POST(request: Request) {
  return handleCron(request)
}
