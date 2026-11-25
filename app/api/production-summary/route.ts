import { NextResponse } from 'next/server'
import { productionError, requireProfile } from '@/lib/production-api'
import { productionAnalytics } from '@/lib/production-analytics'

export async function GET(request: Request) {
  try {
    await requireProfile(['production', 'admin'])
    return NextResponse.json(await productionAnalytics(request, false), {
      headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    })
  } catch (error) {
    return productionError(error, 'No se pudo calcular el resumen de producción.')
  }
}
