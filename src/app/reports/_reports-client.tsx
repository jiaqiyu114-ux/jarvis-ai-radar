"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ExternalLink, ArrowUpRight, ChevronLeft, ChevronRight, RefreshCw, ChevronDown } from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import type { TopSignalData } from "@/components/layout/app-shell"
import type {
  DailyRecommendationSnapshot,
  DailyRecommendationSnapshotItem,
} from "@/lib/data/daily-recommendation-snapshot"
import { scoreBand } from "@/components/ui/score-band"
import { cleanDisplayText, safeSourceName } from "@/lib/text/decode-html"

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  snapshot:    DailyRecommendationSnapshot
  topSignal?:  TopSignalData
  today:       string   // YYYY-MM-DD
  viewingDate: string
  prevDate:    string
  nextDate:    string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const WEEKDAYS = ["周日","周一","周二","周三","周四","周五","周六"]

function formatDate(dateKey: string): string {
  // YYYY-MM-DD → M月D日 周X
  try {
    const [, m, d] = dateKey.split("-")
    const wd = new Date(dateKey + "T12:00:00Z").getUTCDay()
    return `${Number(m)}月${Number(d)}日 ${WEEKDAYS[wd]}`
  } catch {
    return dateKey
  }
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`
  } catch { return "—" }
}

function relativeAge(iso: string | null | undefined): string {
  if (!iso) return ""
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m前`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h前`
  const d = Math.floor(ms / 86_400_000)
  return `${d}d前`
}

// A recommendation reason is worth showing only if it's specific (not generic template).
const GENERIC_FRAGMENTS = [
  "综合价值初步达标",
  "适合今日轻量浏览",
  "信息价值暂未达入选重点",
  "综合价值",
  "初步达标",
]
function isSpecificReason(reason: string): boolean {
  if (!reason || reason.length < 20) return false
  return !GENERIC_FRAGMENTS.some(f => reason.includes(f))
}

// ── Score chip ────────────────────────────────────────────────────────────────

function ScoreChip({ score, size = "md" }: { score: number; size?: "sm" | "md" }) {
  const band = scoreBand(score)
  const sz = size === "sm" ? { width: 32, height: 32, fontSize: 12 } : { width: 38, height: 38, fontSize: 14 }
  return (
    <span
      className={band.cls}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: sz.width, height: sz.height, minWidth: sz.width,
        borderRadius: 10,
        fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: sz.fontSize,
        fontVariantNumeric: "tabular-nums",
        flexShrink: 0,
      }}
    >
      {score}
    </span>
  )
}

// ── Category tag ──────────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, { color: string; bg: string }> = {
  "AI技术":   { color: "var(--accent-blue)",   bg: "color-mix(in srgb, var(--accent-blue) 12%, transparent)" },
  "商业动态": { color: "var(--accent-lime)",    bg: "color-mix(in srgb, var(--accent-lime) 12%, transparent)" },
  "产品发布": { color: "var(--accent-cyan)",    bg: "color-mix(in srgb, var(--accent-cyan) 12%, transparent)" },
  "监管政策": { color: "var(--accent-gold)",    bg: "color-mix(in srgb, var(--accent-gold) 12%, transparent)" },
  "融资并购": { color: "var(--accent-gold)",    bg: "color-mix(in srgb, var(--accent-gold) 12%, transparent)" },
  "行业趋势": { color: "var(--accent-purple)",  bg: "color-mix(in srgb, var(--accent-purple) 12%, transparent)" },
  "开源项目": { color: "var(--accent-lime)",    bg: "color-mix(in srgb, var(--accent-lime) 12%, transparent)" },
  "研究报告": { color: "var(--text-tertiary)",  bg: "var(--overlay-2)" },
  "人物动态": { color: "var(--dg-red)",         bg: "color-mix(in srgb, var(--dg-red) 12%, transparent)" },
}

function CatTag({ cat }: { cat: string }) {
  const c = CAT_COLORS[cat] ?? { color: "var(--text-tertiary)", bg: "var(--overlay-2)" }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "1px 7px", borderRadius: 6,
      fontSize: 11, fontWeight: 600,
      color: c.color, background: c.bg,
    }}>
      {cat}
    </span>
  )
}

// ── Report card (must_read — large) ──────────────────────────────────────────

function MustReadCard({ item }: { item: DailyRecommendationSnapshotItem }) {
  const title  = cleanDisplayText(item.title)
  const summary = cleanDisplayText(item.summary)
  const source = safeSourceName(item.source, item.originalUrl)
  const reason = isSpecificReason(item.recommendationReason) ? item.recommendationReason : null
  const age    = relativeAge(item.publishedAt ?? item.fetchedAt)
  const cat    = (item.category as string) || "其他"

  return (
    <article
      style={{
        padding: "18px 20px", borderRadius: 14,
        background: "var(--grad-card)",
        border: "1px solid color-mix(in srgb, var(--primary-color) 20%, var(--border-subtle))",
        boxShadow: "var(--shadow-soft)",
      }}
    >
      {/* Top row: category + time + score */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <CatTag cat={cat} />
        {age && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{age}</span>}
        <span style={{ marginLeft: "auto" }}>
          <ScoreChip score={item.finalScore} />
        </span>
      </div>

      {/* Title */}
      <h3 style={{
        fontSize: 17, fontWeight: 700, lineHeight: 1.4,
        color: "var(--text-primary)", letterSpacing: "-0.01em",
        marginBottom: 8, paddingRight: 4,
      }}>
        {title}
      </h3>

      {/* Recommendation reason */}
      {reason && (
        <div style={{
          padding: "7px 10px", borderRadius: 8,
          background: "var(--primary-soft)",
          border: "1px solid color-mix(in srgb, var(--primary-color) 18%, transparent)",
          marginBottom: 8,
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--primary-on-soft)", marginRight: 6 }}>推荐理由</span>
          <span style={{ fontSize: 12, color: "var(--primary-on-soft)", opacity: 0.85 }}>{reason}</span>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <p style={{
          fontSize: 13.5, lineHeight: 1.6,
          color: "var(--text-secondary)",
          display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
          overflow: "hidden", marginBottom: 12,
        }}>
          {summary}
        </p>
      )}

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
          {source}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Source {item.sourceTier}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <a
            href={item.originalUrl} target="_blank" rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              padding: "5px 11px", borderRadius: 8,
              fontSize: 12, fontWeight: 600,
              color: "var(--text-secondary)",
              background: "var(--overlay-2)", border: "1px solid var(--border-subtle)",
            }}
          >
            <ExternalLink size={12} /> 原文
          </a>
        </div>
      </div>
    </article>
  )
}

// ── Report card (high_value — standard) ──────────────────────────────────────

function HighValueCard({ item }: { item: DailyRecommendationSnapshotItem }) {
  const title   = cleanDisplayText(item.title)
  const summary = cleanDisplayText(item.summary)
  const source  = safeSourceName(item.source, item.originalUrl)
  const age     = relativeAge(item.publishedAt ?? item.fetchedAt)
  const cat     = (item.category as string) || "其他"

  return (
    <article
      style={{
        padding: "14px 16px", borderRadius: 12,
        background: "var(--grad-card)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "var(--shadow-soft)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <ScoreChip score={item.finalScore} size="sm" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
            <CatTag cat={cat} />
            {age && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{age}</span>}
          </div>
          <h3 style={{
            fontSize: 15, fontWeight: 650, lineHeight: 1.4,
            color: "var(--text-primary)", marginBottom: 5,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            {title}
          </h3>
          {summary && (
            <p style={{
              fontSize: 12.5, lineHeight: 1.55, color: "var(--text-secondary)",
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
              marginBottom: 8,
            }}>
              {summary}
            </p>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{source}</span>
            <a
              href={item.originalUrl} target="_blank" rel="noopener noreferrer"
              style={{
                marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 3,
                padding: "3px 9px", borderRadius: 7,
                fontSize: 11, fontWeight: 600,
                color: "var(--text-tertiary)", background: "var(--overlay-2)", border: "1px solid var(--border-subtle)",
              }}
            >
              <ExternalLink size={11} /> 原文
            </a>
          </div>
        </div>
      </div>
    </article>
  )
}

// ── Observe row (compact, collapsible list) ───────────────────────────────────

function ObserveRow({ item }: { item: DailyRecommendationSnapshotItem }) {
  const title  = cleanDisplayText(item.title)
  const source = safeSourceName(item.source, item.originalUrl)
  const band   = scoreBand(item.finalScore)
  const age    = relativeAge(item.publishedAt ?? item.fetchedAt)
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0",
                  borderBottom: "1px solid var(--border-subtle)" }}>
      <span style={{
        fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 12,
        width: 28, textAlign: "right", flexShrink: 0,
        color: band.cls === "sb-orange" ? "var(--accent-orange)"
             : band.cls === "sb-gold" ? "var(--accent-gold)"
             : "var(--text-muted)",
      }}>{item.finalScore}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-secondary)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </p>
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{source} · {age}</p>
      </div>
      <a href={item.originalUrl} target="_blank" rel="noopener noreferrer"
         style={{ flexShrink: 0, fontSize: 11, color: "var(--text-muted)" }}>
        <ExternalLink size={12} />
      </a>
    </div>
  )
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionLabel({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.10em",
                     color: "var(--text-tertiary)" }}>
        {label}
      </span>
      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{count} 条</span>
    </div>
  )
}

// ── Category distribution ─────────────────────────────────────────────────────

function buildCatDist(items: DailyRecommendationSnapshotItem[]) {
  const map = new Map<string, number>()
  for (const item of items) {
    const c = (item.category as string) || "其他"
    map.set(c, (map.get(c) ?? 0) + 1)
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
}

// ── Generate button ───────────────────────────────────────────────────────────

function GenerateButton({ isToday }: { isToday: boolean }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [msg, setMsg]         = useState<string | null>(null)

  async function generate() {
    setLoading(true)
    setMsg(null)
    try {
      const res = await fetch("/api/today/recommendations/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: false }),
      })
      const data = await res.json() as { ok: boolean; error?: string; selectedCount?: number }
      if (data.ok) {
        setMsg(`生成完成，精选 ${data.selectedCount ?? 0} 条`)
        setTimeout(() => router.refresh(), 800)
      } else {
        setMsg(`失败：${data.error ?? "未知错误"}`)
      }
    } catch (e) {
      setMsg(`网络错误：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button
        type="button" onClick={generate} disabled={loading}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "7px 16px", borderRadius: 10,
          fontSize: 13, fontWeight: 600,
          color: "#fff",
          background: loading ? "var(--text-muted)" : "var(--primary-color)",
          border: "none", cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.7 : 1,
        }}
      >
        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        {loading ? "生成中…" : isToday ? "重新生成今日日报" : "生成今日日报"}
      </button>
      {msg && (
        <span style={{ fontSize: 12, color: msg.startsWith("失败") || msg.startsWith("网络") ? "var(--dg-red)" : "var(--accent-lime)" }}>
          {msg}
        </span>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReportsClient({ snapshot, topSignal, today, viewingDate, prevDate, nextDate }: Props) {
  const { run, grouped, items } = snapshot
  const [observeOpen, setObserveOpen] = useState(false)

  const mustRead    = grouped.must_read
  const highValue   = grouped.high_value
  const observe     = grouped.observe
  const catDist     = buildCatDist(items)
  const isToday     = viewingDate === today
  const hasData     = items.length > 0
  const isStale     = !isToday && hasData

  const generatedAt = run?.generated_at ? formatTime(run.generated_at) : null
  const dateLabel   = formatDate(viewingDate)

  return (
    <AppShell topSignal={topSignal}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 28px" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 24 }}>

          {/* Date navigation */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <Link
              href={`/reports?date=${prevDate}`}
              style={{
                display: "inline-flex", alignItems: "center", padding: "5px 9px",
                borderRadius: 8, border: "1px solid var(--border-subtle)",
                background: "var(--overlay-2)", color: "var(--text-tertiary)",
              }}
            >
              <ChevronLeft size={15} />
            </Link>

            <span style={{
              fontSize: 13, fontWeight: 700, color: "var(--text-secondary)",
              padding: "4px 12px", borderRadius: 8,
              background: "var(--overlay-2)", border: "1px solid var(--border-subtle)",
            }}>
              {dateLabel}
            </span>

            {nextDate ? (
              <Link
                href={`/reports?date=${nextDate}`}
                style={{
                  display: "inline-flex", alignItems: "center", padding: "5px 9px",
                  borderRadius: 8, border: "1px solid var(--border-subtle)",
                  background: "var(--overlay-2)", color: "var(--text-tertiary)",
                }}
              >
                <ChevronRight size={15} />
              </Link>
            ) : (
              <span style={{
                display: "inline-flex", alignItems: "center", padding: "5px 9px",
                borderRadius: 8, border: "1px solid var(--border-subtle)",
                background: "var(--overlay-1)", color: "var(--text-muted)", opacity: 0.4,
              }}>
                <ChevronRight size={15} />
              </span>
            )}

            {/* Status badge */}
            {isToday ? (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
                background: "color-mix(in srgb, var(--accent-lime) 14%, transparent)",
                color: "var(--accent-lime)",
                border: "1px solid color-mix(in srgb, var(--accent-lime) 28%, transparent)",
              }}>今日</span>
            ) : hasData ? (
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999,
                background: "var(--overlay-2)", color: "var(--text-muted)",
                border: "1px solid var(--border-subtle)",
              }}>历史</span>
            ) : null}

            {/* Jump to today */}
            {!isToday && (
              <Link href="/reports" style={{
                marginLeft: 4, fontSize: 12, color: "var(--primary-on-soft)",
                textDecoration: "underline",
              }}>
                回到今日 →
              </Link>
            )}
          </div>

          {/* Title */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <p className="page-kicker" style={{ marginBottom: 4 }}>每日简报 · Daily Brief</p>
              <h1 className="editorial-title">
                {hasData ? (isToday ? "今日日报" : "历史日报") : "暂无日报"}
              </h1>
              {generatedAt && (
                <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 4 }}>
                  生成于 {generatedAt} · 候选 {run?.total_candidates ?? 0} 条 · 精选 {run?.selected_count ?? 0} 条
                </p>
              )}
            </div>

            {/* Generate CTA */}
            {(!hasData || !isToday) && (
              <GenerateButton isToday={isToday} />
            )}
          </div>
        </div>

        {/* ── No data empty state ── */}
        {!hasData && (
          <div style={{
            borderRadius: 14, padding: "48px 0", textAlign: "center",
            border: "1px dashed var(--border-strong)",
            background: "var(--overlay-1)",
          }}>
            <p style={{ fontSize: 15, color: "var(--text-secondary)", fontWeight: 500 }}>
              {viewingDate === today ? "今日日报尚未生成" : "该日期暂无日报记录"}
            </p>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
              {viewingDate === today
                ? "点击上方「生成今日日报」按钮，基于今日已抓取信号生成简报。"
                : "该日期的信号未达到生成日报的最低条件，或快照未生成。"}
            </p>
          </div>
        )}

        {/* ── Main body (two-column) ── */}
        {hasData && (
          <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>

            {/* ══ LEFT: sections ══ */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 28 }}>

              {/* 必看 */}
              {mustRead.length > 0 && (
                <section>
                  <SectionLabel color="var(--dg-red)" label="今日必看" count={mustRead.length} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {mustRead.map(item => <MustReadCard key={item.id} item={item} />)}
                  </div>
                </section>
              )}

              {/* 高价值 */}
              {highValue.length > 0 && (
                <section>
                  <SectionLabel color="var(--accent-orange)" label="高价值精选" count={highValue.length} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {highValue.map(item => <HighValueCard key={item.id} item={item} />)}
                  </div>
                </section>
              )}

              {/* 观察（折叠） */}
              {observe.length > 0 && (
                <section>
                  <button
                    type="button"
                    onClick={() => setObserveOpen(v => !v)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      background: "none", border: "none", cursor: "pointer",
                      padding: "0 0 12px 0", width: "100%",
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--text-muted)", flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                                   letterSpacing: "0.10em", color: "var(--text-tertiary)" }}>
                      观察名单
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{observe.length} 条</span>
                    <ChevronDown
                      size={14}
                      style={{
                        marginLeft: "auto", color: "var(--text-muted)",
                        transform: observeOpen ? "rotate(180deg)" : "none",
                        transition: "transform 0.18s",
                      }}
                    />
                  </button>
                  {observeOpen && (
                    <div style={{
                      padding: "4px 12px 4px", borderRadius: 12,
                      background: "var(--overlay-1)", border: "1px solid var(--border-subtle)",
                    }}>
                      {observe.map(item => <ObserveRow key={item.id} item={item} />)}
                    </div>
                  )}
                </section>
              )}

              {/* All-empty */}
              {mustRead.length === 0 && highValue.length === 0 && observe.length === 0 && (
                <div style={{ textAlign: "center", padding: "32px 0" }}>
                  <p style={{ fontSize: 14, color: "var(--text-muted)" }}>本次快照暂无推荐条目</p>
                </div>
              )}
            </div>

            {/* ══ RIGHT: sidebar ══ */}
            <div style={{ width: 260, flexShrink: 0, position: "sticky", top: 16, display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Quick stats */}
              <div style={{
                padding: "14px 16px", borderRadius: 12,
                background: "var(--grad-card)", border: "1px solid var(--border-subtle)",
                boxShadow: "var(--shadow-soft)",
              }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                            letterSpacing: "0.10em", color: "var(--text-tertiary)", marginBottom: 10 }}>
                  本日摘要
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[
                    { label: "必看",   val: mustRead.length,  color: "var(--dg-red)" },
                    { label: "高价值", val: highValue.length, color: "var(--accent-orange)" },
                    { label: "观察",   val: observe.length,   color: "var(--text-muted)" },
                    { label: "候选池", val: run?.total_candidates ?? 0, color: "var(--accent-blue)" },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{
                      padding: "8px 10px", borderRadius: 8,
                      background: "var(--overlay-2)", border: "1px solid var(--border-subtle)",
                    }}>
                      <p style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--font-mono)",
                                  fontVariantNumeric: "tabular-nums", color, lineHeight: 1 }}>
                        {val}
                      </p>
                      <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>{label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Category distribution (only if >1 category) */}
              {catDist.length > 1 && (
                <div style={{
                  padding: "14px 16px", borderRadius: 12,
                  background: "var(--grad-card)", border: "1px solid var(--border-subtle)",
                  boxShadow: "var(--shadow-soft)",
                }}>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                              letterSpacing: "0.10em", color: "var(--text-tertiary)", marginBottom: 10 }}>
                    内容方向
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {catDist.map(([cat, count]) => (
                      <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <CatTag cat={cat} />
                        <div style={{ flex: 1, height: 3, borderRadius: 2, background: "var(--overlay-3)", overflow: "hidden" }}>
                          <div style={{
                            height: "100%", borderRadius: 2,
                            width: `${Math.round((count / catDist[0][1]) * 100)}%`,
                            background: CAT_COLORS[cat]?.color ?? "var(--text-muted)",
                          }} />
                        </div>
                        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)",
                                       color: "var(--text-muted)", width: 16, textAlign: "right" }}>
                          {count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Snapshot meta */}
              {run && (
                <div style={{
                  padding: "12px 16px", borderRadius: 12,
                  background: "var(--overlay-1)", border: "1px solid var(--border-subtle)",
                }}>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                              letterSpacing: "0.10em", color: "var(--text-tertiary)", marginBottom: 8 }}>
                    快照信息
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "var(--text-muted)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>生成时间</span>
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{generatedAt}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>时间窗口</span>
                      <span style={{ color: "var(--text-secondary)" }}>00:00 – 24:00</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>筛选率</span>
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                        {run.total_candidates > 0 ? Math.round((run.selected_count / run.total_candidates) * 100) : 0}%
                      </span>
                    </div>
                  </div>
                  {isStale && (
                    <p style={{ fontSize: 10, color: "var(--accent-gold)", marginTop: 8 }}>
                      ⚠ 非今日快照
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
