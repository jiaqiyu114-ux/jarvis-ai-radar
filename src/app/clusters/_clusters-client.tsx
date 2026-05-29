"use client"

import { useState } from "react"
import { formatDistanceToNow, format } from "date-fns"
import { zhCN } from "date-fns/locale"
import { ChevronDown, Clock, Newspaper } from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { InformationCard } from "@/components/feed/information-card"
import { ScoreBadge } from "@/components/feed/score-badge"
import { cn } from "@/lib/utils"
import type { MockCluster, InformationItem, SourceTier } from "@/types"

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

const tierChipColors: Record<SourceTier, string> = {
  S: 'text-amber-700 bg-amber-100 border-amber-300 dark:text-amber-400 dark:bg-amber-400/10 dark:border-amber-500/30',
  A: 'text-sky-700 bg-sky-100 border-sky-200 dark:text-sky-400 dark:bg-sky-400/10 dark:border-sky-500/30',
  B: 'text-stone-500 bg-stone-100 border-stone-200 dark:text-stone-400 dark:bg-stone-400/10 dark:border-stone-500/30',
  C: 'text-zinc-400 bg-zinc-100 border-zinc-200 dark:text-zinc-500 dark:bg-zinc-500/10 dark:border-zinc-600/30',
}

function getMomentumLabel(value: number): { label: string; color: string } {
  if (value >= 80) return { label: 'Rising',  color: 'text-danger' }
  if (value >= 50) return { label: 'Stable',  color: 'text-warning' }
  return            { label: 'Cooling', color: 'text-muted-foreground' }
}

function MomentumBar({ value }: { value: number }) {
  const color = value >= 80 ? "bg-danger" : value >= 60 ? "bg-warning" : value >= 40 ? "bg-success" : "bg-muted-foreground"
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground tabular-nums">{value}</span>
    </div>
  )
}

