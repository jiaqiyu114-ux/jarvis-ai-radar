import { type NextRequest, NextResponse } from 'next/server'
import { ROLE_COOKIE, ROLE_MAX_AGE } from '@/lib/auth'

const DEFAULT_ADMIN_PW = '20040126'

export async function POST(req: NextRequest) {
  let body: { role?: string; password?: string; remember?: boolean } = {}
  try { body = await req.json() } catch { /* empty body */ }

  const maxAge = body.remember ? 60 * 60 * 24 * 30 : ROLE_MAX_AGE
  const opts   = { httpOnly: true, maxAge, path: '/', sameSite: 'strict' as const }

  if (body.role === 'guest') {
    const res = NextResponse.json({ ok: true })
    res.cookies.set(ROLE_COOKIE, 'guest', opts)
    return res
  }

  if (body.role === 'admin') {
    const adminPw = process.env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PW
    if (body.password !== adminPw) {
      return NextResponse.json({ ok: false, error: '密码错误' }, { status: 401 })
    }
    const res = NextResponse.json({ ok: true })
    res.cookies.set(ROLE_COOKIE, 'admin', opts)
    return res
  }

  return NextResponse.json({ ok: false, error: '无效请求' }, { status: 400 })
}
