import { NextRequest, NextResponse } from 'next/server'
import { getRecommendations } from '@/lib/recommendations/recommendation-engine'
import {
  attachDeepDivesToRecommendations,
  type FinalDeepDiveMode,
} from '@/lib/recommendations/deep-dive'
import { attachRelatedSignals } from '@/lib/recommendations/related-signals'
import { getDeepDiveModel, getLlmConfig } from '@/lib/llm/deep-dive-client'
import {
  insertRecommendationRun,
  updateRecommendationRun,
} from '@/lib/db/recommendation-runs'
import {
  createRecommendationSnapshot,
  getPreviouslyRecommendedItemIds,
} from '@/lib/db/recommendation-snapshots'

export const dynamic = 'force-dynamic'

type RefreshRequestBody = {
  deepDive?: unknown
}

function parseDeepDiveMode(raw: unknown): FinalDeepDiveMode {
  return String(raw ?? '').toLowerCase() === 'deterministic' ? 'deterministic' : 'llm'
}

/**
 * POST /api/recommendations/refresh
 *
 * Query params:
 * - deepDive=llm|deterministic (default: llm)
 *
 * The route always writes a fresh snapshot when engine execution succeeds.
 * LLM deepDive generation is best-effort and degrades per-item.
 */
export async function POST(req: NextRequest) {
  const WINDOW_HOURS = 72
  const LIMIT = 50
  const startMs = Date.now()
  const startedAt = new Date().toISOString()

  let body: RefreshRequestBody = {}
  try {
    body = await req.json() as RefreshRequestBody
  } catch {
    body = {}
  }

  const queryMode = req.nextUrl.searchParams.get('deepDive')
  const deepDiveMode = parseDeepDiveMode(queryMode ?? body.deepDive)
  const llmConfig = getLlmConfig()

  const runId = await insertRecommendationRun({
    status: 'running',
    window_hours: WINDOW_HOURS,
    limit_count: LIMIT,
    started_at: startedAt,
  })

  try {
    const queryStart = Date.now()
    const result = await getRecommendations({ windowHours: WINDOW_HOURS, limit: LIMIT, includeArchive: true })
    const queryDurationMs = Date.now() - queryStart

    const durationMs = Date.now() - startMs
    const runStatus = result.items.length > 0 ? 'success' : 'partial_success'

    if (runId) {
      await updateRecommendationRun(runId, {
        status: runStatus,
        captured_total: result.stats.capturedTotal,
        recommended_candidates: result.stats.recommendationCandidates,
        must_read_count: result.stats.mustReadCount,
        high_value_count: result.stats.highValueCount,
        observe_count: result.stats.observeCount,
        archive_count: result.stats.archiveCount,
        duration_ms: durationMs,
        finished_at: new Date().toISOString(),
      })
    }

    // Suppress items that were already in must_read/high_value in recent snapshots
    // (6h–48h ago window). Prevents the same high-score item from dominating
    // must_read for the full 72h retention window.
    // Safety valve: only suppress when fresh items exist to replace the suppressed ones.
    // If all candidates are stale (no data pipeline running), skip suppression gracefully.
    const prevRecommendedIds = await getPreviouslyRecommendedItemIds()
    const freshFinalCount = result.items.filter(i =>
      !prevRecommendedIds.has(i.id) &&
      (i.recommendationTier === 'must_read' || i.recommendationTier === 'high_value')
    ).length
    const applySuppression = prevRecommendedIds.size > 0 && freshFinalCount >= 1

    let suppressedFromFinal = 0
    const snapshotItemsBase = result.items
      .filter(i => i.recommendationTier !== 'archive')
      .map(i => {
        if (
          applySuppression &&
          prevRecommendedIds.has(i.id) &&
          (i.recommendationTier === 'must_read' || i.recommendationTier === 'high_value')
        ) {
          suppressedFromFinal++
          return { ...i, recommendationTier: 'observe' as const }
        }
        return i
      })

    const deepDiveStart = Date.now()
    const { items: snapshotItemsWithDeepDive, deepDiveStats } =
      await attachDeepDivesToRecommendations(snapshotItemsBase, {
        mode: deepDiveMode,
        concurrency: 2,
        includeSkipped: false,
      })
    const deepDiveDurationMs = Date.now() - deepDiveStart

    // Compute related signals (rule-based, no LLM). Uses the full candidate pool
    // (all tiers including archive) as the match space.
    const relatedStart = Date.now()
    const snapshotItemsFinal = attachRelatedSignals(snapshotItemsWithDeepDive, result.items)
    const relatedSignalsMs = Date.now() - relatedStart
    const relatedStats = {
      ms: relatedSignalsMs,
      candidatePoolSize: result.items.length,
      itemsWithSignals: snapshotItemsFinal.filter(i => (i.relatedSignals?.length ?? 0) > 0).length,
      avgSignals: snapshotItemsFinal.length > 0
        ? Math.round(snapshotItemsFinal.reduce((s, i) => s + (i.relatedSignals?.length ?? 0), 0) / snapshotItemsFinal.length * 10) / 10
        : 0,
    }

    const snapshotId = await createRecommendationSnapshot(
      {
        run_id: runId ?? undefined,
        status: runStatus,
        window_hours: WINDOW_HOURS,
        limit_count: LIMIT,
        captured_total: result.stats.capturedTotal,
        recommendation_candidates: result.stats.recommendationCandidates,
        must_read_count: result.stats.mustReadCount,
        high_value_count: result.stats.highValueCount,
        observe_count: result.stats.observeCount,
        archive_count: result.stats.archiveCount,
        generated_at: new Date().toISOString(),
        metadata: {
          deepDiveMode,
          deepDiveStats,
          relatedSignals: relatedStats,
          suppressedDuplicates: suppressedFromFinal,
        },
      },
      snapshotItemsFinal,
    )

    const run = runId
      ? { id: runId, status: runStatus, startedAt, durationMs }
      : null

    const snapshot = snapshotId
      ? {
          id: snapshotId,
          runId,
          status: runStatus,
          generatedAt: new Date().toISOString(),
          windowHours: WINDOW_HOURS,
          capturedTotal: result.stats.capturedTotal,
          recommendationCandidates: result.stats.recommendationCandidates,
          mustReadCount: result.stats.mustReadCount,
          highValueCount: result.stats.highValueCount,
          observeCount: result.stats.observeCount,
          archiveCount: result.stats.archiveCount,
        }
      : null

    return NextResponse.json({
      ok: true,
      runStatus,
      durationMs,
      timing: {
        totalMs:          durationMs,
        queryMs:          queryDurationMs,
        deepDiveMs:       deepDiveDurationMs,
        relatedSignalsMs,
      },
      deepDiveMode,
      deepDiveStats,
      relatedSignals:       relatedStats,
      suppressedDuplicates: suppressedFromFinal,
      run,
      snapshot,
      stats: result.stats,
      items: snapshotItemsFinal,
    })
  } catch (err) {
    const durationMs = Date.now() - startMs
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[POST /api/recommendations/refresh]', message)

    if (runId) {
      await updateRecommendationRun(runId, {
        status: 'failed',
        error_message: message.slice(0, 500),
        duration_ms: durationMs,
        finished_at: new Date().toISOString(),
      })
    }

    return NextResponse.json(
      {
        ok: false,
        runStatus: 'failed',
        error: message,
        durationMs,
        deepDiveMode,
        deepDiveStats: {
          total: 0,
          generated: 0,
          fallback: 0,
          failed: 0,
          model: deepDiveMode === 'llm' ? getDeepDiveModel(llmConfig) : 'deterministic-v1',
          provider: deepDiveMode === 'llm' ? llmConfig.provider : 'deterministic',
          mode: deepDiveMode,
        },
        run: runId ? { id: runId, status: 'failed', startedAt, durationMs } : null,
        snapshot: null,
      },
      { status: 500 },
    )
  }
}
