import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { clientIpKey, productionError, readBody } from '@/lib/production-api'
import { isValidPin, verifyProfileCredentials } from '@/lib/profile-access'
import { createSession, isProfile, profileCookie, sessionOptions } from '@/lib/profile-session'

const maxAttempts = 10
const noStore = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } as const

export async function POST(request: Request) {
  try {
    const body = await readBody(request, 4096)
    const { profile, pin } = body

    if (!isProfile(profile) || !isValidPin(pin)) {
      return NextResponse.json({ error: 'PIN inválido.' }, { status: 401, headers: noStore })
    }

    const verification = await verifyProfileCredentials(profile, pin)
    if (verification.disabled) {
      return NextResponse.json(
        { error: 'Este perfil se encuentra deshabilitado por administración.' },
        { status: 403, headers: noStore },
      )
    }

    const session = createSession(profile)
    if (!verification.configured || !session) {
      console.error(`Configuración de acceso incompleta para el perfil ${profile}.`)
      return NextResponse.json({ error: 'PIN inválido.' }, { status: 401, headers: noStore })
    }

    const clientKey = clientIpKey(request)
    const matches = verification.ok
    const increment = matches ? 0 : 1

    const [limit] = await prisma.$queryRaw<{ attempts: number; retryAfter: number }[]>`
      INSERT INTO "ProfileLoginAttempt" ("profile", "clientKey", "attempts", "windowStart")
      VALUES (${profile}, ${clientKey}, ${increment}, CURRENT_TIMESTAMP)
      ON CONFLICT ("profile", "clientKey") DO UPDATE SET
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
      return NextResponse.json(
        { error: 'Se alcanzó el límite de intentos para este perfil. Inténtalo en unos minutos.' },
        { status: 429, headers: { ...noStore, 'Retry-After': String(limit.retryAfter) } },
      )
    }

    if (!matches) {
      return NextResponse.json({ error: 'PIN inválido.' }, { status: 401, headers: noStore })
    }

    await prisma.$transaction([
      prisma.profileLoginAttempt.deleteMany({ where: { profile, clientKey } }),
      prisma.profileSession.deleteMany({ where: { expiresAt: { lte: new Date() } } }),
      prisma.profileSession.create({
        data: { jti: session.jti, profile, expiresAt: session.expiresAt },
      }),
      prisma.auditLog.create({
        data: {
          entity: 'Auth',
          entityId: profile,
          action: 'LOGIN',
          actor: profile,
          afterJson: { clientKey: clientKey.slice(0, 8) },
        },
      }),
    ])

    const response = NextResponse.json({ ok: true }, { headers: noStore })
    response.cookies.set(profileCookie, session.token, sessionOptions)
    return response
  } catch (error) {
    return productionError(error, 'No se pudo verificar el acceso. Inténtalo de nuevo.')
  }
}
