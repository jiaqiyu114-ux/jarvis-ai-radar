"use client"

import { ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { TIER_LABELS, TIER_COLORS } from "@/lib/recommendations/recommendation-engine"
import type { RecommendedItem } from "@/lib/recommendations/recommendation-engine"

// ── Source status display ─────────────────────────────────────────────────────

const SOURCE_STATUS_LABELS: Record<string, string> = {
  official:      '官方源',
  user_curated:  '我的源',
  multi_source:  '多源验证',
  single_source: '单源',
  weak_source:   '来源较弱',
}

const SOURCE_STATUS_COLORS: Record<string, string> = {
  official:      'text-amber-700 border-amber-400/40 bg-amber-50 dark:text-amber-400 dark:bg-amber-400/10',
  user_curated:  'text-teal-700 border-teal-400/40 bg-teal-50 dark:text-teal-400 dark:bg-teal-400/10',
  multi_source:  'text-success border-success/25 bg-success/8',
  single_source: 'text-muted-foreground border-border bg-muted/40',
  weak_source:   'text-warning border-warning/25 bg-warning/8',
}

// ── Source tier badge (inline text) ──────────────────────────────────────────

const TIER_TEXT: Record<string, string> = {
  S: 'text-orange-600 dark:text-orange-400',
  A: 'text-sky-600 dark:text-sky-400',
  B: 'text-muted-foreground',
  C: 'text-muted-foreground/60',
}

function SmallBadge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap", className)}>
      {children}
    </span>
  )
}

// ── Score badge (uses recommendationScore for display) ────────────────────────

function ScoreBox({ score, tier }: { score: number; tier: string }) {
  const color = TIER_COLORS[tier as keyof typeof TIER_COLORS] ?? TIER_COLORS.observe
  return (
    <span className={cn(
      "inline-flex items-center justify-center w-9 h-9 rounded-lg text-sm font-bold tabular-nums shrink-0",
      color,
    )}>
      {score}
    </span>
  )
}

// ── Main card ─────────────────────────────────────────────────────────────────

export function EngineRecommendationCard({ item }: { item: RecommendedItem }) {
  const tierLabel   = TIER_LABELS[item.recommendationTier]  ?? item.recommendationTier
  const tierColor   = TIER_COLORS[item.recommendationTier]  ?? TIER_COLORS.observe
  const statusLabel = SOURCE_STATUS_LABELS[item.sourceStatus] ?? item.sourceStatus
  const statusColor = SOURCE_STATUS_COLORS[item.sourceStatus] ?? SOURCE_STATUS_COLORS.single_source
  const tierText    = TIER_TEXT[item.sourceTier] ?? TIER_TEXT.C
  const deepDive    = item.deepDive
  const deepDiveIsFallback = deepDive?.status === 'fallback' || deepDive?.deepDiveStatus === 'fallback'

  return (
    <article className="group border-b border-border last:border-b-0 bg-card transition-colors hover:bg-accent/60">
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Recommendation score badge */}
        <div className="shrink-0 pt-0.5">
          <ScoreBox score={item.recommendationScore} tier={item.recommendationTier} />
        </div>

        <div className="min-w-0 flex-1">
          {/* Title row with source tier prefix */}
          <div className="flex items-start gap-2">
            <span className={cn("text-[10px] font-semibold shrink-0 mt-0.5", tierText)}>
              {item.sourceTier}
            </span>
            <h2 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2">
              {item.title}
            </h2>
          </div>

          {/* Summary */}
          {item.summary && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
              {item.summary}
            </p>
          )}

          {/* Quality badges */}
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            <SmallBadge className={tierColor}>{tierLabel}</SmallBadge>
            <SmallBadge className={statusColor}>{statusLabel}</SmallBadge>
            {item.qualityFlags.includes('fresh') && (
              <SmallBadge className="text-sky-600 border-sky-400/30 bg-sky-400/8 dark:text-sky-400">
                新鲜
              </SmallBadge>
            )}
            {item.qualityFlags.includes('official_source') && (
              <SmallBadge className="text-amber-700 border-amber-400/30 bg-amber-50 dark:text-amber-400 dark:bg-amber-400/10">
                官方
              </SmallBadge>
            )}
          </div>

          {/* Recommendation reason */}
          <p className="mt-1.5 text-xs text-foreground/80 leading-relaxed">
            {item.recommendationReason}
          </p>

          {deepDive && (
            <div className="mt-1.5 rounded border border-border/60 bg-muted/30 px-2.5 py-2">
              <p className="text-[10px] font-medium text-muted-foreground">深度解读</p>
              <p className="mt-1 text-xs text-foreground/80 leading-relaxed">
                {deepDive.summary}
              </p>
              <p className="mt-1 text-[11px] text-foreground/70 leading-relaxed">
                {deepDive.whyItMatters}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed">
                跟进建议：{deepDive.followUpSuggestion}
              </p>
              {deepDiveIsFallback && (
                <p className="mt-1 text-[10px] text-warning/80">
                  这条解读基于有限文本生成，建议结合原文确认。
                </p>
              )}
            </div>
          )}

          {/* Risk note */}
          {item.riskNote && (
            <p className="mt-0.5 text-[10px] text-warning/80 italic leading-relaxed">
              △ {item.riskNote}
            </p>
          )}

          {/* Bottom meta row */}
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">
              {item.source}
            </span>
            {item.isUserCurated && (
              <span className="text-[10px] text-teal-600/70 dark:text-teal-400/60">
                · 我的源，仍需多源验证
              </span>
            )}
            <a
              href={item.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="ml-auto inline-flex items-center gap-1 rounded border border-primary/25 bg-primary/8 px-2 py-1 text-[10px] font-medium text-primary transition-colors hover:bg-primary/15 shrink-0"
            >
              <ExternalLink className="h-3 w-3" />
              查看原文
            </a>
          </div>
        </div>
      </div>
    </article>
  )
}
