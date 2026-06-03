import { type NextRequest, NextResponse } from 'next/server'
import { runFlashFilter } from '@/lib/analysis/flash-filter'

/**
 * POST /api/pipeline/flash-filter
 *
 * Runs the DeepSeek-chat (fast/cheap) batch pre-filter on unprocessed items.
 * Called automatically by the Vercel Cron every 3 hours (see vercel.json),
 * or manually from the analysis queue UI.
 *
 * Body (all optional):
 *   maxItems: number   — cap items per run (default 150)
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 120   // seconds — Vercel function timeout

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { body = {} }

  const maxItems = typeof body.maxItems === 'number' ? body.maxItems : undefined

  try {
    const result = await runFlashFilter({ maxItems })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[flash-filter] error:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

/** GET — lightweight status / dry-run check (no DB writes). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    description: 'POST to run flash filter. Processes unprocessed items in batches via DeepSeek-chat.',
    schedule: 'every 3 hours (vercel.json cron)',
  })
}
