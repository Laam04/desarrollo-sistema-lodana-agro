import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSession, isProfile, profileCookie, profilePins, sameValue, sessionOptions } from '@/lib/profile-session'

const localPins = { production: '1234', reception: '2345', queries: '3456', admin: '9999' }
const maxAttempts = 10

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const { profile, pin } = body ?? {}

  if (!isProfile(profile) || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN inválido.' }, { status: 401 })
  }

  const expected = process.env[profilePins[profile]] ??
    (process.env.NODE_ENV === 'production' ? undefined : localPins[profile])
  const token = createSession(profile)

  if (!expected || !/^\d{4}$/.test(expected) || !token) {
    return NextResponse.json({ error: 'El acceso a este perfil aún no está configurado.' }, { status: 503 })
  }

  try {
    const matches = sameValue(pin, expected)
    const increment = matches ? 0 : 1
    // Limita intentos por perfil incluso cuando la aplicación tiene varias instancias.
    const [limit] = await prisma.$queryRaw<{ attempts: number; retryAfter: number }[]>`
      INSERT INTO "ProfileLoginAttempt" ("profile", "attempts", "windowStart")
      VALUES (${profile}, ${increment}, CURRENT_TIMESTAMP)
      ON CONFLICT ("profile") DO UPDATE SET
        "attempts" = CASE
          WHEN "ProfileLoginAttempt"."windowStart" <= CURRENT_TIMESTAMP - INTERVAL '15 minutes' THEN EXCLUDED."attempts"
          ELSE LEAST("ProfileLoginAttempt"."attempts" + EXCLUDED."attempts", ${maxAttempts})
        END,
        "windowStart" = CASE
          WHEN "ProfileLoginAttempt"."windowStart" <= CURRENT_TIMESTAMP - INTERVAL '15 minutes' THEN CURRENT_TIMESTAMP
          ELSE "ProfileLoginAttempt"."windowStart"
        END
      RETURNING "attempts", GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("windowStart" + INTERVAL '15 minutes' - CURRENT_TIMESTAMP))))::int AS "retryAfter"
    `
    if (limit.attempts >= maxAttempts) {
      return NextResponse.json({ error: 'Se alcanzó el límite de intentos para este perfil. Inténtalo en unos minutos.' }, {
        status: 429, headers: { 'Retry-After': String(limit.retryAfter) },
      })
    }
    if (!matches) {
      return NextResponse.json({ error: 'PIN inválido.' }, { status: 401 })
    }
  } catch (error) {
    console.error('Error al verificar el acceso:', error)
    return NextResponse.json({ error: 'No se pudo verificar el acceso. Inténtalo de nuevo.' }, { status: 503 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(profileCookie, token, sessionOptions)
  return response
}
