import { NextResponse } from 'next/server'
import { getRecommendations } from '@/lib/recommendations/recommendation-engine'
import {
  insertRecommendationRun,
  updateRecommendationRun,
} from '@/lib/db/recommendation-runs'

export const dynamic = 'force-dynamic'

/**
 * POST /api/recommendations/refresh
 *
 * Triggers a fresh recommendation engine run and records the result.
 * Designed as a lightweight trigger endpoint — no body required.
 *
 * Intended for:
 *   - Manual on-demand refresh
 *   - Future Vercel Cron integration (body: {}) once cron is set up
 *   - CI / scheduled external calls
 *
 * Returns:
 *   { ok, runStatus, durationMs, run: { id, status, startedAt, durationMs }, stats }
 *
 * Note: GET /api/recommendations already triggers a run record.
 * This endpoint is useful when you want a dedicated refresh without
 * fetching the full items list in the response.
 */
export async function POST() {
  const WINDOW_HOURS = 72
  const LIMIT        = 50
  const startMs      = Date.now()
  const startedAt    = new Date().toISOString()

  const runId = await insertRecommendationRun({
    status:       'running',
    window_hours: WINDOW_HOURS,
    limit_count:  LIMIT,
    started_at:   startedAt,
  })

  try {
    const result     = await getRecommendations({ windowHours: WINDOW_HOURS, limit: LIMIT })
    const durationMs = Date.now() - startMs

    if (runId) {
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
      ok:        true,
      runStatus: 'success',
      durationMs,
      run: runId
        ? { id: runId, status: 'success', startedAt, durationMs }
        : null,
      stats: result.stats,
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
        run: runId ? { id: runId, status: 'failed', startedAt, durationMs } : null,
      },
      { status: 500 },
    )
  }
}
