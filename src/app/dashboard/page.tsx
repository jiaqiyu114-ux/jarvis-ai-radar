export const dynamic = 'force-dynamic'

import { Brain, GitBranch, ListChecks, Newspaper, Radio } from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { StatCard } from "@/components/dashboard/stat-card"
import { ScoreBadge } from "@/components/feed/score-badge"
import { SourceTierBadge } from "@/components/feed/source-tier-badge"
import { TodayRecommendationCard } from "./_today-recommendation-card"
import { getTodaySnapshot } from "@/lib/data/today-adapter"
import type { TodayRecommendationItem } from "@/lib/data/today-adapter"
import type { TopSignalData } from "@/components/layout/app-shell"

function MiniSignal({ item }: { item: TodayRecommendationItem }) {
  return (
    <div className="flex items-start gap-2.5 border-b border-border last:border-0 py-2.5">
      <ScoreBadge score={item.finalScore} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-xs font-medium leading-snug text-foreground">
          {item.title}
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          <SourceTierBadge tier={item.sourceTier} />
          <span className="truncate text-[10px] text-muted-foreground">{item.source}</span>
        </div>
      </div>
    </div>
  )
}

function SideSection({
  title,
  empty,
  items,
}: {
  title: string
  empty: string
  items: TodayRecommendationItem[]
}) {
  return (
    <section className="border border-border rounded-lg bg-card px-3 py-2.5">
      <h2 className="section-title mb-1.5">{title}</h2>
      {items.length > 0
        ? items.map(item => <MiniSignal key={item.id} item={item} />)
        : <p className="py-4 text-center text-xs text-muted-foreground">{empty}</p>
      }
    </section>
  )
}

export default async function DashboardPage() {
  const snapshot = await getTodaySnapshot({ limit: 12 })
  const topItem = snapshot.recommendations[0] ?? null
  const topSignal: TopSignalData | undefined = topItem
    ? { score: topItem.finalScore, title: topItem.title, category: topItem.category }
    : undefined

  return (
    <AppShell topSignal={topSignal}>
      <div className="max-w-[1280px] p-6 md:p-8">
        <header className="mb-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="page-kicker mb-1">Today&apos;s Recommendations</p>
              <h1 className="editorial-title text-[2.15rem]">今日雷达 / 今日推荐</h1>
              <p className="page-subtitle mt-1.5">
                {snapshot.window.label}
                {' · '}
                当前窗口捕捉 <span className="font-medium text-foreground tabular-nums">{snapshot.stats.captureTotal}</span> 条
                {' · '}
                推荐候选 <span className="font-medium text-foreground tabular-nums">{snapshot.stats.recommendationCount}</span> 条
              </p>
            </div>

            {snapshot.window.usedFallback && (
              <span className="rounded border border-warning/30 bg-warning/10 px-2 py-1 text-[10px] font-medium text-warning">
                最近72小时补足
              </span>
            )}
          </div>
        </header>

        <div className="grid grid-cols-5 gap-3 mb-6">
          <StatCard
            label="当前窗口捕捉"
            value={snapshot.stats.captureTotal}
            change={snapshot.window.label}
            icon={Radio}
          />
          <StatCard
            label="推荐候选"
            value={snapshot.stats.recommendationCount}
            change="默认展示 12 条"
            icon={ListChecks}
            accent
          />
          <StatCard
            label="可进日报"
            value={snapshot.stats.dailyReportCount}
            change="should_enter_daily_report"
            icon={Newspaper}
          />
          <StatCard
            label="事件追踪候选"
            value={snapshot.stats.eventCandidateCount}
            change="should_track_event"
            icon={GitBranch}
          />
          <StatCard
            label="深度分析候选"
            value={snapshot.stats.deepCandidateCount}
            change="deep / cluster"
            icon={Brain}
          />
        </div>

        <div className="grid grid-cols-3 gap-6">
          <main className="col-span-2">
            <div className="mb-2 flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              <h2 className="section-title text-primary/80">主推荐列表</h2>
              <span className="meta-text">{snapshot.recommendations.length} 条</span>
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-card">
              {snapshot.recommendations.length > 0
                ? snapshot.recommendations.map(item => (
                    <TodayRecommendationCard key={item.id} item={item} />
                  ))
                : (
                  <div className="px-6 py-12 text-center">
                    <p className="text-sm text-muted-foreground">
                      暂无今日推荐。可以先运行处理队列，或等待更多真实信息进入系统。
                    </p>
                  </div>
                )
              }
            </div>
          </main>

          <aside className="col-span-1 space-y-4">
            <SideSection
              title="今日高分参考"
              empty="暂无高分参考"
              items={snapshot.highScoreReference}
            />
            <SideSection
              title="事件候选"
              empty="暂无事件追踪候选"
              items={snapshot.eventCandidates}
            />
            <SideSection
              title="待处理候选"
              empty="暂无待处理候选"
              items={snapshot.pendingCandidates}
            />
          </aside>
        </div>
      </div>
    </AppShell>
  )
}
