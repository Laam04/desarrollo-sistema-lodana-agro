import { NextResponse } from 'next/server'
import { productionError, requireProfile } from '@/lib/production-api'
import { getAdminOperations } from '@/lib/admin-service'

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } as const

export async function GET() {
  try {
    await requireProfile(['admin'])
    return NextResponse.json(await getAdminOperations(), { headers })
  } catch (error) {
    return productionError(error, 'No se pudo consultar la supervisión de operaciones.')
  }
}
