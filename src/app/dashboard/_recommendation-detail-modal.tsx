"use client"

import { useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ExternalLink, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { TIER_LABELS, TIER_COLORS } from "@/lib/recommendations/recommendation-engine"
import type { RecommendedItem } from "@/lib/recommendations/recommendation-engine"
import type { RecommendationDeepDive } from "@/lib/recommendations/deep-dive"

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAge(dateStr: string | null | undefined): string {
  if (!dateStr) return ""
  try {
    const diff = Date.now() - new Date(dateStr).getTime()
    if (isNaN(diff) || diff < 0) return ""
    const h = diff / 3_600_000
    if (h < 1) return `${Math.round(diff / 60_000)} 分钟前`
    if (h < 24) return `${Math.floor(h)} 小时前`
    const d = Math.round(h / 24)
    if (d < 7) return `${d} 天前`
    const dt = new Date(dateStr)
    return `${dt.getMonth() + 1} 月 ${dt.getDate()} 日`
  } catch { return "" }
}

function contentStatusBadge(
  cs: RecommendationDeepDive["contentStatus"] | undefined,
  fcLen: number | undefined,
): { text: string; cls: string } | null {
  // Guard: never show full_article if no actual content
  const safeCs = (cs === "full_article" && (fcLen ?? 0) < 500) ? "rss_summary" : cs
  switch (safeCs) {
    case "full_article": return { text: "原文正文", cls: "text-success border-success/35 bg-success/8" }
    case "partial":      return { text: "部分正文", cls: "text-amber-600 border-amber-400/35 bg-amber-400/8 dark:text-amber-400" }
    case "rss_summary":  return { text: "RSS 摘要", cls: "text-amber-700 border-amber-400/35 bg-amber-400/8 dark:text-amber-500" }
    case "title_only":
    case "missing":      return { text: "仅标题", cls: "text-muted-foreground border-border bg-muted/40" }
    default:             return null
  }
}

function deepDiveBadge(dd: RecommendationDeepDive | undefined): { text: string; cls: string } {
  if (!dd)                                                         return { text: "待深度处理", cls: "text-muted-foreground border-border bg-muted/40" }
  if (dd.status === "generated" && dd.model !== "deterministic-v1") return { text: "AI 深度解读", cls: "text-success border-success/35 bg-success/8" }
  if (dd.status === "fallback" || dd.model === "deterministic-v1") return { text: "规则生成", cls: "text-warning border-warning/35 bg-warning/8" }
  return { text: "待深度处理", cls: "text-muted-foreground border-border bg-muted/40" }
}

/**
 * Compose flowing narrative paragraphs from deepDive fields.
 * Renders without section labels so it reads as a continuous briefing.
 */
function composeSignalNarrative(
  dd: RecommendationDeepDive | undefined,
  item: RecommendedItem,
): string[] {
  if (!dd || dd.status === "skipped") {
    return [item.summary || item.title || ""].filter(Boolean)
  }

  const MIN = 25
  const seen = new Set<string>()

  function add(text: string | null | undefined): string | null {
    const t = (text ?? "").trim()
    if (t.length < MIN) return null
    const key = t.slice(0, 60)
    if (seen.has(key)) return null
    seen.add(key)
    return t
  }

  const parts: string[] = []
  const p = (t: string | null | undefined) => { const v = add(t); if (v) parts.push(v) }

  p(dd.whatHappened)
  p(dd.context)
  p(dd.whyItMatters)
  p(dd.userValue || dd.userInsight || dd.userTakeaway)
  p(dd.uncertainty)

  return parts.length > 0 ? parts : [item.summary || item.title || ""].filter(Boolean)
}

function buildFollowUps(item: RecommendedItem): string[] {
  const dd = item.deepDive
  if (dd?.followUp && dd.followUp.length > 0) return dd.followUp.slice(0, 4)
  const raw = dd?.followUpSuggestion || item.nextStep || ""
  if (!raw) return ["等待下一轮增量证据，再决定是否升级处理。"]
  const lines = raw.split(/\r?\n|[;；]/g).map(l => l.trim()).filter(Boolean).slice(0, 4)
  return lines.length > 0 ? lines : [raw]
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex rounded border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap", className)}>
      {children}
    </span>
  )
}

