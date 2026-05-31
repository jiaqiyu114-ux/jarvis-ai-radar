import { NextRequest, NextResponse } from 'next/server'
import { getRecommendations, type RecommendationTier } from '@/lib/recommendations/recommendation-engine'
import {
  insertRecommendationRun,
  updateRecommendationRun,
} from '@/lib/db/recommendation-runs'

export const dynamic = 'force-dynamic'

/**
 * GET /api/recommendations
 *
 * Query params:
 *   windowHours    - lookback window in hours (default 72, max 168)
 *   limit          - max items returned (default 30, max 100)
 *   tier           - filter by tier: must_read | high_value | observe | archive
 *   includeArchive - include archive-tier items (default false)
 *
 * Response additions (backward-compatible):
 *   run: { id, status, startedAt, durationMs }  — the run record for this call
 *        null when recommendation_runs table does not exist yet
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl

  const windowHours    = Math.min(parseInt(searchParams.get('windowHours') ?? '72', 10) || 72, 168)
  const limit          = Math.min(parseInt(searchParams.get('limit')       ?? '30', 10) || 30, 100)
  const tierParam      = searchParams.get('tier')
  const includeArchive = searchParams.get('includeArchive') === 'true'

  const validTiers: RecommendationTier[] = ['must_read', 'high_value', 'observe', 'archive']
  const tier = validTiers.includes(tierParam as RecommendationTier)
    ? (tierParam as RecommendationTier)
    : null

  const startMs   = Date.now()
  const startedAt = new Date().toISOString()

  // Insert a run record before calling the engine so we always have a runId.
  // Returns null silently when the migration hasn't been run yet.
  const runId = await insertRecommendationRun({
    status:       'running',
    window_hours: windowHours,
    limit_count:  limit,
    started_at:   startedAt,
  })

  try {
    const result     = await getRecommendations({ windowHours, limit, tier, includeArchive })
    const durationMs = Date.now() - startMs

    if (runId) {
      // Non-blocking: update run with results (failure here is non-fatal)
      await updateRecommendationRun(runId, {
        status:                  'success',
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

    return NextResponse.json({
      ok: true,
      ...result,
      run: runId
        ? { id: runId, status: 'success', startedAt, durationMs }
        : null,
    })

  } catch (err) {
    const durationMs = Date.now() - startMs
    const message    = err instanceof Error ? err.message : 'Unknown error'
    console.error('[GET /api/recommendations]', message)

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
        ok:    false,
        error: message,
        windowHours,
        windowStart: '',
        windowEnd:   '',
        stats: {
          capturedTotal: 0, recommendationCandidates: 0,
          mustReadCount: 0, highValueCount: 0, observeCount: 0, archiveCount: 0,
        },
        items: [],
        run: runId ? { id: runId, status: 'failed', startedAt, durationMs } : null,
      },
      { status: 500 },
    )
  }
}
