import { type NextRequest, NextResponse } from 'next/server'
import { runRssProviderIngest } from '@/lib/ingest/ingest-service'
import { isServerSupabaseConfigured } from '@/lib/supabase/server'
import {
  createAcc,
  runDeadlineAwareIngest,
  buildIngestResponse,
} from '@/lib/ingest/ingest-runner'

/**
 * POST /api/ingest/rss — write-mode ingest with hard deadline guarantee.
 *
 * Query params:
 *   maxSources  int   default 8    — sources to attempt this run (prioritised)
 *   timeoutMs   int   default 55000 — hard wall-clock limit (ms); must be < client timeout
 *   force       bool  default false — include failing sources; allow maxSources up to 18
 *
 * Concurrency model:
 *   - BATCH_SIZE = 4 sources run concurrently per batch
 *   - Per-source fetch timeout = 9 s (hard abort via AbortController)
 *   - Health updates are fire-and-forget (never block the fetch batch)
 *   - Write loop checks deadline before each item; stops early if < 3 s remain
 *   - Promise.race(ingestWork, hardTimeout) guarantees response within timeoutMs
 *
 * Worst-case budget (defaults):
 *   select sources  ~  1 s
 *   fetch 8 sources ~ 18 s  (2 batches × 9 s timeout)
 *   write 120 items ~ 18 s  (120 × ~150 ms per item)
 *   total           ~ 37 s  ← well under 55 s deadline and 90 s client timeout
 *
 * GET /api/ingest/rss                — unchanged dry-run (no DB writes)
 * GET /api/ingest/rss?write=true     — unchanged write-mode (verbose response)
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function parsePostParams(req: NextRequest): {
  maxSources:  number
  deadlineMs:  number
  force:       boolean
} {
  const { searchParams } = new URL(req.url)

  const rawTimeout    = Number(searchParams.get('timeoutMs'))
  const rawMaxSources = Number(searchParams.get('maxSources'))
  const force         = searchParams.get('force') === 'true'

  const deadlineMs  = clamp(
    Number.isFinite(rawTimeout)    && rawTimeout    > 0 ? rawTimeout    : 55_000,
    10_000, 80_000,   // never less than 10s or more than 80s
  )
  const maxSources  = clamp(
    Number.isFinite(rawMaxSources) && rawMaxSources > 0 ? rawMaxSources : 8,
    1, force ? 20 : 12,  // with force=true allow up to 20; otherwise cap at 12
  )

  return { maxSources, deadlineMs, force }
}

/** Verbose dry-run / write-mode response (existing format, unchanged). */
function forResponse(result: object): Record<string, unknown> {
  const body = result as Record<string, unknown>
  if (process.env.NODE_ENV === 'production') {
    return Object.fromEntries(Object.entries(body).filter(([k]) => k !== 'debug'))
  }
  return body
}

// ── GET — unchanged dry-run ───────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const startMs = Date.now()
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

    const result     = await runRssProviderIngest({ dryRun: !write, recordHealth: write })
    const durationMs = Date.now() - startMs
    const body       = { ...forResponse(result), durationMs }
    const status     = result.ok ? 200 : 500
    return NextResponse.json(body, { status })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/ingest/rss GET]', message)
    return NextResponse.json({
      ok: false, error: message, durationMs: Date.now() - startMs,
    }, { status: 500 })
  }
}

// ── POST — deadline-aware write with hard cutoff ──────────────────────────────

export async function POST(req: NextRequest) {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({
      ok:    false,
      error: 'Supabase is not configured',
      hint:  'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local',
    }, { status: 400 })
  }

  const startMs = Date.now()
  const { maxSources, deadlineMs, force } = parsePostParams(req)
  const deadline = startMs + deadlineMs

  console.log(
    `[rss ingest] start | maxSources=${maxSources} deadlineMs=${deadlineMs} force=${force}`
  )

  // Create shared mutable accumulator — populated as ingest progresses.
  const acc = createAcc()

  // The main ingest work (non-blocking from the race perspective).
  // If it completes before the timeout, great.
  // If the timeout fires first, acc holds whatever state was reached.
  const ingestWork = runDeadlineAwareIngest(acc, { maxSources, deadline, force })
    .catch(err => {
      // Should never reach here (runDeadlineAwareIngest never throws),
      // but if it somehow does, acc.runStatus stays 'running' → treated as timeout_partial.
      console.error('[api/ingest/rss POST] unexpected rejection in ingestWork:', err)
    })

  // Hard timeout — resolves after deadlineMs regardless of ingestWork progress.
  const hardTimeout = new Promise<void>(resolve => setTimeout(resolve, deadlineMs))

  // Race: whoever resolves first wins.
  // After race resolves, acc contains the latest accumulated state.
  await Promise.race([ingestWork, hardTimeout])

  const durationMs = Date.now() - startMs

  if (acc.runStatus === 'running') {
    // Timeout fired before ingest finished
    acc.runStatus = 'timeout_partial'
    acc.hints.push(
      `Hard deadline of ${deadlineMs}ms hit after ${durationMs}ms. ` +
      `Run again to process remaining sources/items.`
    )
    console.log(
      `[rss ingest] ⏰ TIMEOUT after ${durationMs}ms — returning partial results`
    )
  }

  const body   = buildIngestResponse(acc, durationMs, deadlineMs)
  const status = body.ok ? 200 : 500
  return NextResponse.json(body, { status })
}
