import { NextResponse } from 'next/server'
import { productionError } from '@/lib/production-api'
import { productionAnalytics } from '@/lib/production-analytics'

export async function GET(request: Request) {
  try {
    return NextResponse.json(await productionAnalytics(request, true), {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=180', 'X-Content-Type-Options': 'nosniff' },
    })
  } catch (error) {
    return productionError(error, 'No se pudieron cargar las estadísticas públicas.')
  }
}
