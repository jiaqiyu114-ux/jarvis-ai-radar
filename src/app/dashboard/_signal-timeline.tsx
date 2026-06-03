"use client"

import { useState, useEffect, type KeyboardEvent } from "react"
import { ExternalLink, ArrowUpRight, Zap, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RecommendedItem } from "@/lib/recommendations/recommendation-engine"
import type { TimelineGroup } from "@/lib/recommendations/signal-timeline"
import { RecommendationDetailModal } from "./_recommendation-detail-modal"
import { scoreBand, evidenceLevel } from "@/components/ui/score-band"
import { cleanDisplayText, safeSourceName } from "@/lib/text/decode-html"
import { ClientRelativeTime } from "@/components/time/client-relative-time"

// Source-tier accent colors
const TIER_COLOR: Record<string, string> = {
  S: "var(--accent-orange)", A: "var(--accent-blue)",
  B: "var(--text-tertiary)",  C: "var(--text-muted)", D: "var(--text-muted)",
}

// Recommendation tier → Chinese label + style
const TIER_BADGE: Record<string, { label: string; cls: string }> = {
  must_read:  { label: "必看",  cls: "tl-tier-must" },
  high_value: { label: "高价值", cls: "tl-tier-hv" },
  observe:    { label: "观察",  cls: "tl-tier-obs" },
}

// Evidence level → colored label
const EV_STYLE: Record<string, string> = {
  High:   "var(--accent-lime)",
  Medium: "var(--accent-gold)",
  Low:    "var(--text-muted)",
}

// Known valid categories — anything else falls back to 其他
const KNOWN_CATEGORIES = new Set([
  "AI技术","商业动态","产品发布","监管政策","融资并购",
  "行业趋势","开源项目","研究报告","人物动态","其他",
])

function cleanCategory(raw: string | undefined | null): string {
  if (!raw) return "其他"
  const cleaned = raw.replace(/&[^;]+;/g,"").replace(/\?+/g,"").trim()
  if (!cleaned || cleaned.length < 2) return "其他"
  if (KNOWN_CATEGORIES.has(cleaned)) return cleaned
  for (const cat of KNOWN_CATEGORIES) {
    if (cleaned.startsWith(cat) || cat.startsWith(cleaned)) return cat
  }
  return cleaned
}

/** Live "现在" marker */
function NowMarker() {
  const [now, setNow] = useState("")
  useEffect(() => {
    const tick = () =>
      setNow(new Date().toLocaleTimeString("zh-CN", { hour:"2-digit", minute:"2-digit", hour12: false }))
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="tl-now">
      <span className="tl-now-time">{now || "现在"}</span>
      <span className="tl-now-dot" />
      <span className="tl-now-label">现在 · 实时信号</span>
    </div>
  )
}

/** Empty nudge when no today signals exist */
function TodayEmptyState() {
  return (
    <div className="tl-today-empty">
      <div />
      <p className="tl-today-empty-msg">今日暂无新信号 · 昨日数据展示如下</p>
    </div>
  )
}

function TimelineRow({ item, timeLabel }: { item: RecommendedItem; timeLabel: string }) {
  const [open, setOpen] = useState(false)
  const band      = scoreBand(item.recommendationScore)
  const title     = cleanDisplayText(item.title)
  const summary   = cleanDisplayText(item.summary)
  const source    = safeSourceName(item.source, item.originalUrl)
  const category  = cleanCategory(item.category as string | undefined)
  const tierColor = TIER_COLOR[item.sourceTier] ?? "var(--text-muted)"
  const tierBadge = TIER_BADGE[item.recommendationTier ?? "observe"]
  const signals   = item.relatedSignals?.length ?? 0
  const evidence  = evidenceLevel({
    strongEvidence: item.qualityFlags?.includes("strong_evidence"),
    evScore:        item.evScore,
    signals,
    isOfficial:     item.isOfficial,
  })
  const evColor   = EV_STYLE[evidence.label] ?? "var(--text-muted)"
  const tags      = (item.tags ?? []).slice(0, 2)

  const openDetail = () => setOpen(true)
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail() }
  }

  return (
    <>
      <article className="tl-row" role="button" tabIndex={0}
               onClick={openDetail} onKeyDown={onKey}
               aria-label={`打开解读：${title}`}>
        <div className="tl-rail">
          <span className="tl-time">{timeLabel}</span>
          <span className="tl-time-rel">
            <ClientRelativeTime value={item.publishedAt ?? item.fetchedAt} fallback="" />
          </span>
        </div>
        <span className={cn("tl-dot", band.cls)} aria-hidden />

        <div className={cn("tl-card", band.cls)}>
          <span className={cn("tl-score", band.cls)}>{item.recommendationScore}</span>

          {/* Top meta row */}
          <div className="tl-meta">
            <span className="font-semibold" style={{ color: tierColor }}>Source {item.sourceTier}</span>
            <span className="tl-sep">·</span>
            <span>{category}</span>
            {/* Tier badge */}
            {tierBadge && (
              <span className={cn("tl-tier-badge", tierBadge.cls)}>{tierBadge.label}</span>
            )}
            {/* Multi-source resonance */}
            {signals > 1 && (
              <span className="tl-resonance">
                <Users className="h-2.5 w-2.5" /> {signals} 源
              </span>
            )}
          </div>

          <h3 className="tl-title">{title}</h3>

          {summary && <p className="tl-summary">{summary}</p>}

          {/* Rich footer */}
          <div className="tl-foot">
            <span className="tl-source">{source}</span>
            {/* Evidence level */}
            <span className="tl-ev" style={{ color: evColor }}>
              Evidence {evidence.label}
            </span>
            {/* Tags */}
            {tags.length > 0 && (
              <span className="tl-tags">
                {tags.map(t => <span key={t} className="tl-tag">{t}</span>)}
              </span>
            )}
            <a href={item.originalUrl} target="_blank" rel="noopener noreferrer"
               onClick={e => e.stopPropagation()} className="tl-link">
              <ExternalLink className="h-3 w-3" /> 原文
            </a>
            <span className="tl-open" onClick={openDetail}>
              解读 <ArrowUpRight className="h-3 w-3" />
            </span>
          </div>
        </div>
      </article>

      <RecommendationDetailModal item={item} open={open} onOpenChange={setOpen} />
    </>
  )
}

export function SignalTimeline({ groups }: { groups: TimelineGroup[] }) {
  if (groups.length === 0) return null
  const hasTodayEntries = groups[0]?.label === "今天" && groups[0].entries.length > 0
  return (
    <div className="tl">
      <NowMarker />
      {!hasTodayEntries && <TodayEmptyState />}
      {groups.map(group => (
        <section key={group.key} className="tl-group">
          <div className="tl-group-head">
            <span className="tl-group-label">{group.label}</span>
            <span className="tl-group-count">{group.entries.length} 条</span>
          </div>
          <div className="tl-entries">
            {group.entries.map(entry => (
              <TimelineRow key={entry.item.id} item={entry.item} timeLabel={entry.timeLabel} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
