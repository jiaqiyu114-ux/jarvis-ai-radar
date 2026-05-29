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
import type { InformationItem, FeedbackAction } from "@/types"

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

const dimensionLabels: Record<string, string> = {
  importance:        '重要性',
  ai_relevance:      'AI相关',
  source_score:      '信源质量',
  novelty:           '新颖性',
  momentum:          '势头',
  credibility:       '可信度',
  actionability:     '可操作',
  content_potential: '内容潜力',
  personal_fit:      '个人适配',
}

export function InformationCard({
  item,
  variant = 'compact',
  scoreSize = 'sm',
  onFeedback,
}: InformationCardProps) {
  const [showBreakdown, setShowBreakdown] = useState(variant === 'expanded')

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
            {/* Row 1: TierBadge + Title */}
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
            {/* Row 2: Source · Category · Time */}
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
     Three-row layout — title row is NEVER mixed with meta.
     Eliminates the "category/time pushes title to wrap" bug.
     ────────────────────────────────────────── */
  const isEmphasis = variant === 'emphasis'
  const effectiveSize = scoreSize
  /* Indent rows 2+ to align with content block start after ScoreBadge + gap */
  const bdIndent = effectiveSize === 'md' ? 'ml-12' : 'ml-10'

  return (
    <div
      className={cn(
        "group border-b border-border transition-colors hover:bg-accent",
        isEmphasis ? "py-3.5 px-4" : "py-2.5 px-4"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Score badge — always left-anchored */}
        <ScoreBadge score={item.finalScore} size={effectiveSize} />

        {/* Content block — all rows in one flex-1 container */}
        <div className="flex-1 min-w-0 space-y-1">

          {/* ── Row 1: TierBadge + Title ── */}
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

          {/* ── Row 2: Source · Summary ── */}
          <p className="text-xs text-muted-foreground line-clamp-1">
            <span className="text-foreground/65 font-medium">{item.source}</span>
            {' · '}
            {item.summary}
          </p>

          {/* ── Row 3: Category · Time · Tags · Related · Actions ── */}
          <div className="flex items-center gap-1.5">
            {/* Left: chips + tags — can wrap freely without touching title */}
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

            {/* Right: actions — always shrink-0 at end, never wraps */}
            <div className="flex items-center gap-1 shrink-0">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                <FeedbackActions itemId={item.id} onAction={onFeedback} />
              </div>
              <button
                onClick={() => setShowBreakdown(!showBreakdown)}
                className="text-muted-foreground/40 hover:text-muted-foreground transition-colors p-1"
              >
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showBreakdown && "rotate-180")} />
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* ── Score breakdown (below main layout, indented) ── */}
      {showBreakdown && (
        <div className={cn("mt-2 grid grid-cols-3 gap-x-6 gap-y-1.5 bg-muted/40 rounded-md p-3", bdIndent)}>
          {Object.entries(item.scoreBreakdown).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-14 shrink-0">
                {dimensionLabels[key] ?? key}
              </span>
              <Progress value={value} className="h-1 flex-1" />
              <span className="text-[10px] font-mono text-muted-foreground w-5 text-right">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
