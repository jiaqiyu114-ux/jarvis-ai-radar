"use client"

import { useState, type KeyboardEvent } from "react"
import { ExternalLink, ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RecommendedItem } from "@/lib/recommendations/recommendation-engine"
import { RecommendationDetailModal } from "./_recommendation-detail-modal"
import { cleanDisplayText, safeSourceName } from "@/lib/text/decode-html"
import { ClientRelativeTime } from "@/components/time/client-relative-time"
import { scoreBand, evidenceLevel, mcardVariantClass, mcardClassByIndex } from "@/components/ui/score-band"
import { buildReason } from "@/components/ui/recommendation-reason"

// Source-tier accent (信源质量, NOT content score — kept distinct per §12.4)
const TIER_COLOR: Record<string, string> = {
  S: "#FF7A30", A: "#44D7C6", B: "#AEBBCD", C: "#7E8CA0", D: "#7E8CA0",
}
const EVIDENCE_COLOR: Record<string, string> = {
  High: "var(--dg-green)",
  Medium: "var(--dg-amber)",
  Low: "var(--text-muted)",
}
const TIER_TIP: Record<string, string> = {
  S: "信源 S：官方博客 / 官方文档 / 论文原文（不是内容评分）",
  A: "信源 A：官方社媒 / 创始人 / 顶级研究机构（不是内容评分）",
  B: "信源 B：高质量媒体 / 专业分析师 / 垂直 KOL（不是内容评分）",
  C: "信源 C：普通 KOL / 综合资讯站（不是内容评分）",
  D: "信源 D：搬运号 / 营销号 / 低质量来源（不是内容评分）",
}

function deepDiveStatus(item: RecommendedItem): "ai" | "rule" | "pending" {
  const dd = item.deepDive
  if (!dd || dd.status === "skipped") return "pending"
  if (dd.status === "generated" && dd.model !== "deterministic-v1") return "ai"
  return "rule"
}

// At most 2 tags. Orange (deck-tag-hot) only for official / high priority.
type Tag = { key: string; label: string; cls: string }

function buildTags(item: RecommendedItem, ddStatus: "ai" | "rule" | "pending"): Tag[] {
  const tags: Tag[] = []
  if (item.isOfficial) tags.push({ key: "official", label: "官方源", cls: "deck-tag-hot" })
  else if (item.isUserCurated) tags.push({ key: "mine", label: "我的源", cls: "deck-tag-trust" })
  const sig = item.relatedSignals?.length ?? 0
  if (sig > 1) tags.push({ key: "multi", label: "多源共振", cls: "deck-tag-trust" })
  if (ddStatus === "ai") tags.push({ key: "ai", label: "AI 解读", cls: "deck-tag-ai" })
  if (tags.length < 2 && item.qualityFlags.includes("fresh")) {
    tags.push({ key: "fresh", label: "新鲜", cls: "deck-tag" })
  }
  return tags.slice(0, 2)
}

type Variant = "row" | "color"
type Props = { item: RecommendedItem; enableDetail?: boolean; variant?: Variant; feature?: boolean; colorIndex?: number }

