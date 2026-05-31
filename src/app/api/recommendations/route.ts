import { NextRequest, NextResponse } from 'next/server'
import { getRecommendations, type RecommendationTier } from '@/lib/recommendations/recommendation-engine'
import { getLatestRecommendationSnapshot } from '@/lib/db/recommendation-snapshots'
import { generateDeterministicDeepDive } from '@/lib/recommendations/deep-dive'

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
 * GET /api/recommendations
 *
 * Snapshot-first: returns persisted recommendation data by default.
 * No longer writes run records on every GET (use POST /refresh for that).
 *
 * Query params:
 *   windowHours    - for live fallback only (default 72)
 *   limit          - for live fallback only (default 30)
 *   tier           - filter by tier
 *   includeArchive - include archive tier
 *   live=true      - force live calculation (debug mode, no writes)
 *   mode=live      - alias for live=true
 *
 * Response shape:
 *   source: 'snapshot'      — data from recommendation_snapshots table
 *   source: 'live_fallback' — real-time calculation (no snapshot available)
 *   snapshot: { id, generatedAt, status, windowHours, ... } | null
 *   stats: { capturedTotal, ... }
 *   items: RecommendedItem[]
 *   run: null (reads never create run records; use POST /refresh)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl

  const forceLive = searchParams.get('live') === 'true' || searchParams.get('mode') === 'live'

  // ── Snapshot path (default) ───────────────────────────────────────────────
  if (!forceLive) {
    try {
      const snap = await getLatestRecommendationSnapshot()
      if (snap) {
        return NextResponse.json({
          ok:          true,
          source:      'snapshot',
          windowHours: snap.window_hours,
          windowStart: '',   // not stored in snapshot (engine doesn't expose it)
          windowEnd:   snap.generated_at,
          snapshot: {
            id:                        snap.id,
            runId:                     snap.run_id,
            status:                    snap.status,
            generatedAt:               snap.generated_at,
            windowHours:               snap.window_hours,
            limitCount:                snap.limit_count,
            capturedTotal:             snap.captured_total,
            recommendationCandidates:  snap.recommendation_candidates,
            mustReadCount:             snap.must_read_count,
            highValueCount:            snap.high_value_count,
            observeCount:              snap.observe_count,
            archiveCount:              snap.archive_count,
          },
          stats: {
            capturedTotal:            snap.captured_total,
            recommendationCandidates: snap.recommendation_candidates,
            mustReadCount:            snap.must_read_count,
            highValueCount:           snap.high_value_count,
            observeCount:             snap.observe_count,
            archiveCount:             snap.archive_count,
          },
          items: withDeepDive(snap.items),
          run:   null,
        })
      }
    } catch (err) {
      // snapshot table missing or DB error — fall through to live
      console.warn('[GET /api/recommendations] snapshot read failed, falling back to live:', err)
    }
  }

  // ── Live fallback path ────────────────────────────────────────────────────
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

    return NextResponse.json({
      ok:       true,
      source:   'live_fallback',
      windowHours,
      windowStart: result.windowStart,
      windowEnd:   result.windowEnd,
      snapshot: null,
      stats:    result.stats,
      items:    withDeepDive(result.items),
      run:      null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[GET /api/recommendations]', message)

    return NextResponse.json(
      {
        ok:       false,
        source:   'live_fallback',
        error:    message,
        windowHours, windowStart: '', windowEnd: '',
        snapshot: null,
        stats:    { capturedTotal: 0, recommendationCandidates: 0, mustReadCount: 0, highValueCount: 0, observeCount: 0, archiveCount: 0 },
        items:    [],
        run:      null,
      },
      { status: 500 },
    )
  }
}
