/**
 * GET /api/cron/pipeline
 *
 * Vercel Cron entry point for the daily recommendation pipeline.
 * Vercel sends GET for cron jobs — this dedicated route handles scheduled runs.
 * Manual triggers still use POST /api/pipeline/recommendations (the existing route).
 *
 * Fixed params for scheduled mode (tuned for Vercel Hobby 60s limit):
 *   maxSources=16, ingestTimeout=45s, deepDive=deterministic (no LLM, instant)
 */

import { type NextRequest, NextResponse } from 'next/server'
import { isServerSupabaseConfigured } from '@/lib/supabase/server'
import { verifyCronRequest } from '@/lib/cron/verify-cron'
import { createAcc, runDeadlineAwareIngest, buildIngestResponse } from '@/lib/ingest/ingest-runner'
import { attachDeepDivesToRecommendations } from '@/lib/recommendations/deep-dive'
import { getRecommendations } from '@/lib/recommendations/recommendation-engine'
import { applyDailyGate, persistDeliveries } from '@/lib/recommendations/apply-daily-gate'
import {
  insertRecommendationRun,
  updateRecommendationRun,
  getRecentRunningRun,
} from '@/lib/db/recommendation-runs'
import { createRecommendationSnapshot } from '@/lib/db/recommendation-snapshots'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ── Fixed scheduled-mode params ───────────────────────────────────────────────

const MAX_SOURCES     = 16
const INGEST_TIMEOUT  = 45_000  // 45s — leaves ~12s for refresh phase
const WINDOW_HOURS    = 72
const REFRESH_LIMIT   = 50
const LOCK_MINUTES    = 10

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = verifyCronRequest(req)
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (!isServerSupabaseConfigured) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 400 })
  }

  const startMs    = Date.now()
  const startedAt  = new Date().toISOString()

  console.log('[cron/pipeline] start — scheduled mode')
  if (auth.warning) console.warn('[cron/pipeline]', auth.warning)

  // ── Running lock: prevent concurrent pipeline runs ────────────────────────
  const lockCutoff = new Date(Date.now() - LOCK_MINUTES * 60_000).toISOString()
  const runningRun = await getRecentRunningRun(lockCutoff).catch(() => null)

  if (runningRun) {
    const ageMin = Math.round((Date.now() - new Date(runningRun.started_at).getTime()) / 60_000)
    if (ageMin < LOCK_MINUTES) {
      console.log(`[cron/pipeline] already_running age=${ageMin}m — skipping`)
      return NextResponse.json({ ok: true, status: 'already_running', ageMinutes: ageMin })
    }
    // Recover stale run
    await updateRecommendationRun(runningRun.id, {
      status:        'failed',
      error_message: `stale run recovered after ${ageMin}m by cron`,
      finished_at:   new Date().toISOString(),
    }).catch(() => {})
  }

  // ── Phase 1: RSS Ingest ───────────────────────────────────────────────────
  const acc          = createAcc()
  const ingestStart  = Date.now()
  const deadline     = ingestStart + INGEST_TIMEOUT

  await Promise.race([
    runDeadlineAwareIngest(acc, { maxSources: MAX_SOURCES, deadline, force: false }),
    new Promise<void>(r => setTimeout(r, INGEST_TIMEOUT)),
  ])

  if (acc.runStatus === 'running') acc.runStatus = 'timeout_partial'
  const ingestMs = Date.now() - ingestStart
  const ingest   = buildIngestResponse(acc, ingestMs, INGEST_TIMEOUT)

  console.log(
    `[cron/pipeline] ingest done — ` +
    `sources=${acc.sources.successful}ok/${acc.sources.failed}fail ` +
    `items=+${acc.items.insertedItems} ${ingestMs}ms`
  )

  // ── Phase 2: Recommendation Refresh ──────────────────────────────────────
  const refreshAt = new Date().toISOString()
  const runId = await insertRecommendationRun({
    status:       'running',
    window_hours: WINDOW_HOURS,
    limit_count:  REFRESH_LIMIT,
    started_at:   refreshAt,
  }).catch(() => null)

  let refreshOk = false
  let snapshotSummary: Record<string, unknown> | null = null

  try {
    const result = await getRecommendations({
      windowHours:    WINDOW_HOURS,
      limit:          REFRESH_LIMIT,
      includeArchive: true,
      fetchAll:       true,   // ④ store the full qualifying pool, not just top-N
    })

    const baseItems = result.items.filter(i => i.recommendationTier !== 'archive')
    // Daily hard gate: demote items not eligible for today (captured yesterday,
    // published too old, previously delivered) before they reach the snapshot.
    const { items: gatedItems, gateStats } = await applyDailyGate(baseItems)
    const { items: snapshotItems, deepDiveStats } = await attachDeepDivesToRecommendations(
      gatedItems,
      { mode: 'deterministic', concurrency: 2, includeSkipped: false },
    )

    const refreshMs  = Date.now() - startMs - ingestMs
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
        duration_ms:             refreshMs,
        finished_at:             new Date().toISOString(),
      }).catch(() => {})
    }

    const snapshotId = await createRecommendationSnapshot(
      {
        run_id:                    runId ?? undefined,
        status:                    runStatus,
        window_hours:              WINDOW_HOURS,
        limit_count:               REFRESH_LIMIT,
        captured_total:            result.stats.capturedTotal,
        recommendation_candidates: result.stats.recommendationCandidates,
        must_read_count:           result.stats.mustReadCount,
        high_value_count:          result.stats.highValueCount,
        observe_count:             result.stats.observeCount,
        archive_count:             result.stats.archiveCount,
        generated_at:              new Date().toISOString(),
        metadata:                  { deepDiveMode: 'deterministic', deepDiveStats, dailyGate: gateStats },
      },
      snapshotItems,
    )

    await persistDeliveries(snapshotItems, gateStats.todayKey, snapshotId).catch(() => {})

    refreshOk      = true
    snapshotSummary = {
      id:            snapshotId,
      status:        runStatus,
      mustReadCount: result.stats.mustReadCount,
      highValueCount: result.stats.highValueCount,
      observeCount:  result.stats.observeCount,
      capturedTotal: result.stats.capturedTotal,
    }

    console.log(
      `[cron/pipeline] done — MR=${result.stats.mustReadCount} ` +
      `HV=${result.stats.highValueCount} OB=${result.stats.observeCount} ` +
      `snapshot=${snapshotId} total=${Date.now() - startMs}ms`
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[cron/pipeline] refresh error:', msg)
    if (runId) {
      await updateRecommendationRun(runId, {
        status:        'failed',
        error_message: msg.slice(0, 500),
        finished_at:   new Date().toISOString(),
      }).catch(() => {})
    }
  }

  return NextResponse.json({
    ok:         refreshOk,
    trigger:    'vercel-cron',
    mode:       'scheduled',
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startMs,
    ingest: {
      ok:      ingest.ok,
      sources: ingest.sources,
      items:   ingest.items,
    },
    snapshot: snapshotSummary,
  })
}
