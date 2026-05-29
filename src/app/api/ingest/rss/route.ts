import { type NextRequest, NextResponse } from 'next/server'
import { runRssProviderIngest } from '@/lib/ingest/ingest-service'
import { isServerSupabaseConfigured } from '@/lib/supabase/server'

/**
 * GET /api/ingest/rss                — dry-run; fetches feeds, no DB writes
 * GET /api/ingest/rss?write=true     — fetches feeds and writes to DB
 * POST /api/ingest/rss               — fetches feeds and writes to DB
 *
 * Dry-run (GET without ?write=true):
 *   - Does NOT require Supabase
 *   - Sources are read from DB if available; falls back to hardcoded feed list
 *   - Returns parsed items + feedErrors / itemErrors
 *
 * Write (POST or GET?write=true):
 *   - Requires Supabase; returns 400 if not configured
 *   - Writes providers → sources → items → item_mentions
 *   - Idempotent: repeat calls produce reusedItems + skippedMentions
 *
 * HTTP status:
 *   200 — success or partial success (check ok + errors[])
 *   400 — Supabase not configured (write requests only)
 *   500 — fatal / all items failed
 *
 * Note: legacy POST /api/fetch/rss remains unchanged and is still supported.
 */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const write = searchParams.get('write') === 'true'

    if (write && !isServerSupabaseConfigured) {
      return NextResponse.json({
        ok:    false,
        error: 'Supabase is not configured',
        hint:  'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local',
      }, { status: 400 })
    }

    const result = await runRssProviderIngest({ dryRun: !write })
    const status = 'ok' in result && !result.ok ? 500 : 200
    return NextResponse.json(result, { status })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/ingest/rss GET]', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST() {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({
      ok:    false,
      error: 'Supabase is not configured',
      hint:  'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local',
    }, { status: 400 })
  }

  try {
    const result = await runRssProviderIngest({ dryRun: false })
    const status = result.ok ? 200 : 500
    return NextResponse.json(result, { status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/ingest/rss POST]', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
