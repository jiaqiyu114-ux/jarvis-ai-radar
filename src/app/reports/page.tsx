export const dynamic = 'force-dynamic'

import { getDailyRecommendationSnapshot } from '@/lib/data/daily-recommendation-snapshot'
import { getFeedItems } from '@/lib/data/feed-adapter'
import { AppShell } from '@/components/layout/app-shell'
import ReportsClient from './_reports-client'

export default async function ReportsPage() {
  const [snapshot, feedItems] = await Promise.all([
    getDailyRecommendationSnapshot(),
    getFeedItems(),
  ])

  const topSignal = feedItems[0]
    ? { score: feedItems[0].finalScore, title: feedItems[0].title, category: feedItems[0].category }
    : undefined

  if (!snapshot.hasSnapshot) {
    return (
      <AppShell topSignal={topSignal}>
        <div className="p-8 max-w-[900px]">
          <p className="page-kicker mb-1">Daily Brief</p>
          <h1 className="editorial-title text-[2.25rem]">今日日报</h1>
          <div className="mt-8 rounded-lg border border-border py-16 text-center bg-card space-y-2">
            <p className="text-sm text-muted-foreground">今日推荐快照尚未生成</p>
            <p className="text-xs text-muted-foreground/60">
              请在处理队列完成分流后，到今日雷达页面生成今日推荐。
            </p>
            <p className="text-[10px] text-muted-foreground/40 mt-2">
              API: POST /api/today/recommendations/generate
            </p>
          </div>
        </div>
      </AppShell>
    )
  }

  return <ReportsClient snapshot={snapshot} topSignal={topSignal} />
}
