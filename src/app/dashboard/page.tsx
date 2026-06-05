export const dynamic = 'force-dynamic'

import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cookies } from "next/headers"
import { AppShell } from "@/components/layout/app-shell"
import { TodayRecommendationCard } from "./_today-recommendation-card"
import { EngineRecommendationCard } from "./_engine-recommendation-card"
import { SignalTimeline } from "./_signal-timeline"
import { buildSignalTimeline } from "@/lib/recommendations/signal-timeline"
import { DashboardMoreMenu } from "./_dashboard-more-menu"
import { DashboardRefreshCoordinator } from "./_refresh-coordinator"
import { listEventClusters, type EventClusterListItem } from "@/lib/db/event-clusters"
import { getLatestDailyRecommendationSnapshot } from "@/lib/data/daily-recommendation-snapshot"
import { getLatestRecommendationSnapshot } from "@/lib/db/recommendation-snapshots"
import { getLatestRecommendationRun } from "@/lib/db/recommendation-runs"
import { getSourceCoverageStats } from "@/lib/ingest/source-selector"
import {
  getRecommendationFreshness,
  formatSnapshotAge,
} from "@/lib/recommendations/recommendation-freshness"
import {
  getPipelineAutomationStatus,
} from "@/lib/recommendations/pipeline-automation"
import { todayKey, JARVIS_TIMEZONE } from "@/lib/recommendations/daily-gate"
import {
  PROFILE_COOKIE,
  PROFILE_PRESETS,
  getProfileThresholds,
  DEFAULT_PROFILE_ID,
} from "@/lib/recommendations/recommendation-thresholds"
import { GlassPanel } from "@/components/ui/glass-panel"
import { ClientRelativeTime } from "@/components/time/client-relative-time"
import { cleanDisplayText, safeSourceName } from "@/lib/text/decode-html"
import { getRole, isAdmin as checkAdmin } from "@/lib/auth-server"
import type { RecommendedItem } from "@/lib/recommendations/recommendation-engine"
import type { DailyRecommendationSnapshotItem } from "@/lib/data/daily-recommendation-snapshot"
import type { TopSignalData } from "@/components/layout/app-shell"

// ── Section blocks ────────────────────────────────────────────────────────────

function LegacySectionBlock({ title, items, empty }: {
  title: string
  items: DailyRecommendationSnapshotItem[]
  empty: string
}) {
  if (items.length === 0) {
    return (
      <section className="border-b last:border-b-0" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="px-4 py-2.5">
          <h2 className="section-title">{title}</h2>
          <p className="mt-2 text-xs text-muted-foreground">{empty}</p>
        </div>
      </section>
    )
  }
  return (
    <section className="border-b last:border-b-0" style={{ borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: "var(--border-subtle)", background: "var(--overlay-2)" }}>
        <h2 className="section-title">{title}</h2>
        <span className="meta-text">{items.length} 条</span>
      </div>
      {items.map(item => <TodayRecommendationCard key={item.id} item={item} />)}
    </section>
  )
}

function EngineSectionBlock({ title, items, empty, enableDetail = false }: {
  title: string
  items: RecommendedItem[]
  empty: string
  enableDetail?: boolean
}) {
  if (items.length === 0) {
    if (!empty) return null
    return (
      <section>
        {title && (
          <div className="flex items-center gap-2 mb-2">
            <h2 className="section-title">{title}</h2>
          </div>
        )}
        <p className="text-xs text-muted-foreground">{empty}</p>
      </section>
    )
  }
  return (
    <section>
      {title && (
        <div className="flex items-center gap-2 mb-2.5">
          <h2 className="section-title">{title}</h2>
          <span className="meta-text">{items.length} 条</span>
        </div>
      )}
      <div className="space-y-3">
        {items.map(item => (
          <EngineRecommendationCard
            key={item.id}
            item={item}
            enableDetail={enableDetail}
          />
        ))}
      </div>
    </section>
  )
}

// ── Cluster aside ─────────────────────────────────────────────────────────────

