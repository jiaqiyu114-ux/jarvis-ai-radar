/**
 * POST /api/pipeline/recommendations
 * GET  /api/pipeline/recommendations
 *
 * Unified recommendation pipeline entry point.
 * Runs RSS ingest + recommendation refresh in a single call.
 *
 * This is the canonical trigger for:
 *   - Manual on-demand refresh from the Dashboard "手动重跑" button (mode=manual)
 *   - Future Vercel Cron / Windows Task Scheduler automation (mode=scheduled)
 *   - Server-side auto-trigger when snapshot is stale (mode=auto)
 *
 * --- NOT a long-running background job ---
 * This route is a synchronous HTTP handler with a hard deadline guarantee.
 * When sources exceed 100, upgrade to:
 *   - Batched scheduling per source group
 *   - Per-source cooldown tracking
 *   - Background queue (BullMQ / Supabase pg_cron)
 * But for the current scale (< 25 sources), this inline approach is correct.
 *
 * Running lock:
 *   If a recommendation_runs row with status='running' was started < 10 min ago,
 *   the request returns { status: 'already_running' } immediately without starting
 *   a second pipeline. Stale running rows (> 10 min) are recovered to 'failed'.
 *
 * POST params (query string):
 *   ingest            bool   default true   — run RSS ingest first
 *   refresh           bool   default true   — run recommendation refresh after
 *   maxSources        int    default 8      — sources attempted per ingest run
 *   ingestTimeoutMs   int    default 55000  — hard deadline for ingest phase
 *   refreshWindowHours int   default 72     — recommendation lookback window
 *   refreshLimit      int    default 50     — max items from recommendation engine
 *   mode              str    default manual — 'manual' | 'scheduled' | 'auto'
 *   force             bool   default false  — include failing sources
 *   secret            str    optional       — for scheduled mode auth
 */

