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

// ── Source tier display ───────────────────────────────────────────────────────

const TIER_BADGE: Record<string, { cls: string; tip: string }> = {
  S: {
    cls: "text-orange-300/90 border-orange-500/35 bg-orange-500/[0.08]",
    tip: "信源 S：官方博客 / 官方文档 / 论文原文（不是内容评分）",
  },
  A: {
    cls: "text-cyan-300/90 border-cyan-500/30 bg-cyan-500/[0.07]",
    tip: "信源 A：官方社媒 / 创始人 / 顶级研究机构（不是内容评分）",
  },
  B: {
    cls: "text-slate-400 border-white/[0.1] bg-white/[0.04]",
    tip: "信源 B：高质量媒体 / 专业分析师 / 垂直 KOL（不是内容评分）",
  },
  C: {
    cls: "text-zinc-500 border-white/[0.07] bg-white/[0.03]",
    tip: "信源 C：普通 KOL / 综合资讯站（不是内容评分）",
  },
  D: {
    cls: "text-zinc-600 border-white/[0.05] bg-transparent",
    tip: "信源 D：搬运号 / 营销号 / 低质量来源（不是内容评分）",
  },
}

// ── Score orb — three-tier colored glow ──────────────────────────────────────

function ScoreOrb({ score }: { score: number }) {
  const isHot  = score >= 80
  const isCyan = score >= 72 && score < 80
  const isBlue = score >= 65 && score < 72
  return (
    <div className={cn(
      "shrink-0 flex items-center justify-center w-10 h-10 rounded-2xl",
      "border font-bold text-[13px] font-mono tabular-nums select-none",
      "transition-all duration-300",
      isHot  && "jarvis-score-hot",
      isCyan && "jarvis-score-cyan",
      isBlue && "jarvis-score-blue",
      !isHot && !isCyan && !isBlue && "jarvis-score-dim",
    )}>
      {score}
    </div>
  )
}

// ── Small badge ───────────────────────────────────────────────────────────────

function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center text-[9px] px-1.5 py-0.5 rounded-md border whitespace-nowrap font-medium",
      className,
    )}>
      {children}
    </span>
  )
}

// ── Recommendation reason ─────────────────────────────────────────────────────

function buildReason(item: RecommendedItem): string {
  const score   = item.finalScore
  const signals = item.relatedSignals?.length ?? 0
  if (item.isOfficial)                                return "来源可靠：官方信源直接发布"
  if (item.qualityFlags.includes("strong_evidence"))  return "证据充足：多来源交叉验证"
  if (signals >= 3)                                   return `多源信号：已有 ${signals} 个相关信号`
  if (signals >= 2)                                   return `${signals} 个信号佐证，关注度提升`
  if (item.isUserCurated)                             return "来自你的精选信源"
  if (score >= 80)                                    return "综合评分很高，建议优先阅读"
  if (score >= 72)                                    return "评分较高，今日推荐"
  if (score >= 65)                                    return "达到推荐线，可快速浏览"
  return "进入观察范围，供参考"
}

// ── Deep dive status ──────────────────────────────────────────────────────────

function deepDiveStatus(item: RecommendedItem): "ai" | "rule" | "pending" {
  const dd = item.deepDive
  if (!dd || dd.status === "skipped") return "pending"
  if (dd.status === "generated" && dd.model !== "deterministic-v1") return "ai"
  return "rule"
}

// ── Source status label ───────────────────────────────────────────────────────

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  official:     { label: "官方来源", cls: "text-amber-400/80 border-amber-500/25 bg-amber-500/[0.08]" },
  user_curated: { label: "我的来源", cls: "text-teal-400/80 border-teal-500/25 bg-teal-500/[0.08]" },
  multi_source: { label: "多源验证", cls: "text-green-400/80 border-green-500/25 bg-green-500/[0.08]" },
  single_source:{ label: "",         cls: "" },
  weak_source:  { label: "仍需验证", cls: "text-zinc-500 border-white/[0.08] bg-white/[0.03]" },
}

// ── Card ─────────────────────────────────────────────────────────────────────

type Props = { item: RecommendedItem; enableDetail?: boolean }