function MiniCluster({ cluster }: { cluster: EventClusterListItem }) {
  return (
    <div className="border-b border-border last:border-0 py-2">
      <p className="line-clamp-2 text-xs leading-snug text-foreground/80">{cluster.title}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground/50">
        {cluster.itemCount} 条 · 置信度 {cluster.confidence}
      </p>
    </div>
  )
}

// ── Status helpers ────────────────────────────────────────────────────────────

function formatTime(value: string | null | undefined): string {
  if (!value) return "未记录"
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  })
}

function candidateObservationLabel(
  item: RecommendedItem,
  thresholds: { highValue: number },
): string {
  if (item.shouldEnterDailyReport) return "可进日报"
  if (item.deliveryStatus === "previously_delivered" || item.dailyGate?.reason === "published_too_old") {
    return "旧事件更新"
  }
  if ((item.relatedSignals?.length ?? 0) < 2 && !item.isOfficial) return "等待多源验证"
  if ((item.evScore ?? 0) < 55 && !item.qualityFlags.includes("strong_evidence")) return "证据不足"
  if (item.recommendationScore < thresholds.highValue) return "分数未达阈值"
  return "轻量观察"
}

function candidateSourceLine(item: RecommendedItem): string {
  return `${safeSourceName(item.source, item.originalUrl)} · Source ${item.sourceTier}`
}

