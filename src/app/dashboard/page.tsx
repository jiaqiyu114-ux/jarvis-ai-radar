export const dynamic = 'force-dynamic'

import Link from "next/link"
import { cookies } from "next/headers"
import { AppShell } from "@/components/layout/app-shell"
import { TodayRecommendationCard } from "./_today-recommendation-card"
import { EngineRecommendationCard } from "./_engine-recommendation-card"
import { RefreshRecommendationsButton } from "./_refresh-button"
import { ProfileSync } from "./_profile-sync"
import { listEventClusters, type EventClusterListItem } from "@/lib/db/event-clusters"
import { getLatestDailyRecommendationSnapshot } from "@/lib/data/daily-recommendation-snapshot"
import { getLatestRecommendationSnapshot } from "@/lib/db/recommendation-snapshots"
import { getLatestRecommendationRun } from "@/lib/db/recommendation-runs"
import { getSourceCoverageStats } from "@/lib/ingest/source-selector"
import {
  getRecommendationFreshness,
  formatSnapshotAge,
  type RecommendationFreshness,
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
import { cn } from "@/lib/utils"
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
      <section className="border-b border-white/[0.06] last:border-b-0">
        <div className="px-4 py-2.5">
          <h2 className="section-title">{title}</h2>
          <p className="mt-2 text-xs text-muted-foreground">{empty}</p>
        </div>
      </section>
    )
  }
  return (
    <section className="border-b border-white/[0.06] last:border-b-0">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.03] border-b border-white/[0.06]">
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
      <section className="border-b border-white/[0.06] last:border-b-0">
        <div className="px-4 py-2.5">
          <h2 className="section-title">{title}</h2>
          <p className="mt-2 text-xs text-muted-foreground">{empty}</p>
        </div>
      </section>
    )
  }
  return (
    <section className="border-b border-white/[0.06] last:border-b-0">
      {title && (
        <div className="flex items-center gap-2 px-4 py-2 bg-white/[0.03] border-b border-white/[0.06]">
          <h2 className="section-title">{title}</h2>
          <span className="meta-text">{items.length} 条</span>
        </div>
      )}
      {items.map(item => <EngineRecommendationCard key={item.id} item={item} enableDetail={enableDetail} />)}
    </section>
  )
}

// ── Status cards ─────────────────────────────────────────────────────────────

