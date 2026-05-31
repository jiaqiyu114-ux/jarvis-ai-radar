export const dynamic = 'force-dynamic'

import { Brain, GitBranch, ListChecks, Newspaper, Radio } from "lucide-react"
import Link from "next/link"
import { AppShell } from "@/components/layout/app-shell"
import { StatCard } from "@/components/dashboard/stat-card"
import { ScoreBadge } from "@/components/feed/score-badge"
import { SourceTierBadge } from "@/components/feed/source-tier-badge"
import { TodayRecommendationCard } from "./_today-recommendation-card"
import { EngineRecommendationCard } from "./_engine-recommendation-card"
import { RefreshRecommendationsButton } from "./_refresh-button"
import { listEventClusters, type EventClusterListItem } from "@/lib/db/event-clusters"
import { getLatestDailyRecommendationSnapshot } from "@/lib/data/daily-recommendation-snapshot"
import { getLatestRecommendationSnapshot, type RecommendationSnapshotView } from "@/lib/db/recommendation-snapshots"
import { getLatestRecommendationRun, type RecommendationRun } from "@/lib/db/recommendation-runs"
import { getSourceCoverageStats, type SourceCoverageStats } from "@/lib/ingest/source-selector"
import {
  getRecommendationFreshness,
  formatSnapshotAge,
  type RecommendationFreshness,
} from "@/lib/recommendations/recommendation-freshness"
import {
  getPipelineAutomationStatus,
} from "@/lib/recommendations/pipeline-automation"
import { cn } from "@/lib/utils"
import type { RecommendedItem } from "@/lib/recommendations/recommendation-engine"
import type { DailyRecommendationSnapshotItem } from "@/lib/data/daily-recommendation-snapshot"
import type { TodayRecommendationItem } from "@/lib/data/today-adapter"
import type { TopSignalData } from "@/components/layout/app-shell"

// ── Mini helpers ─────────────────────────────────────────────────────────────

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

function SideSection({ title, empty, items }: {
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

function ClusterSideSection({ title, empty, clusters }: {
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

// ── Section blocks ────────────────────────────────────────────────────────────

function LegacySectionBlock({ title, items, empty }: {
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

function EngineSectionBlock({ title, items, empty }: {
  title: string
  items: RecommendedItem[]
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
      {items.map(item => <EngineRecommendationCard key={item.id} item={item} />)}
    </section>
  )
}

// ── Status helpers ────────────────────────────────────────────────────────────

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const diffMs  = Date.now() - new Date(iso).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1)   return '刚刚'
  if (diffMin < 60)  return `${diffMin}m 前`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr  < 24)  return `${diffHr}h 前`
  return `${Math.floor(diffHr / 24)}d 前`
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "未记录"
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  })
}

// (RUN_STATUS_* constants retained for potential future use or legacy paths)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _RUN_STATUS_COLOR: Record<string, string> = {
  success: 'text-success', partial_success: 'text-warning',
  running: 'text-sky-500', failed: 'text-danger',
}

const SEVERITY_COLOR: Record<string, string> = {
  ok:      'text-success',
  warning: 'text-warning',
  stale:   'text-danger/70',
  missing: 'text-muted-foreground/50',
}

