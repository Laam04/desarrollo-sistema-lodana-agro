import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const profileCookie = process.env.NODE_ENV === 'production' ? '__Host-lodana-profile' : 'lodana-profile'
export const sessionSeconds = 8 * 60 * 60

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

function sessionKeys(): string[] {
  const keys: string[] = []
  const current = process.env.LODANA_SESSION_SECRET
  if (current && current.length >= 32) keys.push(current)
  const previous = process.env.LODANA_SESSION_SECRET_PREVIOUS
  if (previous && previous.length >= 32) keys.push(previous)
  if (keys.length) return keys
  if (process.env.NODE_ENV === 'production') return []
  const runtime = globalThis as typeof globalThis & { lodanaLocalSessionKey?: string }
  return [runtime.lodanaLocalSessionKey ??= randomBytes(32).toString('hex')]
}

export function sameValue(left: string, right: string) {
  const first = Buffer.from(left)
  const second = Buffer.from(right)
  return first.length === second.length && timingSafeEqual(first, second)
}

export type SessionPayload = {
  profile: Profile
  jti: string
  expiresAt: Date
}

export function createSession(profile: Profile): { token: string; jti: string; expiresAt: Date } | null {
  const key = sessionKeys()[0]
  if (!key) return null
  const expiresSec = Math.floor(Date.now() / 1000) + sessionSeconds
  const jti = randomBytes(16).toString('hex')
  const payload = `${profile}.${expiresSec}.${jti}`
  const signature = createHmac('sha256', key).update(payload).digest('base64url')
  return {
    token: `${payload}.${signature}`,
    jti,
    expiresAt: new Date(expiresSec * 1000),
  }
}

export function parseSession(token?: string): SessionPayload | null {
  const keys = sessionKeys()
  if (!keys.length || !token) return null
  const [profile, expires, jti, signature, ...rest] = token.split('.')
  if (
    rest.length ||
    !isProfile(profile) ||
    !/^\d{10,}$/.test(expires ?? '') ||
    !/^[0-9a-f]{32}$/.test(jti ?? '') ||
    !signature
  ) {
    return null
  }
  const expiresSec = Number(expires)
  if (expiresSec <= Math.floor(Date.now() / 1000)) return null
  const payload = `${profile}.${expires}.${jti}`
  const valid = keys.some((key) => {
    const expected = createHmac('sha256', key).update(payload).digest('base64url')
    return sameValue(signature, expected)
  })
  return valid ? { profile, jti, expiresAt: new Date(expiresSec * 1000) } : null
}

export function readSession(token?: string): Profile | null {
  return parseSession(token)?.profile ?? null
}
