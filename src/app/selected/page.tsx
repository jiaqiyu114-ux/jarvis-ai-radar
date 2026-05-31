import { AppShell } from "@/components/layout/app-shell"
import { getSelectedItems } from "@/lib/data/feed-adapter"
import { getLatestRecommendationSnapshot } from "@/lib/db/recommendation-snapshots"
import { enrichItemWithEngine, TIER_LABELS, TIER_COLORS } from "@/lib/recommendations/recommendation-engine"
import { EngineRecommendationCard } from "@/app/dashboard/_engine-recommendation-card"
import { cn } from "@/lib/utils"
import type { TopSignalData } from "@/components/layout/app-shell"
import type { RecommendedItem } from "@/lib/recommendations/recommendation-engine"

export default async function SelectedPage({
  searchParams,
}: {
  searchParams: Promise<{ includeDemo?: string; mode?: string }>
}) {
  const sp          = await searchParams
  const includeDemo = sp.includeDemo === 'true' || sp.mode === 'all'

  // ── Try engine snapshot first ─────────────────────────────────────────────
  const engineSnapshot = await getLatestRecommendationSnapshot().catch(() => null)

  let selected: RecommendedItem[] = []
  let dataSource: 'snapshot' | 'live' = 'live'

  if (engineSnapshot && engineSnapshot.items.length > 0) {
    // Use snapshot: filter to must_read + high_value
    selected = engineSnapshot.items.filter(
      i => i.recommendationTier === 'must_read' || i.recommendationTier === 'high_value'
    )
    dataSource = 'snapshot'
  } else {
    // Fallback: live enrichment from feed-adapter
    const rawItems = await getSelectedItems({ includeDemo })
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
    // Reconstruct as RecommendedItem-compatible for unified rendering
    selected = enriched
      .filter(({ engine }) => engine.recommendationTier === 'must_read' || engine.recommendationTier === 'high_value')
      .sort((a, b) => b.engine.recommendationScore - a.engine.recommendationScore)
      .map(({ item, engine }) => ({
        id:                   item.id,
        title:                item.title,
        summary:              item.summary,
        source:               item.source,
        sourceTier:           item.sourceTier,
        publishedAt:          item.publishedAt,
        fetchedAt:            item.fetchedAt ?? null,
        category:             item.category,
        tags:                 item.tags,
        originalUrl:          item.originalUrl,
        finalScore:           item.finalScore,
        isUserCurated:        item.isUserCurated ?? false,
        isOfficial:           item.isOfficial    ?? false,
        evScore:              item.evidenceProfile?.evidenceScore ?? null,
        truthScore:           item.evidenceProfile?.truthScore   ?? null,
        shouldTrackEvent:     item.analysisGate?.shouldTrackEvent     ?? false,
        shouldEnterDailyReport: item.analysisGate?.shouldEnterDailyReport ?? false,
        shouldDeepAnalyze:    item.analysisGate?.shouldDeepAnalyze    ?? false,
        analysisTier:         item.analysisGate?.analysisTier         ?? null,
        wordCount:            item.articleContent?.wordCount          ?? null,
        signalScore:          engine.signalScore,
        recommendationScore:  engine.recommendationScore,
        recommendationTier:   engine.recommendationTier,
        sourceStatus:         engine.sourceStatus,
        evidenceLevel:        engine.evidenceLevel,
        qualityFlags:         engine.qualityFlags,
        recommendationReason: engine.recommendationReason,
        riskNote:             engine.riskNote,
        nextStep:             engine.nextStep,
      }))
  }

  const topSignal: TopSignalData | undefined = selected[0]
    ? { score: selected[0].recommendationScore, title: selected[0].title, category: selected[0].category }
    : undefined

  const snapshotGeneratedAt = dataSource === 'snapshot' && engineSnapshot?.generated_at
    ? new Date(engineSnapshot.generated_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <AppShell topSignal={topSignal}>
      <div className="p-6 md:p-8 max-w-[900px]">

        {/* ── Editorial header ── */}
        <div className="mb-5">
          <p className="page-kicker mb-1">Editorial Picks</p>
          <div className="flex items-end justify-between gap-4">
            <h1 className="editorial-title text-3xl">精选流</h1>
            <div className="flex items-center gap-2 pb-0.5">
              {dataSource === 'snapshot' ? (
                <span className="text-[10px] text-success border border-success/30 bg-success/10 rounded px-1.5 py-0.5">
                  稳定快照
                </span>
              ) : (
                <span className="text-[10px] text-warning border border-warning/30 bg-warning/10 rounded px-1.5 py-0.5">
                  实时临时结果
                </span>
              )}
              {includeDemo && (
                <span className="text-[10px] text-muted-foreground/50 border border-border/30 rounded px-1.5 py-0.5">
                  含演示数据
                </span>
              )}
            </div>
          </div>
          <p className="page-subtitle mt-1.5">
            Must Read / High Value · 重点判断队列 · {selected.length} 条
            {snapshotGeneratedAt && ` · 快照时间 ${snapshotGeneratedAt}`}
          </p>
          {dataSource === 'live' && (
            <p className="mt-1 text-[11px] text-warning/80">
              暂无稳定精选快照，当前为临时实时结果。请在 Dashboard 点击「刷新推荐」生成快照。
            </p>
          )}
        </div>

        {/* ── Info strip ── */}
        <div className="relative flex items-center gap-3 px-4 py-2 rounded-lg overflow-hidden mb-4 bg-primary/6 border border-primary/12">
          <div className="absolute left-0 inset-y-0 w-0.5 bg-primary rounded-l-lg" />
          <span className="text-[10px] font-semibold tracking-widest text-primary uppercase">判断队列</span>
          <span className="text-xs text-muted-foreground">每条信息均附入选理由与行动建议</span>
          <span className="ml-auto text-xs font-mono text-foreground tabular-nums">{selected.length} 条</span>
        </div>

        {/* ── Cards ── */}
        <div className={cn("rounded-lg overflow-hidden border bg-card", selected.length > 0 ? "border-border/70" : "border-border")}>
          {selected.length > 0
            ? selected.map(item => (
                <div key={item.id}>
                  <div className="flex items-center gap-2 px-4 py-1.5 bg-surface border-b border-border/40 flex-wrap">
                    <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-medium", TIER_COLORS[item.recommendationTier])}>
                      {TIER_LABELS[item.recommendationTier]}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex-1 min-w-0 truncate">
                      {item.recommendationReason}
                    </span>
                    {item.nextStep && (
                      <span className="text-[10px] text-primary font-medium whitespace-nowrap shrink-0">
                        → {item.nextStep.split('，')[0]}
                      </span>
                    )}
                  </div>
                  <EngineRecommendationCard item={item} />
                </div>
              ))
            : (
              <div className="py-12 text-center">
                <p className="text-sm text-muted-foreground">暂无稳定精选内容</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  请先在 Dashboard 点击「刷新推荐」生成推荐快照
                </p>
              </div>
            )
          }
        </div>
      </div>
    </AppShell>
  )
}
