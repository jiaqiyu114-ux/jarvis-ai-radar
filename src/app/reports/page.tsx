export const dynamic = 'force-dynamic'

import { AppShell } from '@/components/layout/app-shell'
import ReportsClient from './_reports-client'
import { getDailyRecommendationSnapshot, getLatestDailyRecommendationSnapshot } from '@/lib/data/daily-recommendation-snapshot'
import { todayKey, JARVIS_TIMEZONE } from '@/lib/recommendations/daily-gate'
import { getFeedItems } from '@/lib/data/feed-adapter'

function shiftDate(dateKey: string, days: number): string {
  const d = new Date(dateKey + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const sp = await searchParams
  const today = todayKey(JARVIS_TIMEZONE)

  // Validate the requested date param
  const requestedDate =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today
      ? sp.date
      : null

  const [snapshot, feedItems] = await Promise.all([
    requestedDate
      ? getDailyRecommendationSnapshot(requestedDate)
      : getLatestDailyRecommendationSnapshot(),
    getFeedItems({ limit: 1 }),
  ])

  const topSignal = feedItems[0]
    ? { score: feedItems[0].finalScore, title: feedItems[0].title, category: feedItems[0].category }
    : undefined

  const viewingDate = snapshot.date || today
  const prevDate = shiftDate(viewingDate, -1)
  const nextDate = shiftDate(viewingDate, 1)

  return (
    <ReportsClient
      snapshot={snapshot}
      topSignal={topSignal}
      today={today}
      viewingDate={viewingDate}
      prevDate={prevDate}
      nextDate={nextDate <= today ? nextDate : null}
    />
  )
}
