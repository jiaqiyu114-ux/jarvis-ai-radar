"use client"

import { useState } from "react"
import type { ReactNode } from "react"
import { ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { TIER_LABELS, TIER_COLORS } from "@/lib/recommendations/recommendation-engine"
import type { RecommendedItem } from "@/lib/recommendations/recommendation-engine"
import { RecommendationDetailModal } from "./_recommendation-detail-modal"
import { cleanDisplayText, safeSourceName } from "@/lib/text/decode-html"
import { ClientRelativeTime } from "@/components/time/client-relative-time"

const SOURCE_STATUS_LABELS: Record<string, string> = {
  official:     "官方来源",
  user_curated: "我的来源",
  multi_source: "多源验证",
  single_source:"单源",
  weak_source:  "来源偏弱",
}

const SOURCE_STATUS_COLORS: Record<string, string> = {
  official:     "text-amber-700 border-amber-400/40 bg-amber-50 dark:text-amber-400 dark:bg-amber-400/10",
  user_curated: "text-teal-700 border-teal-400/40 bg-teal-50 dark:text-teal-400 dark:bg-teal-400/10",
  multi_source: "text-success border-success/25 bg-success/8",
  single_source:"text-muted-foreground border-border bg-muted/40",
  weak_source:  "text-warning border-warning/25 bg-warning/8",
}

const TIER_TEXT: Record<string, string> = {
  S: "text-orange-600 dark:text-orange-400",
  A: "text-sky-600 dark:text-sky-400",
  B: "text-muted-foreground",
  C: "text-muted-foreground/60",
  D: "text-muted-foreground/40",
}

const TIER_TOOLTIPS: Record<string, string> = {
  S: "信源等级 S：官方博客 / 官方文档 / 论文原文 / GitHub 官方仓库（不是内容评分）",
  A: "信源等级 A：官方社媒 / 创始人 / 核心员工 / 顶级研究机构（不是内容评分）",
  B: "信源等级 B：高质量媒体 / 专业分析师 / 垂直 KOL（不是内容评分）",
  C: "信源等级 C：普通 KOL / 综合资讯站（不是内容评分）",
  D: "信源等级 D：搬运号 / 营销号 / 低质量来源（不是内容评分）",
}

function SmallBadge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap", className)}>
      {children}
    </span>
  )
}

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


/** Build a concise, specific recommendation reason from item signals. Max 24 chars. */
function buildCleanReason(item: RecommendedItem): string {
  const score   = item.finalScore
  const signals = item.relatedSignals?.length ?? 0
  if (score >= 85)    return '综合评分很高，建议优先阅读。'
  if (signals >= 3)   return `${signals} 个相关信号，不是孤立事件。`
  if (item.isOfficial) return '官方信源发布，可信度高。'
  if (item.qualityFlags.includes('strong_evidence')) return '证据信号充分，可参考引用。'
  if (signals >= 2)   return `已有 ${signals} 个相关信号。`
  if (item.isUserCurated) return '你认可的信源，纳入今日观察。'
  if (score >= 75)    return '评分较高，适合今日阅读。'
  if (score >= 65)    return '达到推荐线，可快速浏览。'
  return '达到推荐线，建议浏览。'
}

function deepDiveStatus(item: RecommendedItem): 'ai' | 'rule' | 'pending' {
  const dd = item.deepDive
  if (!dd || dd.status === "skipped") return 'pending'
  if (dd.status === "generated" && dd.model !== "deterministic-v1") return 'ai'
  return 'rule'
}

type EngineRecommendationCardProps = {
  item: RecommendedItem
  enableDetail?: boolean
}

