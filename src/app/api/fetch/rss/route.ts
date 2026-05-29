import { type NextRequest, NextResponse } from 'next/server'
import { isSupabaseConfigured } from '@/lib/supabase/client'
import { ingestRssSources } from '@/lib/ingest/rss'

/**
 * POST /api/fetch/rss
 *
 * Reads all non-blocked sources from Supabase, fetches their RSS/Atom feeds,
 * parses articles, and inserts new items into the items table.
 *
 * Returns JSON with ingestion stats.
 * Never triggered automatically — only by an explicit POST request.
 *
 * Security: if JARVIS_FETCH_SECRET is set in env, the request must include
 * header  x-jarvis-secret: <value>  — otherwise 401.
 */
export async function POST(req: NextRequest) {
  // ── Optional secret check ─────────────────────────────────────────────────
  const secret = process.env.JARVIS_FETCH_SECRET?.trim()
  if (secret) {
    const provided = req.headers.get('x-jarvis-secret')
    if (provided !== secret) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized — provide x-jarvis-secret header' },
        { status: 401 },
      )
    }
  }

  // ── Supabase guard ────────────────────────────────────────────────────────
  if (!isSupabaseConfigured) {
    return NextResponse.json({
      ok:      true,
      skipped: true,
      reason:  'Supabase is not configured — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local',
      mode:    'mock',
    })
  }

  // ── Run ingest ────────────────────────────────────────────────────────────
  try {
    const result = await ingestRssSources()
    return NextResponse.json({ ok: true, mode: 'database', ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/fetch/rss]', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
