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

function EngineSectionBlock({ title, items, empty, enableDetail = false }: {
  title: string
  items: RecommendedItem[]
  empty: string
  enableDetail?: boolean
}) {
  if (items.length === 0) {
    if (!empty) return null
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
      {title && (
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/15 border-b border-border">
          <h2 className="section-title">{title}</h2>
          <span className="meta-text">{items.length} 条</span>
        </div>
      )}
      {items.map(item => <EngineRecommendationCard key={item.id} item={item} enableDetail={enableDetail} />)}
    </section>
  )
}

// ── Compact stat pill ─────────────────────────────────────────────────────────

function StatPill({ label, value, sub, accent, warn }: {
  label:   string
  value:   string
  sub?:    string
  accent?: boolean
  warn?:   boolean
}) {
  return (
    <div className="flex items-baseline gap-1.5 shrink-0">
      <span className="text-[10px] text-muted-foreground/60">{label}</span>
      <span className={cn(
        "text-base font-bold tabular-nums leading-none",
        accent ? "text-primary" : warn ? "text-warning" : "text-foreground",
      )}>{value}</span>
      {sub && <span className="text-[10px] text-muted-foreground/40">{sub}</span>}
    </div>
  )
}

// ── Status bar ────────────────────────────────────────────────────────────────

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
    <div className="mb-4 flex items-center gap-5 rounded-lg border border-border bg-card px-4 py-2.5">
      <StatPill
        label="今日推荐"
        value={String(todayCount)}
        accent={todayCount > 0}
        sub="今天筛出"
      />
      <div className="w-px h-6 bg-border/50" />
      <StatPill label="近72h捕捉" value={String(capturedTotal)} sub="系统抓取" />
      <div className="w-px h-6 bg-border/50" />
      <StatPill
        label="可用信源"
        value={`${healthySrc}/${activeSrc}`}
        warn={hasFailing}
        sub={hasFailing ? '部分失败' : '参与抓取'}
      />
      <div className="w-px h-6 bg-border/50" />
      <StatPill
        label="快照"
        value={snapshotAge}
        warn={isStale}
        sub={isStale ? '建议刷新' : '状态正常'}
      />
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

        {/* ── Header ── */}
        <header className="mb-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="page-kicker mb-1">{currentDateKey}</p>
              <h1 className="editorial-title text-[2.15rem]">今日雷达</h1>
              <p className="page-subtitle mt-1.5 max-w-[520px]">{headerSubtitle}</p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[10px] text-muted-foreground/50 border border-border/50 rounded px-2 py-1">
                {activePreset.label}
              </span>
              <RefreshRecommendationsButton />
            </div>
          </div>

          {snapshotIsStale && (
            <div className="mt-2 rounded border border-warning/30 bg-warning/5 px-3 py-1.5 text-[11px] text-warning/90">
              快照已超过 24 小时，建议刷新获取最新推荐。
            </div>
          )}
          {!hasEngineSnapshot && hasLegacySnapshot && !legacySnapshot.isTodaySnapshot && (
            <div className="mt-2 rounded border border-border bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
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

            {/* Section label */}
            <div className="mb-2 flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              <h2 className="section-title text-primary/80">今日推荐</h2>
              {todayTotal > 0 && <span className="meta-text">{todayTotal} 条</span>}
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
            <div className="overflow-hidden rounded-lg border border-border bg-card">
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
                <div className="overflow-hidden rounded-lg border border-sky-500/15 bg-card">
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
          <aside className="col-span-1 space-y-4">

            {/* Candidate reference — low visual weight, collapsed if many today items */}
            {snapshotItems.length > 0 && todayTotal < 5 && (
              <section className="border border-border/60 rounded-lg bg-card/80 px-3 py-2.5">
                <h2 className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1">候选参考</h2>
                <p className="text-[10px] text-muted-foreground/50 mb-2">未进入今日推荐，仅供排查。</p>
                <div className="space-y-0">
                  {[...snapshotItems].sort((a, b) => b.finalScore - a.finalScore).slice(0, 5).map(item => (
                    <div key={item.id} className="border-b border-border/40 last:border-0 py-2 flex items-start gap-2">
                      <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0 pt-0.5 w-6 text-right">{item.finalScore}</span>
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground/70 line-clamp-2 leading-snug">{item.title}</p>
                        <p className="text-[10px] text-muted-foreground/40 mt-0.5">{item.source}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Clusters */}
            {eventClusters.length > 0 && (
              <section className="border border-border/60 rounded-lg bg-card/80 px-3 py-2.5">
                <h2 className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1.5">多源追踪</h2>
                {eventClusters.map(c => <MiniCluster key={c.id} cluster={c} />)}
              </section>
            )}

            {/* Feed shortcut */}
            <section className="border border-border/40 rounded-lg bg-card/50 px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground/70 mb-1.5">查看系统原始捕捉的所有内容（不代表推荐）</p>
              <Link href="/feed" className="text-[10px] text-primary/70 hover:text-primary border border-primary/20 bg-primary/5 rounded px-2 py-1 transition-colors inline-flex">
                打开全量流 →
              </Link>
            </section>
          </aside>
        </div>

        {/* ── System debug fold ── */}
        <details className="mt-8 border border-border/30 rounded-lg overflow-hidden">
          <summary className="px-4 py-2 text-[11px] text-muted-foreground/50 cursor-pointer select-none hover:text-muted-foreground/70 transition-colors list-none flex items-center gap-2">
            <span>▶ 系统状态</span>
            <span className="text-[10px]">（调试信息，默认折叠）</span>
          </summary>
          <div className="px-4 py-3 bg-muted/10 border-t border-border/30 text-[11px] text-muted-foreground/60 space-y-1 font-mono">
            <p>快照生成于：{formatTime(engineSnapshot?.generated_at)} （{timeAgo(engineSnapshot?.generated_at)} 前）</p>
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
