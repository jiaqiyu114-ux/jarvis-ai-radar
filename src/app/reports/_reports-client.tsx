"use client"

import { format } from "date-fns"
import { zhCN } from "date-fns/locale"
import { AppShell } from "@/components/layout/app-shell"
import type { TopSignalData } from "@/components/layout/app-shell"
import { InformationCard } from "@/components/feed/information-card"
import { ScoreBadge } from "@/components/feed/score-badge"
import { cn } from "@/lib/utils"
import type { DailyRecommendationSnapshot, DailyRecommendationSnapshotItem } from "@/lib/data/daily-recommendation-snapshot"
import type { InformationItem } from "@/types"

// ── Category colors ───────────────────────────────────────────────────────────

const categoryColors: Record<string, string> = {
  'AI技术':   'text-blue-700 bg-blue-100 dark:text-blue-400 dark:bg-blue-400/10',
  '商业动态': 'text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-400/10',
  '产品发布': 'text-sky-700 bg-sky-100 dark:text-cyan-400 dark:bg-cyan-400/10',
  '监管政策': 'text-amber-700 bg-amber-100 dark:text-orange-400 dark:bg-orange-400/10',
  '融资并购': 'text-yellow-700 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-400/10',
  '行业趋势': 'text-violet-700 bg-violet-100 dark:text-violet-400 dark:bg-violet-400/10',
  '开源项目': 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-400/10',
  '研究报告': 'text-stone-600 bg-stone-100 dark:text-slate-400 dark:bg-slate-400/10',
  '人物动态': 'text-rose-700 bg-rose-100 dark:text-pink-400 dark:bg-pink-400/10',
  '其他':     'text-stone-500 bg-stone-100 dark:text-muted-foreground dark:bg-muted',
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ label, count, accent }: { label: string; count: number; accent?: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", accent ?? "bg-primary")} />
      <h2 className="section-title">{label}</h2>
      <span className="meta-text">{count} 条</span>
    </div>
  )
}

// ── Snapshot item card ────────────────────────────────────────────────────────
// Wraps InformationCard so the existing dialog/detail-card behaviour is preserved.
// Click opens the in-app detail panel; "查看原文" lives inside the detail panel.

function SnapshotItemCard({ item }: { item: DailyRecommendationSnapshotItem }) {
  return (
    <div>
      {/* Recommendation reason strip */}
      {item.recommendationReason && (
        <div className="flex items-center gap-2 px-4 py-1 bg-surface border-b border-border/40">
          <span className="text-[10px] text-muted-foreground/70 line-clamp-1">
            {item.recommendationReason}
          </span>
          {item.shouldEnterDailyReport && (
            <span className="ml-auto text-[9px] text-primary font-medium whitespace-nowrap">↗ 日报</span>
          )}
          {item.shouldTrackEvent && (
            <span className="text-[9px] text-success font-medium whitespace-nowrap">↗ 追踪</span>
          )}
        </div>
      )}
      {/* InformationCard handles click→dialog, external link stays inside detail panel */}
      <InformationCard item={item as unknown as InformationItem} variant="emphasis" scoreSize="md" />
    </div>
  )
}

// ── Category direction aggregation ───────────────────────────────────────────

