import { type NextRequest, NextResponse } from 'next/server'
import {
  getDailyRecommendationSnapshot,
  getLatestDailyRecommendationSnapshot,
  getLiveDailyRecommendationPreview,
} from '@/lib/data/daily-recommendation-snapshot'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') ?? undefined

  try {
    if (date) {
      // Specific date requested: return only that date, no automatic fallback
      const snapshot = await getDailyRecommendationSnapshot(date)
      if (snapshot.hasSnapshot) {
        return NextResponse.json({
          ok: true,
          date: snapshot.date,
          hasSnapshot: true,
          livePreview: false,
          run: snapshot.run,
          items: snapshot.items,
          grouped: snapshot.grouped,
          meta: {
            requestedDate: date,
            snapshotDate: snapshot.date,
            generatedAt: snapshot.run?.generated_at ?? null,
            isTodaySnapshot: snapshot.isTodaySnapshot,
            isFallback: false,
          },
        })
      }
      return NextResponse.json({
        ok: true,
        date: snapshot.date,
        hasSnapshot: false,
        livePreview: false,
        run: null,
        items: [],
        grouped: { must_read: [], high_value: [], observe: [] },
        meta: {
          requestedDate: date,
          snapshotDate: date,
          isTodaySnapshot: snapshot.isTodaySnapshot,
          isFallback: false,
          emptyReason: 'no_snapshot_for_date',
        },
      })
    }

    // No date param: try today first, then fall back to latest generated snapshot
    const todaySnapshot = await getDailyRecommendationSnapshot()
    const todayDate = todaySnapshot.date

    if (todaySnapshot.hasSnapshot) {
      return NextResponse.json({
        ok: true,
        date: todaySnapshot.date,
        hasSnapshot: true,
        livePreview: false,
        run: todaySnapshot.run,
        items: todaySnapshot.items,
        grouped: todaySnapshot.grouped,
        meta: {
          todayDate,
          snapshotDate: todaySnapshot.date,
          generatedAt: todaySnapshot.run?.generated_at ?? null,
          isTodaySnapshot: true,
          isFallback: false,
          label: '今日快照',
        },
      })
    }

    const latestSnapshot = await getLatestDailyRecommendationSnapshot()
    if (latestSnapshot.hasSnapshot) {
      return NextResponse.json({
        ok: true,
        date: latestSnapshot.date,
        hasSnapshot: true,
        livePreview: false,
        run: latestSnapshot.run,
        items: latestSnapshot.items,
        grouped: latestSnapshot.grouped,
        meta: {
          todayDate,
          snapshotDate: latestSnapshot.date,
          generatedAt: latestSnapshot.run?.generated_at ?? null,
          isTodaySnapshot: false,
          isFallback: true,
          fallbackReason: '今日暂无快照，显示最近一次生成的快照',
          label: `最近一次快照 (${latestSnapshot.date})`,
        },
      })
    }

    const livePreview = await getLiveDailyRecommendationPreview(12)
    return NextResponse.json({
      ok: true,
      date: todayDate,
      hasSnapshot: false,
      livePreview: true,
      run: null,
      items: [],
      livePreviewSnapshot: {
        window: livePreview.window,
        stats: livePreview.stats,
        items: livePreview.recommendations,
      },
      meta: {
        todayDate,
        snapshotDate: null,
        isTodaySnapshot: false,
        isFallback: false,
        emptyReason: 'no_snapshots',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
