import { NextRequest, NextResponse } from 'next/server'
import {
  listRecommendationSnapshots,
  getRecommendationSnapshotById,
} from '@/lib/db/recommendation-snapshots'

export const dynamic = 'force-dynamic'

/**
 * GET /api/recommendations/snapshots?limit=20
 *
 * Returns metadata for recent recommendation snapshots (no items).
 * Useful for history review and dashboard status displays.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10) || 20, 100)
  const includeItems = searchParams.get('includeItems') === 'true'
  const itemsLimit = Math.min(parseInt(searchParams.get('itemsLimit') ?? '20', 10) || 20, 100)

  try {
    const rows = await listRecommendationSnapshots(limit)

    const baseSnapshots = rows.map(s => ({
      id:                       s.id,
      runId:                    s.run_id,
      status:                   s.status,
      windowHours:              s.window_hours,
      limitCount:               s.limit_count,
      capturedTotal:            s.captured_total,
      recommendationCandidates: s.recommendation_candidates,
      mustReadCount:            s.must_read_count,
      highValueCount:           s.high_value_count,
      observeCount:             s.observe_count,
      archiveCount:             s.archive_count,
      generatedAt:              s.generated_at,
      createdAt:                s.created_at,
    }))

    if (!includeItems) {
      return NextResponse.json({ ok: true, count: baseSnapshots.length, snapshots: baseSnapshots })
    }

    const detailRows = await Promise.all(
      rows.map(async (s) => getRecommendationSnapshotById(s.id)),
    )

    const snapshots = baseSnapshots.map((snap, idx) => ({
      ...snap,
      items: (detailRows[idx]?.items ?? []).slice(0, itemsLimit),
    }))

    return NextResponse.json({
      ok: true,
      count: snapshots.length,
      includeItems: true,
      itemsLimit,
      snapshots,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[GET /api/recommendations/snapshots]', message)
    return NextResponse.json({ ok: false, error: message, snapshots: [] }, { status: 500 })
  }
}
