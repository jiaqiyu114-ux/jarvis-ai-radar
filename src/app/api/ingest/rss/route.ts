import { type NextRequest, NextResponse } from 'next/server'
import { runRssProviderIngest } from '@/lib/ingest/ingest-service'
import { isServerSupabaseConfigured } from '@/lib/supabase/server'
import type { RssWriteResult, RssDryRunResult } from '@/lib/ingest/ingest-service'
import type { SourceHealthSummary } from '@/lib/providers/rss-provider'

/**
 * GET /api/ingest/rss                — dry-run; fetches feeds, no DB writes
 * GET /api/ingest/rss?write=true     — fetches feeds and writes to DB
 * POST /api/ingest/rss               — fetches feeds and writes to DB
 *
 * Concurrency model (see rss-provider.ts):
 *   - Sources are fetched in parallel batches (4 concurrent)
 *   - Per-source timeout: 9 s
 *   - Global deadline: 65 s — returns partial_success when hit
 *   - Single source failures never block other sources
 *
 * POST response shape:
 *   {
 *     ok, runStatus, durationMs,
 *     sources: { total, processed, successful, failed, timedOut, skipped },
 *     items:   { fetched, insertedItems, reusedItems, insertedMentions, skippedMentions },
 *     failedSources: [{ name, url, reason, durationMs }]
 *   }
 */

/** Build the structured summary response expected by the task spec. */
function buildSummaryResponse(
  result: RssWriteResult | RssDryRunResult,
  durationMs: number,
): Record<string, unknown> {
  const sh = result.sourceHealthSummary as SourceHealthSummary

  const failedSources = result.feedErrors.map(e => ({
    name:      e.sourceName,
    url:       e.feedUrl,
    stage:     e.stage,
    reason:    e.message,
    durationMs: e.latencyMs ?? null,
  }))

  const processed = sh.total - (sh.skippedThisRun ?? 0)

  // Write-mode fields (inserted/reused/mentions)
  const writeResult = result as RssWriteResult
  const itemsInserted  = writeResult.insertedItems     ?? 0
  const itemsReused    = writeResult.reusedItems       ?? 0
  const mentInserted   = writeResult.insertedMentions  ?? 0
  const mentSkipped    = writeResult.skippedMentions   ?? 0

  // Dry-run fields
  const dryResult = result as RssDryRunResult
  const itemsFetched = dryResult.fetched ?? (itemsInserted + itemsReused)

  return {
    ok:        result.ok,
    runStatus: result.runStatus,
    durationMs,
    sources: {
      total:      sh.total,
      processed,
      successful: sh.succeededThisRun,
      failed:     sh.failedThisRun,
      timedOut:   sh.timedOutThisRun  ?? 0,
      skipped:    sh.skippedThisRun   ?? 0,
    },
    items: {
      fetched:          itemsFetched,
      insertedItems:    itemsInserted,
      reusedItems:      itemsReused,
      insertedMentions: mentInserted,
      skippedMentions:  mentSkipped,
    },
    failedSources,
    // Keep the detailed debug in dev/staging
    ...(process.env.NODE_ENV !== 'production' && {
      sourceMode:      result.sourceMode,
      sourceLoadDebug: result.sourceLoadDebug,
    }),
  }
}

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

    const result = await runRssProviderIngest({ dryRun: !write, recordHealth: write })
    const durationMs = Date.now() - startMs

    if (write) {
      const httpStatus = result.runStatus === 'full_failure' ? 500 : 200
      return NextResponse.json(buildSummaryResponse(result, durationMs), { status: httpStatus })
    }

    // Dry-run: keep the full verbose response (useful for debugging)
    const body = result as Record<string, unknown>
    const httpStatus = result.ok ? 200 : 500
    return NextResponse.json({ ...body, durationMs }, { status: httpStatus })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/ingest/rss GET]', message)
    return NextResponse.json({
      ok: false, error: message, durationMs: Date.now() - startMs,
    }, { status: 500 })
  }
}

export async function POST() {
  const startMs = Date.now()

  if (!isServerSupabaseConfigured) {
    return NextResponse.json({
      ok:    false,
      error: 'Supabase is not configured',
      hint:  'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local',
    }, { status: 400 })
  }

  try {
    const result = await runRssProviderIngest({ dryRun: false, recordHealth: true })
    const durationMs = Date.now() - startMs

    // 200 for full_success and partial_success; 500 only for full_failure
    const httpStatus = result.runStatus === 'full_failure' ? 500 : 200
    return NextResponse.json(buildSummaryResponse(result, durationMs), { status: httpStatus })

  } catch (err) {
    const durationMs = Date.now() - startMs
    const message    = err instanceof Error ? err.message : String(err)
    const stack      = err instanceof Error ? err.stack   : undefined

    console.error('[api/ingest/rss POST] unhandled exception:', message)
    if (stack) console.error(stack)

    return NextResponse.json({
      ok:        false,
      runStatus: 'full_failure',
      durationMs,
      error:     message,
      hint:      'Check the dev server console for the full stack trace.',
      ...(process.env.NODE_ENV !== 'production' && stack ? { stack } : {}),
    }, { status: 500 })
  }
}
