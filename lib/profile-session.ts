import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const profileCookie = 'lodana-profile'
const sessionSeconds = 8 * 60 * 60

export const profilePins = {
  production: 'LODANA_PIN_PRODUCTION',
  reception: 'LODANA_PIN_RECEPTION',
  queries: 'LODANA_PIN_QUERIES',
  admin: 'LODANA_PIN_ADMIN',
} as const

export type Profile = keyof typeof profilePins

export function isProfile(value: unknown): value is Profile {
  return typeof value === 'string' && Object.hasOwn(profilePins, value)
}

export const sessionOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: sessionSeconds,
  path: '/',
} as const

function sessionKey() {
  const key = process.env.LODANA_SESSION_SECRET
  if (key && key.length >= 32) return key
  if (process.env.NODE_ENV === 'production') return null
  const runtime = globalThis as typeof globalThis & { lodanaLocalSessionKey?: string }
  return runtime.lodanaLocalSessionKey ??= randomBytes(32).toString('hex')
}

export function sameValue(left: string, right: string) {
  const first = Buffer.from(left)
  const second = Buffer.from(right)
  return first.length === second.length && timingSafeEqual(first, second)
}

export function createSession(profile: Profile) {
  const key = sessionKey()
  if (!key) return null
  const value = `${profile}.${Math.floor(Date.now() / 1000) + sessionSeconds}`
  return `${value}.${createHmac('sha256', key).update(value).digest('base64url')}`
}

export function readSession(token?: string): Profile | null {
  const key = sessionKey()
  if (!key || !token) return null
  const [profile, expires, signature, ...rest] = token.split('.')
  if (rest.length || !isProfile(profile) || !/^\d{10,}$/.test(expires ?? '') || !signature) return null
  if (Number(expires) <= Math.floor(Date.now() / 1000)) return null
  const expected = createHmac('sha256', key).update(`${profile}.${expires}`).digest('base64url')
  return sameValue(signature, expected) ? profile : null
}
