import { type NextRequest, NextResponse } from 'next/server'
import { ROLE_COOKIE } from '@/lib/auth'

const PUBLIC_PREFIXES = ['/login', '/api/auth', '/_next', '/favicon']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) return

  const role = req.cookies.get(ROLE_COOKIE)?.value
  if (role !== 'admin' && role !== 'guest') {
    const url = new URL('/login', req.url)
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