export function EngineRecommendationCard({ item, enableDetail = false }: Props) {
  const [open, setOpen] = useState(false)

  const title          = cleanDisplayText(item.title)
  const summary        = cleanDisplayText(item.summary)
  const sourceName     = safeSourceName(item.source, item.originalUrl)
  const reason         = buildReason(item)
  const ddStatus       = deepDiveStatus(item)
  const tierLabel      = TIER_LABELS[item.recommendationTier] ?? item.recommendationTier
  const tierColor      = TIER_COLORS[item.recommendationTier] ?? TIER_COLORS.observe
  const sourceTierInfo = TIER_BADGE[item.sourceTier] ?? TIER_BADGE.C
  const statusInfo     = STATUS_PILL[item.sourceStatus]
  const deepDiveSummary = (item.deepDive && ddStatus !== "pending")
    ? (item.deepDive.oneSentence || item.deepDive.summary)
    : null

  const body = (
    <>
      {/* Row 1: tier badge + title */}
      <div className="flex items-start gap-2 min-w-0">
        <span
          className={cn(
            "shrink-0 mt-0.5 text-[9px] font-bold font-mono tracking-wider px-1.5 py-0.5 rounded border",
            sourceTierInfo.cls,
          )}
          title={sourceTierInfo.tip}
        >
          {item.sourceTier}
        </span>
        <h2 className="min-w-0 flex-1 text-[13px] font-semibold leading-snug transition-colors line-clamp-2 text-left"
            style={{color:"rgba(244,241,234,0.92)"}}>
          {title}
        </h2>
      </div>

      {/* Row 2: summary */}
      {summary && (
        <p className="mt-1.5 text-[11px] leading-relaxed line-clamp-2 text-left"
           style={{color:"rgba(244,241,234,0.62)"}}>
          {summary}
        </p>
      )}

      {/* Row 3: DeepDive one-sentence (AI only) */}
      {deepDiveSummary && (
        <p className="mt-1.5 text-[11px] leading-relaxed line-clamp-2 text-left pl-2"
           style={{
             color:"rgba(244,241,234,0.72)",
             borderLeft:"2px solid rgba(232,93,61,0.45)",
           }}>
          {deepDiveSummary}
        </p>
      )}

      {/* Row 4: pills */}
      <div className="mt-2 flex items-center gap-1 flex-wrap">
        <Pill className={tierColor}>{tierLabel}</Pill>
        {statusInfo?.label && (
          <Pill className={statusInfo.cls}>{statusInfo.label}</Pill>
        )}
        {item.qualityFlags.includes("fresh") && (
          <Pill className="text-cyan-400/70 border-cyan-500/20 bg-cyan-500/[0.06]">新鲜</Pill>
        )}
        {item.qualityFlags.includes("official_source") && (
          <Pill className="text-amber-400/70 border-amber-500/20 bg-amber-500/[0.06]">官方</Pill>
        )}
        {ddStatus === "ai" && (
          <Pill className="text-violet-400/70 border-violet-500/20 bg-violet-500/[0.06]">AI 解读</Pill>
        )}
        {(item.relatedSignals?.length ?? 0) > 1 && (
          <Pill className="text-slate-400 border-white/[0.08] bg-white/[0.03]">
            {item.relatedSignals!.length} 信号
          </Pill>
        )}
      </div>

      {/* Row 5: reason */}
      <p className="mt-1 text-[10px] leading-relaxed text-left"
         style={{color:"rgba(244,241,234,0.42)"}}>
        {reason}
      </p>
    </>
  )

  return (
    <>
      <article className={cn(
        "group border-b border-white/[0.06] last:border-0",
        "transition-all duration-200 hover:bg-white/[0.03]",
        enableDetail ? "cursor-pointer" : "cursor-default",
      )}>
        <div className="flex items-start gap-4 px-5 py-4">
          {/* Score orb */}
          <ScoreOrb score={item.recommendationScore} />

          {/* Content */}
          <div className="min-w-0 flex-1">
            {enableDetail ? (
              <button type="button" onClick={() => setOpen(true)} className="w-full text-left">
                {body}
              </button>
            ) : (
              <div>{body}</div>
            )}

            {/* Footer: source · time · link */}
            <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] truncate max-w-[150px] font-mono"
                    style={{color:"rgba(244,241,234,0.45)"}}>
                {sourceName}
              </span>
              <span className="text-[10px]" style={{color:"rgba(255,255,255,0.15)"}}>·</span>
              <ClientRelativeTime
                value={item.publishedAt ?? item.fetchedAt}
                className="text-[10px] text-white/[0.38]"
                fallback=""
              />
              <a
                href={item.originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className={cn(
                  "ml-auto inline-flex items-center gap-1 shrink-0",
                  "rounded-lg border border-white/[0.1] bg-white/[0.04]",
                  "px-2.5 py-1 text-[10px] font-medium text-slate-400",
                  "transition-all hover:border-white/[0.2] hover:text-slate-200 hover:bg-white/[0.07]",
                )}
              >
                <ExternalLink className="h-2.5 w-2.5" />
                原文
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
