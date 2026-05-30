"use client"

import { useState } from "react"
import { ExternalLink, ChevronDown } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { zhCN } from "date-fns/locale"
import { ScoreBadge } from "./score-badge"
import { SourceTierBadge } from "./source-tier-badge"
import { FeedbackActions } from "./feedback-actions"
import { ItemDetailPanel } from "./item-detail-panel"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { buildScoreExplanation } from "@/lib/scoring/explanation"
import type { InformationItem, FeedbackAction } from "@/types"

interface InformationCardProps {
  item: InformationItem
  /** compact: feed default | expanded: detail pre-opened | minimal: narrow columns | emphasis: selected/dashboard */
  variant?: 'compact' | 'expanded' | 'minimal' | 'emphasis'
  scoreSize?: 'sm' | 'md'
  onFeedback?: (action: FeedbackAction, itemId: string) => void
}

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

export function InformationCard({
  item,
  variant = 'compact',
  scoreSize = 'sm',
  onFeedback,
}: InformationCardProps) {
  // `open` controls the detail dialog.
  // variant='expanded' pre-opens the dialog (used by cluster detail view).
  const [open, setOpen] = useState(variant === 'expanded')

  // Build score explanation for the folded card chips
  const explanation = buildScoreExplanation(item.scoreBreakdown, item.finalScore, item.penalties)

  const timeAgo = formatDistanceToNow(new Date(item.publishedAt), {
    addSuffix: true,
    locale: zhCN,
  })

  const categoryClass = categoryColors[item.category] ?? categoryColors['其他']
  const visibleTags   = item.tags.slice(0, 3)
  const extraTagCount = item.tags.length - 3

  // Driver chips shown in the folded card
  const foldedPositive = explanation.topPositiveDrivers.slice(0, 2)
  const foldedNegative = explanation.topNegativeDrivers
    .filter(d => !d.includes('分惩罚'))
    .slice(0, 1)

  /* ──────────────────────────────────────────
     MINIMAL variant — for narrow columns (dashboard sidebars).
     Title links to original URL in this compact context.
     ────────────────────────────────────────── */
  if (variant === 'minimal') {
    return (
      <div className="border-b border-border last:border-0 py-2 px-4 transition-colors hover:bg-accent">
        <div className="flex items-start gap-2.5">
          <ScoreBadge score={item.finalScore} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-1.5">
              <SourceTierBadge tier={item.sourceTier} />
              <a
                href={item.originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-0 text-sm font-medium text-foreground hover:text-primary leading-snug line-clamp-1 transition-colors"
              >
                {item.title}
              </a>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-[11px] text-muted-foreground">{item.source}</span>
              <span className="text-muted-foreground/40">·</span>
              <span className={cn("text-[10px] px-1 py-px rounded font-medium", categoryClass)}>
                {item.category}
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">{timeAgo}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ──────────────────────────────────────────
     STANDARD variants: compact / emphasis / expanded

     Interaction contract:
       • Clicking the card background or title (non-interactive area) → opens detail dialog.
       • Clicking the ExternalLink <a> → navigates to original URL, does NOT open dialog.
       • Clicking FeedbackAction buttons → action only, does NOT open dialog.
       • Clicking the chevron button → opens/closes dialog (same as card click).
       • Title is plain text <span> — the ExternalLink icon is the ONLY external navigation.

     Implementation: outer div checks e.target.closest('a, button') before opening dialog.
     ────────────────────────────────────────── */
  const isEmphasis = variant === 'emphasis'

  return (
    <>
      {/* ── Card row (list view) ── */}
      <div
        className={cn(
          "group border-b border-border transition-colors hover:bg-accent cursor-pointer",
          isEmphasis ? "py-3.5 px-4" : "py-2.5 px-4"
        )}
        onClick={(e) => {
          // Skip if user clicked an actual link or button (ExternalLink, FeedbackActions, chevron)
          const t = e.target as HTMLElement
          if (!t.closest('a, button')) setOpen(true)
        }}
      >
        <div className="flex items-start gap-3">

          {/* Score column: badge + band label */}
          <div className="flex flex-col items-center gap-0.5 shrink-0">
            <ScoreBadge score={item.finalScore} size={scoreSize} />
            <span className={cn(
              "text-[9px] px-1 py-px rounded border font-medium whitespace-nowrap",
              explanation.scoreBand.color,
            )}>
              {explanation.scoreBand.label}
            </span>
          </div>

          {/* Content block */}
          <div className="flex-1 min-w-0 space-y-1">

            {/* Row 1: TierBadge + Title (plain text, NOT a link) */}
            <div className="flex items-start gap-1.5">
              <SourceTierBadge tier={item.sourceTier} />
              <span
                className={cn(
                  "flex-1 min-w-0 text-sm text-foreground leading-snug",
                  isEmphasis ? "font-semibold" : "font-medium"
                )}
              >
                {item.title}
              </span>
            </div>

            {/* Row 2: Source · Summary */}
            <p className="text-xs text-muted-foreground line-clamp-1">
              <span className="text-foreground/65 font-medium">{item.source}</span>
              {' · '}
              {item.summary}
            </p>

            {/* Row 3: meta + ExternalLink + feedback + chevron */}
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1 flex-wrap flex-1 min-w-0">
                <span className={cn("text-[10px] px-1.5 py-px rounded font-medium whitespace-nowrap", categoryClass)}>
                  {item.category}
                </span>
                <span className="text-muted-foreground/40 text-[10px]">·</span>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{timeAgo}</span>
                {/* ExternalLink: the ONLY way to navigate to the original URL */}
                <a
                  href={item.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground/40 hover:text-primary transition-colors"
                  title="查看原文"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
                {visibleTags.map(tag => (
                  <span key={tag} className="text-[10px] text-muted-foreground bg-[var(--tag-bg)] px-1.5 py-px rounded whitespace-nowrap">
                    {tag}
                  </span>
                ))}
                {extraTagCount > 0 && (
                  <span className="text-[10px] text-muted-foreground">+{extraTagCount}</span>
                )}
                {item.relatedReportCount > 0 && (
                  <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap">
                    {item.relatedReportCount} 篇
                  </span>
                )}
              </div>

              {/* Right: feedback + chevron */}
              <div className="flex items-center gap-1 shrink-0">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <FeedbackActions itemId={item.id} onAction={onFeedback} />
                </div>
                <button
                  onClick={() => setOpen(prev => !prev)}
                  className="text-muted-foreground/40 hover:text-muted-foreground transition-colors p-1"
                  title="查看详情"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Row 4: driver chips */}
            {(foldedPositive.length > 0 || foldedNegative.length > 0 || explanation.isRuleBasedOnly) && (
              <div className="flex flex-wrap items-center gap-1">
                {foldedPositive.map(d => (
                  <span
                    key={d}
                    className="text-[10px] px-1.5 py-px rounded border text-success border-success/25 bg-success/8 whitespace-nowrap"
                  >
                    ↑ {d}
                  </span>
                ))}
                {foldedNegative.map(d => (
                  <span
                    key={d}
                    className="text-[10px] px-1.5 py-px rounded border text-muted-foreground border-border bg-muted/50 whitespace-nowrap"
                  >
                    ↓ {d}
                  </span>
                ))}
                {foldedPositive.length === 0 && foldedNegative.length === 0 && explanation.isRuleBasedOnly && (
                  <span className="text-[10px] text-muted-foreground/55 px-1 py-px rounded border border-border/40 whitespace-nowrap">
                    规则基线
                  </span>
                )}
                {(foldedPositive.length > 0 || foldedNegative.length > 0) && explanation.isRuleBasedOnly && (
                  <span className="text-[9px] text-muted-foreground/40 whitespace-nowrap">
                    · 规则基线
                  </span>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ── Detail dialog ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-2xl w-full max-h-[88vh] overflow-y-auto p-0 gap-0"
        >
          {/* DialogTitle is required for accessibility */}
          <DialogTitle className="sr-only">{item.title}</DialogTitle>

          {/* Sticky header */}
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-6 py-3">
            <p className="text-[10px] text-muted-foreground font-medium tracking-wider uppercase">
              信息详情
            </p>
          </div>

          {/* Scrollable content */}
          <div className="px-6 py-5">
            <ItemDetailPanel item={item} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
