"use client"

import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ExternalLink, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { TIER_LABELS, TIER_COLORS } from "@/lib/recommendations/recommendation-engine"
import type { RecommendedItem } from "@/lib/recommendations/recommendation-engine"

type RecommendationDetailModalProps = {
  item: RecommendedItem
  open: boolean
  onOpenChange: (open: boolean) => void
}

function metricLabel(label: string, value: number | null | undefined) {
  if (value == null) return `${label} -`
  return `${label} ${value}`
}

function deepDiveBadge(item: RecommendedItem): { label: string; className: string } {
  const deepDive = item.deepDive
  if (!deepDive) {
    return {
      label: "待深度处理",
      className: "text-muted-foreground border-border bg-muted/40",
    }
  }

  if (deepDive.status === "generated" && deepDive.model !== "deterministic-v1") {
    return {
      label: "AI 深度解读",
      className: "text-success border-success/30 bg-success/10",
    }
  }

  if (deepDive.status === "fallback" || deepDive.model === "deterministic-v1") {
    return {
      label: "规则生成",
      className: "text-warning border-warning/30 bg-warning/10",
    }
  }

  return {
    label: "待深度处理",
    className: "text-muted-foreground border-border bg-muted/40",
  }
}

function toFollowUps(item: RecommendedItem): string[] {
  const deepDive = item.deepDive
  if (deepDive?.followUp && deepDive.followUp.length > 0) return deepDive.followUp.slice(0, 4)

  const fallback = deepDive?.followUpSuggestion || item.nextStep || ""
  if (!fallback) return ["等待下一轮增量证据，再决定是否升级处理。"]

  const lines = fallback
    .split(/\r?\n|[;；]/g)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 4)

  return lines.length > 0 ? lines : [fallback]
}

function deepDiveMeta(item: RecommendedItem): string {
  const deepDive = item.deepDive
  if (!deepDive) return "待生成"
  const model = deepDive.model || "unknown-model"
  const provider = deepDive.provider || "unknown-provider"
  return `${model} / ${provider}`
}

