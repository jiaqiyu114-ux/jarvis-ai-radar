"use client"

import { useState, useMemo } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ExternalLink, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { TIER_LABELS } from "@/lib/recommendations/recommendation-engine"
import type { RecommendedItem } from "@/lib/recommendations/recommendation-engine"
import type { RecommendationDeepDive } from "@/lib/recommendations/deep-dive"
import type { RelatedSignal } from "@/lib/recommendations/related-signals"
import { RELATION_TYPE_LABELS, TOPIC_DISPLAY_ZH } from "@/lib/recommendations/related-signals"
import { scoreBand, evidenceLevel } from "@/components/ui/score-band"

// ── Image filtering ───────────────────────────────────────────────────────────

// Keywords that indicate site decoration rather than article content images
const IMAGE_BLOCKLIST = [
  'logo', 'icon', 'favicon', 'avatar', 'sprite',
  'placeholder', 'default-image', 'banner-ad', '/ad/', '/ads/',
  'tracking', '1x1', 'spacer', 'blank', 'noimage', 'no-image',
  'header-image', 'site-logo', 'brand', 'fallback', 'dummy', 'sample',
  'ai-generated', 'generated-image', 'midjourney', 'dall-e', 'stable-diffusion',
  'cartoon', 'illustration', 'default-og', 'og-default', 'social-card',
]

const ARTICLE_MEDIA_HINTS = [
  '/wp-content/uploads/',
  '/uploads/',
  '/content/dam/',
  '/images/',
  '/image/',
  '/media/',
  '/assets/',
  '/static/',
  '/cdn-cgi/image/',
]

const IMAGE_EXTENSION_RE = /\.(?:avif|jpe?g|png|webp)$/i

function isLikelyOriginalArticleImage(url: string, source: "cover" | "media"): boolean {
  if (!url || !url.startsWith('http')) return false
  if (url.startsWith('data:')) return false

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  const low = `${parsed.hostname}${parsed.pathname}`.toLowerCase()
  if (IMAGE_BLOCKLIST.some(kw => low.includes(kw))) return false

  // Conservative: hide generic OG/social share images unless the URL clearly
  // lives in an article media path. The detail view should never show a guessed
  // or generated-looking image as evidence.
  const looksLikeSocialPreview = /(?:^|[/_-])(og|open-graph|social|share|card)(?:[._/-]|$)/i.test(parsed.pathname)
  const hasArticlePath = ARTICLE_MEDIA_HINTS.some(hint => low.includes(hint))
  const hasImageExtension = IMAGE_EXTENSION_RE.test(parsed.pathname)

  if (!hasImageExtension) return false
  if (looksLikeSocialPreview && !hasArticlePath) return false
  if (low.includes("nvidia") && /(cartoon|illustration|generated|social|share|og)/i.test(low)) return false

  return source === "media" ? (hasArticlePath || low.includes('/media/')) : hasArticlePath
}

function stripQuery(url: string): string {
  try { return new URL(url).origin + new URL(url).pathname }
  catch { return url }
}

/**
 * Pick a single best image for Signal Card.
 * Only shows images that look like original article/media assets. This is
 * intentionally conservative: an omitted image is better than a fake-looking
 * placeholder in a recommendation product.
 * Returns null when no suitable image is found.
 */
function pickSignalImage(
  coverImageUrl: string | null | undefined,
  mediaUrls: string[] | null | undefined,
): string | null {
  const seen = new Set<string>()

  function normalizeUrl(u: string | null | undefined): { url: string; key: string } | null {
    if (!u) return null
    const url = u.trim()
    if (!url) return null
    const key = stripQuery(url)
    return { url, key }
  }

  // Priority 1: explicit cover image
  const cover = normalizeUrl(coverImageUrl)
  if (cover && !seen.has(cover.key) && isLikelyOriginalArticleImage(cover.url, "cover")) {
    seen.add(cover.key)
    return cover.url
  }

  // Priority 2: first usable media URL
  for (const u of mediaUrls ?? []) {
    const result = normalizeUrl(u)
    if (!result || seen.has(result.key)) continue
    if (isLikelyOriginalArticleImage(result.url, "media")) {
      seen.add(result.key)
      return result.url
    }
  }

  return null
}

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
    case "full_article":      return { text: "原文正文", cls: "text-success border-success/35 bg-success/8" }
    case "extracted_article": return { text: "较长正文", cls: "text-emerald-600 border-emerald-400/35 bg-emerald-400/8 dark:text-emerald-400" }
    case "partial":           return { text: "部分正文", cls: "text-amber-600 border-amber-400/35 bg-amber-400/8 dark:text-amber-400" }
    case "rss_summary":       return { text: "RSS 摘要", cls: "text-amber-700 border-amber-400/35 bg-amber-400/8 dark:text-amber-500" }
    case "title_only":
    case "missing":           return { text: "仅标题", cls: "text-muted-foreground border-border bg-muted/40" }
    default:                  return null
  }
}

