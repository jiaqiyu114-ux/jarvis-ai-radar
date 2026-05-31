"use client"

import { ExternalLink } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { TIER_LABELS, TIER_COLORS } from "@/lib/recommendations/recommendation-engine"
import type { RecommendedItem } from "@/lib/recommendations/recommendation-engine"

type RecommendationDetailModalProps = {
  item: RecommendedItem
  open: boolean
  onOpenChange: (open: boolean) => void
}

function metricLabel(label: string, value: number | null | undefined) {
  if (value == null) return `${label} -`
  return `${label} ${value}`
}

function deepDiveBadge(item: RecommendedItem): { label: string; className: string } | null {
  const deepDive = item.deepDive
  if (!deepDive) return null
  if (deepDive.status === "generated" && deepDive.model !== "deterministic-v1") {
    return {
      label: "AI 深度解读",
      className: "text-success border-success/30 bg-success/10",
    }
  }
  if (deepDive.status === "fallback" || deepDive.model === "deterministic-v1") {
    return {
      label: "规则兜底解读 / 待 Pro 深度处理",
      className: "text-warning border-warning/30 bg-warning/10",
    }
  }
  return null
}

export function RecommendationDetailModal({ item, open, onOpenChange }: RecommendationDetailModalProps) {
  const deepDive = item.deepDive
  const deepBadge = deepDiveBadge(item)
  const userValue = deepDive?.userValue ?? deepDive?.userInsight ?? ""
  const uncertainty = deepDive?.uncertainty ?? deepDive?.riskAndUncertainty ?? ""
  const followUp = deepDive?.followUp ?? deepDive?.followUpSuggestion ?? ""

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-full max-h-[90vh] overflow-hidden p-0 gap-0">
        <DialogTitle className="sr-only">{item.title}</DialogTitle>

        <div className="flex h-full max-h-[90vh] flex-col">
          <header className="border-b border-border px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold leading-snug text-foreground">{item.title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.source} · Tier {item.sourceTier} · {item.category}
                </p>
              </div>
              <span className={cn("shrink-0 rounded border px-2 py-0.5 text-[10px] font-medium", TIER_COLORS[item.recommendationTier])}>
                {TIER_LABELS[item.recommendationTier]}
              </span>
            </div>
            {deepBadge && (
              <div className="mt-2">
                <span className={cn("inline-flex rounded border px-2 py-0.5 text-[10px] font-medium", deepBadge.className)}>
                  {deepBadge.label}
                </span>
              </div>
            )}
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <section className="rounded border border-border bg-card px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground">评分与分层</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-foreground">
                <span>{metricLabel("Final", item.finalScore)}</span>
                <span>{metricLabel("Signal", item.signalScore)}</span>
                <span>{metricLabel("Evidence", item.evScore)}</span>
                <span>{metricLabel("Recommendation", item.recommendationScore)}</span>
                <span>Tier {item.recommendationTier}</span>
                <span>Source {item.sourceStatus}</span>
              </div>
              {item.qualityFlags.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  质量信号：{item.qualityFlags.join(" / ")}
                </p>
              )}
            </section>

            <section className="rounded border border-border bg-card px-3 py-2.5 space-y-2">
              <p className="text-[11px] text-muted-foreground">为什么进入今日推荐</p>
              <p className="text-sm leading-relaxed text-foreground/90">{item.recommendationReason}</p>
              {item.riskNote && (
                <p className="text-xs leading-relaxed text-warning/90">风险提示：{item.riskNote}</p>
              )}
              {item.nextStep && (
                <p className="text-xs leading-relaxed text-foreground/80">后续动作：{item.nextStep}</p>
              )}
            </section>

            {deepDive ? (
              <section className="rounded border border-border bg-card px-3 py-2.5 space-y-3">
                <p className="text-[11px] text-muted-foreground">
                  深度解读 · {deepDive.status} · {deepDive.model}
                </p>
                <div className="space-y-2 text-sm leading-relaxed text-foreground/90">
                  <p><span className="text-muted-foreground">核心摘要：</span>{deepDive.summary}</p>
                  <p><span className="text-muted-foreground">为什么重要：</span>{deepDive.whyItMatters}</p>
                  <p><span className="text-muted-foreground">对你的启发：</span>{userValue}</p>
                  <p><span className="text-muted-foreground">不确定性：</span>{uncertainty}</p>
                  <p><span className="text-muted-foreground">跟进建议：</span>{followUp}</p>
                </div>
                {deepDive.fallbackReason && (
                  <p className="text-xs text-warning/90">
                    兜底原因：{deepDive.fallbackReason}
                  </p>
                )}
              </section>
            ) : (
              <section className="rounded border border-border bg-card px-3 py-3">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  这条推荐已有基础判断，但还没有生成完整深度解读。可以稍后刷新推荐快照。
                </p>
              </section>
            )}
          </div>

          <footer className="border-t border-border px-5 py-3 bg-card/90">
            <a
              href={item.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded border border-primary/25 bg-primary/8 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              查看原文
            </a>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  )
}
