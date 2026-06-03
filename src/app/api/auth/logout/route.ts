import { NextResponse } from 'next/server'
import { ROLE_COOKIE } from '@/lib/auth'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ROLE_COOKIE, '', { maxAge: 0, path: '/' })
  return res
}
