import { GET as listAreas, POST as createArea } from '../production-areas/route'
import { productionError, readBody } from '@/lib/production-api'

export const GET = listAreas

export async function POST(request: Request) {
  try {
    const body = await readBody(request)
    return createArea(new Request(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, type: 'LOT' }),
    }))
  } catch (error) {
    return productionError(error, 'No se pudo registrar el lote.')
  }
}