import { type NextRequest, NextResponse } from 'next/server'
import { isServerSupabaseConfigured } from '@/lib/supabase/server'
import {
  attachDeepDivesToRecommendations,
  type FinalDeepDiveMode,
} from '@/lib/recommendations/deep-dive'
import { getDeepDiveModel, getLlmConfig } from '@/lib/llm/deep-dive-client'
import {
  createAcc,
  runDeadlineAwareIngest,
  buildIngestResponse,
} from '@/lib/ingest/ingest-runner'
import { getSourceCoverageStats } from '@/lib/ingest/source-selector'
import { getRecommendations } from '@/lib/recommendations/recommendation-engine'
import {
  getRecommendationFreshness,
} from '@/lib/recommendations/recommendation-freshness'
import { getPipelineAutomationStatus } from '@/lib/recommendations/pipeline-automation'
import {
  insertRecommendationRun,
  updateRecommendationRun,
  getLatestRecommendationRun,
  getRecentRunningRun,
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

type PipelineMode = 'manual' | 'scheduled' | 'auto'

type PipelineParams = {
  ingest:              boolean
  refresh:             boolean
  maxSources:          number
  ingestTimeoutMs:     number
  refreshWindowHours:  number
  refreshLimit:        number
  mode:                PipelineMode
  force:               boolean
  deepDiveMode:        FinalDeepDiveMode
}

function parseParams(req: NextRequest): PipelineParams {
  const sp = req.nextUrl.searchParams

  const rawIngestMs    = Number(sp.get('ingestTimeoutMs'))
  const rawMaxSources  = Number(sp.get('maxSources'))
  const rawWindowHours = Number(sp.get('refreshWindowHours'))
  const rawLimit       = Number(sp.get('refreshLimit'))
  const rawMode        = sp.get('mode') ?? 'manual'
  const deepDiveMode: FinalDeepDiveMode = sp.get('deepDive') === 'deterministic'
    ? 'deterministic'
    : 'llm'

  const mode: PipelineMode =
    rawMode === 'scheduled' ? 'scheduled' :
    rawMode === 'auto'      ? 'auto'      : 'manual'

  return {
    ingest:             sp.get('ingest')  !== 'false',
    refresh:            sp.get('refresh') !== 'false',
    maxSources:         clamp(Number.isFinite(rawMaxSources)  && rawMaxSources  > 0 ? rawMaxSources  : 12,  1, 40),
    ingestTimeoutMs:    clamp(Number.isFinite(rawIngestMs)    && rawIngestMs    > 0 ? rawIngestMs    : 55_000, 10_000, 300_000),
    refreshWindowHours: clamp(Number.isFinite(rawWindowHours) && rawWindowHours > 0 ? rawWindowHours : 72,  1, 168),
    refreshLimit:       clamp(Number.isFinite(rawLimit)       && rawLimit        > 0 ? rawLimit       : 50, 1, 100),
    mode,
    force:              sp.get('force') === 'true',
    deepDiveMode,
  }
}

// ── Auth helper ───────────────────────────────────────────────────────────────

function checkAuth(req: NextRequest, params: PipelineParams): boolean {
  const pipelineSecret = process.env.PIPELINE_SECRET
  if (!pipelineSecret) return true              // no secret configured → allow all
  if (params.mode === 'manual') return true      // manual mode never requires auth

  // scheduled / auto: require secret
  const authHeader  = req.headers.get('authorization') ?? ''
  const querySecret = req.nextUrl.searchParams.get('secret') ?? ''
  const provided    = authHeader.replace('Bearer ', '').trim() || querySecret.trim()
  return provided === pipelineSecret
}

// ── Overall status logic ──────────────────────────────────────────────────────

type PipelineStatus = 'success' | 'partial_success' | 'failed' | 'already_running'

function computeStatus(
  ingestEnabled:  boolean,
  ingestOk:       boolean | null,
  refreshEnabled: boolean,
  refreshOk:      boolean | null,
): Exclude<PipelineStatus, 'already_running'> {
  const both_failed = (ingestEnabled && ingestOk === false) && (refreshEnabled && refreshOk === false)
  const all_ok      = (!ingestEnabled || ingestOk === true)  && (!refreshEnabled || refreshOk === true)
  if (both_failed) return 'failed'
  if (all_ok)      return 'success'
  return 'partial_success'
}

// ── POST handler ──────────────────────────────────────────────────────────────

const RUNNING_LOCK_MINUTES = 10

export async function POST(req: NextRequest) {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({
      ok:    false,
      error: 'Supabase is not configured',
      hint:  'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local',
    }, { status: 400 })
  }

  const params    = parseParams(req)
  const llmConfig = getLlmConfig()
  const startMs   = Date.now()
  const startedAt = new Date().toISOString()
  const hints:    string[] = []

  // ── Auth check ────────────────────────────────────────────────────────────
  if (!checkAuth(req, params)) {
    return NextResponse.json({
      ok:    false,
      error: 'Unauthorized — provide Authorization: Bearer <PIPELINE_SECRET> for scheduled/auto mode',
    }, { status: 401 })
  }
  if (!process.env.PIPELINE_SECRET) {
    hints.push('PIPELINE_SECRET not set. Set this env var before enabling automated cron to protect the endpoint.')
  }

  // ── Running lock ──────────────────────────────────────────────────────────
  // Prevent concurrent pipeline runs. Stale runs (> 10 min) are recovered.
  const lockCutoff  = new Date(Date.now() - RUNNING_LOCK_MINUTES * 60_000).toISOString()
  const runningRun  = await getRecentRunningRun(lockCutoff).catch(() => null)

  if (runningRun) {
    const runAgeMs  = Date.now() - new Date(runningRun.started_at).getTime()
    const runAgeMin = Math.round(runAgeMs / 60_000)

    if (runAgeMin < RUNNING_LOCK_MINUTES) {
      // Active running run — do not start another
      console.log(`[pipeline] already_running run=${runningRun.id} age=${runAgeMin}m`)
      return NextResponse.json({
        ok:      true,
        status:  'already_running' as const,
        message: `Recommendation pipeline is already running (started ${runAgeMin}m ago). Wait for it to finish.`,
        mode:    params.mode,
        run:     { id: runningRun.id, startedAt: runningRun.started_at, ageMinutes: runAgeMin },
      })
    } else {
      // Stale running run — recover it and proceed
      console.log(`[pipeline] recovering stale running run=${runningRun.id} age=${runAgeMin}m`)
      await updateRecommendationRun(runningRun.id, {
        status:        'failed',
        error_message: `stale running run recovered after ${runAgeMin}m (new pipeline start)`,
        finished_at:   new Date().toISOString(),
      }).catch(() => {})
    }
  }

  console.log(
    `[pipeline] start mode=${params.mode} ingest=${params.ingest} refresh=${params.refresh} ` +
    `maxSources=${params.maxSources} ingestTimeoutMs=${params.ingestTimeoutMs} deepDive=${params.deepDiveMode}`,
  )

  // ── Phase 1: RSS Ingest ───────────────────────────────────────────────────

  let ingestResult: Record<string, unknown> | null = null
  let ingestOk:     boolean | null = null

  if (params.ingest) {
    const ingestStart    = Date.now()
    const ingestDeadline = ingestStart + params.ingestTimeoutMs
    const acc            = createAcc()

    const ingestWork = runDeadlineAwareIngest(acc, {
      maxSources: params.maxSources,
      deadline:   ingestDeadline,
      force:      params.force,
    }).catch(() => {})

    await Promise.race([
      ingestWork,
      new Promise<void>(resolve => setTimeout(resolve, params.ingestTimeoutMs)),
    ])

    if (acc.runStatus === 'running') {
      acc.runStatus = 'timeout_partial'
      acc.hints.push(`Ingest deadline of ${params.ingestTimeoutMs}ms hit. Run again to continue.`)
    }

    const ingestDurationMs = Date.now() - ingestStart
    const raw  = buildIngestResponse(acc, ingestDurationMs, params.ingestTimeoutMs)
    ingestOk   = (raw.ok as boolean) ?? false

    ingestResult = {
      enabled:       true,
      ok:            ingestOk,
      runStatus:     raw.runStatus,
      durationMs:    ingestDurationMs,
      sources:       raw.sources,
      items:         raw.items,
      failedSources: raw.failedSources,
      hints:         raw.hints,
      sourceSelection: raw.sourceSelection ?? null,
    }

    if (acc.sources.successful === 0) {
      hints.push('Ingest: no sources succeeded. Check /api/recommendations/health for details.')
    } else {
      hints.push(`Ingest: ${acc.sources.successful} source(s) OK, ${acc.items.insertedItems} new item(s).`)
    }

    console.log(
      `[pipeline] ingest done — status=${raw.runStatus} sources=${acc.sources.successful}ok ` +
      `items=+${acc.items.insertedItems}/~${acc.items.reusedItems} duration=${ingestDurationMs}ms`,
    )
  } else {
    ingestResult = { enabled: false }
    ingestOk     = null
    hints.push('Ingest skipped (ingest=false).')
  }

  // ── Phase 2: Recommendation Refresh ──────────────────────────────────────

  let refreshResult: Record<string, unknown> | null = null
  let refreshOk:     boolean | null = null

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
      const result     = await getRecommendations({
        windowHours:    params.refreshWindowHours,
        limit:          params.refreshLimit,
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

      const snapshotItemsBase = result.items.filter(i => i.recommendationTier !== 'archive')
      const {
        items: snapshotItems,
        deepDiveStats,
      } = await attachDeepDivesToRecommendations(snapshotItemsBase, {
        mode: params.deepDiveMode,
        concurrency: 2,
        includeSkipped: false,
      })
      const snapshotId    = await createRecommendationSnapshot(
        {
          run_id:                    runId ?? undefined,
          status:                    runStatus,
          window_hours:              params.refreshWindowHours,
          limit_count:               params.refreshLimit,
          captured_total:            result.stats.capturedTotal,
          recommendation_candidates: result.stats.recommendationCandidates,
          must_read_count:           result.stats.mustReadCount,
          high_value_count:          result.stats.highValueCount,
          observe_count:             result.stats.observeCount,
          archive_count:             result.stats.archiveCount,
          generated_at:              new Date().toISOString(),
          metadata: {
            deepDiveMode: params.deepDiveMode,
            deepDiveStats,
          },
        },
        snapshotItems,
      )

      refreshOk     = true
      refreshResult = {
        enabled:   true,
        ok:        true,
        runStatus,
        durationMs,
        deepDiveMode: params.deepDiveMode,
        deepDiveStats,
        run:       runId      ? { id: runId, status: runStatus, startedAt: refreshAt, durationMs } : null,
        snapshot:  snapshotId ? {
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
        stats: result.stats,
        items: snapshotItems,
      }

      hints.push(
        `Refresh: MR=${result.stats.mustReadCount} HV=${result.stats.highValueCount} ` +
        `OB=${result.stats.observeCount} captured=${result.stats.capturedTotal} deepDive=${deepDiveStats.generated}/${deepDiveStats.total}`,
      )
      console.log(
        `[pipeline] refresh done — status=${runStatus} MR=${result.stats.mustReadCount} ` +
        `HV=${result.stats.highValueCount} snapshot=${snapshotId ?? 'null'} duration=${durationMs}ms`,
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

      refreshOk     = false
      refreshResult = {
        enabled:   true,
        ok:        false,
        runStatus: 'failed',
        durationMs,
        deepDiveMode: params.deepDiveMode,
        deepDiveStats: {
          total: 0,
          generated: 0,
          fallback: 0,
          failed: 0,
          model: params.deepDiveMode === 'llm' ? getDeepDiveModel(llmConfig) : 'deterministic-v1',
          provider: params.deepDiveMode === 'llm' ? llmConfig.provider : 'deterministic',
          mode: params.deepDiveMode,
        },
        error:     message,
        run:       runId ? { id: runId, status: 'failed', startedAt: refreshAt, durationMs } : null,
        snapshot:  null,
        stats:     null,
      }
      hints.push(`Refresh failed: ${message.slice(0, 120)}`)
    }
  } else {
    refreshResult = {
      enabled: false,
      deepDiveMode: params.deepDiveMode,
      deepDiveStats: null,
    }
    refreshOk     = null
    hints.push('Refresh skipped (refresh=false).')
  }

  // ── Build response ────────────────────────────────────────────────────────

  const totalDurationMs = Date.now() - startMs
  const status          = computeStatus(params.ingest, ingestOk, params.refresh, refreshOk)
  const deepDiveStats = (refreshResult as { deepDiveStats?: unknown } | null)?.deepDiveStats ?? null

  console.log(`[pipeline] finish status=${status} mode=${params.mode} totalMs=${totalDurationMs}`)

  return NextResponse.json({
    ok:         status !== 'failed',
    status,
    mode:       params.mode,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: totalDurationMs,
    deepDiveMode: params.deepDiveMode,
    deepDiveStats,
    ingest:     ingestResult,
    refresh:    refreshResult,
    hints,
  })
}

// ── GET handler — pipeline status, freshness, coverage, automation ────────────

export async function GET() {
  const now = new Date()
  const runningCutoff = new Date(Date.now() - RUNNING_LOCK_MINUTES * 60_000).toISOString()

  const [latestRun, latestSnapshot, coverage, runningRun, automationBase] = await Promise.all([
    getLatestRecommendationRun().catch(() => null),
    getLatestRecommendationSnapshot().catch(() => null),
    getSourceCoverageStats().catch(() => null),
    getRecentRunningRun(runningCutoff).catch(() => null),
    getPipelineAutomationStatus().catch(() => ({
      localTaskScriptAvailable: false,
      vercelCronConfigured: false,
      cronPath: null,
      recommendedSchedule: 'every 6 hours' as const,
      secretConfigured: false,
    })),
  ])

  const freshness = getRecommendationFreshness({
    latestSnapshot: latestSnapshot ? { generated_at: latestSnapshot.generated_at } : null,
    latestRun,
    coverage,
    now,
  })

  const runningAgeMinutes = runningRun
    ? Math.max(0, Math.round((now.getTime() - new Date(runningRun.started_at).getTime()) / 60_000))
    : null

  const latestRunAgeMinutes = latestRun
    ? Math.max(0, Math.round((now.getTime() - new Date(latestRun.started_at).getTime()) / 60_000))
    : null

  const latestSnapshotAgeMinutes = latestSnapshot
    ? Math.max(0, Math.round((now.getTime() - new Date(latestSnapshot.generated_at).getTime()) / 60_000))
    : null

  type PipelineStatus = 'ok' | 'warning' | 'stale' | 'missing' | 'running'
  const status: PipelineStatus = runningRun
    ? 'running'
    : freshness.severity === 'ok'
      ? 'ok'
      : freshness.severity

  const statusLabelMap: Record<Exclude<PipelineStatus, 'running'>, string> = {
    ok: 'normal',
    warning: 'warning',
    stale: 'stale',
    missing: 'missing snapshot',
  }

  const freshnessPayload = {
    severity: freshness.severity,
    label: statusLabelMap[freshness.severity],
    message: freshness.reason,
    shouldAutoRefresh: freshness.shouldAutoRefresh,
    ageMinutes: freshness.ageMinutes,
    ageHours: freshness.ageHours,
    isFresh: freshness.isFresh,
    isStale: freshness.isStale,
  }

  const coveragePayload = coverage
    ? {
        totalActive: coverage.totalActiveRss,
        healthySources: coverage.healthySources,
        neverFetchedSources: coverage.neverFetchedSources,
        fetchedLast24h: coverage.fetchedLast24h,
        suggestedNextMaxSources: coverage.suggestedNextMaxSources,
        needsRefresh: coverage.needsRefresh,
        reason: coverage.reason,
      }
    : {
        totalActive: 0,
        healthySources: 0,
        neverFetchedSources: 0,
        fetchedLast24h: 0,
        suggestedNextMaxSources: 8,
        needsRefresh: true,
        reason: 'coverage unavailable',
      }

  const automation = {
    ...automationBase,
    scheduledReady: automationBase.vercelCronConfigured || automationBase.localTaskScriptAvailable,
    suggestedCronPath: automationBase.cronPath ?? '/api/pipeline/recommendations?mode=scheduled&maxSources=12&ingestTimeoutMs=55000',
    hint: automationBase.secretConfigured
      ? 'PIPELINE_SECRET configured'
      : 'PIPELINE_SECRET not configured (recommended for production scheduled mode)',
  }

  const hints: string[] = []
  if (!latestSnapshot) {
    hints.push('No snapshot found. Trigger POST /api/pipeline/recommendations once.')
  }
  if (runningRun) {
    hints.push(`Pipeline is running now (${runningAgeMinutes}m elapsed).`)
  }
  if (coveragePayload.needsRefresh) {
    hints.push(`Coverage suggests refresh: ${coveragePayload.reason}.`)
  }
  if (!automation.vercelCronConfigured) {
    hints.push('Vercel cron not detected. Configure vercel.json or use local task scheduler.')
  }
  if (!automation.secretConfigured) {
    hints.push('Set PIPELINE_SECRET in production before enabling scheduled mode.')
  }
  if (latestRun?.status === 'failed') {
    hints.push('Latest run failed. Existing snapshot is preserved, retry when needed.')
  }

  return NextResponse.json({
    ok: true,
    status,
    now: now.toISOString(),
    checkedAt: now.toISOString(),
    latestRun: latestRun ? {
      id: latestRun.id,
      status: latestRun.status,
      startedAt: latestRun.started_at,
      finishedAt: latestRun.finished_at,
      durationMs: latestRun.duration_ms,
      ageMinutes: latestRunAgeMinutes,
    } : null,
    latestSnapshot: latestSnapshot ? {
      id: latestSnapshot.id,
      status: latestSnapshot.status,
      generatedAt: latestSnapshot.generated_at,
      ageMinutes: latestSnapshotAgeMinutes,
      capturedTotal: latestSnapshot.captured_total,
      recommendationCandidates: latestSnapshot.recommendation_candidates,
      mustReadCount: latestSnapshot.must_read_count,
      highValueCount: latestSnapshot.high_value_count,
      observeCount: latestSnapshot.observe_count,
    } : null,
    freshness: freshnessPayload,
    coverage: coveragePayload,
    automation: {
      localTaskScriptAvailable: automation.localTaskScriptAvailable,
      vercelCronConfigured: automation.vercelCronConfigured,
      cronPath: automation.cronPath,
      recommendedSchedule: automation.recommendedSchedule,
      secretConfigured: automation.secretConfigured,
      scheduledReady: automation.scheduledReady,
      suggestedCronPath: automation.suggestedCronPath,
      hint: automation.hint,
    },

    // Backward-compatible fields
    snapshot: latestSnapshot ? {
      id: latestSnapshot.id,
      status: latestSnapshot.status,
      generatedAt: latestSnapshot.generated_at,
      ageHours: latestSnapshotAgeMinutes !== null ? Math.round((latestSnapshotAgeMinutes / 60) * 10) / 10 : null,
      isStale: freshness.isStale,
      mustReadCount: latestSnapshot.must_read_count,
      highValueCount: latestSnapshot.high_value_count,
      observeCount: latestSnapshot.observe_count,
      capturedTotal: latestSnapshot.captured_total,
    } : null,
    hints,
  })
}
