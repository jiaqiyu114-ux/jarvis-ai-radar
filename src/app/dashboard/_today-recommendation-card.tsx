"use client"

import { useState } from "react"
import { ExternalLink } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { ItemDetailPanel } from "@/components/feed/item-detail-panel"
import { ScoreBadge } from "@/components/feed/score-badge"
import { SourceTierBadge } from "@/components/feed/source-tier-badge"
import { cn } from "@/lib/utils"
import { classifyRecommendationItem } from "@/lib/recommendations/recommendation-quality"
import type { TodayRecommendationItem } from "@/lib/data/today-adapter"
import type { ReactNode } from "react"

function SmallBadge({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap", className)}>
      {children}
    </span>
  )
}

export function TodayRecommendationCard({ item }: { item: TodayRecommendationItem }) {
  const [open, setOpen] = useState(false)

  // Get section from snapshot items (DailyRecommendationSnapshotItem has .section)
  const section = (item as unknown as Record<string, unknown>).section as string | null | undefined

  const quality = classifyRecommendationItem({
    finalScore:             item.finalScore,
    sourceTier:             item.sourceTier,
    analysisTier:           item.analysisTier,
    shouldTrackEvent:       item.shouldTrackEvent,
    shouldEnterDailyReport: item.shouldEnterDailyReport,
    shouldDeepAnalyze:      item.shouldDeepAnalyze,
    shouldEnterTopicPool:   item.analysisGate?.shouldEnterTopicPool,
    isUserCurated:          item.isUserCurated,
    evidenceScore:          item.evidenceScore,
    truthScore:             item.truthScore,
    sourceTraceScore:       item.sourceTraceScore,
    wordCount:              item.articleContent?.wordCount,
    contentFetchStatus:     item.articleContent?.fetchStatus,
    penalties: item.penalties
      ? {
          clickbait:    item.penalties.clickbait,
          marketing:    item.penalties.marketing,
          duplicate:    item.penalties.duplicate,
          cognitiveLoad: item.penalties.cognitiveLoad,
        }
      : null,
    hasOriginalSource: item.evidenceProfile?.hasOriginalSource,
    section: section ?? null,
  })

  // Show risk badge if there are penalties or weak source
  const showRiskBadge =
    (item.penalties?.clickbait ?? 0) >= 10 ||
    (item.penalties?.marketing ?? 0) >= 10 ||
    quality.evidenceStatus === '证据不足'

  return (
    <>
      <article className="group border-b border-border last:border-b-0 bg-card transition-colors hover:bg-accent/60">
        <div className="flex items-start gap-3 px-4 py-3">
          <div className="shrink-0 pt-0.5">
            <ScoreBadge score={item.finalScore} size="md" />
          </div>

          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="block w-full text-left"
            >
              <div className="flex items-start gap-2">
                <SourceTierBadge tier={item.sourceTier} />
                <h2 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground group-hover:text-primary transition-colors">
                  {item.title}
                </h2>
              </div>

              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                {item.summary || "暂无简介"}
              </p>

              {/* ── Quality badges row ── */}
              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                <SmallBadge className={quality.roleColor}>{quality.roleLabel}</SmallBadge>
                <SmallBadge className={quality.sourceStatusColor}>{quality.sourceStatus}</SmallBadge>
                {showRiskBadge && (
                  <SmallBadge className="text-warning/80 border-warning/25 bg-warning/8">
                    {quality.evidenceStatus}
                  </SmallBadge>
                )}
                {item.isUserCurated && (
                  <SmallBadge className="text-teal-700 border-teal-400/40 bg-teal-50 dark:text-teal-400 dark:border-teal-400/30 dark:bg-teal-400/10">
                    我的源
                  </SmallBadge>
                )}
              </div>

              {/* ── Recommendation reason ── */}
              <p className="mt-1.5 text-xs text-foreground/80 leading-relaxed">
                {item.recommendationReason}
              </p>
            </button>

            {/* ── Bottom meta row ── */}
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground truncate max-w-44">
                {item.source}
              </span>
              {item.isUserCurated && (
                <span className="text-[10px] text-teal-600/70 dark:text-teal-400/60">
                  · 用户认可源，仍需多源验证
                </span>
              )}

              <a
                href={item.originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={event => event.stopPropagation()}
                className="ml-auto inline-flex items-center gap-1 rounded border border-primary/25 bg-primary/8 px-2 py-1 text-[10px] font-medium text-primary transition-colors hover:bg-primary/15"
              >
                <ExternalLink className="h-3 w-3" />
                查看原文
              </a>
            </div>
          </div>
        </div>
      </article>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl w-full max-h-[88vh] overflow-y-auto p-0 gap-0">
          <DialogTitle className="sr-only">{item.title}</DialogTitle>
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-6 py-3">
            <p className="text-[10px] text-muted-foreground font-medium tracking-wider uppercase">
              信息详情
            </p>
          </div>
          <div className="px-6 py-5">
            <ItemDetailPanel
              item={item}
              recommendationReason={item.recommendationReason}
              contextPage="dashboard"
              qualityInput={{
                finalScore:             item.finalScore,
                sourceTier:             item.sourceTier,
                analysisTier:           item.analysisTier,
                shouldTrackEvent:       item.shouldTrackEvent,
                shouldEnterDailyReport: item.shouldEnterDailyReport,
                shouldDeepAnalyze:      item.shouldDeepAnalyze,
                shouldEnterTopicPool:   item.analysisGate?.shouldEnterTopicPool,
                isUserCurated:          item.isUserCurated,
                evidenceScore:          item.evidenceScore,
                truthScore:             item.truthScore,
                sourceTraceScore:       item.sourceTraceScore,
                wordCount:              item.articleContent?.wordCount,
                contentFetchStatus:     item.articleContent?.fetchStatus,
                penalties:              item.penalties
                  ? {
                      clickbait:     item.penalties.clickbait,
                      marketing:     item.penalties.marketing,
                      duplicate:     item.penalties.duplicate,
                      cognitiveLoad: item.penalties.cognitiveLoad,
                    }
                  : null,
                hasOriginalSource: item.evidenceProfile?.hasOriginalSource,
                section: section ?? null,
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
