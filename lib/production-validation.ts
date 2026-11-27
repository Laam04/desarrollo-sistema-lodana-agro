export function cleanName(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ')
    : ''
}

export function normalizeName(value: string): string {
  return cleanName(value).toLocaleLowerCase('es-EC')
}

export function normalizeCatalogName(value: string): string {
  return normalizeName(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function parsePositiveDecimal(value: unknown): number | null {
  return parseDecimal(value, 10, 2)
}

export function parseSurface(value: unknown): number | null {
  return value === 0 || (typeof value === 'string' && /^0{1,10}(?:\.0{1,2})?$/.test(value.trim()))
    ? 0 : parsePositiveDecimal(value)
}

export function parseDecimal(value: unknown, digits: number, places: number): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const text = String(value).trim()
  if (!new RegExp(`^\\d{1,${digits}}(?:\\.\\d{1,${places}})?$`).test(text)) return null
  const parsed = Number(text)
  return parsed > 0 ? parsed : null
}

export function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const year = Number(value.slice(0, 4))
  if (year < 2000 || year > 2100) return null

  const date = new Date(`${value}T12:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null
}