function deepDiveBadge(dd: RecommendationDeepDive | undefined): { text: string; cls: string } {
  if (!dd)                                                          return { text: "待深度处理", cls: "text-muted-foreground border-border bg-muted/40" }
  if (dd.status === "generated" && dd.model !== "deterministic-v1") return { text: "AI 深度解读", cls: "text-success border-success/35 bg-success/8" }
  if (dd.status === "fallback" || dd.model === "deterministic-v1")  return { text: "规则生成", cls: "text-warning border-warning/35 bg-warning/8" }
  return { text: "待深度处理", cls: "text-muted-foreground border-border bg-muted/40" }
}

// ── Sectioned reading view ────────────────────────────────────────────────────
// Splits the deep-dive into labeled blocks instead of one long run of prose,
// so the modal reads like a briefing: 这是什么 / 为什么重要 / 对我有什么用 /
// 风险和不确定性 / 后续可以看什么. Built ENTIRELY from existing fields — no
// backend change. Sections with no usable content are omitted.

type ReadingSection = { key: string; label: string; paras: string[] }

function buildReadingSections(
  dd: RecommendationDeepDive | undefined,
  item: RecommendedItem,
  displayCS: string | undefined,
  sumLen: number | undefined,
  fcLen: number | undefined,
): ReadingSection[] {
  const MIN = 12
  const seen = new Set<string>()
  const clean = (t: string | null | undefined) => (t ?? "").trim()
  const fresh = (t: string | null | undefined): string | null => {
    const v = clean(t)
    if (v.length < MIN) return null
    const key = v.slice(0, 60)
    if (seen.has(key)) return null
    seen.add(key)
    return v
  }
  const sections: ReadingSection[] = []
  const PARA_CAP = 2   // max paragraphs per section — keeps the modal scannable
  const add = (key: string, label: string, ...cands: (string | null | undefined)[]) => {
    const paras = cands.map(fresh).filter((v): v is string => v != null).slice(0, PARA_CAP)
    if (paras.length) sections.push({ key, label, paras })
  }

  add("what", "这是什么", dd?.whatHappened, dd?.context ?? item.summary)
  add("why", "为什么重要", dd?.whyItMatters)
  add("use", "对我有什么用", dd?.userValue || dd?.userInsight || dd?.userTakeaway)

  // Risk section — only show the AI's own uncertainty statement.
  // Removed: riskNote (often contains internal field references), qualityNote
  // (meta-commentary), and evidenceGaps (engineering audit data, not user-facing).
  const uncertainty = fresh(dd?.uncertainty)
  if (uncertainty) {
    sections.push({ key: "risk", label: "风险和不确定性", paras: [uncertainty] })
  }

  // Fallback: no structured content at all → show the summary as "这是什么"
  if (sections.length === 0) {
    const s = clean(item.summary || item.title)
    if (s) sections.push({ key: "what", label: "这是什么", paras: [s] })
  }
  return sections
}

