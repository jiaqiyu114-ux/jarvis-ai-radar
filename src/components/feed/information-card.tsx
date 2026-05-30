"use client"

import { useState } from "react"
import { ExternalLink, ChevronDown } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { zhCN } from "date-fns/locale"
import { ScoreBadge } from "./score-badge"
import { SourceTierBadge } from "./source-tier-badge"
import { FeedbackActions } from "./feedback-actions"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { buildScoreExplanation } from "@/lib/scoring/explanation"
import type { InformationItem, FeedbackAction } from "@/types"
import type { DimensionStatus } from "@/lib/scoring/explanation"

interface InformationCardProps {
  item: InformationItem
  /** compact: feed default | expanded: breakdown open | minimal: narrow columns | emphasis: selected/dashboard */
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

const dimStatusText: Record<DimensionStatus, string> = {
  available: '',
  fallback:  '默认',
  missing:   '缺失',
}

const dimStatusColor: Record<DimensionStatus, string> = {
  available: 'text-muted-foreground',
  fallback:  'text-muted-foreground/50',
  missing:   'text-danger/60',
}

export function InformationCard({
  item,
  variant = 'compact',
  scoreSize = 'sm',
  onFeedback,
}: InformationCardProps) {
  const [showBreakdown, setShowBreakdown] = useState(variant === 'expanded')

  // Build score explanation (pure computation, no I/O)
  const explanation = buildScoreExplanation(item.scoreBreakdown, item.finalScore, item.penalties)

  const timeAgo = formatDistanceToNow(new Date(item.publishedAt), {
    addSuffix: true,
    locale: zhCN,
  })

  const categoryClass = categoryColors[item.category] ?? categoryColors['其他']
  const visibleTags = item.tags.slice(0, 3)
  const extraTagCount = item.tags.length - 3

  /* ──────────────────────────────────────────
     MINIMAL variant — for narrow columns / dashboard sidebar
     Single-line title, compact meta, no tags/actions
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
     ────────────────────────────────────────── */
  const isEmphasis    = variant === 'emphasis'
  const effectiveSize = scoreSize
  const bdIndent      = effectiveSize === 'md' ? 'ml-12' : 'ml-10'

  return (
    <div
      className={cn(
        "group border-b border-border transition-colors hover:bg-accent",
        isEmphasis ? "py-3.5 px-4" : "py-2.5 px-4"
      )}
    >
      <div className="flex items-start gap-3">

        {/* ── Score column: badge + band label ── */}
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <ScoreBadge score={item.finalScore} size={effectiveSize} />
          <span className={cn(
            "text-[9px] px-1 py-px rounded border font-medium whitespace-nowrap",
            explanation.scoreBand.color,
          )}>
            {explanation.scoreBand.label}
          </span>
        </div>

        {/* ── Content block ── */}
        <div className="flex-1 min-w-0 space-y-1">

          {/* Row 1: TierBadge + Title */}
          <div className="flex items-start gap-1.5">
            <SourceTierBadge tier={item.sourceTier} />
            <a
              href={item.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex-1 min-w-0 text-sm text-foreground hover:text-primary leading-snug line-clamp-2 transition-colors",
                isEmphasis ? "font-semibold" : "font-medium"
              )}
            >
              {item.title}
            </a>
          </div>

          {/* Row 2: Source · Summary */}
          <p className="text-xs text-muted-foreground line-clamp-1">
            <span className="text-foreground/65 font-medium">{item.source}</span>
            {' · '}
            {item.summary}
          </p>

          {/* Row 3: Category · Time · Tags · Actions · Chevron */}
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 flex-wrap flex-1 min-w-0">
              <span className={cn("text-[10px] px-1.5 py-px rounded font-medium whitespace-nowrap", categoryClass)}>
                {item.category}
              </span>
              <span className="text-muted-foreground/40 text-[10px]">·</span>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">{timeAgo}</span>
              <a
                href={item.originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
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

            <div className="flex items-center gap-1 shrink-0">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                <FeedbackActions itemId={item.id} onAction={onFeedback} />
              </div>
              <button
                onClick={() => setShowBreakdown(!showBreakdown)}
                className="text-muted-foreground/40 hover:text-muted-foreground transition-colors p-1"
                title="查看评分解释"
              >
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showBreakdown && "rotate-180")} />
              </button>
            </div>
          </div>

          {/* Row 4: One-line score reason */}
          {explanation.oneLineReason && (
            <p className="text-[10px] text-muted-foreground/55 leading-snug">
              {explanation.oneLineReason}
            </p>
          )}

        </div>
      </div>

      {/* ── Enhanced score breakdown (expanded) ── */}
      {showBreakdown && (
        <div className={cn("mt-2 space-y-2", bdIndent)}>

          {/* Driver chips */}
          {(explanation.topPositiveDrivers.length > 0 || explanation.topNegativeDrivers.length > 0) && (
            <div className="flex flex-wrap gap-1">
              {explanation.topPositiveDrivers.map(d => (
                <span key={d} className="text-[10px] px-1.5 py-0.5 rounded border text-success border-success/25 bg-success/8">
                  ↑ {d}
                </span>
              ))}
              {explanation.topNegativeDrivers
                .filter(d => !d.includes('分惩罚'))
                .map(d => (
                  <span key={d} className="text-[10px] px-1.5 py-0.5 rounded border text-muted-foreground border-border bg-muted/50">
                    ↓ {d}
                  </span>
                ))
              }
            </div>
          )}

          {/* Dimension bars */}
          <div className="grid grid-cols-3 gap-x-6 gap-y-1.5 bg-muted/40 rounded-md p-3">
            {explanation.dimensions.map(dim => (
              <div key={dim.key} className="flex items-center gap-2">
                <span className={cn("text-[10px] w-14 shrink-0 truncate", dimStatusColor[dim.status])}>
                  {dim.label}
                </span>
                <Progress
                  value={dim.status === 'missing' ? 0 : dim.rawValue}
                  className={cn("h-1 flex-1", dim.status === 'fallback' && "opacity-40")}
                />
                <span className={cn("text-[10px] font-mono w-5 text-right", dimStatusColor[dim.status])}>
                  {dim.status === 'missing' ? '—' : dim.rawValue}
                </span>
                {dim.status !== 'available' && (
                  <span className="text-[9px] text-muted-foreground/40 w-6 shrink-0">
                    {dimStatusText[dim.status]}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Penalties */}
          {explanation.penalties.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap px-1">
              <span className="text-[10px] text-muted-foreground/60">惩罚：</span>
              {explanation.penalties.map(p => (
                <span key={p.key} className="text-[10px] px-1.5 py-0.5 rounded border text-danger/80 border-danger/20 bg-danger/5">
                  -{p.amount} {p.label}
                </span>
              ))}
            </div>
          )}

          {/* Rule-based note */}
          {explanation.isRuleBasedOnly && (
            <p className="text-[10px] text-muted-foreground/45 px-1">
              当前为规则引擎基线评分，多数维度尚未经 AI 评分（显示为默认值 50）
            </p>
          )}

        </div>
      )}
    </div>
  )
}
