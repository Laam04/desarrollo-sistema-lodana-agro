import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { profileCookie, readSession } from '@/lib/profile-session'

export class ProductionError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text()
  if (Buffer.byteLength(text) > 256 * 1024) throw new ProductionError('La solicitud supera el límite de tamaño.', 413)
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

export async function currentActor() {
  return readSession((await cookies()).get(profileCookie)?.value)
}

export function productionError(error: unknown, fallback: string) {
  if (error instanceof ProductionError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(error.code)) {
    return NextResponse.json({ error: 'Los registros cambiaron durante la operación. Actualiza los datos e inténtalo de nuevo.' }, { status: 409 })
  }
  console.error(fallback, error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}
