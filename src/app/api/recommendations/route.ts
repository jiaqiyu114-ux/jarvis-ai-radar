import { NextRequest, NextResponse } from 'next/server'
import { getRecommendations, type RecommendationTier } from '@/lib/recommendations/recommendation-engine'

export const dynamic = 'force-dynamic'

/**
 * GET /api/recommendations
 *
 * Query params:
 *   windowHours    - lookback window in hours (default 72, max 168)
 *   limit          - max items returned (default 30, max 100)
 *   tier           - filter by tier: must_read | high_value | observe (default: all non-archive)
 *   includeArchive - include archive-tier items (default false)
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

  try {
    const result = await getRecommendations({ windowHours, limit, tier, includeArchive })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[GET /api/recommendations]', message)
    return NextResponse.json(
      {
        ok: false,
        error: message,
        windowHours, windowStart: '', windowEnd: '',
        stats: { capturedTotal: 0, recommendationCandidates: 0, mustReadCount: 0, highValueCount: 0, observeCount: 0, archiveCount: 0 },
        items: [],
      },
      { status: 500 },
    )
  }
}
