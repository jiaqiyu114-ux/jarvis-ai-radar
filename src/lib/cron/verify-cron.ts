import type { NextRequest } from 'next/server'

/**
 * Verify that a request to a cron route is legitimate.
 *
 * On Vercel, when the CRON_SECRET environment variable is set, scheduled cron
 * invocations automatically include the header:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Behaviour:
 *   - CRON_SECRET not set  → allow (local dev / not yet configured). Returns ok
 *     with a warning so the route can surface a hint.
 *   - CRON_SECRET set      → require a matching Bearer token, else reject.
 *
 * See: https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
 */
export function verifyCronRequest(req: NextRequest): { ok: boolean; warning?: string } {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return { ok: true, warning: 'CRON_SECRET not set — cron endpoint is publicly callable. Set CRON_SECRET in Vercel to secure it.' }
  }

  const auth = req.headers.get('authorization') ?? ''
  const provided = auth.replace(/^Bearer\s+/i, '').trim()
  if (provided && provided === secret) return { ok: true }

  return { ok: false }
}