function ContentQualityBanner({
  contentStatus,
  fcLen,
  sumLen,
}: {
  contentStatus: string | undefined
  fcLen: number | undefined
  sumLen: number | undefined
}) {
  if (!contentStatus || contentStatus === "full_article") return null
  const isTitle = contentStatus === "title_only" || contentStatus === "missing"
  const isPartial = contentStatus === "partial"

  return (
    <div className="rounded-lg border border-amber-400/25 bg-amber-400/6 px-4 py-3 text-[13px] leading-relaxed">
      <span className="font-semibold text-amber-700 dark:text-amber-400">
        {isTitle ? "仅有标题信息" : isPartial ? "部分正文分析" : "基于 RSS 摘要"}
      </span>
      <span className="text-amber-700/80 dark:text-amber-400/75">
        {isTitle
          ? "：深度解读基于极有限内容，结论仅供参考，请以原文为准。"
          : isPartial
            ? `：当前只抓取到部分正文（约 ${fcLen ?? "?"} 字），分析受限，建议查看原文补充上下文。`
            : `：深度解读基于 RSS 摘要（约 ${sumLen ?? "?"} 字），非完整原文。所有推断需克制，建议查看原文后形成最终判断。`}
      </span>
    </div>
  )
}

function SystemNote({
  reason,
  risk,
  isFallback,
  model,
  provider,
}: {
  reason: string
  risk: string
  isFallback: boolean
  model?: string
  provider?: string
}) {
  if (!reason && !risk) return null
  return (
    <div className="rounded-r-lg border-l-[3px] border-primary/30 pl-4 pr-3 py-3 bg-muted/20">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-2">
        系统批注
      </p>
      {reason && (
        <p className="text-[13px] leading-relaxed text-foreground/80">{reason}</p>
      )}
      {risk && (
        <p className="mt-1.5 text-[12px] leading-relaxed text-warning/90">{risk}</p>
      )}
      {isFallback && (
        <p className="mt-2 text-[11px] text-muted-foreground/60">
          当前展示为规则生成说明，AI 深度解读暂未完成。
          {model && ` · ${model}${provider ? ` / ${provider}` : ""}`}
        </p>
      )}
    </div>
  )
}