function ClusterRow({ cluster, items }: { cluster: MockCluster; items: InformationItem[] }) {
  const [expanded, setExpanded] = useState(false)

  const primaryItem  = items.find(i => i.id === cluster.primaryItemId)
  const relatedItems = items.filter(i => cluster.relatedItemIds.includes(i.id))

  const knownItems = [...(primaryItem ? [primaryItem] : []), ...relatedItems]
  const tierCounts = knownItems.reduce<Partial<Record<SourceTier, number>>>((acc, item) => {
    acc[item.sourceTier] = (acc[item.sourceTier] ?? 0) + 1
    return acc
  }, {})
  const uncoveredCount = cluster.sourceCount - knownItems.length
  const tierOrder: SourceTier[] = ['S', 'A', 'B', 'C']

  const firstSeen    = formatDistanceToNow(new Date(cluster.firstSeenAt), { addSuffix: true, locale: zhCN })
  const latestAt     = formatDistanceToNow(new Date(cluster.latestAt),    { addSuffix: true, locale: zhCN })
  const firstSeenFmt = format(new Date(cluster.firstSeenAt), 'MM/dd HH:mm')
  const latestFmt    = format(new Date(cluster.latestAt),    'MM/dd HH:mm')
  const catClass     = categoryColors[cluster.category] ?? categoryColors['其他']
  const momentum     = getMomentumLabel(cluster.momentum)

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      <div
        className="flex items-start gap-4 px-5 py-3.5 cursor-pointer hover:bg-accent transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {primaryItem && <ScoreBadge score={primaryItem.finalScore} size="sm" />}

        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground">{cluster.title}</h3>
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0", catClass)}>
              {cluster.category}
            </span>
          </div>

          {primaryItem && (
            <p className="text-xs text-muted-foreground line-clamp-1 italic">
              {primaryItem.summary}
            </p>
          )}

          <div className="flex items-center gap-3 flex-wrap pt-0.5">
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Newspaper className="h-3 w-3" />
              {cluster.sourceCount} 篇
            </span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              {firstSeen}
            </span>
            <span className="text-[11px] text-muted-foreground">{latestAt}更新</span>

            <div className="flex items-center gap-1.5">
              <span className={cn("text-[10px] font-medium", momentum.color)}>{momentum.label}</span>
              <MomentumBar value={cluster.momentum} />
            </div>

            <div className="flex items-center gap-1">
              {tierOrder.map(tier =>
                tierCounts[tier] ? (
                  <span key={tier} className={cn("text-[10px] px-1 py-px rounded border font-bold", tierChipColors[tier])}>
                    {tier}×{tierCounts[tier]}
                  </span>
                ) : null
              )}
              {uncoveredCount > 0 && (
                <span className="text-[10px] text-muted-foreground">+{uncoveredCount}</span>
              )}
            </div>
          </div>
        </div>

        <ChevronDown className={cn("h-4 w-4 text-muted-foreground/50 shrink-0 mt-1 transition-transform", expanded && "rotate-180")} />
      </div>

      {expanded && (
        <div className="border-t border-border">
          <div className="px-5 py-3 bg-surface flex items-center gap-4">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="text-center shrink-0">
                <div className="w-2 h-2 rounded-full bg-primary mx-auto mb-1" />
                <div className="text-[10px] font-mono text-foreground/70">{firstSeenFmt}</div>
                <div className="text-[10px] text-muted-foreground">首次报道</div>
              </div>
              <div className="flex-1 h-px bg-border" />
              <div className="text-center shrink-0">
                <div className="w-2 h-2 rounded-full bg-muted-foreground mx-auto mb-1" />
                <div className="text-[10px] font-mono text-foreground/70">{latestFmt}</div>
                <div className="text-[10px] text-muted-foreground">最新动态</div>
              </div>
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0 ml-4">
              {cluster.sourceCount} 篇 · {knownItems.length} 条已录入
            </span>
          </div>

          {primaryItem && (
            <div>
              <div className="px-5 py-1.5 bg-primary/5 border-b border-border/60">
                <span className="page-kicker text-primary/70">主条信息</span>
              </div>
              <InformationCard item={primaryItem} />
            </div>
          )}

          {relatedItems.length > 0 && (
            <div>
              <div className="px-5 py-1.5 border-b border-border/60 bg-surface">
                <span className="muted-label">相关报道 ({relatedItems.length})</span>
              </div>
              {relatedItems.map(item => <InformationCard key={item.id} item={item} />)}
            </div>
          )}

          {uncoveredCount > 0 && (
            <div className="px-5 py-2.5 text-center border-t border-border bg-surface">
              <span className="text-xs text-muted-foreground">另有 {uncoveredCount} 篇报道未录入数据</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Module-level constant: evaluated once per bundle load.
// The stat cards that depend on this use suppressHydrationWarning to handle
// the inevitable difference between server render time and client hydration time.
const NOW = Date.now()

export default function ClustersClient({ clusters, items }: { clusters: MockCluster[]; items: InformationItem[] }) {
  const sorted = [...clusters].sort((a, b) => b.momentum - a.momentum)

  return (
    <AppShell>
      <div className="p-6 md:p-8 max-w-[1080px]">

        {/* ── Editorial header ── */}
        <div className="mb-6">
          <p className="page-kicker mb-1">Event Archive</p>
          <h1 className="editorial-title text-[2.25rem]">事件簇</h1>
          <p className="page-subtitle mt-1.5">
            {clusters.length} 个活跃事件 · 按势头排序
          </p>
        </div>

        {/* ── Stat row ── */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: '活跃事件',   value: clusters.length },
            { label: '总关联报道', value: clusters.reduce((s, c) => s + c.sourceCount, 0) },
            { label: '高势头 ≥80', value: clusters.filter(c => c.momentum >= 80).length },
            { label: '今日新增',   value: clusters.filter(c => {
                const h = (NOW - new Date(c.firstSeenAt).getTime()) / 3600000
                return h <= 24
              }).length },
          ].map(({ label, value }) => (
            <div key={label} className="border border-border rounded-lg px-4 py-2.5 bg-card">
              <p className="muted-label mb-1">{label}</p>
              {/* suppressHydrationWarning: counts derived from Date.now() differ between
                  static-build server render and client hydration — cosmetic, not critical. */}
              <p suppressHydrationWarning className="text-2xl font-bold font-mono leading-none tabular-nums">{value}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          {sorted.length > 0
            ? sorted.map(cluster => <ClusterRow key={cluster.id} cluster={cluster} items={items} />)
            : (
              <div className="border border-border rounded-lg py-12 text-center bg-card">
                <p className="text-sm text-muted-foreground">暂无活跃事件簇</p>
                <p className="text-xs text-muted-foreground/60 mt-1">信源抓取后，相关联的报道会自动聚合成事件簇</p>
              </div>
            )
          }
        </div>
      </div>
    </AppShell>
  )
}