function buildCategoryDistribution(items: DailyRecommendationSnapshotItem[]): Array<{ cat: string; count: number }> {
  const map = new Map<string, number>()
  for (const item of items) {
    const cat = (item.category as string) || '其他'
    map.set(cat, (map.get(cat) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([cat, count]) => ({ cat, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  snapshot:  DailyRecommendationSnapshot
  topSignal?: TopSignalData
}

export default function ReportsClient({ snapshot, topSignal }: Props) {
  const { run, grouped, items } = snapshot

  const generatedAt = run?.generated_at
    ? format(new Date(run.generated_at), 'MM月dd日 HH:mm', { locale: zhCN })
    : '—'

  const reportDate = run?.run_date
    ? format(new Date(run.run_date + 'T00:00:00'), 'yyyy年MM月dd日', { locale: zhCN })
    : snapshot.date

  const mustReadItems  = grouped.must_read
  const highValueItems = grouped.high_value
  const observeItems   = grouped.observe
  const catDist        = buildCategoryDistribution(items)

  return (
    <AppShell topSignal={topSignal}>
      <div className="p-6 md:p-8 max-w-[1280px]">

        {/* ── Editorial header ── */}
        <div className="mb-6">
          <p className="page-kicker mb-1">{reportDate} · Daily Brief</p>
          <h1 className="editorial-title text-[2.25rem]">今日日报</h1>
          <p className="page-subtitle mt-1.5">
            生成于 {generatedAt}
            {run && (
              <>
                {' · '}候选 {run.total_candidates} 条
                {' · '}精选 {run.selected_count} 条
              </>
            )}
          </p>
        </div>

        {/* ── Stats bar ── */}
        {run && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: '必看',   value: run.must_read_count  },
              { label: '高价值', value: run.high_value_count },
              { label: '观察',   value: run.observe_count    },
              { label: '候选池', value: run.total_candidates },
            ].map(({ label, value }) => (
              <div key={label} className="border border-border rounded-lg px-4 py-2.5 bg-card text-center">
                <p className="text-2xl font-bold font-mono leading-none tabular-nums">{value}</p>
                <p className="muted-label mt-1">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Two-column layout ── */}
        <div className="flex gap-8 items-start">

          {/* ══ LEFT: Main sections ══ */}
          <div className="flex-1 min-w-0 space-y-8">

            {/* 今日必看 */}
            {mustReadItems.length > 0 && (
              <section>
                <SectionHeader label="今日必看" count={mustReadItems.length} accent="bg-primary animate-pulse" />
                <div className="border border-primary/15 rounded-lg overflow-hidden bg-primary/3">
                  {mustReadItems.map(item => <SnapshotItemCard key={item.id} item={item} />)}
                </div>
              </section>
            )}

            {/* 高价值精选 */}
            {highValueItems.length > 0 && (
              <section>
                <SectionHeader label="高价值精选" count={highValueItems.length} accent="bg-warning" />
                <div className="border border-border/60 rounded-lg overflow-hidden bg-card">
                  {highValueItems.map(item => <SnapshotItemCard key={item.id} item={item} />)}
                </div>
              </section>
            )}

            {/* 观察名单 */}
            {observeItems.length > 0 && (
              <section>
                <SectionHeader label="观察名单" count={observeItems.length} accent="bg-muted-foreground" />
                <div className="border border-border/50 rounded-lg overflow-hidden bg-card opacity-90">
                  {observeItems.map(item => <SnapshotItemCard key={item.id} item={item} />)}
                </div>
              </section>
            )}

            {/* 空状态 */}
            {mustReadItems.length === 0 && highValueItems.length === 0 && observeItems.length === 0 && (
              <div className="border border-border rounded-lg py-12 text-center bg-card">
                <p className="text-sm text-muted-foreground">本次快照暂无推荐条目</p>
                <p className="text-xs text-muted-foreground/60 mt-1">候选池可能不足，尝试扩大时间窗口后重新生成。</p>
              </div>
            )}

          </div>

          {/* ══ RIGHT: Sidebar ══ */}
          <div className="w-[320px] shrink-0 sticky top-14 space-y-5">

            {/* 今日内容方向 */}
            {catDist.length > 0 && (
              <div className="border border-border rounded-lg p-4 bg-card">
                <p className="muted-label mb-3">今日内容方向</p>
                <div className="space-y-2">
                  {catDist.map(({ cat, count }) => (
                    <div key={cat} className="flex items-center gap-2">
                      <span className={cn("text-[10px] px-1.5 py-px rounded font-medium shrink-0", categoryColors[cat] ?? categoryColors['其他'])}>
                        {cat}
                      </span>
                      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary/40"
                          style={{ width: `${Math.round((count / (catDist[0]?.count || 1)) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground tabular-nums w-4 text-right">{count}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground/50 mt-3">
                  基于今日 {items.length} 条推荐条目统计，不调用 LLM。
                </p>
              </div>
            )}

            {/* 快照信息 */}
            {run && (
              <div className="border border-border rounded-lg p-4 bg-card">
                <p className="muted-label mb-3">快照信息</p>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <p>生成时间：{generatedAt}</p>
                  <p>候选窗口：
                    {run.window_start
                      ? format(new Date(run.window_start), 'MM/dd HH:mm', { locale: zhCN })
                      : '—'}
                    {' → '}
                    {run.window_end
                      ? format(new Date(run.window_end), 'HH:mm', { locale: zhCN })
                      : '—'}
                  </p>
                  <p>总候选：{run.total_candidates} · 精选：{run.selected_count}</p>
                  {run.notes && (
                    <p className="text-[10px] text-muted-foreground/60 mt-2">{run.notes}</p>
                  )}
                </div>
              </div>
            )}

            {/* 顶部高分参考 */}
            {items.length > 0 && (
              <div className="border border-border rounded-lg p-4 bg-card">
                <p className="muted-label mb-3">今日评分前三</p>
                <div className="space-y-2">
                  {[...items].sort((a, b) => b.finalScore - a.finalScore).slice(0, 3).map(item => (
                    <div key={item.id} className="flex items-center gap-2.5 py-1">
                      <ScoreBadge score={item.finalScore} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{item.title}</p>
                        <p className="text-[10px] text-muted-foreground">{item.source}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </AppShell>
  )
}
