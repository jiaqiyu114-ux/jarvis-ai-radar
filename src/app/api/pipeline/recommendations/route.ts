/**
 * POST /api/pipeline/recommendations
 * GET  /api/pipeline/recommendations
 *
 * Unified recommendation pipeline entry point.
 * Runs RSS ingest + recommendation refresh in a single call.
 *
 * This is the canonical trigger for:
 *   - Manual on-demand refresh from the Dashboard "刷新推荐" button
 *   - Future Vercel Cron / Windows Task Scheduler automation
 *   - CI / health checks
 *
 * --- NOT a long-running background job ---
 * This route is a synchronous HTTP handler with a hard deadline guarantee.
 * When sources exceed 100, upgrade to:
 *   - Batched scheduling per source group
 *   - Per-source cooldown tracking
 *   - Background queue (BullMQ / Supabase pg_cron)
 * But for the current scale (< 25 sources), this inline approach is correct.
 *
 * POST params (query string):
 *   ingest            bool   default true   — run RSS ingest first
 *   refresh           bool   default true   — run recommendation refresh after
 *   maxSources        int    default 8      — sources attempted per ingest run
 *   ingestTimeoutMs   int    default 55000  — hard deadline for ingest phase
 *   refreshWindowHours int   default 72     — recommendation lookback window
 *   refreshLimit      int    default 50     — max items from recommendation engine
 *   mode              str    default manual — 'manual' | 'scheduled'
 *   force             bool   default false  — include failing sources
 */

import { type NextRequest, NextResponse } from 'next/server'
import { isServerSupabaseConfigured } from '@/lib/supabase/server'
import {
  createAcc,
  runDeadlineAwareIngest,
  buildIngestResponse,
} from '@/lib/ingest/ingest-runner'
import { getRecommendations } from '@/lib/recommendations/recommendation-engine'
import {
  insertRecommendationRun,
  updateRecommendationRun,
  getLatestRecommendationRun,
} from '@/lib/db/recommendation-runs'
import {
  createRecommendationSnapshot,
  getLatestRecommendationSnapshot,
} from '@/lib/db/recommendation-snapshots'

export const dynamic = 'force-dynamic'

// ── Param parsing ─────────────────────────────────────────────────────────────

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

type PipelineParams = {
  ingest:              boolean
  refresh:             boolean
  maxSources:          number
  ingestTimeoutMs:     number
  refreshWindowHours:  number
  refreshLimit:        number
  mode:                'manual' | 'scheduled'
  force:               boolean
}

function parseParams(req: NextRequest): PipelineParams {
  const sp = req.nextUrl.searchParams

  const rawIngestMs     = Number(sp.get('ingestTimeoutMs'))
  const rawMaxSources   = Number(sp.get('maxSources'))
  const rawWindowHours  = Number(sp.get('refreshWindowHours'))
  const rawLimit        = Number(sp.get('refreshLimit'))
  const rawMode         = sp.get('mode') ?? 'manual'

  return {
    ingest:             sp.get('ingest')  !== 'false',
    refresh:            sp.get('refresh') !== 'false',
    maxSources:         clamp(Number.isFinite(rawMaxSources)  && rawMaxSources  > 0 ? rawMaxSources  : 8,   1, 20),
    ingestTimeoutMs:    clamp(Number.isFinite(rawIngestMs)    && rawIngestMs    > 0 ? rawIngestMs    : 55_000, 10_000, 80_000),
    refreshWindowHours: clamp(Number.isFinite(rawWindowHours) && rawWindowHours > 0 ? rawWindowHours : 72,  1, 168),
    refreshLimit:       clamp(Number.isFinite(rawLimit)       && rawLimit        > 0 ? rawLimit       : 50, 1, 100),
    mode:               (rawMode === 'scheduled' ? 'scheduled' : 'manual') as 'manual' | 'scheduled',
    force:              sp.get('force') === 'true',
  }
}

// ── Overall status logic ──────────────────────────────────────────────────────

type PipelineStatus = 'success' | 'partial_success' | 'failed'

