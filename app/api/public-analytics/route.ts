import { NextResponse } from 'next/server'
import { clientIpKey, ProductionError, productionError } from '@/lib/production-api'
import { marketDay } from '@/lib/market-data'
import { shiftMonth, type AnalyticsReport } from '@/lib/analytics-model'
import { productionAnalytics, readAnalyticsPeriod } from '@/lib/production-analytics'

const allowedParams = new Set(['from', 'to'])
const rateLimitWindowMs = 60_000
const rateLimitMaxRequests = 60
const cacheTtlMs = 60_000
const maxCacheEntries = 100

const rateBuckets = new Map<string, { count: number; resetAt: number }>()
const reportCache = new Map<string, { expiresAt: number; data: AnalyticsReport }>()

function enforcePublicRateLimit(request: Request) {
  const now = Date.now()
  if (rateBuckets.size > 2000) {
    for (const [key, bucket] of rateBuckets) {
      if (bucket.resetAt <= now) rateBuckets.delete(key)
    }
  }
  const key = clientIpKey(request)
  const current = rateBuckets.get(key)
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + rateLimitWindowMs })
    return null
  }
  current.count++
  if (current.count > rateLimitMaxRequests) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
    return NextResponse.json(
      { error: 'Demasiadas consultas en poco tiempo. Inténtalo nuevamente en un minuto.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
    )
  }
  return null
}

export async function GET(request: Request) {
  try {
    const limited = enforcePublicRateLimit(request)
    if (limited) return limited

    const url = new URL(request.url)
    for (const key of url.searchParams.keys()) {
      if (!allowedParams.has(key)) {
        throw new ProductionError('Parámetro de consulta no admitido en estadísticas públicas.', 400)
      }
    }

    const latestMonth = shiftMonth(marketDay().slice(0, 7), -1)
    const period = readAnalyticsPeriod(request, latestMonth)
    const cacheKey = `${period.from}:${period.to}:${latestMonth}`
    const now = Date.now()
    const cached = reportCache.get(cacheKey)
    if (cached && cached.expiresAt > now) {
      return NextResponse.json(cached.data, {
        headers: { 'Cache-Control': 'public, max-age=60, s-maxage=180', 'X-Content-Type-Options': 'nosniff' },
      })
    }

    const data = await productionAnalytics(request, true)
    if (reportCache.size >= maxCacheEntries) {
      const oldest = reportCache.keys().next().value
      if (oldest) reportCache.delete(oldest)
    }
    reportCache.set(cacheKey, { expiresAt: now + cacheTtlMs, data })

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=180', 'X-Content-Type-Options': 'nosniff' },
    })
  } catch (error) {
    return productionError(error, 'No se pudieron cargar las estadísticas públicas.')
  }
}
