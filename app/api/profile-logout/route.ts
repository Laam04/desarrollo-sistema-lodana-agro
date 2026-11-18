import { NextResponse } from 'next/server'
import { profileCookie, sessionOptions } from '@/lib/profile-session'

export function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(profileCookie, '', { ...sessionOptions, maxAge: 0 })
  return response
}
