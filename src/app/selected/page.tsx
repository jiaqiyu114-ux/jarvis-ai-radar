import { AppShell } from "@/components/layout/app-shell"
import { InformationCard } from "@/components/feed/information-card"
import { getSelectedItems } from "@/lib/data/feed-adapter"
import { enrichItemWithEngine, TIER_LABELS, TIER_COLORS } from "@/lib/recommendations/recommendation-engine"
import { cn } from "@/lib/utils"
import type { TopSignalData } from "@/components/layout/app-shell"

export default async function SelectedPage({
  searchParams,
}: {
  searchParams: Promise<{ includeDemo?: string; mode?: string }>
}) {
  const sp          = await searchParams
  const includeDemo = sp.includeDemo === 'true' || sp.mode === 'all'
  const rawItems = await getSelectedItems({ includeDemo })
  // Enrich with engine classification and filter to high_value+
  const enriched = rawItems.map(item => ({
    item,
    engine: enrichItemWithEngine({
      finalScore:    item.finalScore,
      sourceTier:    item.sourceTier,
      title:         item.title,
      summary:       item.summary,
      publishedAt:   item.publishedAt,
      fetchedAt:     item.fetchedAt,
      isOfficial:    item.isOfficial,
      isUserCurated: item.isUserCurated,
      evScore:       item.evidenceProfile?.evidenceScore,
      truthScore:    item.evidenceProfile?.truthScore,
      penalties:     item.penalties,
      wordCount:     item.articleContent?.wordCount,
      shouldTrackEvent:       item.analysisGate?.shouldTrackEvent,
      shouldEnterDailyReport: item.analysisGate?.shouldEnterDailyReport,
      analysisTier:           item.analysisGate?.analysisTier,
    }),
  }))
  const selected = enriched
    .filter(({ engine }) => engine.recommendationTier === 'must_read' || engine.recommendationTier === 'high_value')
    .sort((a, b) => b.engine.recommendationScore - a.engine.recommendationScore)

  const topSignal: TopSignalData | undefined = selected[0]
    ? { score: selected[0].engine.recommendationScore, title: selected[0].item.title, category: selected[0].item.category }
    : undefined

  return (
    <AppShell topSignal={topSignal}>
      <div className="p-6 md:p-8 max-w-[900px]">

        {/* ── Editorial header ── */}
        <div className="mb-5">
          <p className="page-kicker mb-1">Editorial Picks</p>
          <div className="flex items-end justify-between gap-4">
            <h1 className="editorial-title text-3xl">精选流</h1>
            <div className="flex items-center gap-3 pb-0.5">
              {includeDemo ? (
                <span className="text-[10px] text-warning border border-warning/30 bg-warning/10 rounded px-1.5 py-0.5">
                  含演示数据
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground/50 border border-border/30 rounded px-1.5 py-0.5">
                  仅真实数据
                </span>
              )}
            </div>
          </div>
          <p className="page-subtitle mt-1.5">
            推荐分层 must_read / high_value · 今日重点判断队列 · {selected.length} 条
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
        <div className={cn("rounded-lg overflow-hidden border bg-card", selected.length > 0 ? "border-border/70" : "border-border")}>
          {selected.length > 0
            ? selected.map(({ item, engine }) => (
                <div key={item.id}>
                  <div className="flex items-center gap-2 px-4 py-1.5 bg-surface border-b border-border/40 flex-wrap">
                    <span className={cn(
                      "text-[9px] px-1.5 py-0.5 rounded border font-medium",
                      TIER_COLORS[engine.recommendationTier],
                    )}>
                      {TIER_LABELS[engine.recommendationTier]}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex-1 min-w-0 truncate">
                      {engine.recommendationReason}
                    </span>
                    {engine.nextStep && (
                      <span className="text-[10px] text-primary font-medium whitespace-nowrap shrink-0">
                        → {engine.nextStep.split('，')[0]}
                      </span>
                    )}
                  </div>
                  <InformationCard item={item} variant="emphasis" scoreSize="md" />
                </div>
              ))
            : (
              <div className="py-12 text-center">
                <p className="text-sm text-muted-foreground">暂无精选内容</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  等待 must_read / high_value 级真实信号进入系统
                </p>
              </div>
            )
          }
        </div>
      </div>
    </AppShell>
  )
}
