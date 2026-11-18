import { NextResponse } from 'next/server'
import { currentActor, productionError } from '@/lib/production-api'
import { productionAnalytics } from '@/lib/production-analytics'

export async function GET(request: Request) {
  const actor = await currentActor()
  if (actor !== 'production' && actor !== 'admin') {
    return NextResponse.json({ error: 'Inicia sesión con un perfil autorizado.' }, { status: actor ? 403 : 401 })
  }

  try {
    return NextResponse.json(await productionAnalytics(request, false), {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    return productionError(error, 'No se pudo calcular el resumen de producción.')
  }
}