function RunStatusStrip({ run, engineSnapshot, coverage, freshness }: {
  run:           RecommendationRun | null
  engineSnapshot: RecommendationSnapshotView | null
  coverage:      SourceCoverageStats | null
  freshness:     RecommendationFreshness | null
}) {
  // Always render — even with no data, the strip shows the refresh button.
  const severityColor = freshness
    ? (SEVERITY_COLOR[freshness.severity] ?? 'text-muted-foreground')
    : 'text-muted-foreground/50'

  const runStatus = run?.status ?? null
  const captured  = engineSnapshot?.captured_total   ?? run?.captured_total   ?? 0
  const mustRead  = engineSnapshot?.must_read_count  ?? run?.must_read_count  ?? 0
  const highValue = engineSnapshot?.high_value_count ?? run?.high_value_count ?? 0
  const observe   = engineSnapshot?.observe_count    ?? run?.observe_count    ?? 0

  return (
    <div className="mb-3 flex items-center gap-2 flex-wrap px-1 text-[11px] text-muted-foreground/70">
      <span className="text-muted-foreground/40 text-[10px] uppercase tracking-wider">推荐引擎</span>

      {/* Freshness indicator — primary status */}
      {freshness ? (
        <span className={cn("font-medium", severityColor)}>
          {freshness.severity === 'ok'      && '自动刷新就绪'}
          {freshness.severity === 'warning' && '建议尽快刷新'}
          {freshness.severity === 'stale'   && '快照已过期'}
          {freshness.severity === 'missing' && '暂无快照'}
        </span>
      ) : (
        <span className="text-muted-foreground/50">状态检测中</span>
      )}

      {/* Snapshot age */}
      {freshness && freshness.ageMinutes !== null && (
        <>
          <span className="text-muted-foreground/30">·</span>
          <span className={cn(severityColor, 'opacity-80')}>
            {formatSnapshotAge(freshness.ageMinutes)}
          </span>
        </>
      )}

      {/* Counts */}
      {(mustRead > 0 || highValue > 0 || observe > 0) && (
        <>
          <span className="text-muted-foreground/30">·</span>
          {mustRead  > 0 && <span className="text-success">MR <span className="tabular-nums">{mustRead}</span></span>}
          {highValue > 0 && <span className="text-primary">HV <span className="tabular-nums">{highValue}</span></span>}
          {observe   > 0 && <span className="text-sky-600 dark:text-sky-400">OB <span className="tabular-nums">{observe}</span></span>}
          {captured  > 0 && <span className="text-muted-foreground/50 tabular-nums">/{captured}</span>}
        </>
      )}

      {/* Coverage */}
      {coverage && (
        <>
          <span className="text-muted-foreground/30">·</span>
          <span className="text-muted-foreground/60">
            RSS{' '}
            <span className="tabular-nums text-foreground/60">{coverage.fetchedLast24h}</span>
            {'/'}{coverage.totalActiveRss}
          </span>
          {coverage.neverFetchedSources > 0 && (
            <span className="text-warning/70">· {coverage.neverFetchedSources} 未抓</span>
          )}
        </>
      )}

      {/* Run failure note */}
      {runStatus && runStatus !== 'success' && runStatus !== 'running' && (
        <span className="text-warning/70">· 上次运行不完整，旧快照仍可用</span>
      )}

      {/* Refresh button — always visible, low visual weight */}
      <span className="ml-auto">
        <RefreshRecommendationsButton />
      </span>
    </div>
  )
}

function QualityPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
      <span className={`font-mono font-semibold tabular-nums ${color}`}>{value}</span>
      {label}
    </span>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  // ── Data fetching (priority: engine snapshot > legacy snapshot) ──────────────
  const [engineSnapshot, legacySnapshot, latestRun, eventClustersResult, coverage, automationStatus] =
    await Promise.all([
      getLatestRecommendationSnapshot().catch(() => null),
      getLatestDailyRecommendationSnapshot().catch(() => ({ hasSnapshot: false, isTodaySnapshot: false, run: null, items: [], grouped: { must_read: [], high_value: [], observe: [] }, date: '' })),
      getLatestRecommendationRun().catch(() => null),
      listEventClusters({ limit: 20, includeItems: false }).catch(() => ({ clusters: [] })),
      getSourceCoverageStats().catch(() => null),
      getPipelineAutomationStatus().catch(() => ({
        localTaskScriptAvailable: false,
        vercelCronConfigured: false,
        cronPath: null,
        recommendedSchedule: "every 6 hours" as const,
        secretConfigured: false,
      })),
    ])

  const eventClusters = eventClustersResult.clusters
    .filter(c =>
      (c.status === "active" || c.status === "watching") &&
      (c.confidence > 20 || c.itemCount >= 2 || c.sourceCount >= 2)
    )
    .slice(0, 5)

  // Freshness classification (pure computation, no I/O)
  const freshness = getRecommendationFreshness({
    latestSnapshot: engineSnapshot ? { generated_at: engineSnapshot.generated_at } : null,
    latestRun,
    coverage,
  })

  // ── Determine data source ────────────────────────────────────────────────────
  const hasEngineSnapshot = engineSnapshot !== null
  const hasLegacySnapshot = legacySnapshot.hasSnapshot

  // Engine snapshot items
  const engineItems = engineSnapshot?.items ?? []
  const engineMustRead  = engineItems.filter(i => i.recommendationTier === 'must_read')
  const engineHighValue = engineItems.filter(i => i.recommendationTier === 'high_value')
  const engineObserve   = engineItems.filter(i => i.recommendationTier === 'observe')

  // Legacy snapshot items
  const snapshotItems = hasLegacySnapshot ? legacySnapshot.items : []

  // Snapshot age warning (> 24h) — computed server-side at request time
  const snapshotAgeMs   = engineSnapshot
    ? new Date().getTime() - new Date(engineSnapshot.generated_at).getTime()
    : null
  const snapshotIsStale = snapshotAgeMs !== null && snapshotAgeMs > 24 * 3_600_000
  const engineStatusLabel = latestRun?.status === "running"
    ? "正在运行"
    : freshness.severity === "ok"
      ? "正常"
      : freshness.severity === "warning"
        ? "警告"
        : freshness.severity === "stale"
          ? "过期"
          : "尚无快照"

  // Top signal for app shell
  const topEngineItem   = engineItems[0] ?? null
  const topLegacyItem   = snapshotItems[0] ?? null
  const topSignal: TopSignalData | undefined = topEngineItem
    ? { score: topEngineItem.recommendationScore, title: topEngineItem.title, category: topEngineItem.category }
    : topLegacyItem
      ? { score: topLegacyItem.finalScore, title: topLegacyItem.title, category: topLegacyItem.category }
      : undefined

  // ── Stats ────────────────────────────────────────────────────────────────────
  const stats = hasEngineSnapshot
    ? {
        captureTotal:        engineSnapshot!.captured_total,
        recommendationCount: engineSnapshot!.recommendation_candidates,
        dailyReportCount:    engineSnapshot!.must_read_count,
        eventCandidateCount: engineItems.filter(i => i.shouldTrackEvent).length,
        deepCandidateCount:  engineItems.filter(i => i.shouldDeepAnalyze).length,
      }
    : hasLegacySnapshot && legacySnapshot.run
      ? {
          captureTotal:        legacySnapshot.run.total_candidates,
          recommendationCount: legacySnapshot.run.selected_count,
          dailyReportCount:    legacySnapshot.run.must_read_count,
          eventCandidateCount: snapshotItems.filter(i => i.shouldTrackEvent).length,
          deepCandidateCount:  snapshotItems.filter(i => i.shouldDeepAnalyze || i.analysisTier === 'deep').length,
        }
      : { captureTotal: 0, recommendationCount: 0, dailyReportCount: 0, eventCandidateCount: 0, deepCandidateCount: 0 }

  // ── Quality pills ────────────────────────────────────────────────────────────
  const qualityStats = hasEngineSnapshot
    ? {
        mustRead:          engineSnapshot!.must_read_count,
        highValue:         engineSnapshot!.high_value_count,
        observe:           engineSnapshot!.observe_count,
        multiSource:       engineItems.filter(i => i.sourceStatus === 'multi_source').length,
        userCurated:       engineItems.filter(i => i.isUserCurated).length,
        withEvidence:      engineItems.filter(i => i.evidenceLevel === 'strong' || i.evidenceLevel === 'medium').length,
        estimatedExcluded: Math.max(0, engineSnapshot!.captured_total - engineSnapshot!.recommendation_candidates),
      }
    : hasLegacySnapshot
      ? {
          mustRead:          legacySnapshot.grouped.must_read.length,
          highValue:         legacySnapshot.grouped.high_value.length,
          observe:           legacySnapshot.grouped.observe.length,
          multiSource:       snapshotItems.filter(r => r.analysisTier === 'cluster').length,
          userCurated:       snapshotItems.filter(r => r.isUserCurated === true).length,
          withEvidence:      snapshotItems.filter(r => (r.evidenceScore ?? 0) >= 55).length,
          estimatedExcluded: Math.max(0, stats.captureTotal - stats.recommendationCount),
        }
      : { mustRead: 0, highValue: 0, observe: 0, multiSource: 0, userCurated: 0, withEvidence: 0, estimatedExcluded: 0 }

  const highScoreRef = hasLegacySnapshot
    ? [...snapshotItems].sort((a, b) => b.finalScore - a.finalScore).slice(0, 5)
    : []

  // ── Header label ─────────────────────────────────────────────────────────────
  let headerLabel: string
  let headerSubtitle: string
  if (hasEngineSnapshot) {
    headerLabel    = '推荐快照'
    headerSubtitle = `快照生成于 ${formatTime(engineSnapshot!.generated_at)}`
  } else if (hasLegacySnapshot) {
    headerLabel    = legacySnapshot.isTodaySnapshot ? '今日推荐快照' : '最近一次推荐快照'
    headerSubtitle = legacySnapshot.run
      ? `快照生成于 ${formatTime(legacySnapshot.run.generated_at)}`
      : '已有快照'
  } else {
    headerLabel    = '推荐雷达'
    headerSubtitle = '暂无推荐快照，请点击「刷新推荐」生成'
  }

  return (
    <AppShell topSignal={topSignal}>
      <div className="max-w-[1280px] p-6 md:p-8">

        {/* ── Header ── */}
        <header className="mb-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="page-kicker mb-1">Today&apos;s Recommendations</p>
              <h1 className="editorial-title text-[2.15rem]">{headerLabel}</h1>
              <p className="page-subtitle mt-1.5">
                {headerSubtitle}
                {(hasEngineSnapshot || hasLegacySnapshot) && (
                  <>
                    {' · '}
                    当前窗口捕捉 <span className="font-medium text-foreground tabular-nums">{stats.captureTotal}</span> 条
                    {' · '}
                    推荐候选 <span className="font-medium text-foreground tabular-nums">{stats.recommendationCount}</span> 条
                  </>
                )}
              </p>
            </div>
            {hasEngineSnapshot && (
              <span className="rounded border border-success/30 bg-success/10 px-2 py-1 text-[10px] font-medium text-success">
                稳定快照
              </span>
            )}
            {!hasEngineSnapshot && !hasLegacySnapshot && (
              <span className="rounded border border-muted bg-muted/30 px-2 py-1 text-[10px] font-medium text-muted-foreground">
                无快照
              </span>
            )}
          </div>

          {/* Stale snapshot warning */}
          {hasEngineSnapshot && snapshotIsStale && (
            <div className="mt-2 rounded border border-warning/30 bg-warning/8 px-3 py-1.5 text-[11px] text-warning">
              推荐快照较旧（{timeAgo(engineSnapshot!.generated_at)}），建议点击「刷新推荐」获取最新结果。
            </div>
          )}

          {/* Legacy fallback notice */}
          {!hasEngineSnapshot && hasLegacySnapshot && !legacySnapshot.isTodaySnapshot && (
            <div className="mt-2 rounded border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs text-warning">
              当前展示历史快照，暂无新版推荐快照。请点击「刷新推荐」生成。
              {legacySnapshot.run ? `（快照日期 ${legacySnapshot.run.run_date}）` : ''}
            </div>
          )}
        </header>

        {/* ── Run status strip + refresh button ── */}
        <RunStatusStrip run={latestRun} engineSnapshot={engineSnapshot} coverage={coverage} freshness={freshness} />

        <div className="mb-4 rounded border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground/80">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground/50">引擎状态</span>
            <span className={cn(
              "font-medium",
              latestRun?.status === "running"
                ? "text-sky-500"
                : freshness.severity === "ok"
                  ? "text-success"
                  : freshness.severity === "warning"
                    ? "text-warning"
                    : "text-danger/70",
            )}>{engineStatusLabel}</span>
            {engineSnapshot && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span>最近快照 {formatTime(engineSnapshot.generated_at)}</span>
                {freshness.ageMinutes !== null && <span>({formatSnapshotAge(freshness.ageMinutes)})</span>}
                <span className="text-muted-foreground/30">·</span>
                <span>捕捉 {engineSnapshot.captured_total}</span>
                <span>MR {engineSnapshot.must_read_count}</span>
                <span>HV {engineSnapshot.high_value_count}</span>
                <span>OB {engineSnapshot.observe_count}</span>
              </>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={automationStatus.vercelCronConfigured ? "text-success/80" : "text-warning/80"}>
              {automationStatus.vercelCronConfigured ? "自动刷新: 每 6 小时" : "自动刷新未接入，请使用本地任务或 Vercel Cron"}
            </span>
            {coverage && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span>RSS 覆盖 {coverage.fetchedLast24h}/{coverage.totalActiveRss}</span>
                {coverage.neverFetchedSources > 0 && <span>{coverage.neverFetchedSources} 个未抓</span>}
                {coverage.needsRefresh && <span className="text-warning/80">建议扩大本轮抓取源数量</span>}
              </>
            )}
          </div>
        </div>

        {/* Snapshot table not-ready / no-snapshot notice */}
        {!hasEngineSnapshot && !latestRun && (
          <div className="mb-4 rounded border border-border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground space-y-1">
            <p>暂无推荐快照，点击上方「刷新推荐」按钮生成首个快照。</p>
            <p className="text-[10px] text-muted-foreground/60">
              如果按钮提示失败，请先在 Supabase SQL Editor 执行{' '}
              <code className="font-mono text-foreground/70">supabase/recommendation-snapshots-v1.sql</code>{' '}
              和{' '}
              <code className="font-mono text-foreground/70">supabase/recommendation-runs-v1.sql</code>
            </p>
          </div>
        )}

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-5 gap-3 mb-6">
          <StatCard label="当前窗口捕捉" value={stats.captureTotal}
            change={hasEngineSnapshot ? `${engineSnapshot!.window_hours}h 窗口` : hasLegacySnapshot ? "snapshot" : "—"} icon={Radio} />
          <StatCard label="推荐候选" value={stats.recommendationCount}
            change={hasEngineSnapshot ? "engine snapshot" : hasLegacySnapshot ? "legacy snapshot" : "—"} icon={ListChecks} accent />
          <StatCard label="可进日报" value={stats.dailyReportCount}
            change="must_read" icon={Newspaper} />
          <StatCard label="事件追踪候选" value={stats.eventCandidateCount}
            change="should_track_event" icon={GitBranch} />
          <StatCard label="深度分析候选" value={stats.deepCandidateCount}
            change="deep / cluster" icon={Brain} />
        </div>

        {/* ── Quality overview strip ── */}
        {(hasEngineSnapshot || hasLegacySnapshot) && (
          <div className="mb-5 flex items-center gap-2 flex-wrap rounded-lg border border-border bg-card px-4 py-2.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mr-1">质量分布</span>
            {qualityStats.mustRead   > 0 && <QualityPill label="重点推荐" value={qualityStats.mustRead}   color="text-success" />}
            {qualityStats.highValue  > 0 && <QualityPill label="高价值"   value={qualityStats.highValue}  color="text-primary" />}
            {qualityStats.observe    > 0 && <QualityPill label="观察"     value={qualityStats.observe}    color="text-sky-600 dark:text-sky-400" />}
            <span className="w-px h-3 bg-border mx-0.5" />
            {qualityStats.multiSource  > 0 && <QualityPill label="多源验证" value={qualityStats.multiSource}  color="text-success" />}
            {qualityStats.userCurated  > 0 && <QualityPill label="我的源"   value={qualityStats.userCurated}  color="text-teal-600 dark:text-teal-400" />}
            {qualityStats.withEvidence > 0 && <QualityPill label="证据充分" value={qualityStats.withEvidence} color="text-foreground" />}
            {qualityStats.estimatedExcluded > 0 && (
              <>
                <span className="w-px h-3 bg-border mx-0.5" />
                <QualityPill label="候选未入选" value={qualityStats.estimatedExcluded} color="text-muted-foreground" />
              </>
            )}
          </div>
        )}

        {/* ── Main grid ── */}
        <div className="grid grid-cols-3 gap-6">
          <main className="col-span-2">
            <div className="mb-2 flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              <h2 className="section-title text-primary/80">
                {hasEngineSnapshot ? "稳定推荐快照" : hasLegacySnapshot ? "快照推荐" : "暂无推荐"}
              </h2>
              <span className="meta-text">
                {hasEngineSnapshot ? engineItems.filter(i => i.recommendationTier !== 'archive').length
                  : hasLegacySnapshot ? snapshotItems.length
                  : 0} 条
              </span>
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-card">
              {hasEngineSnapshot ? (
                <>
                  <EngineSectionBlock title="Must Read" items={engineMustRead}
                    empty="当前无 must_read 级推荐（需 recommendationScore ≥ 80）" />
                  <EngineSectionBlock title="High Value" items={engineHighValue}
                    empty="当前无 high_value 级推荐（需 recommendationScore ≥ 65）" />
                  <EngineSectionBlock title="Observe" items={engineObserve}
                    empty="当前无 observe 级候选" />
                </>
              ) : hasLegacySnapshot ? (
                <>
                  <LegacySectionBlock title="Must Read" items={legacySnapshot.grouped.must_read}
                    empty="本次快照没有 must_read 内容" />
                  <LegacySectionBlock title="High Value" items={legacySnapshot.grouped.high_value}
                    empty="本次快照没有 high_value 内容" />
                  <LegacySectionBlock title="Observe" items={legacySnapshot.grouped.observe}
                    empty="本次快照没有 observe 内容" />
                </>
              ) : (
                <div className="px-6 py-12 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">当前暂无推荐快照</p>
                  <p className="text-xs text-muted-foreground/60">
                    请先触发 RSS 抓取（<Link href="/sources" className="underline">信源管理</Link>），
                    再点击上方「刷新推荐」生成首个快照。
                  </p>
                  <p className="text-[10px] text-muted-foreground/50">
                    诊断：<a href="/api/recommendations/health" target="_blank" className="underline">GET /api/recommendations/health</a>
                  </p>
                </div>
              )}
            </div>
          </main>

          <aside className="col-span-1 space-y-4">
            {highScoreRef.length > 0 && (
              <SideSection
                title={legacySnapshot.isTodaySnapshot ? "今日高分参考" : "高分参考"}
                empty="暂无高分参考"
                items={highScoreRef}
              />
            )}
            <ClusterSideSection
              title="多源事件候选"
              empty="暂无多源事件候选（单条观察簇不在此展示）"
              clusters={eventClusters}
            />
            {/* Excluded candidates guidance */}
            {qualityStats.estimatedExcluded > 0 && (
              <section className="border border-border rounded-lg bg-card px-3 py-2.5">
                <h2 className="section-title mb-1.5">暂未推荐的候选信号</h2>
                <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
                  约有 <span className="font-mono font-medium text-foreground">{qualityStats.estimatedExcluded}</span> 条进入候选池但未推荐。
                </p>
                <ul className="space-y-1 mb-2">
                  {['综合评分未达阈值（< 65分）', '标题/内容含噪音信号，已降权', '证据信号偏弱'].map(r => (
                    <li key={r} className="flex items-start gap-1.5 text-[10px] text-muted-foreground/70">
                      <span className="text-muted-foreground/40 shrink-0">–</span>{r}
                    </li>
                  ))}
                </ul>
                <Link href="/feed" className="inline-flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 border border-primary/20 bg-primary/5 rounded px-2 py-1 transition-colors">
                  查看全量信息流 →
                </Link>
              </section>
            )}
          </aside>
        </div>
      </div>
    </AppShell>
  )
}
