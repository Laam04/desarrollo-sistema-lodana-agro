import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { parseSession, profileCookie, sessionOptions } from '@/lib/profile-session'

export async function POST() {
  const token = (await cookies()).get(profileCookie)?.value
  const parsed = parseSession(token)
  if (parsed) {
    await prisma.profileSession.updateMany({
      where: { jti: parsed.jti, revokedAt: null },
      data: { revokedAt: new Date() },
    }).catch(() => {})
  }

  const response = NextResponse.json(
    { ok: true },
    { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
  )
  response.cookies.set(profileCookie, '', { ...sessionOptions, maxAge: 0 })
  return response
}
