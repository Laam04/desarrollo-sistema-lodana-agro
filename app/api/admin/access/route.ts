import { NextResponse } from 'next/server'
import { currentSession, ProductionError, productionError, readBody, requireProfile } from '@/lib/production-api'
import {
  clearLockoutsForProfile,
  getAccessOverview,
  revokeSessionsForProfile,
  setProfileEnabled,
  updateProfilePin,
} from '@/lib/profile-access'
import { isProfile } from '@/lib/profile-session'

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } as const

export async function GET() {
  try {
    await requireProfile(['admin'])
    return NextResponse.json(await getAccessOverview(), { headers })
  } catch (error) {
    return productionError(error, 'No se pudo consultar la configuración de accesos.')
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireProfile(['admin'])
    const session = await currentSession()
    const body = await readBody(request, 16 * 1024)

    const action = typeof body.action === 'string' ? body.action : ''
    const profile = body.profile

    if (!isProfile(profile)) {
      throw new ProductionError('Selecciona un perfil válido.', 400)
    }

    if (action === 'toggle_enabled') {
      if (typeof body.enabled !== 'boolean') {
        throw new ProductionError('Indica si el perfil debe quedar habilitado o deshabilitado.', 400)
      }
      const result = await setProfileEnabled(profile, body.enabled, actor)
      return NextResponse.json(result, { headers })
    }

    if (action === 'update_pin') {
      const pin = typeof body.pin === 'string' ? body.pin : ''
      const result = await updateProfilePin(profile, pin, actor, session?.jti)
      return NextResponse.json(result, { headers })
    }

    if (action === 'reset_pin') {
      const result = await updateProfilePin(profile, null, actor, session?.jti)
      return NextResponse.json(result, { headers })
    }

    if (action === 'revoke_sessions') {
      const result = await revokeSessionsForProfile(profile, actor, session?.jti)
      return NextResponse.json(result, { headers })
    }

    if (action === 'clear_lockouts') {
      const clientKey = typeof body.clientKey === 'string' && body.clientKey.trim()
        ? body.clientKey.trim()
        : undefined
      const result = await clearLockoutsForProfile(profile, actor, clientKey)
      return NextResponse.json(result, { headers })
    }

    throw new ProductionError('Acción de administración de accesos no reconocida.', 400)
  } catch (error) {
    return productionError(error, 'No se pudo actualizar la configuración de acceso.')
  }
}
