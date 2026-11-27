import { mutate } from 'swr'

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const DEFAULT_TIMEOUT_MS = 20_000

export async function productionFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  const callerSignal = init?.signal
  const onCallerAbort = () => controller.abort()
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort()
    else callerSignal.addEventListener('abort', onCallerAbort, { once: true })
  }

  let response: Response
  try {
    response = await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('La solicitud tardó demasiado. Verifica tu conexión e inténtalo de nuevo.', 0)
    }
    throw new ApiError('No se pudo conectar con el servidor. Verifica tu conexión a internet.', 0)
  } finally {
    clearTimeout(timer)
    callerSignal?.removeEventListener('abort', onCallerAbort)
  }

  if (response.status === 204) return undefined as T

  const data = await response.json().catch(() => null)
  if (response.status === 401 && !url.startsWith('/api/profile-')) {
    if (typeof window !== 'undefined') window.location.replace('/')
    throw new ApiError('Tu sesión expiró. Redirigiendo al inicio…', 401)
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