export function EngineRecommendationCard({ item, enableDetail = false }: EngineRecommendationCardProps) {
  const [open, setOpen] = useState(false)
  const tierLabel   = TIER_LABELS[item.recommendationTier] ?? item.recommendationTier
  const tierColor   = TIER_COLORS[item.recommendationTier] ?? TIER_COLORS.observe
  const statusLabel = SOURCE_STATUS_LABELS[item.sourceStatus] ?? item.sourceStatus
  const statusColor = SOURCE_STATUS_COLORS[item.sourceStatus] ?? SOURCE_STATUS_COLORS.single_source
  const tierText    = TIER_TEXT[item.sourceTier] ?? TIER_TEXT.C
  const deepDive    = item.deepDive
  const ddStatus    = deepDiveStatus(item)
  const title       = cleanDisplayText(item.title)
  const summary     = cleanDisplayText(item.summary)
  const sourceName  = safeSourceName(item.source, item.originalUrl)
  const cleanReason = buildCleanReason(item)

  // Only show DeepDive summary when it has real content (not just deterministic placeholder)
  const deepDiveSummary = deepDive && ddStatus !== 'pending'
    ? (deepDive.oneSentence || deepDive.summary)
    : null

  const body = (
    <>
      {/* Title row */}
      <div className="flex items-start gap-2">
        <span
          className={cn("text-[10px] font-medium shrink-0 mt-0.5 leading-none", tierText)}
          title={TIER_TOOLTIPS[item.sourceTier] ?? "信源等级（信源可信度评级，不是内容评分）"}
        >
          信源{item.sourceTier}
        </span>
        <h2 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2 text-left">
          {title}
        </h2>
      </div>

      {/* Summary */}
      {summary && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2 text-left">
          {summary}
        </p>
      )}

      {/* Badges */}
      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        <SmallBadge className={tierColor}>{tierLabel}</SmallBadge>
        {item.sourceStatus !== 'single_source' && (
          <SmallBadge className={statusColor}>{statusLabel}</SmallBadge>
        )}
        {item.qualityFlags.includes("fresh") && (
          <SmallBadge className="text-sky-600 border-sky-400/30 bg-sky-400/8 dark:text-sky-400">新鲜</SmallBadge>
        )}
        {item.qualityFlags.includes("official_source") && (
          <SmallBadge className="text-amber-700 border-amber-400/30 bg-amber-50 dark:text-amber-400 dark:bg-amber-400/10">官方</SmallBadge>
        )}
        {ddStatus === 'ai' && (
          <SmallBadge className="text-violet-600 border-violet-400/25 bg-violet-50/50 dark:text-violet-400 dark:bg-violet-400/10">已生成解读</SmallBadge>
        )}
        {ddStatus === 'pending' && (
          <SmallBadge className="text-muted-foreground/60 border-border bg-muted/30">待深度解读</SmallBadge>
        )}
      </div>

      {/* DeepDive one-sentence summary — only when AI-generated */}
      {deepDiveSummary && (
        <p className="mt-1.5 text-xs text-foreground/80 leading-relaxed line-clamp-2 text-left border-l-2 border-primary/30 pl-2">
          {deepDiveSummary}
        </p>
      )}

      {/* Recommendation reason — short, specific */}
      <p className="mt-1 text-[11px] text-muted-foreground/70 leading-relaxed text-left">
        {cleanReason}
      </p>

      {/* Related signals hint */}
      {(item.relatedSignals?.length ?? 0) > 0 && (
        <p className="mt-0.5 text-[10px] text-muted-foreground/40 text-left">
          {item.relatedSignals!.length} 个相关信号
        </p>
      )}
    </>
  )

  return (
    <>
      <article className="group border-b border-border last:border-b-0 bg-card transition-colors hover:bg-accent/60">
        <div className="flex items-start gap-3 px-4 py-3">
          <div className="shrink-0 pt-0.5">
            <ScoreBox score={item.recommendationScore} tier={item.recommendationTier} />
          </div>

          <div className="min-w-0 flex-1">
            {enableDetail ? (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="w-full text-left"
              >
                {body}
              </button>
            ) : (
              <div>{body}</div>
            )}

            {/* Source + time + 查看原文 */}
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground truncate max-w-[160px]">
                {sourceName}
              </span>
              <span className="text-muted-foreground/30 text-[10px]">·</span>
              <ClientRelativeTime
                value={item.publishedAt ?? item.fetchedAt}
                className="text-[10px] text-muted-foreground/60"
                fallback=""
              />
              {item.isUserCurated && (
                <span className="text-[10px] text-teal-600/70 dark:text-teal-400/60">
                  · 我的来源
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

      {enableDetail && (
        <RecommendationDetailModal item={item} open={open} onOpenChange={setOpen} />
      )}
    </>
  )
}
