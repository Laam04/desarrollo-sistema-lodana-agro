import { NextResponse } from 'next/server'
import { productionError, requireProfile } from '@/lib/production-api'
import { getAdminAuditLogs } from '@/lib/admin-service'

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } as const

export async function GET(request: Request) {
  try {
    await requireProfile(['admin'])
    const params = new URL(request.url).searchParams
    return NextResponse.json(await getAdminAuditLogs(params), { headers })
  } catch (error) {
    return productionError(error, 'No se pudo consultar el historial de auditoría.')
  }
}
