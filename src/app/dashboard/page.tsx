export const dynamic = 'force-dynamic'

import { Brain, GitBranch, ListChecks, Newspaper, Radio } from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { StatCard } from "@/components/dashboard/stat-card"
import { ScoreBadge } from "@/components/feed/score-badge"
import { SourceTierBadge } from "@/components/feed/source-tier-badge"
import { TodayRecommendationCard } from "./_today-recommendation-card"
import { listEventClusters, type EventClusterListItem } from "@/lib/db/event-clusters"
import {
  getLatestDailyRecommendationSnapshot,
  getLiveDailyRecommendationPreview,
} from "@/lib/data/daily-recommendation-snapshot"
import type { DailyRecommendationSnapshotItem } from "@/lib/data/daily-recommendation-snapshot"
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

function MiniCluster({ cluster }: { cluster: EventClusterListItem }) {
  return (
    <div className="border-b border-border last:border-0 py-2.5">
      <p className="line-clamp-2 text-xs font-medium leading-snug text-foreground">
        {cluster.title}
      </p>
      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-muted-foreground">{cluster.status}</span>
        <span className="text-muted-foreground/40 text-[10px]">·</span>
        <span className="text-[10px] text-muted-foreground">items {cluster.itemCount}</span>
        <span className="text-muted-foreground/40 text-[10px]">·</span>
        <span className="text-[10px] text-muted-foreground">confidence {cluster.confidence}</span>
      </div>
    </div>
  )
}