function computeStatus(
  ingestEnabled: boolean,
  ingestOk:      boolean | null,    // null = skipped
  refreshEnabled: boolean,
  refreshOk:      boolean | null,   // null = skipped
): PipelineStatus {
  const both_failed    = (ingestEnabled && ingestOk === false) && (refreshEnabled && refreshOk === false)
  const any_ok         = (!ingestEnabled || ingestOk !== false) || (!refreshEnabled || refreshOk !== false)
  const all_ok         = (!ingestEnabled || ingestOk === true)  && (!refreshEnabled || refreshOk === true)

  if (both_failed)  return 'failed'
  if (all_ok)       return 'success'
  if (any_ok)       return 'partial_success'
  return 'failed'
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({
      ok:    false,
      error: 'Supabase is not configured',
      hint:  'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local',
    }, { status: 400 })
  }

  const params     = parseParams(req)
  const startMs    = Date.now()
  const startedAt  = new Date().toISOString()
  const hints:     string[] = []

  console.log(
    `[pipeline] start mode=${params.mode} ingest=${params.ingest} refresh=${params.refresh} ` +
    `maxSources=${params.maxSources} ingestTimeoutMs=${params.ingestTimeoutMs}`
  )

  // ── Phase 1: RSS Ingest ───────────────────────────────────────────────────────

  let ingestResult: Record<string, unknown> | null = null
  let ingestOk: boolean | null = null

  if (params.ingest) {
    const ingestStart    = Date.now()
    const ingestDeadline = ingestStart + params.ingestTimeoutMs
    const acc            = createAcc()

    // Use Promise.race for the hard deadline guarantee (same pattern as /api/ingest/rss POST)
    const ingestWork = runDeadlineAwareIngest(acc, {
      maxSources: params.maxSources,
      deadline:   ingestDeadline,
      force:      params.force,
    }).catch(() => { /* runDeadlineAwareIngest never throws, but safety net */ })

    await Promise.race([
      ingestWork,
      new Promise<void>(resolve => setTimeout(resolve, params.ingestTimeoutMs)),
    ])

    if (acc.runStatus === 'running') {
      acc.runStatus = 'timeout_partial'
      acc.hints.push(`Ingest deadline of ${params.ingestTimeoutMs}ms hit. Run again to continue.`)
    }

    const ingestDurationMs = Date.now() - ingestStart
    const raw = buildIngestResponse(acc, ingestDurationMs, params.ingestTimeoutMs)
    ingestOk = (raw.ok as boolean) ?? false

    ingestResult = {
      enabled:     true,
      ok:          ingestOk,
      runStatus:   raw.runStatus,
      durationMs:  ingestDurationMs,
      sources:     raw.sources,
      items:       raw.items,
      failedSources: raw.failedSources,
      hints:       raw.hints,
    }

    if (acc.sources.successful === 0) {
      hints.push('Ingest: no sources succeeded. Check /api/recommendations/health for details.')
    } else if (ingestOk) {
      hints.push(`Ingest: ${acc.sources.successful} source(s) OK, ${acc.items.insertedItems} new item(s).`)
    }

    console.log(
      `[pipeline] ingest done — status=${raw.runStatus} sources=${acc.sources.successful}ok ` +
      `items=+${acc.items.insertedItems}/~${acc.items.reusedItems} duration=${ingestDurationMs}ms`
    )
  } else {
    ingestResult = { enabled: false }
    ingestOk = null
    hints.push('Ingest skipped (ingest=false).')
  }

  // ── Phase 2: Recommendation Refresh ──────────────────────────────────────────

  let refreshResult: Record<string, unknown> | null = null
  let refreshOk: boolean | null = null

  if (params.refresh) {
    const refreshStart = Date.now()
    const refreshAt    = new Date().toISOString()

    const runId = await insertRecommendationRun({
      status:       'running',
      window_hours: params.refreshWindowHours,
      limit_count:  params.refreshLimit,
      started_at:   refreshAt,
    })

    try {
      const result = await getRecommendations({
        windowHours:   params.refreshWindowHours,
        limit:         params.refreshLimit,
        includeArchive: true,
      })
      const durationMs = Date.now() - refreshStart
      const runStatus  = result.items.length > 0 ? 'success' : 'partial_success'

      if (runId) {
        await updateRecommendationRun(runId, {
          status:                  runStatus,
          captured_total:          result.stats.capturedTotal,
          recommended_candidates:  result.stats.recommendationCandidates,
          must_read_count:         result.stats.mustReadCount,
          high_value_count:        result.stats.highValueCount,
          observe_count:           result.stats.observeCount,
          archive_count:           result.stats.archiveCount,
          duration_ms:             durationMs,
          finished_at:             new Date().toISOString(),
        })
      }

      const snapshotItems = result.items.filter(i => i.recommendationTier !== 'archive')
      const snapshotId    = await createRecommendationSnapshot(
        {
          run_id:                   runId ?? undefined,
          status:                   runStatus,
          window_hours:             params.refreshWindowHours,
          limit_count:              params.refreshLimit,
          captured_total:           result.stats.capturedTotal,
          recommendation_candidates: result.stats.recommendationCandidates,
          must_read_count:          result.stats.mustReadCount,
          high_value_count:         result.stats.highValueCount,
          observe_count:            result.stats.observeCount,
          archive_count:            result.stats.archiveCount,
          generated_at:             new Date().toISOString(),
        },
        snapshotItems,
      )

      refreshOk = true
      refreshResult = {
        enabled:    true,
        ok:         true,
        runStatus,
        durationMs,
        run:        runId      ? { id: runId, status: runStatus, startedAt: refreshAt, durationMs } : null,
        snapshot:   snapshotId ? {
          id:                       snapshotId,
          runId,
          status:                   runStatus,
          generatedAt:              new Date().toISOString(),
          windowHours:              params.refreshWindowHours,
          capturedTotal:            result.stats.capturedTotal,
          mustReadCount:            result.stats.mustReadCount,
          highValueCount:           result.stats.highValueCount,
          observeCount:             result.stats.observeCount,
        } : null,
        stats:      result.stats,
      }

      hints.push(
        `Refresh: MR=${result.stats.mustReadCount} HV=${result.stats.highValueCount} ` +
        `OB=${result.stats.observeCount} captured=${result.stats.capturedTotal}`
      )
      console.log(
        `[pipeline] refresh done — status=${runStatus} MR=${result.stats.mustReadCount} ` +
        `HV=${result.stats.highValueCount} snapshot=${snapshotId ?? 'null'} duration=${durationMs}ms`
      )

    } catch (err) {
      const durationMs = Date.now() - refreshStart
      const message    = err instanceof Error ? err.message : String(err)
      console.error('[pipeline] refresh error:', message)

      if (runId) {
        await updateRecommendationRun(runId, {
          status:        'failed',
          error_message: message.slice(0, 500),
          duration_ms:   durationMs,
          finished_at:   new Date().toISOString(),
        })
      }

      refreshOk = false
      refreshResult = {
        enabled:   true,
        ok:        false,
        runStatus: 'failed',
        durationMs,
        error:     message,
        run:       runId ? { id: runId, status: 'failed', startedAt: refreshAt, durationMs } : null,
        snapshot:  null,
        stats:     null,
      }
      hints.push(`Refresh failed: ${message.slice(0, 120)}`)
    }
  } else {
    refreshResult = { enabled: false }
    refreshOk = null
    hints.push('Refresh skipped (refresh=false).')
  }

  // ── Build response ────────────────────────────────────────────────────────────

  const totalDurationMs = Date.now() - startMs
  const status = computeStatus(params.ingest, ingestOk, params.refresh, refreshOk)

  console.log(
    `[pipeline] finish status=${status} mode=${params.mode} totalMs=${totalDurationMs}`
  )

  return NextResponse.json({
    ok:          status !== 'failed',
    status,
    mode:        params.mode,
    startedAt,
    finishedAt:  new Date().toISOString(),
    durationMs:  totalDurationMs,
    ingest:      ingestResult,
    refresh:     refreshResult,
    hints,
  })
}