export function RecommendationDetailModal({ item, open, onOpenChange }: RecommendationDetailModalProps) {
  const deepDive = item.deepDive
  const deepBadge = deepDiveBadge(item)
  const followUps = toFollowUps(item)
  const evidenceGaps = deepDive?.evidenceGaps?.filter(Boolean) ?? []

  const oneSentence = deepDive?.oneSentence || item.recommendationReason || item.summary || "暂无一句话判断。"
  const whatHappened = deepDive?.whatHappened || item.summary || item.title
  const whyItMatters = deepDive?.whyItMatters || item.recommendationReason
  const userValue = deepDive?.userValue || deepDive?.userTakeaway || deepDive?.userInsight || "建议将这条信息与同主题信号交叉验证后再形成结论。"
  const uncertainty = deepDive?.uncertainty || deepDive?.riskAndUncertainty || item.riskNote || "当前仍有不确定性，建议保留保守判断。"
  const sourceNotes = deepDive?.sourceNotes || deepDive?.sourceReadingGuide || `${item.source} / Tier ${item.sourceTier}`

  const showGeneratedHint = deepDive?.status === "generated" && deepDive.model !== "deterministic-v1"
  const showFallbackHint = deepDive?.status === "fallback" || deepDive?.model === "deterministic-v1"
  const contentStatus = deepDive?.contentStatus
  const showSummaryOnlyWarning = contentStatus === "rss_summary" || contentStatus === "title_only"
  const inputDiag = deepDive?.inputDiagnostics

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-24px)] max-w-[940px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border/80 bg-background shadow-xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
          <DialogPrimitive.Title className="sr-only">{item.title}</DialogPrimitive.Title>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background/90 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="关闭详情"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex h-[85vh] max-h-[85vh] flex-col">
            <header className="border-b border-border px-5 pb-4 pt-5">
              <div className="space-y-3 pr-10">
                <h2 className="text-base font-semibold leading-snug text-foreground">{item.title}</h2>
                <p className="text-xs text-muted-foreground">
                  {item.source} · Tier {item.sourceTier} · {item.category}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("inline-flex rounded border px-2 py-0.5 text-[10px] font-medium", TIER_COLORS[item.recommendationTier])}>
                    {TIER_LABELS[item.recommendationTier]}
                  </span>
                  <span className={cn("inline-flex rounded border px-2 py-0.5 text-[10px] font-medium", deepBadge.className)}>
                    {deepBadge.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{deepDiveMeta(item)}</span>
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-4">
                {showSummaryOnlyWarning && (
                  <section className="rounded-lg border border-amber-400/30 bg-amber-400/8 px-4 py-2.5">
                    <p className="text-xs leading-relaxed">
                      <span className="font-semibold text-amber-700 dark:text-amber-400">
                        {contentStatus === "title_only" ? "仅有标题信息" : "基于 RSS 摘要分析"}
                      </span>
                      <span className="text-amber-700/80 dark:text-amber-400/80">
                        {contentStatus === "title_only"
                          ? "：深度解读基于极有限内容，结论仅供参考，建议查看原文。"
                          : `：深度解读基于 RSS 摘要（${inputDiag?.inputSummaryLength ?? "?"}字），非完整原文。结论受限，建议查看原文获取完整上下文。`}
                      </span>
                    </p>
                  </section>
                )}

                <section className="rounded-lg border border-border bg-card px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">一句话判断</p>
                  <p className="mt-2 text-sm leading-relaxed text-foreground">{oneSentence}</p>
                </section>

                <section className="rounded-lg border border-border bg-card px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">发生了什么</p>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/90">{whatHappened}</p>
                  {deepDive?.context && (
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{deepDive.context}</p>
                  )}
                </section>

                <section className="rounded-lg border border-border bg-card px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">为什么重要</p>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/90">{whyItMatters}</p>
                </section>

                <section className="rounded-lg border border-border bg-card px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">对你的启发</p>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/90">{userValue}</p>
                </section>

                <section className="rounded-lg border border-border bg-card px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">风险与不确定性</p>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/90">{uncertainty}</p>
                  {evidenceGaps.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted-foreground">
                      {evidenceGaps.map((gap, index) => (
                        <li key={`${item.id}-gap-${index}`}>{gap}</li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="rounded-lg border border-border bg-card px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">后续追踪</p>
                  <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-foreground/90">
                    {followUps.map((line, index) => (
                      <li key={`${item.id}-follow-${index}`}>{line}</li>
                    ))}
                  </ul>
                </section>

                {showGeneratedHint && (
                  <section className="rounded-lg border border-success/20 bg-success/5 px-4 py-3 text-xs text-foreground/80">
                    当前为 AI 深度解读结果，已使用模型 {deepDiveMeta(item)}。
                  </section>
                )}

                {showFallbackHint && (
                  <section className="rounded-lg border border-warning/20 bg-warning/5 px-4 py-3 text-xs text-foreground/80 space-y-1.5">
                    <p>当前未获得高质量 AI 解读，先展示规则版说明。</p>
                    {deepDive?.fallbackReason && (
                      <p className="text-warning/90">fallback reason: {deepDive.fallbackReason}</p>
                    )}
                  </section>
                )}

                {!deepDive && (
                  <section className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground leading-relaxed">
                    这条推荐已有基础判断，但还没有生成完整深度解读。可以稍后刷新推荐快照。
                  </section>
                )}

                <details className="rounded-lg border border-border bg-card px-4 py-3">
                  <summary className="cursor-pointer text-[11px] uppercase tracking-wide text-muted-foreground">
                    评分与系统判断
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-foreground/80">
                    <span>{metricLabel("Final", item.finalScore)}</span>
                    <span>{metricLabel("Signal", item.signalScore)}</span>
                    <span>{metricLabel("Evidence", item.evScore)}</span>
                    <span>{metricLabel("Recommendation", item.recommendationScore)}</span>
                    <span>Source {item.sourceStatus}</span>
                    <span>Tier {item.sourceTier}</span>
                  </div>
                  {item.qualityFlags.length > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      quality flags: {item.qualityFlags.join(" / ")}
                    </p>
                  )}
                  {inputDiag && (
                    <div className="mt-2 border-t border-border pt-2 text-[10px] text-muted-foreground/70 space-y-0.5">
                      <p>内容来源: {inputDiag.contentSource} · 摘要: {inputDiag.inputSummaryLength}字 · 全文: {inputDiag.inputFullContentLength}字</p>
                      <p>生成状态: {inputDiag.generationStatus} · 模型: {deepDiveMeta(item)}</p>
                      {inputDiag.fallbackReason && (
                        <p>fallback: {inputDiag.fallbackReason}</p>
                      )}
                    </div>
                  )}
                </details>
              </div>
            </div>

            <footer className="border-t border-border bg-background/95 px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">{sourceNotes}</p>
                <a
                  href={item.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/8 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
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
