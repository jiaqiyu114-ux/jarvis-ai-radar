import { NextRequest, NextResponse } from 'next/server'
import { listRecommendationRuns } from '@/lib/db/recommendation-runs'

export const dynamic = 'force-dynamic'

/**
 * GET /api/recommendations/runs?limit=20
 *
 * Returns the most recent recommendation engine run records.
 * Returns { ok: true, runs: [] } when the migration hasn't been run yet.
 *
 * Used by the Dashboard and for diagnostics.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10) || 20, 100)

  try {
    const rows = await listRecommendationRuns(limit)

    const runs = rows.map(r => ({
      id:                    r.id,
      status:                r.status,
      windowHours:           r.window_hours,
      limitCount:            r.limit_count,
      capturedTotal:         r.captured_total,
      recommendedCandidates: r.recommended_candidates,
      mustReadCount:         r.must_read_count,
      highValueCount:        r.high_value_count,
      observeCount:          r.observe_count,
      archiveCount:          r.archive_count,
      durationMs:            r.duration_ms,
      startedAt:             r.started_at,
      finishedAt:            r.finished_at,
      errorMessage:          r.error_message,
    }))

    return NextResponse.json({ ok: true, count: runs.length, runs })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[GET /api/recommendations/runs]', message)
    return NextResponse.json({ ok: false, error: message, runs: [] }, { status: 500 })
  }
}