export function EngineRecommendationCard({ item, enableDetail = false, variant = "row", feature = false, colorIndex }: Props) {
  const [open, setOpen] = useState(false)

  const title     = cleanDisplayText(item.title)
  const summary   = cleanDisplayText(item.summary)
  const source    = safeSourceName(item.source, item.originalUrl)
  const reason    = buildReason(item)
  const ddStatus  = deepDiveStatus(item)
  const band      = scoreBand(item.recommendationScore)
  const signals   = item.relatedSignals?.length ?? 0
  const evidence  = evidenceLevel({
    strongEvidence: item.qualityFlags.includes("strong_evidence"),
    evScore: item.evScore,
    signals,
    isOfficial: item.isOfficial,
  })
  const tierColor = TIER_COLOR[item.sourceTier] ?? "#7E8CA0"
  const evidenceColor = EVIDENCE_COLOR[evidence.label] ?? "var(--text-muted)"
  const tags      = buildTags(item, ddStatus)

  const openDetail = () => enableDetail && setOpen(true)
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!enableDetail) return
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      openDetail()
    }
  }

  // ── Multicolor card variant (reference event-card form) ──────────────────────
  if (variant === "color") {
    return (
      <>
        <article
          className={cn(
            "rf-mcard",
            colorIndex != null ? mcardClassByIndex(colorIndex) : mcardVariantClass(item.recommendationScore),
            feature && "sm:col-span-2",
          )}
          role={enableDetail ? "button" : undefined}
          tabIndex={enableDetail ? 0 : undefined}
          onClick={openDetail}
          onKeyDown={handleKeyDown}
          aria-label={enableDetail ? `打开解读：${title}` : undefined}
        >
          <span className="rf-mcard-score">{item.recommendationScore}</span>

          <div style={{ paddingRight: 46 }}>
            <div className="rf-mcard-kicker truncate">
              {band.label} · {item.category} · Source {item.sourceTier}
            </div>
            <h3 className={cn("rf-mcard-title", feature ? "line-clamp-3 text-[19px]" : "line-clamp-2")}>
              {title}
            </h3>
          </div>

          {summary && (
            <p className={cn("rf-mcard-summary", feature ? "line-clamp-3" : "line-clamp-2")}>
              {summary}
            </p>
          )}

          {feature && reason && (
            <p className="rf-mcard-summary line-clamp-2" style={{ opacity: 0.82, marginTop: 8 }}>
              <span style={{ fontWeight: 700 }}>推荐理由 </span>{reason}
            </p>
          )}

          <div className="rf-mcard-meta">
            <span className="truncate" style={{ maxWidth: 180 }}>{source}</span>
            <span>·</span>
            <ClientRelativeTime value={item.publishedAt ?? item.fetchedAt} fallback="" />
            {signals > 1 && <><span>·</span><span>{signals} 信号</span></>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {enableDetail && (
              <button type="button" onClick={e => { e.stopPropagation(); openDetail() }} className="rf-mcard-btn">
                打开解读 <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            )}
            <a href={item.originalUrl} target="_blank" rel="noopener noreferrer"
               onClick={e => e.stopPropagation()} className="rf-mcard-btn">
              <ExternalLink className="h-3 w-3" /> 原文
            </a>
          </div>
        </article>

        {enableDetail && <RecommendationDetailModal item={item} open={open} onOpenChange={setOpen} />}
      </>
    )
  }

  // ── Default dark row variant ─────────────────────────────────────────────────
  return (
    <>
      <article
        className={cn("deck-row", enableDetail && "cursor-pointer")}
        role={enableDetail ? "button" : undefined}
        tabIndex={enableDetail ? 0 : undefined}
        onClick={openDetail}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-start gap-4">
          {/* Score block (content value) */}
          <div className={cn("score-block", band.cls)}>
            <span className="sb-num">{item.recommendationScore}</span>
            <span className="sb-band">{band.label}</span>
          </div>

          {/* Middle: content */}
          <div className="min-w-0 flex-1">
            {/* Meta row — source tier · evidence · time (信源等级 ≠ 内容评分) */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
              <span className="font-semibold" style={{ color: tierColor }} title={TIER_TIP[item.sourceTier]}>
                Source {item.sourceTier}
              </span>
              <span style={{ color: "rgba(255,255,255,0.18)" }}>·</span>
              <span style={{ color: evidenceColor }}>Evidence {evidence.label}</span>
              <span style={{ color: "rgba(255,255,255,0.18)" }}>·</span>
              <ClientRelativeTime value={item.publishedAt ?? item.fetchedAt}
                                  className="text-[12px]" fallback="" />
            </div>

            {/* Title */}
            <button type="button" onClick={openDetail}
                    className={cn("mt-1.5 block w-full text-left", enableDetail ? "cursor-pointer" : "cursor-default")}>
              <h3 className="text-[16px] leading-[23px] font-[650] line-clamp-2"
                  style={{ color: "var(--text-primary)" }}>
                {title}
              </h3>
            </button>

            {/* Summary */}
            {summary && (
              <p className="mt-1.5 text-[14px] leading-[21px] line-clamp-2"
                 style={{ color: "var(--text-secondary)" }}>
                {summary}
              </p>
            )}

            {/* Reason */}
            <div className="reason-box">
              <span className="reason-label">推荐理由</span>
              {reason}
            </div>

            {/* Tags + source/signals footer */}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {tags.map(t => <span key={t.key} className={cn("deck-tag", t.cls)}>{t.label}</span>)}
              <span className="text-[12px] font-mono truncate max-w-[180px]" style={{ color: "var(--text-tertiary)" }}>
                {source}
              </span>
              {signals > 1 && (
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>· {signals} 信号</span>
              )}
            </div>
          </div>

          {/* Right: quiet actions */}
          <div className="shrink-0 flex flex-col items-end gap-2.5 w-[78px] pt-0.5">
            <a href={item.originalUrl} target="_blank" rel="noopener noreferrer"
               onClick={e => e.stopPropagation()}
               className="glass-btn justify-center text-[12px] py-1 px-2.5 w-full">
              <ExternalLink className="h-3 w-3" /> 原文
            </a>
            {enableDetail && (
              <span className="inline-flex items-center gap-1 text-[11px] transition-colors"
                    style={{ color: "var(--text-muted)" }}>
                解读 <ArrowUpRight className="h-3 w-3" />
              </span>
            )}
          </div>
        </div>
      </article>

      {enableDetail && (
        <RecommendationDetailModal item={item} open={open} onOpenChange={setOpen} />
      )}
    </>
  )
}
