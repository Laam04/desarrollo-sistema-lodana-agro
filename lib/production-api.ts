import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { parseSession, profileCookie, type Profile } from '@/lib/profile-session'

export class ProductionError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

const errorHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const

export async function readBody(request: Request, maxBytes = 256 * 1024): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type')
  if (contentType && !contentType.toLowerCase().includes('application/json')) {
    throw new ProductionError('El tipo de contenido debe ser application/json.', 415)
  }
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ProductionError('La solicitud supera el límite de tamaño.', 413)
  }

  let text = ''
  if (request.body) {
    const reader = request.body.getReader()
    const decoder = new TextDecoder()
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => {})
        throw new ProductionError('La solicitud supera el límite de tamaño.', 413)
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } else {
    text = await request.text()
    if (Buffer.byteLength(text) > maxBytes) {
      throw new ProductionError('La solicitud supera el límite de tamaño.', 413)
    }
  }

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new ProductionError('Envía un objeto JSON válido.')
  }
  if (!isRecord(body)) throw new ProductionError('Envía un objeto JSON válido.')
  return body
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function currentSession() {
  const token = (await cookies()).get(profileCookie)?.value
  const parsed = parseSession(token)
  if (!parsed) return null
  const [record, accessConfig] = await Promise.all([
    prisma.profileSession.findUnique({
      where: { jti: parsed.jti },
      select: { profile: true, revokedAt: true, expiresAt: true },
    }),
    parsed.profile === 'admin'
      ? null
      : prisma.profileAccessConfig.findUnique({
          where: { profile: parsed.profile },
          select: { enabled: true },
        }),
  ])
  if (!record || record.revokedAt || record.expiresAt <= new Date() || record.profile !== parsed.profile) {
    return null
  }
  if (accessConfig && !accessConfig.enabled) {
    return null
  }
  return parsed
}

export async function currentActor(): Promise<Profile | null> {
  return (await currentSession())?.profile ?? null
}

export async function requireProfile(allowed: readonly Profile[]): Promise<Profile> {
  const actor = await currentActor()
  if (!actor) throw new ProductionError('Inicia sesión para continuar.', 401)
  if (!allowed.includes(actor)) throw new ProductionError('El perfil no tiene acceso a esta operación.', 403)
  return actor
}

export function clientIpKey(request: Request): string {
  const vercelIp = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
  const cfIp = request.headers.get('cf-connecting-ip')?.trim()
  const realIp = request.headers.get('x-real-ip')?.trim()
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const raw = vercelIp || cfIp || realIp || forwarded || 'local'
  return createHash('sha256').update(raw).digest('hex').slice(0, 24)
}

export function productionError(error: unknown, fallback: string) {
  if (error instanceof ProductionError) {
    return NextResponse.json({ error: error.message }, { status: error.status, headers: errorHeaders })
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(error.code)) {
    return NextResponse.json(
      { error: 'Los registros cambiaron durante la operación. Actualiza los datos e inténtalo de nuevo.' },
      { status: 409, headers: errorHeaders },
    )
  }
  console.error(fallback, error)
  return NextResponse.json({ error: fallback }, { status: 500, headers: errorHeaders })
}
