import { mutate } from 'swr'

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export async function productionFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const data = await response.json().catch(() => null)
  if (response.status === 401 && !url.startsWith('/api/profile-')) {
    window.location.replace('/')
  }
  if (!response.ok || data === null) {
    throw new ApiError(data?.error ?? 'No se pudo completar la solicitud.', response.status)
  }
  return data
}

export function invalidateProduction(...endpoints: string[]) {
  return mutate(
    (key) => typeof key === 'string' && endpoints.some((url) => key === url || key.startsWith(`${url}?`)),
    undefined,
    { revalidate: true },
  )
}

const farmDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit',
})

export function today() {
  return farmDate.format(new Date())
}

export function formatDate(value?: string) {
  if (!value) return '—'
  const date = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return date ? `${date[3]}/${date[2]}/${date[1]}` : '—'
}

const localDateLabel = new Intl.DateTimeFormat('es-EC', {
  timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit',
})

export function formatTimestampDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : localDateLabel.format(date)
}