function EvidenceNote({
  sourceNotes,
  evidenceGaps,
  followUps,
}: {
  sourceNotes: string | undefined
  evidenceGaps: string[]
  followUps: string[]
}) {
  if (!sourceNotes && evidenceGaps.length === 0 && followUps.length === 0) return null
  return (
    <div className="space-y-3">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60">证据状态</p>
      {sourceNotes && (
        <p className="text-[13px] leading-relaxed text-muted-foreground">{sourceNotes}</p>
      )}
      {evidenceGaps.length > 0 && (
        <ul className="space-y-1 pl-4 list-disc marker:text-muted-foreground/40">
          {evidenceGaps.map((gap, i) => (
            <li key={i} className="text-[12px] leading-relaxed text-muted-foreground">{gap}</li>
          ))}
        </ul>
      )}
      {followUps.length > 0 && (
        <div className="pt-1">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-2">
            后续观察
          </p>
          <ul className="space-y-1.5 pl-4 list-disc marker:text-primary/50">
            {followUps.map((line, i) => (
              <li key={i} className="text-[13px] leading-relaxed text-foreground/75">{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function AuditDrawer({
  item,
  dd,
}: {
  item: RecommendedItem
  dd: RecommendationDeepDive | undefined
}) {
  const [open, setOpen] = useState(false)
  const diag = dd?.inputDiagnostics

  return (
    <div className="rounded-lg border border-border/60">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors text-left"
      >
        <span className="uppercase tracking-widest">查看系统审计</span>
        <span className="text-muted-foreground/40">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-border/60 px-4 pb-4 pt-3 space-y-3 text-[11px]">
          {/* Scores */}
          <div>
            <p className="text-muted-foreground/50 uppercase tracking-wider mb-1.5">评分</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-foreground/70">
              <span>Final <span className="font-semibold">{item.finalScore}</span></span>
              <span>Signal <span className="font-semibold">{item.signalScore}</span></span>
              <span>Rec <span className="font-semibold">{item.recommendationScore}</span></span>
              {item.evScore != null && <span>Evidence <span className="font-semibold">{item.evScore}</span></span>}
              {item.truthScore != null && <span>Truth <span className="font-semibold">{item.truthScore}</span></span>}
            </div>
          </div>

          {/* Source */}
          <div>
            <p className="text-muted-foreground/50 uppercase tracking-wider mb-1.5">来源</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-foreground/70">
              <span>Tier <span className="font-mono">{item.sourceTier}</span></span>
              <span>Status <span className="font-mono">{item.sourceStatus}</span></span>
              {item.isUserCurated && <span className="text-teal-500">is_user_curated</span>}
              {item.isOfficial && <span className="text-amber-500">is_official</span>}
            </div>
          </div>

          {/* DeepDive metadata */}
          {dd && (
            <div>
              <p className="text-muted-foreground/50 uppercase tracking-wider mb-1.5">DeepDive</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-foreground/70">
                <span>status <span className="font-mono">{dd.status}</span></span>
                <span>contentStatus <span className="font-mono">{dd.contentStatus ?? "—"}</span></span>
                <span>model <span className="font-mono">{dd.model}</span></span>
                <span>provider <span className="font-mono">{dd.provider}</span></span>
              </div>
              {dd.fallbackReason && (
                <p className="mt-1 text-warning/70 font-mono break-all">fallback: {dd.fallbackReason}</p>
              )}
            </div>
          )}

          {/* Input diagnostics */}
          {diag && (
            <div>
              <p className="text-muted-foreground/50 uppercase tracking-wider mb-1.5">Input diagnostics</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-foreground/70">
                <span>contentSource <span className="font-mono">{diag.contentSource}</span></span>
                <span>titleLen <span className="font-mono">{diag.inputTitleLength}</span></span>
                <span>summaryLen <span className="font-mono">{diag.inputSummaryLength}</span></span>
                <span>fullContentLen <span className="font-mono">{diag.inputFullContentLength}</span></span>
              </div>
              {diag.rawModelContentStatus && diag.rawModelContentStatus !== dd?.contentStatus && (
                <p className="mt-1 text-amber-500/80 font-mono">
                  model claimed: {diag.rawModelContentStatus} → system: {dd?.contentStatus}
                </p>
              )}
              {diag.qualityWarnings && diag.qualityWarnings.length > 0 && (
                <p className="mt-1 text-warning/70 font-mono break-all">
                  warns: {diag.qualityWarnings.join("; ")}
                </p>
              )}
            </div>
          )}

          {/* Quality flags */}
          {item.qualityFlags.length > 0 && (
            <div>
              <p className="text-muted-foreground/50 uppercase tracking-wider mb-1.5">Quality flags</p>
              <p className="text-foreground/70 font-mono">{item.qualityFlags.join(" · ")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type RecommendationDetailModalProps = {
  item: RecommendedItem
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RecommendationDetailModal({ item, open, onOpenChange }: RecommendationDetailModalProps) {
  const dd = item.deepDive
  const diag = dd?.inputDiagnostics
  const contentStatus = dd?.contentStatus
  const fcLen = diag?.inputFullContentLength
  const sumLen = diag?.inputSummaryLength

  // Safety-corrected contentStatus for display
  const displayCS = contentStatus === "full_article" && (fcLen ?? 0) < 500 ? "rss_summary" : contentStatus

  const ddBadge = deepDiveBadge(dd)
  const csBadge = contentStatusBadge(displayCS, fcLen)
  const isFallback = dd?.status === "fallback" || dd?.model === "deterministic-v1"
  const isLimitedContent = displayCS && displayCS !== "full_article"

  const narrative = composeSignalNarrative(dd, item)
  const evidenceGaps = dd?.evidenceGaps?.filter(Boolean) ?? []
  const followUps = buildFollowUps(item)

  // Judgment framing: oneSentence or recommendationReason as the signal dek
  const signalDek = dd?.oneSentence || item.recommendationReason || ""
  // Source notes
  const sourceNotes = dd?.sourceNotes || dd?.sourceReadingGuide || ""

  const age = formatAge(item.publishedAt)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-24px)] max-w-[960px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border/80 bg-background shadow-2xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <DialogPrimitive.Title className="sr-only">{item.title}</DialogPrimitive.Title>

          {/* Close button */}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-3 top-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background/90 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="关闭详情"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex h-[88vh] max-h-[88vh] flex-col">

            {/* ── SIGNAL HEADER ─────────────────────────────────────────── */}
            <header className="border-b border-border px-6 pb-5 pt-5 shrink-0">

              {/* Source meta row */}
              <div className="flex items-center justify-between gap-3 pr-8">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0 flex-wrap">
                  <span className="font-medium text-foreground/70 truncate max-w-[200px]">{item.source}</span>
                  <span className="text-muted-foreground/30">·</span>
                  <span>Tier {item.sourceTier}</span>
                  <span className="text-muted-foreground/30">·</span>
                  <span>{item.category}</span>
                  {age && (
                    <>
                      <span className="text-muted-foreground/30">·</span>
                      <span>{age}</span>
                    </>
                  )}
                </div>
                <a
                  href={item.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/8 px-3 py-1.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/15"
                  onClick={e => e.stopPropagation()}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  查看原文
                </a>
              </div>

              {/* Title — factual anchor */}
              <h2 className="mt-3 text-xl font-bold leading-snug text-foreground pr-8">
                {item.title}
              </h2>

              {/* Signal dek — judgment framing */}
              {signalDek && signalDek !== item.title && (
                <p className="mt-2 text-sm leading-relaxed text-foreground/70 pr-8">
                  {signalDek}
                </p>
              )}

              {/* Badges row */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge className={TIER_COLORS[item.recommendationTier]}>
                  {TIER_LABELS[item.recommendationTier]}
                </Badge>
                <Badge className={ddBadge.cls}>{ddBadge.text}</Badge>
                {csBadge && <Badge className={csBadge.cls}>{csBadge.text}</Badge>}
                {item.isUserCurated && (
                  <Badge className="text-teal-700 border-teal-400/35 bg-teal-400/8 dark:text-teal-400">
                    我的来源
                  </Badge>
                )}
              </div>
            </header>

            {/* ── SCROLLABLE BODY ───────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-6 py-6 space-y-8">

                {/* Content quality warning */}
                {isLimitedContent && (
                  <ContentQualityBanner
                    contentStatus={displayCS}
                    fcLen={fcLen}
                    sumLen={sumLen}
                  />
                )}

                {/* ── SIGNAL INTERPRETATION — flowing narrative, no labels ── */}
                {narrative.length > 0 && (
                  <div className="space-y-5">
                    {narrative.map((para, i) => (
                      <p
                        key={i}
                        className={cn(
                          "text-[15px] leading-[1.85] text-foreground/88",
                          // Last paragraph (usually uncertainty) gets slightly muted
                          i === narrative.length - 1 && "text-foreground/70",
                        )}
                      >
                        {para}
                      </p>
                    ))}
                  </div>
                )}

                {!dd && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    这条推荐已有基础判断，但还没有生成完整深度解读。可以稍后刷新推荐快照。
                  </p>
                )}

                {/* ── SYSTEM NOTE ──────────────────────────────────────── */}
                <SystemNote
                  reason={item.recommendationReason}
                  risk={item.riskNote}
                  isFallback={isFallback}
                  model={dd?.model}
                  provider={dd?.provider}
                />

                {/* ── EVIDENCE NOTE ──────────────────────────────────────── */}
                <EvidenceNote
                  sourceNotes={sourceNotes || undefined}
                  evidenceGaps={evidenceGaps}
                  followUps={followUps}
                />

                {/* ── AUDIT DRAWER ──────────────────────────────────────── */}
                <AuditDrawer item={item} dd={dd} />

              </div>
            </div>

            {/* ── FOOTER ────────────────────────────────────────────────── */}
            <footer className="border-t border-border bg-background/95 px-6 py-3 shrink-0">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-muted-foreground/60 truncate">
                  {item.source} · {item.category}
                  {age ? ` · ${age}` : ""}
                </p>
                <a
                  href={item.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/8 px-3 py-1.5 text-[12px] font-medium text-primary transition-colors hover:bg-primary/15 shrink-0"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  查看原文
                </a>
              </div>
            </footer>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
