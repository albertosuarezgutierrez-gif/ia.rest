import { NextRequest, NextResponse } from 'next/server'

// Routes accessible only by admins
const ADMIN_ROUTES = ['/hub', '/kds']
// Routes accessible only by camareros (and admins)
const CAMARERO_ROUTES = ['/edge']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow API routes and login
  if (pathname.startsWith('/api') || pathname === '/login' || pathname === '/') {
    return NextResponse.next()
  }

  // Check session from cookie (we'll set it on login)
  const session = req.cookies.get('ia_session')?.value
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  try {
    const s = JSON.parse(session)
    // Camarero trying to access admin routes → redirect to edge
    if (ADMIN_ROUTES.some(r => pathname.startsWith(r)) && s.rol !== 'admin') {
      return NextResponse.redirect(new URL('/edge', req.url))
    }
    return NextResponse.next()
  } catch {
    return NextResponse.redirect(new URL('/login', req.url))
  }
}

export const config = {
  matcher: ['/hub/:path*', '/kds/:path*', '/edge/:path*'],
}
