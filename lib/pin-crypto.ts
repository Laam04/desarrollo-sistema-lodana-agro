import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export function isValidPin(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 4 && value.length <= 64 && !/[\r\n]/.test(value)
}

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex')
  const derived = scryptSync(pin, salt, 32).toString('hex')
  return `scrypt$${salt}$${derived}`
}

export function verifyPinHash(pin: string, storedHash: string): boolean {
  const parts = storedHash.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const [, salt, expectedHex] = parts
  if (!/^[0-9a-f]{32}$/.test(salt) || !/^[0-9a-f]{64}$/.test(expectedHex)) return false
  const derived = scryptSync(pin, salt, 32)
  const expected = Buffer.from(expectedHex, 'hex')
  return derived.length === expected.length && timingSafeEqual(derived, expected)
}