function buildFollowUps(item: RecommendedItem): string[] {
  const dd = item.deepDive
  if (dd?.followUp && dd.followUp.length > 0) return dd.followUp.slice(0, 3)
  const raw = dd?.followUpSuggestion || item.nextStep || ""
  if (!raw) return []
  const lines = raw.split(/\r?\n|[;；]/g).map(l => l.trim()).filter(Boolean).slice(0, 3)
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

/** Single signal image with error-state hide — no broken image or empty space. */
function SignalImage({ url }: { url: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <div className="w-full overflow-hidden rounded-[20px] bg-muted/20" style={{ height: "200px", maxHeight: "220px" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        className="w-full h-full object-cover"
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
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
  if (!reason && !risk && !isFallback) return null
  return (
    <div className="border-l-[3px] pl-4 pr-2 py-0.5" style={{ borderColor: "rgba(255,122,48,0.36)" }}>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-2">
        系统批注
      </p>
      {reason && (
        <p className="text-[13px] leading-relaxed text-foreground/85">{reason}</p>
      )}
      {risk && (
        <p className={cn("text-[12px] leading-relaxed", reason ? "mt-1.5" : "")}>
          <span className="text-warning/90">{risk}</span>
        </p>
      )}
      {isFallback && (
        <p className="mt-2 text-[11px] text-muted-foreground/65">
          当前展示为规则生成说明，AI 深度解读暂未完成
          {model && model !== "deterministic-v1" ? ` · ${model}${provider ? ` / ${provider}` : ""}` : ""}。
        </p>
      )}
    </div>
  )
}

// ── Related Signals ───────────────────────────────────────────────────────────

const RELATION_LABELS_ZH: Partial<Record<string, string>> = {
  same_entity:    '同主体',
  same_company:   '同公司',
  same_product:   '同产品',
  same_topic:     '同主题',
  same_source:    '同信源',
  shared_keyword: '关键词',
  time_proximity: '时间近',
}

/** Build display tags from rich match metadata, falling back to relation types. */
function buildSignalTags(signal: RelatedSignal): string[] {
  const tags: string[] = []
  // Prefer specific company/product/topic labels over generic relation types
  for (const co of signal.matchedCompanies ?? []) { tags.push(co) }
  for (const pr of signal.matchedProducts  ?? []) { if (!tags.includes(pr)) tags.push(pr) }
  for (const t  of signal.matchedTopics    ?? []) { tags.push(TOPIC_DISPLAY_ZH[t] ?? t) }
  // If nothing specific, fall back to relation type labels
  if (tags.length === 0) {
    for (const rt of signal.relationTypes) {
      const label = RELATION_LABELS_ZH[rt] ?? RELATION_TYPE_LABELS[rt]
      if (label) tags.push(label)
    }
  }
  // Deduplicate and cap at 3
  return [...new Set(tags)].slice(0, 3)
}

function formatRelAge(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  try {
    const diff = Date.now() - new Date(dateStr).getTime()
    if (isNaN(diff) || diff < 0) return ''
    const h = diff / 3_600_000
    if (h < 1) return `${Math.round(diff / 60_000)}m前`
    if (h < 24) return `${Math.floor(h)}h前`
    const d = Math.round(h / 24)
    return d < 7 ? `${d}d前` : `${new Date(dateStr).getMonth()+1}/${new Date(dateStr).getDate()}`
  } catch { return '' }
}

function RelatedSignalRow({ signal, currentItemUrl }: { signal: RelatedSignal; currentItemUrl: string }) {
  if (signal.url && signal.url === currentItemUrl) return null
  const age    = formatRelAge(signal.publishedAt)
  const labels = buildSignalTags(signal)

  return (
    <div className="py-2.5 border-b border-border/40 last:border-b-0">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium text-foreground/85 leading-snug line-clamp-2 flex-1">
          {signal.title}
        </p>
        {signal.url && (
          <a
            href={signal.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-0.5 rounded border border-primary/20 bg-primary/6 px-1.5 py-0.5 text-[10px] text-primary/70 hover:text-primary transition-colors"
            onClick={e => e.stopPropagation()}
          >
            <ExternalLink className="h-2.5 w-2.5" />
            原文
          </a>
        )}
      </div>
      <div className="mt-1 flex items-center flex-wrap gap-1.5">
        {signal.sourceName && (
          <span className="text-[10px] text-muted-foreground/70 truncate max-w-[120px]">
            {signal.sourceName}
          </span>
        )}
        {age && (
          <span className="text-[10px] text-muted-foreground/50">{age}</span>
        )}
        {labels.map(l => (
          <span key={l} className="text-[10px] px-1 py-0.5 rounded border border-border/60 bg-muted/30 text-muted-foreground/70">
            {l}
          </span>
        ))}
      </div>
      {signal.reason && (
        <p className="mt-1 text-[11px] text-muted-foreground/60 leading-relaxed italic line-clamp-2">
          {signal.reason}
        </p>
      )}
    </div>
  )
}

function RelatedSignalsSection({ signals, currentItemUrl }: { signals: RelatedSignal[]; currentItemUrl: string }) {
  const [expanded, setExpanded] = useState(false)
  const valid = signals.filter(s => !s.url || s.url !== currentItemUrl)
  if (valid.length === 0) return null
  const displayed = expanded ? valid.slice(0, 5) : valid.slice(0, 3)
  const hasMore = valid.length > 3 && !expanded

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          相关信号
        </h4>
        <span className="text-[10px] text-muted-foreground/50">{valid.length} 条</span>
      </div>
      <div className="rounded-md border border-border/50 bg-muted/20 px-3">
        {displayed.map(sig => (
          <RelatedSignalRow key={sig.id} signal={sig} currentItemUrl={currentItemUrl} />
        ))}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1.5 w-full text-center text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          展开更多 ({valid.length - 3} 条)
        </button>
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
              {item.evScore != null    && <span>Evidence <span className="font-semibold">{item.evScore}</span></span>}
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
          {/* Daily gate metadata — only present when item was processed through refresh pipeline */}
          {(item.dailyGate || item.deliveryStatus || item.recommendationBucket) && (
            <div>
              <p className="text-muted-foreground/40 uppercase tracking-wider mb-1.5">Recommendation Gate</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-foreground/65">
                {item.recommendationBucket && (
                  <span>bucket <span className="font-semibold">{item.recommendationBucket}</span></span>
                )}
                {item.deliveryStatus && (
                  <span className={
                    item.deliveryStatus === 'new_today' ? 'text-success' :
                    item.deliveryStatus === 'previously_delivered' ? 'text-warning/80' : ''
                  }>
                    status <span className="font-semibold">{item.deliveryStatus}</span>
                  </span>
                )}
                {item.observeReason && (
                  <span>observeReason <span className="font-semibold">{item.observeReason}</span></span>
                )}
              </div>
              {item.dailyGate && (
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-foreground/50 text-[10px]">
                  <span>tz={item.dailyGate.timezone}</span>
                  <span>today={item.dailyGate.todayKey}</span>
                  <span>captured={item.dailyGate.capturedDateKey ?? "?"}</span>
                  <span>published={item.dailyGate.publishedDateKey ?? "?"}</span>
                  <span className={item.dailyGate.eligibleForToday ? 'text-success' : 'text-warning/80'}>
                    eligible={String(item.dailyGate.eligibleForToday)}
                  </span>
                  <span>reason={item.dailyGate.reason}</span>
                </div>
              )}
              {item.previousDelivery?.previouslyRecommended && (
                <p className="mt-0.5 text-warning/60 font-mono text-[10px]">
                  previously_delivered matchedBy={item.previousDelivery.matchedBy}
                </p>
              )}
            </div>
          )}
          {item.relatedSignals && item.relatedSignals.length > 0 && (
            <div>
              <p className="text-muted-foreground/40 uppercase tracking-wider mb-1.5">
                Related Signals ({item.relatedSignals.length})
              </p>
              <div className="space-y-2">
                {item.relatedSignals.map((sig, idx) => (
                  <div key={sig.id ?? idx} className="rounded border border-border/40 bg-muted/20 px-2.5 py-1.5 space-y-0.5">
                    <p className="text-foreground/75 font-mono text-[10px] truncate">{sig.title}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-mono text-foreground/50">
                      <span>score={sig.score}</span>
                      {(sig.matchedCompanies ?? []).length > 0 &&
                        <span>co={sig.matchedCompanies!.join(",")}</span>}
                      {(sig.matchedProducts ?? []).length > 0 &&
                        <span>pr={sig.matchedProducts!.join(",")}</span>}
                      {(sig.matchedTopics ?? []).length > 0 &&
                        <span>topics={sig.matchedTopics!.join(",")}</span>}
                      {(sig.matchedKeywords ?? []).length > 0 &&
                        <span>kw={sig.matchedKeywords!.join(",")}</span>}
                      {sig.sourceName && <span>src={sig.sourceName}</span>}
                      {sig.contentStatus && <span>cs={sig.contentStatus}</span>}
                    </div>
                    {sig.debug?.scoreBreakdown && Object.keys(sig.debug.scoreBreakdown).length > 0 && (
                      <p className="text-[10px] font-mono text-muted-foreground/40 truncate">
                        {Object.entries(sig.debug.scoreBreakdown).map(([k, v]) => `${k}:${v}`).join(" ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Evidence rail (§15.6) — source, evidence and system scores, NOT prose ─────

function RailRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[12px]">
      <span style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <span className="font-medium text-right" style={{ color: color ?? "var(--text-secondary)" }}>{value}</span>
    </div>
  )
}

function darkScoreColor(score: number): string {
  const cls = scoreBand(score).cls
  if (cls === "sb-red") return "var(--dg-red)"
  if (cls === "sb-orange") return "var(--dg-orange)"
  if (cls === "sb-gold") return "var(--dg-amber)"
  if (cls === "sb-blue") return "var(--dg-blue)"
  return "var(--text-muted)"
}

function darkEvidenceColor(label: string): string {
  if (label === "High") return "var(--dg-green)"
  if (label === "Medium") return "var(--dg-amber)"
  return "var(--text-muted)"
}

function RailScore({ label, value }: { label: string; value: number }) {
  const color = darkScoreColor(value)
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] w-14 shrink-0" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--overlay-3)" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
      </div>
      <span className="text-[12px] font-mono tabular-nums w-7 text-right" style={{ color }}>{value}</span>
    </div>
  )
}

function RailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5 border-t border-[color:var(--border-subtle)] pt-3.5 first:border-t-0 first:pt-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.10em]" style={{ color: "var(--text-muted)" }}>{title}</p>
      {children}
    </div>
  )
}

function EvidenceRail({
  item, dd, displayCS,
}: {
  item: RecommendedItem
  dd: RecommendationDeepDive | undefined
  displayCS: string | undefined
}) {
  const signals = item.relatedSignals?.length ?? 0
  const evidence = evidenceLevel({
    strongEvidence: item.qualityFlags.includes("strong_evidence"),
    evScore: item.evScore,
    signals,
    isOfficial: item.isOfficial,
  })
  const fullContent = displayCS === "full_article" ? "完整正文"
    : displayCS === "extracted_article" ? "较长正文"
    : displayCS === "partial" ? "部分正文"
    : "仅摘要"

  return (
    <div className="space-y-3.5 rounded-xl p-4"
         style={{
           background: "var(--bg-card-soft)",
           border: "1px solid var(--border-subtle)",
           boxShadow: "var(--shadow-soft)",
         }}>
      <RailGroup title="来源">
        <RailRow label="Provider" value={dd?.provider || "RSS"} />
        <RailRow label="Source" value={item.source} />
        <RailRow label="信源等级" value={`Tier ${item.sourceTier}`}
                 color={item.sourceTier === "S" ? "var(--dg-orange)" : item.sourceTier === "A" ? "var(--dg-cyan)" : "var(--text-secondary)"} />
        <RailRow label="官方源" value={item.isOfficial ? "是" : "否"}
                 color={item.isOfficial ? "var(--dg-amber)" : undefined} />
      </RailGroup>

      <RailGroup title="证据">
        <RailRow label="证据强度" value={evidence.label} color={darkEvidenceColor(evidence.label)} />
        <RailRow label="多源" value={signals > 0 ? `${signals} 个相关` : "暂无"} />
        <RailRow label="正文" value={fullContent} />
      </RailGroup>

      {(item.truthScore != null || item.evScore != null || item.signalScore != null) && (
        <RailGroup title="系统判断">
          {item.truthScore != null  && <RailScore label="真实" value={item.truthScore} />}
          {item.evScore != null     && <RailScore label="证据" value={item.evScore} />}
          {item.signalScore != null && <RailScore label="信号" value={item.signalScore} />}
          <RailScore label="综合" value={item.recommendationScore} />
        </RailGroup>
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

  const displayCS = contentStatus === "full_article" && (fcLen ?? 0) < 500 ? "rss_summary" : contentStatus

  const ddBadge = deepDiveBadge(dd)
  const csBadge = contentStatusBadge(displayCS, fcLen)
  const isFallback = dd?.status === "fallback" || dd?.model === "deterministic-v1"
  const isLlmGenerated = !!dd && dd.status === "generated" && dd.model !== "deterministic-v1"

  // Signal title derivation (memoized — item ref is stable during modal lifetime)
  const { signalTitle, originalTitleRef, signalDek, systemNoteReason } = useMemo(() => {
    const rawOneSentence = (dd?.oneSentence ?? "").trim()
    // Qualifier prefixes the AI uses when it lacks confidence — these make the title
    // read like a meta-comment, not an actual headline. Reject and fall back to original.
    const QUALIFIER_RE = /^(基于有限|基于|根据|仅基于|当前仅|分析显示|注意|由于|综合|鉴于)/
    const hasQualifier = QUALIFIER_RE.test(rawOneSentence)
    const useJudgment = (
      isLlmGenerated &&
      rawOneSentence.length > 20 &&
      rawOneSentence !== item.title &&
      !rawOneSentence.startsWith("该条目") &&
      !hasQualifier
    )
    return {
      signalTitle:      useJudgment ? rawOneSentence : item.title,
      originalTitleRef: useJudgment ? item.title : null,
      signalDek:        useJudgment ? "" : (item.recommendationReason || ""),
      systemNoteReason: useJudgment ? item.recommendationReason : "",
    }
  }, [dd, isLlmGenerated, item])

  // Sectioned reading view + follow-ups (memoized)
  const sections = useMemo(
    () => buildReadingSections(dd, item, displayCS, sumLen, fcLen),
    [dd, item, displayCS, sumLen, fcLen],
  )
  const followUps = useMemo(() => buildFollowUps(item), [item])

  // Single best signal image (memoized, filtered)
  const signalImage = useMemo(
    () => pickSignalImage(item.coverImageUrl, item.mediaUrls),
    [item.coverImageUrl, item.mediaUrls],
  )

  const age = formatAge(item.publishedAt)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Overlay: a calm scrim, not a heavy black fog */}
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          style={{ background: "rgba(8,8,14,0.62)" }}
        />

        {/* Content: strong dark glass reading surface, 1040px */}
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-[1040px] -translate-x-1/2 -translate-y-1/2 rounded-[28px] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          style={{
            background: "var(--bg-glass-strong)",
            border: "1px solid var(--border-subtle)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <DialogPrimitive.Title className="sr-only">{item.title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            推荐详情、证据强度、系统判断和后续观察方向。
          </DialogPrimitive.Description>

          {/* Close button */}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:text-foreground"
            style={{ borderColor: "var(--border-subtle)", background: "var(--overlay-3)" }}
            aria-label="关闭详情"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex h-[88vh] max-h-[88vh] flex-col">

            {/* ── HEADER (§15.3) — meta + actions only; title lives in body ── */}
            <header
              className="shrink-0 px-7 pt-5 pb-4"
              style={{
                borderBottom: "1px solid var(--border-subtle)",
                background: "var(--overlay-1)",
              }}
            >
              <div className="flex items-center justify-between gap-3 pr-10">
                <div className="flex items-center gap-2 text-[12px] min-w-0 flex-wrap" style={{ color: "var(--text-tertiary)" }}>
                  <span className="font-semibold truncate max-w-[200px]"
                        style={{ color: item.sourceTier === "S" ? "var(--dg-orange)" : item.sourceTier === "A" ? "var(--dg-cyan)" : "var(--text-secondary)" }}>
                    Source {item.sourceTier}
                  </span>
                  <span style={{ color: "var(--hairline)" }}>·</span>
                  <span className="truncate max-w-[200px]">{item.source}</span>
                  <span style={{ color: "var(--hairline)" }}>·</span>
                  <span>{item.category}</span>
                  {age && (<><span style={{ color: "rgba(255,255,255,0.18)" }}>·</span><span>{age}</span></>)}
                  {item.isOfficial && (<><span style={{ color: "rgba(255,255,255,0.18)" }}>·</span><span style={{ color: "var(--dg-amber)" }}>Official</span></>)}
                </div>
                <a
                  href={item.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass-btn glass-btn-primary shrink-0 text-[12px] py-1.5 px-3"
                  onClick={e => e.stopPropagation()}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  查看原文
                </a>
              </div>
            </header>

            {/* ── SCROLLABLE BODY ── */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-7 py-6">

                {/* Title block (§15.4) */}
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] font-semibold tracking-[0.04em]">
                  <span style={{ color: darkScoreColor(item.recommendationScore) }}>Score {item.recommendationScore}</span>
                  <span style={{ color: "var(--hairline)" }}>·</span>
                  <span style={{ color: "var(--text-secondary)" }}>{TIER_LABELS[item.recommendationTier]}</span>
                  <span style={{ color: "var(--hairline)" }}>·</span>
                  <span style={{ color: darkEvidenceColor(evidenceLevel({ strongEvidence: item.qualityFlags.includes("strong_evidence"), evScore: item.evScore, signals: item.relatedSignals?.length ?? 0, isOfficial: item.isOfficial }).label) }}>
                    Evidence {evidenceLevel({ strongEvidence: item.qualityFlags.includes("strong_evidence"), evScore: item.evScore, signals: item.relatedSignals?.length ?? 0, isOfficial: item.isOfficial }).label}
                  </span>
                </div>
                <h2 className="mt-2.5 max-w-[760px] pr-6 text-[20px] font-bold leading-[28px]" style={{ color: "var(--text-primary)", letterSpacing: "-0.012em" }}>
                  {signalTitle}
                </h2>
                {originalTitleRef && (
                  <p className="mt-1.5 text-[12px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
                    原文标题：{originalTitleRef}
                  </p>
                )}
                {signalDek && (
                  <p className="mt-2 text-[14px] leading-[22px]" style={{ color: "var(--text-secondary)" }}>
                    {signalDek}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge className={ddBadge.cls}>{ddBadge.text}</Badge>
                  {csBadge && <Badge className={csBadge.cls}>{csBadge.text}</Badge>}
                  {item.isUserCurated && (
                    <Badge className="text-teal-700 border-teal-400/35 bg-teal-400/8 dark:text-teal-400">我的来源</Badge>
                  )}
                </div>

                {/* Two-column: main reading (left, 680px) + evidence rail (right) */}
                <div className="mt-6 flex flex-col items-start gap-8 lg:flex-row">
                  {/* Main content — prose capped at 680px, line-height 1.7, 16px gaps */}
                  <div className="min-w-0 flex-1 space-y-7 lg:max-w-[680px]">
                    {signalImage && <SignalImage url={signalImage} />}

                    {sections.length > 0 ? (
                      sections.map(sec => (
                        <section key={sec.key} className="space-y-4">
                          <h3 className="text-[12px] font-semibold uppercase tracking-[0.10em]"
                              style={{ color: "var(--text-tertiary)" }}>
                            {sec.label}
                          </h3>
                          {sec.paras.map((para, i) => (
                            <p key={i} className="text-[14px] leading-[1.68]" style={{ color: "var(--text-secondary)" }}>
                              {para}
                            </p>
                          ))}
                        </section>
                      ))
                    ) : (
                      <p className="text-[14px] leading-[1.68]" style={{ color: "var(--text-secondary)" }}>
                        这条推荐已有基础判断，但还没有生成完整深度解读。可以稍后刷新推荐快照。
                      </p>
                    )}

                    {followUps.length > 0 && (
                      <section className="space-y-4">
                        <h3 className="text-[12px] font-semibold uppercase tracking-[0.10em]"
                            style={{ color: "var(--text-tertiary)" }}>
                          后续可以看什么
                        </h3>
                        <div className="space-y-3">
                          {followUps.map((line, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <span className="mt-[7px] shrink-0 text-[11px]" style={{ color: "rgba(110,168,255,0.7)" }}>▸</span>
                              <p className="text-[13.5px] leading-[1.65]" style={{ color: "var(--text-secondary)" }}>{line}</p>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    <SystemNote
                      reason={systemNoteReason}
                      risk=""
                      isFallback={isFallback}
                      model={dd?.model}
                      provider={dd?.provider}
                    />

                    {item.relatedSignals && item.relatedSignals.length > 0 && (
                      <RelatedSignalsSection
                        signals={item.relatedSignals}
                        currentItemUrl={item.originalUrl}
                      />
                    )}
                  </div>

                  {/* Evidence rail */}
                  <aside className="w-full shrink-0 lg:sticky lg:top-5 lg:w-[280px]">
                    <EvidenceRail item={item} dd={dd} displayCS={displayCS} />
                  </aside>
                </div>

                {/* AUDIT DRAWER — full width at the bottom (§15.7) */}
                <div className="mt-7">
                  <AuditDrawer item={item} dd={dd} />
                </div>
              </div>
            </div>

          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
