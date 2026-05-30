import { type NextRequest, NextResponse } from 'next/server'
import {
  getDailyRecommendationSnapshot,
  getLiveDailyRecommendationPreview,
} from '@/lib/data/daily-recommendation-snapshot'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') ?? undefined

  try {
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
      })
    }

    const livePreview = await getLiveDailyRecommendationPreview(12)
    return NextResponse.json({
      ok: true,
      date: snapshot.date,
      hasSnapshot: false,
      livePreview: true,
      run: null,
      items: [],
      livePreviewSnapshot: {
        window: livePreview.window,
        stats: livePreview.stats,
        items: livePreview.recommendations,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
