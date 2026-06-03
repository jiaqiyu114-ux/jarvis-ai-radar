// Shared auth constants and types — safe for both server and client imports.
// Server-only functions (getRole, isAdmin) live in auth-server.ts.

export type UserRole = 'admin' | 'guest'

export const ROLE_COOKIE  = 'jarvis_role'
export const ROLE_MAX_AGE = 60 * 60 * 24 * 7  // 7 days
