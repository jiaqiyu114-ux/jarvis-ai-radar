// Server-only auth helpers. Do NOT import in client components.
import { cookies } from 'next/headers'
import { ROLE_COOKIE, type UserRole } from './auth'

export async function getRole(): Promise<UserRole | null> {
  const store = await cookies()
  const val   = store.get(ROLE_COOKIE)?.value
  if (val === 'admin' || val === 'guest') return val
  return null
}

export function isAdmin(role: UserRole | null): boolean {
  return role === 'admin'
}
