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
  const safeCs = cs === "full_article" && (fcLen ?? 0) < 500 ? "rss_summary" : cs
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
  if (!dd)                                                          return { text: "待深度处理", cls: "text-muted-foreground border-border bg-muted/40" }
  if (dd.status === "generated" && dd.model !== "deterministic-v1") return { text: "AI 深度解读", cls: "text-success border-success/35 bg-success/8" }
  if (dd.status === "fallback" || dd.model === "deterministic-v1")  return { text: "规则生成", cls: "text-warning border-warning/35 bg-warning/8" }
  return { text: "待深度处理", cls: "text-muted-foreground border-border bg-muted/40" }
}

/**
 * Compose flowing narrative paragraphs from deepDive fields.
 * Leads with significance (whyItMatters) so the first sentence is always
 * a judgment statement, not a news-recap opener like "据 XX 报道…".
 * Pre-registers oneSentence so it is never repeated in the body.
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

  // Pre-register oneSentence so it doesn't appear again in the body
  // (it is already shown in the header as signal title or dek)
  const os = (dd.oneSentence ?? "").trim()
  if (os.length >= MIN) seen.add(os.slice(0, 60))

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

  // Judgment-first order: significance → facts → context → personal angle → caveats
  p(dd.whyItMatters)
  p(dd.whatHappened)
  p(dd.context)
  p(dd.userValue || dd.userInsight || dd.userTakeaway)
  p(dd.uncertainty)

  return parts.length > 0 ? parts : [item.summary || item.title || ""].filter(Boolean)
}

function buildFollowUps(item: RecommendedItem): string[] {
  const dd = item.deepDive
  if (dd?.followUp && dd.followUp.length > 0) return dd.followUp.slice(0, 4)
  const raw = dd?.followUpSuggestion || item.nextStep || ""
  if (!raw) return []
  const lines = raw.split(/\r?\n|[;；]/g).map(l => l.trim()).filter(Boolean).slice(0, 4)
  return lines.length > 0 ? lines : [raw]
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn(
      "inline-flex rounded border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap",
      className,
    )}>
      {children}
    </span>
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
  if (!reason && !risk && !isFallback) return null
  return (
    <div className="border-l-[3px] border-primary/25 pl-4 pr-2 py-0.5">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-2">
        系统批注
      </p>
      {reason && (
        <p className="text-[13px] leading-relaxed text-foreground/75">{reason}</p>
      )}
      {risk && (
        <p className={cn("text-[12px] leading-relaxed", reason ? "mt-1.5" : "")}>
          <span className="text-warning/80">{risk}</span>
        </p>
      )}
      {isFallback && (
        <p className="mt-2 text-[11px] text-muted-foreground/55">
          当前展示为规则生成说明，AI 深度解读暂未完成
          {model && model !== "deterministic-v1" ? ` · ${model}${provider ? ` / ${provider}` : ""}` : ""}。
        </p>
      )}
    </div>
  )
}

function EvidenceNote({
  sourceNotes,
  evidenceGaps,
  followUps,
  displayCS,
  sumLen,
  fcLen,
}: {
  sourceNotes: string | undefined
  evidenceGaps: string[]
  followUps: string[]
  displayCS: string | undefined
  sumLen: number | undefined
  fcLen: number | undefined
}) {
  // Build a single natural-language evidence paragraph
  const parts: string[] = []
  if (sourceNotes) parts.push(sourceNotes)

  // Inline content-quality note (replaces the removed top banner)
  const qualityNote = (() => {
    if (!displayCS || displayCS === "full_article") return ""
    if (displayCS === "rss_summary") return `当前内容来自 RSS 摘要（约 ${sumLen ?? "?"}字），尚缺完整原文，以上推断需保守解读。`
    if (displayCS === "partial")     return `当前只获取到部分正文（约 ${fcLen ?? "?"}字），分析不完整，建议查看原文补充细节。`
    if (displayCS === "title_only" || displayCS === "missing") return "当前仅有标题信息，深度解读基于极有限输入，请以原文为准。"
    return ""
  })()
  if (qualityNote) parts.push(qualityNote)

  // Evidence gaps — inline sentence
  if (evidenceGaps.length > 0) {
    parts.push(`待补充：${evidenceGaps.join("；")}`)
  }

  const evidencePara = parts.filter(Boolean).join(" ")
  const hasContent = evidencePara || followUps.length > 0
  if (!hasContent) return null

  return (
    <div className="space-y-3">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50">证据与限制</p>
      {evidencePara && (
        <p className="text-[13px] leading-relaxed text-muted-foreground">{evidencePara}</p>
      )}
      {followUps.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-2">
            后续观察
          </p>
          {followUps.length === 1 ? (
            <p className="text-[13px] leading-relaxed text-foreground/70">{followUps[0]}</p>
          ) : (
            <div className="space-y-1.5">
              {followUps.map((line, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-primary/40 shrink-0 text-[11px] mt-[3px]">▸</span>
                  <p className="text-[13px] leading-relaxed text-foreground/70">{line}</p>
                </div>
              ))}
            </div>
          )}
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
    <div className="rounded-lg border border-border/50">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors text-left"
      >
        <span className="uppercase tracking-widest">查看系统审计</span>
        <span className="text-muted-foreground/30 text-[10px]">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-border/50 px-4 pb-4 pt-3 space-y-3 text-[11px]">
          <div>
            <p className="text-muted-foreground/40 uppercase tracking-wider mb-1.5">评分</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-foreground/65">
              <span>Final <span className="font-semibold">{item.finalScore}</span></span>
              <span>Signal <span className="font-semibold">{item.signalScore}</span></span>
              <span>Rec <span className="font-semibold">{item.recommendationScore}</span></span>
              {item.evScore != null   && <span>Evidence <span className="font-semibold">{item.evScore}</span></span>}
              {item.truthScore != null && <span>Truth <span className="font-semibold">{item.truthScore}</span></span>}
            </div>
          </div>
          <div>
            <p className="text-muted-foreground/40 uppercase tracking-wider mb-1.5">来源</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-foreground/65">
              <span>Tier <span className="font-mono">{item.sourceTier}</span></span>
              <span>Status <span className="font-mono">{item.sourceStatus}</span></span>
              {item.isUserCurated && <span className="text-teal-500">is_user_curated</span>}
              {item.isOfficial    && <span className="text-amber-500">is_official</span>}
            </div>
          </div>
          {dd && (
            <div>
              <p className="text-muted-foreground/40 uppercase tracking-wider mb-1.5">DeepDive</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-foreground/65">
                <span>status <span className="font-mono">{dd.status}</span></span>
                <span>contentStatus <span className="font-mono">{dd.contentStatus ?? "—"}</span></span>
                <span>model <span className="font-mono">{dd.model}</span></span>
                <span>provider <span className="font-mono">{dd.provider}</span></span>
              </div>
              {dd.fallbackReason && (
                <p className="mt-1 text-warning/60 font-mono break-all">fallback: {dd.fallbackReason}</p>
              )}
            </div>
          )}
          {diag && (
            <div>
              <p className="text-muted-foreground/40 uppercase tracking-wider mb-1.5">Input diagnostics</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-foreground/65">
                <span>contentSource <span className="font-mono">{diag.contentSource}</span></span>
                <span>titleLen <span className="font-mono">{diag.inputTitleLength}</span></span>
                <span>summaryLen <span className="font-mono">{diag.inputSummaryLength}</span></span>
                <span>fullContentLen <span className="font-mono">{diag.inputFullContentLength}</span></span>
              </div>
              {diag.rawModelContentStatus && diag.rawModelContentStatus !== dd?.contentStatus && (
                <p className="mt-1 text-amber-500/70 font-mono">
                  model claimed: {diag.rawModelContentStatus} → system: {dd?.contentStatus}
                </p>
              )}
              {diag.qualityWarnings && diag.qualityWarnings.length > 0 && (
                <p className="mt-1 text-warning/60 font-mono break-all">
                  warns: {diag.qualityWarnings.join("; ")}
                </p>
              )}
            </div>
          )}
          {item.qualityFlags.length > 0 && (
            <div>
              <p className="text-muted-foreground/40 uppercase tracking-wider mb-1.5">Quality flags</p>
              <p className="text-foreground/65 font-mono">{item.qualityFlags.join(" · ")}</p>
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

  // Safety-corrected contentStatus
  const displayCS = contentStatus === "full_article" && (fcLen ?? 0) < 500 ? "rss_summary" : contentStatus

  const ddBadge = deepDiveBadge(dd)
  const csBadge = contentStatusBadge(displayCS, fcLen)
  const isFallback = dd?.status === "fallback" || dd?.model === "deterministic-v1"
  const isLlmGenerated = !!dd && dd.status === "generated" && dd.model !== "deterministic-v1"

  // ── Signal title derivation ────────────────────────────────────────────────
  // If LLM-generated, promote oneSentence to the main heading (judgment-first).
  // item.title becomes the factual reference subtitle below.
  // If deterministic/missing, item.title stays as main heading;
  // recommendationReason appears as the dek framing.
  const rawOneSentence = (dd?.oneSentence ?? "").trim()
  const useJudgmentTitle = (
    isLlmGenerated &&
    rawOneSentence.length > 20 &&
    rawOneSentence !== item.title &&
    !rawOneSentence.startsWith("该条目")
  )
  const signalTitle    = useJudgmentTitle ? rawOneSentence : item.title
  const originalTitleRef = useJudgmentTitle ? item.title : null
  // Dek only shown when item.title is main (to add judgment framing below it)
  const signalDek = useJudgmentTitle ? "" : (item.recommendationReason || "")

  // SystemNote shows recommendationReason only when it's not already in the header dek
  const systemNoteReason = useJudgmentTitle ? item.recommendationReason : ""

  const narrative = composeSignalNarrative(dd, item)
  const evidenceGaps = dd?.evidenceGaps?.filter(Boolean) ?? []
  const followUps = buildFollowUps(item)
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

              {/* Source meta + 查看原文 */}
              <div className="flex items-center justify-between gap-3 pr-8">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0 flex-wrap">
                  <span className="font-medium text-foreground/70 truncate max-w-[200px]">{item.source}</span>
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

              {/* Main heading — signal title (judgment) or news headline */}
              <h2 className="mt-3 text-xl font-bold leading-snug text-foreground pr-8">
                {signalTitle}
              </h2>

              {/* Original news title (shown only when judgment is main heading) */}
              {originalTitleRef && (
                <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground/55 pr-8">
                  原文标题：{originalTitleRef}
                </p>
              )}

              {/* Dek — system judgment framing (shown when item.title is main) */}
              {signalDek && (
                <p className="mt-2 text-[13px] leading-relaxed text-foreground/65 pr-8">
                  {signalDek}
                </p>
              )}

              {/* Badges */}
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
              <div className="px-6 py-7 space-y-8">

                {/* SIGNAL INTERPRETATION — flowing narrative, no section labels */}
                {narrative.length > 0 ? (
                  <div className="space-y-5">
                    {narrative.map((para, i) => (
                      <p
                        key={i}
                        className={cn(
                          "text-[15px] leading-[1.85]",
                          // Last paragraph (uncertainty/caveats) slightly muted
                          i === narrative.length - 1
                            ? "text-foreground/65"
                            : "text-foreground/88",
                        )}
                      >
                        {para}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    这条推荐已有基础判断，但还没有生成完整深度解读。可以稍后刷新推荐快照。
                  </p>
                )}

                {/* SYSTEM NOTE */}
                <SystemNote
                  reason={systemNoteReason}
                  risk={item.riskNote}
                  isFallback={isFallback}
                  model={dd?.model}
                  provider={dd?.provider}
                />

                {/* EVIDENCE NOTE — natural language, no big bullet report */}
                <EvidenceNote
                  sourceNotes={sourceNotes || undefined}
                  evidenceGaps={evidenceGaps}
                  followUps={followUps}
                  displayCS={displayCS}
                  sumLen={sumLen}
                  fcLen={fcLen}
                />

                {/* AUDIT DRAWER — collapsed by default */}
                <AuditDrawer item={item} dd={dd} />

              </div>
            </div>

            {/* No sticky footer — 查看原文 is in the header */}

          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