function ClusterSideSection({
  title,
  empty,
  clusters,
}: {
  title: string
  empty: string
  clusters: EventClusterListItem[]
}) {
  return (
    <section className="border border-border rounded-lg bg-card px-3 py-2.5">
      <h2 className="section-title mb-1.5">{title}</h2>
      {clusters.length > 0
        ? clusters.map(cluster => <MiniCluster key={cluster.id} cluster={cluster} />)
        : <p className="py-4 text-center text-xs text-muted-foreground">{empty}</p>
      }
    </section>
  )
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "未记录"
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function SectionBlock({
  title,
  items,
  empty,
}: {
  title: string
  items: DailyRecommendationSnapshotItem[]
  empty: string
}) {
  if (items.length === 0) {
    return (
      <section className="border-b border-border last:border-b-0">
        <div className="px-4 py-2.5">
          <h2 className="section-title">{title}</h2>
          <p className="mt-2 text-xs text-muted-foreground">{empty}</p>
        </div>
      </section>
    )
  }

  return (
    <section className="border-b border-border last:border-b-0">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/20 border-b border-border">
        <h2 className="section-title">{title}</h2>
        <span className="meta-text">{items.length} 条</span>
      </div>
      {items.map(item => <TodayRecommendationCard key={item.id} item={item} />)}
    </section>
  )
}

export default async function DashboardPage() {
  const snapshot = await getLatestDailyRecommendationSnapshot()
  const livePreview = snapshot.hasSnapshot
    ? null
    : await getLiveDailyRecommendationPreview(12)

  let eventClusters: EventClusterListItem[] = []
  try {
    const result = await listEventClusters({ limit: 20, includeItems: false })
    // Only show clusters with real multi-item/multi-source signal
    // confidence > 20 is above the single-item cap (max 20), indicating ≥2 items or URL match
    eventClusters = result.clusters
      .filter(cluster =>
        (cluster.status === "active" || cluster.status === "watching") &&
        (cluster.confidence > 20 || cluster.itemCount >= 2 || cluster.sourceCount >= 2)
      )
      .slice(0, 5)
  } catch {
    eventClusters = []
  }

  const recommendations = snapshot.hasSnapshot
    ? snapshot.items
    : livePreview?.recommendations ?? []
  const topItem = recommendations[0] ?? null
  const topSignal: TopSignalData | undefined = topItem
    ? { score: topItem.finalScore, title: topItem.title, category: topItem.category }
    : undefined

  const stats = snapshot.hasSnapshot && snapshot.run
    ? {
        captureTotal: snapshot.run.total_candidates,
        recommendationCount: snapshot.run.selected_count,
        dailyReportCount: snapshot.run.must_read_count,
        eventCandidateCount: recommendations.filter(item => item.shouldTrackEvent).length,
        deepCandidateCount: recommendations.filter(item => item.shouldDeepAnalyze || item.analysisTier === 'deep' || item.analysisTier === 'cluster').length,
      }
    : livePreview?.stats ?? {
        captureTotal: 0,
        recommendationCount: 0,
        dailyReportCount: 0,
        eventCandidateCount: 0,
        deepCandidateCount: 0,
      }

  const highScoreReference = [...recommendations]
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, 5)
  const pendingCandidates = recommendations
    .filter(item => item.analysisGate?.analysisStage === 'unprocessed' || item.analysisStage === 'unprocessed')
    .slice(0, 5)

  return (
    <AppShell topSignal={topSignal}>
      <div className="max-w-[1280px] p-6 md:p-8">
        <header className="mb-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="page-kicker mb-1">Today&apos;s Recommendations</p>
              <h1 className="editorial-title text-[2.15rem]">
                {snapshot.hasSnapshot
                  ? snapshot.isTodaySnapshot ? "今日推荐快照" : "最近一次推荐快照"
                  : "今日推荐尚未生成"}
              </h1>
              <p className="page-subtitle mt-1.5">
                {snapshot.hasSnapshot && snapshot.run
                  ? `生成时间 ${formatTime(snapshot.run.generated_at)}`
                  : "实时候选，不是正式日报快照"}
                {' · '}
                当前窗口捕捉 <span className="font-medium text-foreground tabular-nums">{stats.captureTotal}</span> 条
                {' · '}
                推荐候选 <span className="font-medium text-foreground tabular-nums">{stats.recommendationCount}</span> 条
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground/70">
                窗口范围：{snapshot.hasSnapshot && snapshot.run
                  ? `${formatTime(snapshot.run.window_start)} - ${formatTime(snapshot.run.window_end)}`
                  : livePreview
                    ? `${formatTime(livePreview.window.startIso)} - ${formatTime(livePreview.window.endIso)}`
                    : "未记录"}
              </p>
            </div>

            {!snapshot.hasSnapshot && (
              <span className="rounded border border-warning/30 bg-warning/10 px-2 py-1 text-[10px] font-medium text-warning">
                实时候选
              </span>
            )}
          </div>

          {snapshot.hasSnapshot && !snapshot.isTodaySnapshot && (
            <div className="mt-3 rounded border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              当前暂无今日快照，以下展示的是最近一次生成的推荐快照
              {snapshot.run ? `（${snapshot.run.run_date}，生成于 ${formatTime(snapshot.run.generated_at)}）` : ""}。
            </div>
          )}
        </header>

        <div className="grid grid-cols-5 gap-3 mb-6">
          <StatCard
            label="当前窗口捕捉"
            value={stats.captureTotal}
            change={snapshot.hasSnapshot ? "snapshot window" : livePreview?.window.label}
            icon={Radio}
          />
          <StatCard
            label="推荐候选"
            value={stats.recommendationCount}
            change={snapshot.hasSnapshot ? "selected_count" : "live preview"}
            icon={ListChecks}
            accent
          />
          <StatCard
            label="可进日报"
            value={stats.dailyReportCount}
            change={snapshot.hasSnapshot ? "must_read" : "should_enter_daily_report"}
            icon={Newspaper}
          />
          <StatCard
            label="事件追踪候选"
            value={stats.eventCandidateCount}
            change="should_track_event"
            icon={GitBranch}
          />
          <StatCard
            label="深度分析候选"
            value={stats.deepCandidateCount}
            change="deep / cluster"
            icon={Brain}
          />
        </div>

        <div className="grid grid-cols-3 gap-6">
          <main className="col-span-2">
            <div className="mb-2 flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              <h2 className="section-title text-primary/80">
                {snapshot.hasSnapshot ? "正式推荐" : "实时候选，不是正式日报快照"}
              </h2>
              <span className="meta-text">{recommendations.length} 条</span>
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-card">
              {snapshot.hasSnapshot
                ? (
                  <>
                    <SectionBlock
                      title="Must Read"
                      items={snapshot.grouped.must_read}
                      empty="本次快照没有 must_read 内容"
                    />
                    <SectionBlock
                      title="High Value"
                      items={snapshot.grouped.high_value}
                      empty="本次快照没有 high_value 内容"
                    />
                    <SectionBlock
                      title="Observe"
                      items={snapshot.grouped.observe}
                      empty="本次快照没有 observe 内容"
                    />
                  </>
                )
                : recommendations.length > 0
                  ? recommendations.map(item => (
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
              title={snapshot.isTodaySnapshot ? "今日高分参考" : "高分参考"}
              empty="暂无高分参考"
              items={highScoreReference}
            />
            <ClusterSideSection
              title="多源事件候选"
              empty="暂无多源事件候选（单条观察簇不在此展示）"
              clusters={eventClusters}
            />
            <SideSection
              title="待处理候选"
              empty="暂无待处理候选"
              items={pendingCandidates}
            />
          </aside>
        </div>
      </div>
    </AppShell>
  )
}
