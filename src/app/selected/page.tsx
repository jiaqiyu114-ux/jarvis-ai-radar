import { AppShell } from "@/components/layout/app-shell"
import { InformationCard } from "@/components/feed/information-card"
import { getSelectedItems } from "@/lib/data/feed-adapter"
import type { InformationItem } from "@/types"

const SELECTED_MIN_SCORE = 75

function getEntryReasons(item: InformationItem): string[] {
  const reasons: string[] = []
  if (item.sourceTier === 'S') reasons.push('S 级信源')
  else if (item.sourceTier === 'A') reasons.push('A 级信源')
  if (item.scoreBreakdown.importance >= 85) reasons.push('高重要性')
  if (item.scoreBreakdown.content_potential >= 80) reasons.push('内容潜力')
  if (item.scoreBreakdown.novelty >= 85) reasons.push('新颖信号')
  if (item.scoreBreakdown.momentum >= 85) reasons.push('趋势上升')
  if (item.scoreBreakdown.actionability >= 80) reasons.push('高可操作')
  if (item.scoreBreakdown.credibility >= 85) reasons.push('高可信度')
  return reasons.slice(0, 3)
}

function getSuggestedAction(item: InformationItem): string {
  if (item.scoreBreakdown.content_potential >= 80) return '加入选题池'
  if (item.relatedReportCount >= 15) return '跟进事件簇'
  if (item.scoreBreakdown.actionability >= 80) return '立即行动'
  return '归档备查'
}

export default async function SelectedPage() {
  const items = await getSelectedItems()
  const selected = [...items].sort((a, b) => b.finalScore - a.finalScore)

  return (
    <AppShell>
      <div className="p-6 md:p-8 max-w-[900px]">

        {/* ── Editorial header ── */}
        <div className="mb-5">
          <p className="page-kicker mb-1">Editorial Picks</p>
          <h1 className="editorial-title text-3xl">精选流</h1>
          <p className="page-subtitle mt-1.5">
            最终分 ≥ {SELECTED_MIN_SCORE} · 今日重点判断队列 · {selected.length} 条
          </p>
        </div>

        {/* ── Info strip ── */}
        <div className="relative flex items-center gap-3 px-4 py-2 rounded-lg overflow-hidden mb-4 bg-primary/6 border border-primary/12">
          <div className="absolute left-0 inset-y-0 w-0.5 bg-primary rounded-l-lg" />
          <span className="text-[10px] font-semibold tracking-widest text-primary uppercase">判断队列</span>
          <span className="text-xs text-muted-foreground">每条信息均附入选理由与行动建议</span>
          <span className="ml-auto text-xs font-mono text-foreground tabular-nums">{selected.length} 条</span>
        </div>

        {/* ── Cards with entry rationale ── */}
        <div className="rounded-lg overflow-hidden border border-border/70 bg-card">
          {selected.length > 0
            ? selected.map(item => {
                const reasons = getEntryReasons(item)
                const action  = getSuggestedAction(item)
                return (
                  <div key={item.id}>
                    <div className="flex items-center gap-3 px-4 py-1.5 bg-surface border-b border-border/40">
                      <span className="text-[10px] text-muted-foreground">
                        入选：{reasons.join(' · ')}
                      </span>
                      <span className="ml-auto text-[10px] text-primary font-medium whitespace-nowrap">
                        → {action}
                      </span>
                    </div>
                    <InformationCard item={item} variant="emphasis" scoreSize="md" />
                  </div>
                )
              })
            : (
              <div className="py-10 text-center">
                <p className="text-sm text-muted-foreground">暂无精选内容</p>
              </div>
            )
          }
        </div>
      </div>
    </AppShell>
  )
}