function StatusBar({
  todayCount, capturedTotal, healthySrc, activeSrc, freshness, hasFailing,
}: {
  todayCount:    number
  capturedTotal: number
  healthySrc:    number
  activeSrc:     number
  freshness:     RecommendationFreshness | null
  hasFailing:    boolean
}) {
  const snapshotAge = freshness?.ageMinutes != null
    ? formatSnapshotAge(freshness.ageMinutes)
    : '—'
  const isStale = freshness?.severity === 'stale' || freshness?.severity === 'missing'

  return (
    <div className="mb-6 grid grid-cols-4 gap-3">
      {[
        { label: "今日推荐", value: String(todayCount), sub: "条重点信息", hot: todayCount > 0, warn: false },
        { label: "近72h捕捉", value: String(capturedTotal), sub: "条抓取", hot: false, warn: false },
        { label: "可用信源", value: `${healthySrc}/${activeSrc}`, sub: hasFailing ? "部分失败" : "参与抓取", hot: false, warn: hasFailing },
        { label: "快照状态", value: snapshotAge, sub: isStale ? "建议刷新" : "状态正常", hot: false, warn: isStale },
      ].map(({ label, value, sub, hot, warn }) => (
        <div key={label} className="rounded-2xl px-4 py-4 flex flex-col gap-1.5"
             style={{
               background: hot
                 ? "linear-gradient(135deg, rgba(232,93,61,0.18), rgba(232,93,61,0.08))"
                 : "linear-gradient(135deg, rgba(255,255,255,0.09), rgba(255,255,255,0.04))",
               border: hot
                 ? "1px solid rgba(232,93,61,0.35)"
                 : "1px solid rgba(255,255,255,0.12)",
               backdropFilter: "blur(18px)",
             }}>
          <span className="text-[9px] font-mono tracking-[0.15em] uppercase"
                style={{color:"rgba(244,241,234,0.42)"}}>
            {label}
          </span>
          <span className="text-[1.75rem] font-bold tabular-nums leading-none font-mono"
                style={{color: hot ? "#E85D3D" : warn ? "#F4C95D" : "rgba(244,241,234,0.92)"}}>
            {value}
          </span>
          <span className="text-[10px]" style={{color:"rgba(244,241,234,0.38)"}}>
            {sub}
          </span>
        </div>
      ))}
    </div>
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
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

  // Score distribution across all engine candidates (for explaining gaps)
  const scoreDist = hasEngineSnapshot ? {
    '80+':   engineItems.filter(i => i.recommendationScore >= 80).length,
    '72–79': engineItems.filter(i => i.recommendationScore >= 72 && i.recommendationScore < 80).length,
    '65–71': engineItems.filter(i => i.recommendationScore >= 65 && i.recommendationScore < 72).length,
    '55–64': engineItems.filter(i => i.recommendationScore >= 55 && i.recommendationScore < 65).length,
    '50–54': engineItems.filter(i => i.recommendationScore >= 50 && i.recommendationScore < 55).length,
    '<50':   engineItems.filter(i => i.recommendationScore < 50).length,
  } : null

  // Items close to threshold but below — used in aside as candidate reference
  const candidateRef = engineItems
    .filter(i => i.recommendationScore >= thresholds.observe && i.recommendationScore < thresholds.highValue)
    .sort((a, b) => b.recommendationScore - a.recommendationScore)
    .slice(0, 6)

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

  // Build user-friendly subtitle
  let headerSubtitle: string
  if (todayTotal > 0) {
    headerSubtitle = `今天筛出 ${todayTotal} 条重点信息，按重要程度排序。全量捕捉请看「全量流」。`
  } else if (hasEngineSnapshot) {
    headerSubtitle = `今日暂无新推荐（当前档位：${activePreset.label}，推荐线 ${thresholds.highValue} 分）。可查看近期观察。`
  } else {
    headerSubtitle = '点击「刷新推荐」开始生成今日推荐。'
  }

  return (
    <AppShell topSignal={topSignal}>
      <div className="max-w-[1280px] p-6 md:p-8">

        {/* Auto-refresh if profile changed after snapshot */}
        <ProfileSync
          snapshotGeneratedAt={engineSnapshot?.generated_at ?? null}
          profileId={profileId}
        />

        {/* ── Hero ── */}
        <header className="mb-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[9px] font-mono tracking-[0.2em] uppercase mb-2"
                 style={{color:"rgba(244,241,234,0.38)"}}>
                {currentDateKey} · AI SIGNAL RADAR
              </p>
              <h1 className="text-[2.6rem] font-bold leading-none tracking-tight"
                  style={{color:"rgba(244,241,234,0.96)"}}>
                今日雷达
              </h1>
              <p className="mt-2 text-[13px] max-w-[480px] leading-relaxed"
                 style={{color:"rgba(244,241,234,0.62)"}}>
                {headerSubtitle}
              </p>
            </div>
            <div className="flex items-center gap-2 pb-1 shrink-0">
              <span className="text-[10px] rounded-lg px-2.5 py-1.5 font-mono"
                    style={{color:"rgba(244,241,234,0.55)", border:"1px solid rgba(255,255,255,0.12)"}}>
                {activePreset.label}
              </span>
              <RefreshRecommendationsButton />
            </div>
          </div>

          {snapshotIsStale && (
            <div className="mt-3 rounded-xl px-4 py-2 text-[11px]"
                 style={{border:"1px solid rgba(244,196,93,0.25)", background:"rgba(244,196,93,0.06)", color:"rgba(244,196,93,0.85)"}}>
              快照已超过 24 小时，建议刷新获取最新推荐。
            </div>
          )}
          {!hasEngineSnapshot && hasLegacySnapshot && !legacySnapshot.isTodaySnapshot && (
            <div className="mt-3 rounded-xl px-4 py-2 text-[11px]"
                 style={{border:"1px solid rgba(255,255,255,0.08)", background:"rgba(255,255,255,0.04)", color:"rgba(244,241,234,0.62)"}}>
              当前展示历史快照，请点击「刷新推荐」生成今日版本。
            </div>
          )}
        </header>

        {/* ── Status bar (4 clean metrics) ── */}
        <StatusBar
          todayCount={todayTotal}
          capturedTotal={capturedTotal}
          healthySrc={healthySrc}
          activeSrc={activeSrc}
          freshness={freshness}
          hasFailing={failingSrc > 0}
        />

        {/* ── Main grid: 3/4 main + 1/4 aside ── */}
        <div className="grid grid-cols-4 gap-5">
          <main className="col-span-3">

            {/* Section label + score distribution */}
            <div className="mb-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{background:"#E85D3D"}} />
                <h2 className="section-title" style={{color:"rgba(232,93,61,0.85)"}}>今日推荐</h2>
                {todayTotal > 0 && <span className="meta-text">{todayTotal} 条</span>}
                <span className="text-[10px] text-muted-foreground/40">· 分数 ≥ {thresholds.highValue}</span>
              </div>
              {/* Score distribution — explains gaps between today and observe */}
              {scoreDist && (
                <div className="flex items-center gap-0.5 flex-wrap text-[10px] text-muted-foreground/50">
                  <span className="mr-1 text-muted-foreground/40">分数分布：</span>
                  {(Object.entries(scoreDist) as [string, number][]).map(([range, count], i) => (
                    <span key={range} className={cn(
                      "px-1.5 py-0.5 rounded",
                      range === '80+' && count > 0 ? "text-success/70 bg-success/8" :
                      range.startsWith('72') && count > 0 ? "text-primary/70 bg-primary/8" :
                      range.startsWith('65') && count > 0 ? "text-primary/50 bg-primary/5" :
                      "text-muted-foreground/40",
                    )}>
                      {i > 0 && <span className="text-muted-foreground/20 mr-0.5">|</span>}
                      {range} {count}条
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Empty state */}
            {hasEngineSnapshot && todayTotal === 0 && (
              <div className="mb-3 rounded-lg border border-border bg-muted/15 px-4 py-5 space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  今日暂无新推荐（档位：{activePreset.label}，推荐线 {thresholds.highValue} 分）
                </p>
                <div className="text-[11px] text-muted-foreground/70 space-y-1">
                  {capturedTotal === 0 && <p>· 快照无捕获信息，请点击「刷新推荐」触发抓取。</p>}
                  {capturedTotal > 0 && demoterToObserve.length > 0 && (
                    <p>· 有 {demoterToObserve.length} 条信息接近推荐线但未达到 {thresholds.highValue} 分，已进入近期观察。</p>
                  )}
                  {engineObserveBacklog.length > 0 && (
                    <p>· 近期观察有 {engineObserveBacklog.length} 条，见下方。</p>
                  )}
                </div>
                <Link href="/settings" className="text-[10px] text-primary/70 hover:text-primary underline">调整推荐强度 →</Link>
              </div>
            )}

            {/* Today's recommendations */}
            <div className="overflow-hidden rounded-2xl"
                 style={{
                   background: "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.035))",
                   border: "1px solid rgba(255,255,255,0.12)",
                   backdropFilter: "blur(18px)",
                 }}>
              {hasEngineSnapshot ? (
                <>
                  {(engineMustRead.length > 0 || engineHighValue.length > 0) ? (
                    <>
                      {engineMustRead.length > 0 && (
                        <EngineSectionBlock title="重点推荐" items={engineMustRead} enableDetail empty="" />
                      )}
                      {engineHighValue.length > 0 && (
                        <EngineSectionBlock title="今日推荐" items={engineHighValue} enableDetail empty="" />
                      )}
                    </>
                  ) : (
                    <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                      今日暂无推荐内容
                    </div>
                  )}
                  {engineObserve.length > 0 && (
                    <EngineSectionBlock title="近期观察" items={engineObserve} empty="" />
                  )}
                </>
              ) : hasLegacySnapshot ? (
                <>
                  <LegacySectionBlock title="重点推荐" items={legacySnapshot.grouped.must_read} empty="无 must_read 内容" />
                  <LegacySectionBlock title="今日推荐" items={legacySnapshot.grouped.high_value} empty="无 high_value 内容" />
                </>
              ) : (
                <div className="px-6 py-10 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">尚无推荐快照</p>
                  <p className="text-xs text-muted-foreground/60">
                    点击右上角「刷新推荐」生成首个快照，或先在{' '}
                    <Link href="/sources" className="underline">信源管理</Link> 中导入信源。
                  </p>
                </div>
              )}
            </div>

            {/* Observe backlog — clearly separated from today_recommendation */}
            {engineObserveBacklog.length > 0 && (
              <div className="mt-5">
                <div className="mb-1.5 flex items-center gap-2 flex-wrap">
                  <div className="h-1.5 w-1.5 rounded-full bg-sky-500/50 shrink-0" />
                  <h2 className="section-title text-sky-600/70 dark:text-sky-400/70">近期观察</h2>
                  <span className="meta-text">{engineObserveBacklog.length} 条</span>
                  <span className="text-[10px] text-muted-foreground/40">
                    · 分数 {thresholds.observe}–{thresholds.highValue - 1} · 未达今日推荐线 · 供参考
                  </span>
                  {engineObserveBacklog.length > 30 && (
                    <span className="ml-auto text-[10px] text-muted-foreground/40">显示前 30 条</span>
                  )}
                </div>
                <div className="overflow-hidden rounded-2xl"
                     style={{
                       background: "linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))",
                       border: "1px solid rgba(255,255,255,0.10)",
                       backdropFilter: "blur(14px)",
                     }}>
                  <EngineSectionBlock title="" items={engineObserveBacklog.slice(0, 30)} empty="" />
                  {engineObserveBacklog.length > 30 && (
                    <div className="px-4 py-2 border-t border-border/50 text-center">
                      <Link href="/feed" className="text-[10px] text-primary/60 hover:text-primary">
                        还有 {engineObserveBacklog.length - 30} 条 · 查看全量流 →
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>

          {/* ── Aside ── */}
          <aside className="col-span-1 space-y-3">

            {/* Candidate reference */}
            {candidateRef.length > 0 && (
              <section className="rounded-2xl px-4 py-3.5"
                       style={{
                         background: "linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))",
                         border: "1px solid rgba(255,255,255,0.10)",
                         backdropFilter: "blur(14px)",
                       }}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{background:"#F4C95D"}} />
                  <h2 className="text-[9px] font-bold uppercase tracking-[0.14em] font-mono"
                      style={{color:"rgba(244,241,234,0.55)"}}>候选参考</h2>
                </div>
                <p className="text-[10px] mb-3 leading-relaxed"
                   style={{color:"rgba(244,241,234,0.48)"}}>
                  分数 {thresholds.observe}–{thresholds.highValue - 1}，未进推荐，横向对比用
                </p>
                <div>
                  {candidateRef.map(item => (
                    <div key={item.id} className="py-2.5 flex items-start gap-2.5"
                         style={{borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
                      <span className="text-[11px] font-mono font-bold shrink-0 pt-0.5 w-7 text-right tabular-nums"
                            style={{color:"rgba(244,241,234,0.50)"}}>
                        {item.recommendationScore}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] line-clamp-2 leading-snug"
                           style={{color:"rgba(244,241,234,0.78)"}}>
                          {item.title}
                        </p>
                        <p className="text-[10px] mt-0.5 truncate"
                           style={{color:"rgba(244,241,234,0.42)"}}>
                          {item.source}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Clusters */}
            {eventClusters.length > 0 && (
              <section className="rounded-2xl px-4 py-3"
                       style={{
                         background:"rgba(255,255,255,0.05)",
                         border:"1px solid rgba(255,255,255,0.09)",
                       }}>
                <h2 className="text-[9px] font-bold uppercase tracking-[0.14em] font-mono mb-2"
                    style={{color:"rgba(244,241,234,0.40)"}}>多源追踪</h2>
                {eventClusters.map(c => <MiniCluster key={c.id} cluster={c} />)}
              </section>
            )}

            {/* Feed shortcut */}
            <section className="rounded-2xl px-4 py-3"
                     style={{
                       background:"rgba(255,255,255,0.04)",
                       border:"1px solid rgba(255,255,255,0.08)",
                     }}>
              <p className="text-[11px] mb-2 leading-relaxed"
                 style={{color:"rgba(244,241,234,0.52)"}}>
                全量捕捉，不代表推荐
              </p>
              <Link href="/feed"
                    className="text-[10px] rounded-lg px-3 py-1.5 inline-flex transition-colors"
                    style={{color:"rgba(232,93,61,0.80)", border:"1px solid rgba(232,93,61,0.22)"}}>
                打开全量流 →
              </Link>
            </section>
          </aside>
        </div>

        {/* ── System debug fold ── */}
        <details className="mt-8 border border-white/[0.05] rounded-xl overflow-hidden">
          <summary className="px-4 py-2 text-[10px] text-muted-foreground/30 cursor-pointer select-none hover:text-muted-foreground/50 transition-colors list-none flex items-center gap-2 font-mono tracking-widest">
            <span>▸ SYSTEM STATUS</span>
            <span className="text-[9px] opacity-50">（默认折叠）</span>
          </summary>
          <div className="px-4 py-3 bg-white/[0.02] border-t border-white/[0.05] text-[11px] text-muted-foreground/50 space-y-1 font-mono">
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
