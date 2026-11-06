import { NextResponse } from 'next/server'

const PIN_ENV: Record<string, string> = {
  production: 'LODANA_PIN_PRODUCTION',
  reception: 'LODANA_PIN_RECEPTION',
  queries: 'LODANA_PIN_QUERIES',
  admin: 'LODANA_PIN_ADMIN',
}

const fallbackPins: Record<string, string> = {
  production: '1234',
  reception: '2345',
  queries: '3456',
  admin: '9999',
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const profile = typeof body?.profile === 'string' ? body.profile : ''
  const pin = typeof body?.pin === 'string' ? body.pin : ''
  const envName = PIN_ENV[profile]
  const expectedPin = envName ? process.env[envName] ?? fallbackPins[profile] : undefined

  if (!expectedPin || !/^\d{4}$/.test(pin) || pin !== expectedPin) {
    return NextResponse.json({ error: 'PIN inválido' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set('lodana-profile', profile, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 8,
    path: '/',
  })
  return response
}
