import { NextResponse } from 'next/server'
import { productionError } from '@/lib/production-api'
import { sameValue } from '@/lib/profile-session'
import { runScheduledReports } from '@/lib/report-automation'
import { isValidIsoDay } from '@/lib/market-data'
import { isValidMonthKey } from '@/lib/report-periods'

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } as const

function verifyCronSecret(request: Request): { ok: boolean; status: number; error?: string } {
  const configured = process.env.LODANA_CRON_SECRET?.trim()
  if (!configured || configured.length < 32) {
    return { ok: false, status: 503, error: 'LODANA_CRON_SECRET no está configurado correctamente en el servidor.' }
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

    let now = new Date()
    if (asOfParam && isValidIsoDay(asOfParam)) {
      now = new Date(`${asOfParam}T12:00:00.000Z`)
    }

    const result = await runScheduledReports({
      source: 'CRON_ENDPOINT',
      actor: 'system-cron',
      now,
      targetMonth: targetMonth && isValidMonthKey(targetMonth) ? targetMonth : undefined,
      targetWeekDay: targetWeekDay && isValidIsoDay(targetWeekDay) ? targetWeekDay : undefined,
    })

    return NextResponse.json(result, { headers })
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
