import { NextRequest, NextResponse } from 'next/server'
import { profileCookie, readSession, type Profile } from '@/lib/profile-session'

function deny(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
  )
}

const routeAcl: readonly { prefix: string; roles: readonly Profile[] }[] = [
  { prefix: '/api/receptions', roles: ['reception', 'admin'] },
  { prefix: '/api/market-sales', roles: ['reception', 'admin'] },
  { prefix: '/api/market-prices', roles: ['reception', 'production', 'admin'] },
  { prefix: '/agro-market', roles: ['reception', 'admin'] },
  { prefix: '/administracion', roles: ['admin'] },
  { prefix: '/api/admin', roles: ['admin'] },
  { prefix: '/reportes', roles: ['queries', 'admin'] },
  { prefix: '/api/reports', roles: ['queries', 'admin'] },
  { prefix: '/consultas', roles: ['queries', 'admin'] },
  { prefix: '/lodana', roles: ['production', 'admin'] },
  { prefix: '/api/crops', roles: ['production', 'admin'] },
  { prefix: '/api/harvests', roles: ['production', 'admin'] },
  { prefix: '/api/losses', roles: ['production', 'admin'] },
  { prefix: '/api/production-areas', roles: ['production', 'admin'] },
  { prefix: '/api/zones', roles: ['production', 'admin'] },
  { prefix: '/api/units', roles: ['production', 'admin'] },
  { prefix: '/api/costs', roles: ['production', 'admin'] },
  { prefix: '/api/cost-categories', roles: ['production', 'admin'] },
  { prefix: '/api/shipments', roles: ['production', 'admin'] },
  { prefix: '/api/production-summary', roles: ['production', 'admin'] },
  { prefix: '/api/trash', roles: ['production', 'admin'] },
]

function allowedOrigins(request: NextRequest): Set<string> {
  const origins = new Set<string>([request.nextUrl.origin])
  const configured = process.env.APP_ORIGIN?.trim()
  if (configured) {
    try {
      origins.add(new URL(configured).origin)
    } catch {
      // Ignora APP_ORIGIN mal formado
    }
  }
  const host = request.headers.get('host')
  if (host) {
    origins.add(`https://${host}`)
    if (process.env.NODE_ENV !== 'production') {
      origins.add(`http://${host}`)
    }
  }
  return origins
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const api = pathname.startsWith('/api/')
  const read = ['GET', 'HEAD', 'OPTIONS'].includes(request.method)

  if (pathname === '/consultas' && read) return NextResponse.next()
  if (pathname === '/api/public-analytics') {
    if (read) return NextResponse.next()
    return NextResponse.json(
      { error: 'El servicio de consultas es de solo lectura.' },
      { status: 405, headers: { Allow: 'GET, HEAD, OPTIONS', 'Cache-Control': 'no-store' } },
    )
  }

  if (pathname === '/api/cron/reports') {
    const response = NextResponse.next()
    response.headers.set('Cache-Control', 'no-store')
    return response
  }

  if (api && !read) {
    const origin = request.headers.get('origin')
    const fetchSite = request.headers.get('sec-fetch-site')
    const validFetchSite = fetchSite === 'same-origin' || fetchSite === 'none'
    const validOrigin = origin !== null && allowedOrigins(request).has(origin)

    if ((fetchSite && !validFetchSite) || (origin && !validOrigin) || (!origin && !validFetchSite)) {
      return deny('La solicitud debe provenir de Lodana Agro.', 403)
    }
  }

  if (pathname === '/api/profile-login' || pathname === '/api/profile-logout') {
    const response = NextResponse.next()
    response.headers.set('Cache-Control', 'no-store')
    return response
  }

  const profile = readSession(request.cookies.get(profileCookie)?.value)
  const matched = routeAcl.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  const allowed: readonly Profile[] = matched ? matched.roles : []

  if (!profile || !allowed.includes(profile)) {
    if (!api) return NextResponse.redirect(new URL('/', request.url))
    return profile
      ? deny('El perfil no tiene acceso a esta operación.', 403)
      : deny('Inicia sesión para continuar.', 401)
  }

  const response = NextResponse.next()
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export const config = {
  matcher: [
    '/api/:path*',
    '/lodana/:path*',
    '/agro-market/:path*',
    '/administracion/:path*',
    '/consultas/:path*',
    '/reportes/:path*',
  ],
}
