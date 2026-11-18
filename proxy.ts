import { NextRequest, NextResponse } from 'next/server'
import { profileCookie, readSession, type Profile } from '@/lib/profile-session'

function deny(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const api = pathname.startsWith('/api/')
  const read = ['GET', 'HEAD', 'OPTIONS'].includes(request.method)

  if (pathname === '/consultas' && read) return NextResponse.next()
  if (pathname === '/api/public-analytics') {
    if (read) return NextResponse.next()
    return NextResponse.json({ error: 'El servicio de consultas es de solo lectura.' }, {
      status: 405, headers: { Allow: 'GET, HEAD, OPTIONS', 'Cache-Control': 'no-store' },
    })
  }

  if (api && !read) {
    const origin = request.headers.get('origin')
    const host = request.headers.get('host')
    const fetchSite = request.headers.get('sec-fetch-site')
    if (fetchSite === 'cross-site' || (origin && origin !== request.nextUrl.origin &&
      origin !== `https://${host}` && origin !== `http://${host}`)) {
      return deny('La solicitud debe provenir de Lodana Agro.', 403)
    }
  }

  if (pathname === '/api/profile-login') return NextResponse.next()

  const profile = readSession(request.cookies.get(profileCookie)?.value)
  if (pathname === '/api/profile-logout') return NextResponse.next()

  let allowed: Profile[] = ['production', 'admin']
  if (pathname.startsWith('/api/receptions') || pathname.startsWith('/api/market-sales') || pathname.startsWith('/agro-market')) {
    allowed = ['reception', 'admin']
  } else if (pathname.startsWith('/administracion') || pathname === '/api/units/seed') {
    allowed = ['admin']
  } else if (pathname.startsWith('/consultas') || pathname.startsWith('/reportes')) {
    allowed = ['queries', 'admin']
  }

  if (!profile || !allowed.includes(profile)) {
    if (!api) return NextResponse.redirect(new URL('/', request.url))
    return profile ? deny('El perfil no tiene acceso a esta operación.', 403) : deny('Inicia sesión para continuar.', 401)
  }

  const response = NextResponse.next()
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export const config = {
  matcher: ['/api/:path*', '/lodana/:path*', '/agro-market/:path*', '/administracion/:path*', '/consultas/:path*', '/reportes/:path*'],
}
