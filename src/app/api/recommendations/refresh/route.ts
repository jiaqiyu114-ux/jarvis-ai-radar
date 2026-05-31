import { NextResponse } from 'next/server'
import { getRecommendations } from '@/lib/recommendations/recommendation-engine'
import { generateDeterministicDeepDive } from '@/lib/recommendations/deep-dive'
import {
  insertRecommendationRun,
  updateRecommendationRun,
} from '@/lib/db/recommendation-runs'
import {
  createRecommendationSnapshot,
} from '@/lib/db/recommendation-snapshots'

export const dynamic = 'force-dynamic'

function withDeepDive<T extends {
  title: string
  summary: string
  source: string
  sourceTier: string
  category: string
  finalScore: number
  evScore: number | null
  truthScore: number | null
  recommendationTier: string
  sourceStatus: string
  recommendationReason: string
  riskNote: string
  nextStep: string
  shouldTrackEvent: boolean
  shouldEnterDailyReport: boolean
  shouldDeepAnalyze: boolean
  analysisTier: string | null
  publishedAt: string
  fetchedAt: string | null
  originalUrl: string
  deepDive?: unknown
}>(items: T[]) {
  return items.map((item) => {
    if (item.deepDive) return item
    return {
      ...item,
      deepDive: generateDeterministicDeepDive({
        title: item.title,
        summary: item.summary,
        source: item.source,
        sourceTier: item.sourceTier,
        category: item.category,
        finalScore: item.finalScore,
        evScore: item.evScore,
        truthScore: item.truthScore,
        recommendationTier: item.recommendationTier,
        sourceStatus: item.sourceStatus,
        recommendationReason: item.recommendationReason,
        riskNote: item.riskNote,
        nextStep: item.nextStep,
        shouldTrackEvent: item.shouldTrackEvent,
        shouldEnterDailyReport: item.shouldEnterDailyReport,
        shouldDeepAnalyze: item.shouldDeepAnalyze,
        analysisTier: item.analysisTier,
        publishedAt: item.publishedAt,
        fetchedAt: item.fetchedAt,
        originalUrl: item.originalUrl,
      }),
    }
  })
}

/**
 * POST /api/recommendations/refresh
 *
 * The canonical entry point for generating a new recommendation snapshot.
 *
 * Flow:
 *   1. Run recommendation engine
 *   2. Write recommendation_runs record
 *   3. Write recommendation_snapshots + recommendation_snapshot_items
 *   4. Return { ok, runStatus, run, snapshot, stats, items }
 *
 * After a successful refresh, GET /api/recommendations will return
 * the new snapshot. Failures do NOT overwrite a previously good snapshot.
 */
export async function POST() {
  const WINDOW_HOURS = 72
  const LIMIT        = 50
  const startMs      = Date.now()
  const startedAt    = new Date().toISOString()

  // 1. Insert initial run record
  const runId = await insertRecommendationRun({
    status:       'running',
    window_hours: WINDOW_HOURS,
    limit_count:  LIMIT,
    started_at:   startedAt,
  })

  try {
    // 2. Run recommendation engine
    const result     = await getRecommendations({ windowHours: WINDOW_HOURS, limit: LIMIT, includeArchive: true })
    const durationMs = Date.now() - startMs

    const runStatus = result.items.length > 0 ? 'success' : 'partial_success'

    // 3. Update run record with results
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

    // 4. Persist snapshot (filter out archive items for main snapshot)
    const snapshotItems = result.items.filter(i => i.recommendationTier !== 'archive')
    const snapshotItemsWithDeepDive = withDeepDive(snapshotItems)

    const snapshotId = await createRecommendationSnapshot(
      {
        run_id:                   runId ?? undefined,
        status:                   runStatus,
        window_hours:             WINDOW_HOURS,
        limit_count:              LIMIT,
        captured_total:           result.stats.capturedTotal,
        recommendation_candidates: result.stats.recommendationCandidates,
        must_read_count:          result.stats.mustReadCount,
        high_value_count:         result.stats.highValueCount,
        observe_count:            result.stats.observeCount,
        archive_count:            result.stats.archiveCount,
        generated_at:             new Date().toISOString(),
      },
      snapshotItemsWithDeepDive,
    )

    const run      = runId      ? { id: runId,      status: runStatus, startedAt, durationMs } : null
    const snapshot = snapshotId ? {
      id:                       snapshotId,
      runId,
      status:                   runStatus,
      generatedAt:              new Date().toISOString(),
      windowHours:              WINDOW_HOURS,
      capturedTotal:            result.stats.capturedTotal,
      recommendationCandidates: result.stats.recommendationCandidates,
      mustReadCount:            result.stats.mustReadCount,
      highValueCount:           result.stats.highValueCount,
      observeCount:             result.stats.observeCount,
      archiveCount:             result.stats.archiveCount,
    } : null

    return NextResponse.json({
      ok:        true,
      runStatus,
      durationMs,
      run,
      snapshot,
      stats:     result.stats,
      items:     snapshotItemsWithDeepDive,
    })

  } catch (err) {
    const durationMs = Date.now() - startMs
    const message    = err instanceof Error ? err.message : 'Unknown error'
    console.error('[POST /api/recommendations/refresh]', message)

    if (runId) {
      await updateRecommendationRun(runId, {
        status:        'failed',
        error_message: message.slice(0, 500),
        duration_ms:   durationMs,
        finished_at:   new Date().toISOString(),
      })
    }

    return NextResponse.json(
      {
        ok:        false,
        runStatus: 'failed',
        error:     message,
        durationMs,
        run:       runId ? { id: runId, status: 'failed', startedAt, durationMs } : null,
        snapshot:  null,
      },
      { status: 500 },
    )
  }
}