// Small stat tile for the insights panel.
function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5"
         style={{ background: "var(--overlay-2)", border: "1px solid var(--border-subtle)" }}>
      <div className="rf-stat-num">{value}</div>
      <div className="mt-1.5" style={{ fontSize: "var(--fs-nano)", color: "var(--text-muted)", fontWeight: "var(--fw-nano)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const role    = await getRole()
  const adminOk = checkAdmin(role)

  // Read current profile from cookie (set by settings page after save)
  const cookieStore = await cookies()
  const profileId = cookieStore.get(PROFILE_COOKIE)?.value ?? DEFAULT_PROFILE_ID
  const thresholds = getProfileThresholds(profileId)
  const activePreset = PROFILE_PRESETS.find(p => p.id === profileId) ?? PROFILE_PRESETS[2]

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
    .filter(c => (c.status === "active" || c.status === "watching") &&
                 (c.confidence > 20 || c.itemCount >= 2 || c.sourceCount >= 2))
    .slice(0, 5)

  const freshness = getRecommendationFreshness({
    latestSnapshot: engineSnapshot ? { generated_at: engineSnapshot.generated_at } : null,
    latestRun,
    coverage,
  })

  const hasEngineSnapshot = engineSnapshot !== null
  const hasLegacySnapshot = legacySnapshot.hasSnapshot
  const currentDateKey    = todayKey(JARVIS_TIMEZONE)

  const engineItems = engineSnapshot?.items ?? []

  // Re-classify items at display time based on the CURRENT profile's thresholds.
  // Snapshot tiers were set when snapshot was created (possibly with a different profile).
  // We re-filter so that items below the current highValue threshold are moved to observe.
  const isToday = (i: RecommendedItem) =>
    i.recommendationBucket === 'today_recommendation' || i.recommendationBucket == null

  // Today's recommendations: must pass both today gate AND current highValue threshold
  const engineTodayAll = engineItems.filter(i =>
    isToday(i) &&
    (i.recommendationTier === 'must_read' || i.recommendationTier === 'high_value') &&
    i.recommendationScore >= thresholds.highValue,
  )
  const engineMustRead  = engineTodayAll.filter(i => i.recommendationScore >= thresholds.mustRead)
  const engineHighValue = engineTodayAll.filter(i =>
    i.recommendationScore >= thresholds.highValue && i.recommendationScore < thresholds.mustRead,
  )

  // Observe backlog: either originally backlog, or today items demoted by threshold re-filter,
  // or genuine observe-tier items — all must be >= observe threshold
  const demoterToObserve = engineItems.filter(i =>
    isToday(i) &&
    (i.recommendationTier === 'must_read' || i.recommendationTier === 'high_value') &&
    i.recommendationScore >= thresholds.observe &&
    i.recommendationScore < thresholds.highValue,
  )
  const engineObserveBacklog = [
    ...engineItems.filter(i =>
      i.recommendationTier === 'observe' &&
      i.recommendationBucket === 'observe_backlog' &&
      i.recommendationScore >= thresholds.observe,
    ),
    ...demoterToObserve,
  ]
  const engineObserve = engineItems.filter(i =>
    i.recommendationTier === 'observe' &&
    i.recommendationBucket !== 'observe_backlog' &&
    i.recommendationScore >= thresholds.observe &&
    i.recommendationScore < thresholds.highValue,
  )

  const todayMRCount = engineMustRead.length
  const todayHVCount = engineHighValue.length
  const todayTotal   = todayMRCount + todayHVCount

  // Dashboard is a live timeline: the curated signals ordered by publish time.
  // Apply the current profile's observe threshold so "只看大事" hides low-score
  // items — previously the timeline used the entire pool regardless of profile.
  const timelineItems  = engineItems.filter(i => i.recommendationScore >= thresholds.observe)
  const timelineGroups = buildSignalTimeline(timelineItems, { limit: 50 })
  const timelineCount  = timelineGroups.reduce((n, g) => n + g.entries.length, 0)

  // Score distribution across all engine candidates (for explaining gaps)
  const scoreDist = hasEngineSnapshot ? {
    '80+':   engineItems.filter(i => i.recommendationScore >= 80).length,
    '72–79': engineItems.filter(i => i.recommendationScore >= 72 && i.recommendationScore < 80).length,
    '65–71': engineItems.filter(i => i.recommendationScore >= 65 && i.recommendationScore < 72).length,
    '55–64': engineItems.filter(i => i.recommendationScore >= 55 && i.recommendationScore < 65).length,
    '50–54': engineItems.filter(i => i.recommendationScore >= 50 && i.recommendationScore < 55).length,
    '<50':   engineItems.filter(i => i.recommendationScore < 50).length,
  } : null
  const distMax = scoreDist ? Math.max(1, ...Object.values(scoreDist)) : 1

  // Items close to threshold but below — used in aside as candidate reference
  const candidateRef = engineItems
    .filter(i => i.recommendationScore >= thresholds.observe && i.recommendationScore < thresholds.highValue)
    .sort((a, b) => b.recommendationScore - a.recommendationScore)
    .slice(0, 5)

  const snapshotItems = hasLegacySnapshot ? legacySnapshot.items : []
  const snapshotAgeMs = engineSnapshot
    ? new Date().getTime() - new Date(engineSnapshot.generated_at).getTime()
    : 0
  const snapshotIsStale = snapshotAgeMs > 24 * 3_600_000

  const capturedTotal = engineSnapshot?.captured_total ?? legacySnapshot.run?.total_candidates ?? 0
  const healthySrc    = coverage?.healthySources ?? 0
  const activeSrc     = coverage?.totalActiveRss ?? 0
  const failingSrc    = coverage?.failingSources ?? 0

  const topItem = engineItems[0] ?? snapshotItems[0] ?? null
  const topSignal: TopSignalData | undefined = topItem
    ? { score: (topItem as RecommendedItem).recommendationScore ?? (topItem as { finalScore: number }).finalScore, title: topItem.title, category: topItem.category }
    : undefined

  const snapshotAge = freshness?.ageMinutes != null ? formatSnapshotAge(freshness.ageMinutes) : '—'
  const titleSub = timelineCount > 0
    ? `按发布时间排列，看看此刻正在发生什么`
    : hasEngineSnapshot
      ? '暂无带时间的信号，稍后刷新快照'
      : '点击「更多 → 手动操作」生成今日推荐'

  return (
    <AppShell
      topSignal={topSignal}
      lastUpdated={engineSnapshot?.generated_at ?? null}
      capturedCount={capturedTotal}
    >
      <div className="mx-auto max-w-[1240px] px-5 py-6 md:px-7">

        {/* Unified refresh coordinator: display sync + stale content fetch, one lock */}
        <DashboardRefreshCoordinator
          snapshotGeneratedAt={engineSnapshot?.generated_at ?? null}
          profileId={profileId}
        />

        {/* ── Pipeline error / stale alert banner ── */}
        {(() => {
          const lastRunFailed = latestRun?.status === 'failed'
          const ageH = freshness?.ageMinutes != null ? freshness.ageMinutes / 60 : null
          const isVeryStale = ageH != null && ageH > 28  // missed a cron cycle
          if (!lastRunFailed && !isVeryStale) return null
          return (
            <div className="mb-5 flex items-start gap-3 rounded-xl px-4 py-3"
                 style={{ background: "color-mix(in srgb, #ef4444 8%, transparent)", border: "1px solid color-mix(in srgb, #ef4444 25%, transparent)" }}>
              <span className="mt-0.5 text-[15px]">⚠️</span>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold" style={{ color: "#dc2626" }}>
                  {lastRunFailed ? 'Pipeline 最近一次运行失败' : `快照已 ${Math.round(ageH ?? 0)} 小时未更新`}
                </p>
                <p className="mt-0.5 text-[11px]" style={{ color: "#991b1b" }}>
                  {lastRunFailed
                    ? `上次运行于 ${latestRun?.started_at ? new Date(latestRun.started_at).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '未知'}，可点击「更多 → 手动生成快照」重新触发。`
                    : '可能是 Vercel Cron 未触发或网络问题。点击「更多 → 手动生成快照」立即刷新。'
                  }
                </p>
              </div>
            </div>
          )
        })()}

        {/* ── Title row ── */}
        <header className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--primary)" }} />
              <span className="page-kicker">Today&apos;s Radar</span>
            </div>
            <h1 className="editorial-title">今日雷达</h1>
            <p className="page-subtitle mt-2">{titleSub}</p>
          </div>
          <DashboardMoreMenu presetLabel={activePreset.label} isAdmin={adminOk} />
        </header>

        {/* ── Tabs + snapshot meta ── */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="rf-tabs">
            <span className="rf-tab active">
              时间线{todayMRCount > 0 && <span className="rf-tab-dot" />}
            </span>
            <Link href="/feed" className="rf-tab">全量流</Link>
            <Link href="/selected" className="rf-tab">精选流</Link>
          </div>
          <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-tertiary)" }}>
            <span>Snapshot</span>
            <span style={{ color: "var(--hairline)" }}>·</span>
            <ClientRelativeTime value={engineSnapshot?.generated_at} fallback="尚未生成" />
            <span style={{ color: "var(--hairline)" }}>·</span>
            <span>real data only</span>
          </div>
        </div>

        {snapshotIsStale && (
          <div className="mb-4 rounded-lg px-4 py-2 text-[12px]"
               style={{ border: "1px solid color-mix(in srgb, var(--warning) 28%, transparent)", background: "color-mix(in srgb, var(--warning) 10%, transparent)", color: "var(--warning)" }}>
            快照已超过 24 小时，建议在「更多 → 手动操作」刷新。
          </div>
        )}
        {!hasEngineSnapshot && hasLegacySnapshot && !legacySnapshot.isTodaySnapshot && (
          <div className="mb-4 rounded-lg px-4 py-2 text-[12px]"
               style={{ border: "1px solid var(--border-subtle)", background: "var(--bg-panel)", color: "var(--text-secondary)" }}>
            当前展示历史快照，请在「更多 → 手动操作」生成今日版本。
          </div>
        )}

        {/* ── Two-column body: timeline (left) + stats sidebar (right) ── */}
        <div className="flex gap-7 items-start">

          {/* ══ LEFT: main timeline column ══ */}
          <main className="min-w-0 flex-1 space-y-6">

            {/* ── Signal timeline — curated signals by publish time ── */}
            {hasEngineSnapshot && timelineCount > 0 && (
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-[12px] font-semibold uppercase tracking-[0.10em]" style={{ color: "var(--text-tertiary)" }}>
                    信号时间线
                  </h2>
                  <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                    {timelineCount} 条 · 按发布时间 · 分数 ≥ {thresholds.observe}
                  </span>
                </div>
                <SignalTimeline groups={timelineGroups} />
              </section>
            )}

            {/* ── No engine snapshot: legacy / first-run states ── */}
            {!hasEngineSnapshot && (
              hasLegacySnapshot ? (
                <GlassPanel className="overflow-hidden">
                  <LegacySectionBlock title="重点推荐" items={legacySnapshot.grouped.must_read} empty="无 must_read 内容" />
                  <LegacySectionBlock title="今日推荐" items={legacySnapshot.grouped.high_value} empty="无 high_value 内容" />
                </GlassPanel>
              ) : (
                <GlassPanel className="px-6 py-10 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">尚无推荐快照</p>
                  <p className="text-xs text-muted-foreground/60">
                    点击右上角「刷新推荐」生成首个快照，或先在{' '}
                    <Link href="/sources" className="underline">信源管理</Link> 中导入信源。
                  </p>
                </GlassPanel>
              )
            )}

            {/* ── Demoted content, collapsed below the fold ── */}
            {hasEngineSnapshot && (
              <div>
                {(engineObserve.length > 0 || engineObserveBacklog.length > 0) && (
                  <details className="fold">
                    <summary>
                      <ChevronRight className="chev h-4 w-4" /> 近期观察
                      <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                        {engineObserve.length + engineObserveBacklog.length} 条 · 分数 {thresholds.observe}–{thresholds.highValue - 1}
                      </span>
                    </summary>
                    <div className="space-y-3 pb-2 pt-3">
                      {engineObserve.length > 0 && (
                        <EngineSectionBlock title="" items={engineObserve} enableDetail empty="" />
                      )}
                      {engineObserveBacklog.length > 0 && (
                        <EngineSectionBlock title="" items={engineObserveBacklog.slice(0, 30)} enableDetail empty="" />
                      )}
                      {engineObserveBacklog.length > 30 && (
                        <div className="text-center">
                          <Link href="/feed" className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                            还有 {engineObserveBacklog.length - 30} 条 · 查看全量流 →
                          </Link>
                        </div>
                      )}
                    </div>
                  </details>
                )}

                {candidateRef.length > 0 && (
                  <details className="fold">
                    <summary>
                      <ChevronRight className="chev h-4 w-4" /> 候选参考
                      <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>{candidateRef.length} 条</span>
                    </summary>
                    <div className="space-y-2 pb-2 pt-3">
                      <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>未进入今日推荐，仅供排查和对比。</p>
                      {candidateRef.map(item => (
                        <div key={item.id} className="candidate-item flex items-start gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-[14px] font-semibold tabular-nums"
                                style={{ color: "var(--accent-gold)", background: "rgba(242,212,92,0.12)", border: "1px solid rgba(242,212,92,0.26)" }}>
                            {item.recommendationScore}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-[13px] font-medium leading-[18px]" style={{ color: "var(--text-secondary)" }}>
                              {cleanDisplayText(item.title)}
                            </p>
                            <p className="mt-1 truncate text-[11.5px]" style={{ color: "var(--text-tertiary)" }}>
                              {candidateSourceLine(item)} · {candidateObservationLabel(item, thresholds)}
                            </p>
                          </div>
                        </div>
                      ))}
                      <Link href="/feed" className="glass-btn mt-1 text-[12px]">打开全量流 →</Link>
                    </div>
                  </details>
                )}

                {eventClusters.length > 0 && (
                  <details className="fold">
                    <summary>
                      <ChevronRight className="chev h-4 w-4" /> 多源追踪
                      <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>{eventClusters.length}</span>
                    </summary>
                    <div className="pb-2 pt-1">
                      {eventClusters.map(c => <MiniCluster key={c.id} cluster={c} />)}
                    </div>
                  </details>
                )}
              </div>
            )}
          </main>

          {/* ══ RIGHT: sticky stats sidebar ══ */}
          {hasEngineSnapshot && (
            <aside className="w-[268px] shrink-0 sticky top-4 space-y-4">

              {/* Signal overview */}
              <div className="rf-panel">
                <div className="mb-3 flex items-center justify-between">
                  <span className="rf-panel-title">信号概览</span>
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>快照</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Stat value={capturedTotal} label="捕捉" />
                  <Stat value={timelineCount} label="时间线" />
                  <Stat value={todayMRCount} label="必看" />
                  <Stat value={candidateRef.length} label="候选" />
                  <Stat value={engineObserveBacklog.length} label="观察" />
                  <Stat value={snapshotAge} label="快照" />
                </div>
              </div>

              {/* Score distribution */}
              {scoreDist && (
                <div className="rf-panel">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="rf-panel-title">分数分布</span>
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {engineSnapshot?.recommendation_candidates ?? 0} 候选
                    </span>
                  </div>
                  <div className="rf-barchart">
                    {(Object.entries(scoreDist) as [string, number][]).map(([range, count]) => (
                      <div key={range} className="rf-bar-col">
                        <span className="font-mono text-[10px]" style={{ color: "var(--text-tertiary)" }}>{count}</span>
                        <div className="rf-bar" style={{ height: `${Math.max(4, (count / distMax) * 88)}%` }} />
                        <span className="rf-bar-label">{range}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Source health */}
              <div className="rf-panel">
                <span className="rf-panel-title">信源状态</span>
                <div className="mt-3 space-y-2 text-[12px]">
                  <div className="flex justify-between"><span style={{ color: "var(--text-tertiary)" }}>正常</span><span style={{ color: "var(--accent-lime)" }} className="font-mono font-bold">{healthySrc}</span></div>
                  <div className="flex justify-between"><span style={{ color: "var(--text-tertiary)" }}>不稳定</span><span style={{ color: failingSrc > 0 ? "var(--accent-gold)" : "var(--text-muted)" }} className="font-mono font-bold">{failingSrc}</span></div>
                  <div className="flex justify-between"><span style={{ color: "var(--text-tertiary)" }}>活跃信源</span><span style={{ color: "var(--text-secondary)" }} className="font-mono font-bold">{activeSrc}</span></div>
                </div>
              </div>

            </aside>
          )}
        </div>

        {/* ── System debug fold ── */}
        <details className="mt-8 overflow-hidden rounded-2xl border" style={{ borderColor: "var(--border-subtle)" }}>
          <summary className="px-4 py-2 text-[10px] text-muted-foreground/30 cursor-pointer select-none hover:text-muted-foreground/50 transition-colors list-none flex items-center gap-2 font-mono tracking-widest">
            <span>▸ SYSTEM STATUS</span>
            <span className="text-[9px] opacity-50">（默认折叠）</span>
          </summary>
          <div className="space-y-1 border-t px-4 py-3 font-mono text-[11px] text-muted-foreground/55"
               style={{ borderColor: "var(--border-subtle)", background: "var(--overlay-2)" }}>
            <p>快照生成于：{formatTime(engineSnapshot?.generated_at)}</p>
            <p>近72h捕捉：{capturedTotal} 条 / 引擎候选：{engineSnapshot?.recommendation_candidates ?? 0} 条</p>
            <p>今日推荐：MR={todayMRCount} HV={todayHVCount} / 观察榜：{engineObserveBacklog.length} 条</p>
            <p>信源：{healthySrc} healthy / {failingSrc} failing / {activeSrc} active</p>
            <p>快照时效：{freshness?.severity ?? '—'} ({freshness?.ageMinutes != null ? `${freshness.ageMinutes}m` : '—'})</p>
            <p>自动刷新：{automationStatus.vercelCronConfigured ? '已配置 Vercel Cron' : '未配置，请使用本地任务'}</p>
            <p>日期键：{currentDateKey} ({JARVIS_TIMEZONE})</p>
          </div>
        </details>

      </div>
    </AppShell>
  )
}
