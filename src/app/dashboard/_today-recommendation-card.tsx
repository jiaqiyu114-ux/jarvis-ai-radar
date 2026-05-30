"use client"

import { useState } from "react"
import { ExternalLink } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { ItemDetailPanel } from "@/components/feed/item-detail-panel"
import { ScoreBadge } from "@/components/feed/score-badge"
import { SourceTierBadge } from "@/components/feed/source-tier-badge"
import { cn } from "@/lib/utils"
import type { TodayRecommendationItem } from "@/lib/data/today-adapter"
import type { ReactNode } from "react"

const analysisTierLabel: Record<string, string> = {
  cluster:  "事件追踪",
  deep:     "深度分析",
  standard: "标准分析",
  light:    "轻量观察",
  none:     "未分流",
}

const evidenceLabel: Record<string, string> = {
  very_high: "证据强",
  high:      "证据好",
  medium:    "证据中",
  low:       "证据弱",
}

const tierClass: Record<string, string> = {
  cluster:  "text-success border-success/30 bg-success/10",
  deep:     "text-primary border-primary/30 bg-primary/10",
  standard: "text-sky-600 border-sky-400/30 bg-sky-400/10 dark:text-sky-400",
  light:    "text-muted-foreground border-border bg-muted/50",
  none:     "text-muted-foreground/50 border-border/40 bg-muted/30",
}

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
  const analysisTier = item.analysisTier ?? "none"
  const evidenceLevel = item.evidenceProfile?.evidenceLevel ?? null

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

              <p className="mt-1.5 text-xs text-foreground/80 leading-relaxed">
                {item.recommendationReason}
              </p>
            </button>

            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground truncate max-w-44">
                {item.source}
              </span>
              <SmallBadge className={tierClass[analysisTier] ?? tierClass.none}>
                {analysisTierLabel[analysisTier] ?? analysisTier}
              </SmallBadge>
              {evidenceLevel && (
                <SmallBadge className="text-muted-foreground border-border bg-muted/40">
                  {evidenceLabel[evidenceLevel] ?? evidenceLevel}
                </SmallBadge>
              )}
              {item.shouldEnterDailyReport && (
                <SmallBadge className="text-primary border-primary/25 bg-primary/8">
                  日报候选
                </SmallBadge>
              )}
              {item.shouldTrackEvent && (
                <SmallBadge className="text-success border-success/25 bg-success/8">
                  事件候选
                </SmallBadge>
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
            <ItemDetailPanel item={item} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