// ── GET handler — pipeline health / status ────────────────────────────────────

export async function GET() {
  const now      = new Date()
  const h24start = new Date(now.getTime() - 24 * 3_600_000).toISOString()

  const [latestRun, latestSnapshot] = await Promise.all([
    getLatestRecommendationRun().catch(() => null),
    getLatestRecommendationSnapshot().catch(() => null),
  ])

  // Snapshot age
  const snapshotAgeMs = latestSnapshot
    ? now.getTime() - new Date(latestSnapshot.generated_at).getTime()
    : null
  const snapshotIsStale  = snapshotAgeMs !== null && snapshotAgeMs > 24 * 3_600_000
  const snapshotAgeHours = snapshotAgeMs !== null ? Math.round(snapshotAgeMs / 3_600_000) : null

  // Recommendation advice
  const shouldRefresh =
    !latestSnapshot ||
    snapshotIsStale ||
    (latestRun?.status === 'failed')

  const hints: string[] = []
  if (!latestSnapshot) {
    hints.push('No snapshot found. Run POST /api/pipeline/recommendations to generate one.')
  } else if (snapshotIsStale) {
    hints.push(`Snapshot is ${snapshotAgeHours}h old (> 24h). Consider refreshing.`)
  }
  if (latestRun?.status === 'failed') {
    hints.push('Last run failed. Check logs and retry.')
  }

  return NextResponse.json({
    ok:           true,
    checkedAt:    now.toISOString(),
    shouldRefresh,
    snapshot: latestSnapshot ? {
      id:            latestSnapshot.id,
      status:        latestSnapshot.status,
      generatedAt:   latestSnapshot.generated_at,
      ageHours:      snapshotAgeHours,
      isStale:       snapshotIsStale,
      mustReadCount: latestSnapshot.must_read_count,
      highValueCount: latestSnapshot.high_value_count,
      observeCount:  latestSnapshot.observe_count,
      capturedTotal: latestSnapshot.captured_total,
    } : null,
    latestRun: latestRun ? {
      id:         latestRun.id,
      status:     latestRun.status,
      startedAt:  latestRun.started_at,
      durationMs: latestRun.duration_ms,
    } : null,
    lastIngestWindow: h24start,
    hints,
  })
}
