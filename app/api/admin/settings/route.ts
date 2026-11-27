import { NextResponse } from 'next/server'
import { productionError, readBody, requireProfile } from '@/lib/production-api'
import { getSystemConfig, saveSystemConfig } from '@/lib/system-config'

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } as const

export async function GET() {
  try {
    await requireProfile(['admin'])
    return NextResponse.json(await getSystemConfig(), { headers })
  } catch (error) {
    return productionError(error, 'No se pudo leer la configuración del sistema.')
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireProfile(['admin'])
    const body = await readBody(request, 32 * 1024)
    const updated = await saveSystemConfig(
      { institution: body.institution, reporting: body.reporting },
      actor,
    )
    return NextResponse.json(updated, { headers })
  } catch (error) {
    return productionError(error, 'No se pudo guardar la configuración del sistema.')
  }
}
