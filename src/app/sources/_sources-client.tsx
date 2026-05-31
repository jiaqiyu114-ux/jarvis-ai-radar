"use client"

import { useMemo, useState } from "react"
import { AppShell } from "@/components/layout/app-shell"
import { SourceTierBadge } from "@/components/feed/source-tier-badge"
import { SourceOriginBadge } from "@/components/sources/source-origin-badge"
import { cn } from "@/lib/utils"
import type { SourceWithHealth } from "@/lib/data/sources-adapter"
import type { SourceHealthStatus } from "@/types/database"

// ── Health badge ──────────────────────────────────────────────────────────────

const HEALTH_STYLE: Record<SourceHealthStatus, string> = {
  healthy:  "bg-success/10 text-success border-success/25",
  degraded: "bg-warning/10 text-warning border-warning/25",
  failing:  "bg-danger/10 text-danger border-danger/25",
  blocked:  "bg-danger/10 text-danger border-danger/25",
  unknown:  "bg-muted text-muted-foreground border-border",
}

const HEALTH_LABEL: Record<SourceHealthStatus, string> = {
  healthy:  "正常",
  degraded: "不稳定",
  failing:  "连续失败",
  blocked:  "已屏蔽",
  unknown:  "未检测",
}

const HEALTH_DOT: Record<SourceHealthStatus, string> = {
  healthy:  "bg-success",
  degraded: "bg-warning",
  failing:  "bg-danger",
  blocked:  "bg-danger",
  unknown:  "bg-muted-foreground",
}

const FETCH_STATUS_LABEL: Record<string, string> = {
  success:     "成功",
  failed:      "失败",
  timeout:     "超时",
  aborted:     "中断",
  parse_error: "解析失败",
  db_error:    "写入失败",
}

function fetchStatusLabel(status: string | null): string {
  if (!status) return "—"
  return FETCH_STATUS_LABEL[status] ?? status
}

function HealthBadge({ status, isRss }: { status: SourceHealthStatus; isRss: boolean }) {
  if (!isRss) return <span className="text-[10px] text-muted-foreground/40">—</span>
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full border font-medium",
      HEALTH_STYLE[status] ?? HEALTH_STYLE.unknown,
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full", HEALTH_DOT[status] ?? HEALTH_DOT.unknown)} />
      {HEALTH_LABEL[status] ?? status}
    </span>
  )
}

// ── Filter types ──────────────────────────────────────────────────────────────

type FilterKey = "all" | "my" | "official" | "rss" | "failing" | "blocked"

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",      label: "全部" },
  { key: "my",       label: "我的源" },
  { key: "official", label: "官方源" },
  { key: "rss",      label: "RSS" },
  { key: "failing",  label: "失败" },
  { key: "blocked",  label: "被屏蔽" },
]

function applyFilter(sources: SourceWithHealth[], filter: FilterKey): SourceWithHealth[] {
  switch (filter) {
    case "my":       return sources.filter(s => s.isUserCurated)
    case "official": return sources.filter(s => s.isOfficial)
    case "rss":      return sources.filter(s => s.platform === "rss")
    case "failing":  return sources.filter(s => s.healthStatus === "failing" || s.healthStatus === "degraded")
    case "blocked":  return sources.filter(s => s.isBlocked)
    default:         return sources
  }
}

// ── Source row ────────────────────────────────────────────────────────────────

function SourceRow({ source }: { source: SourceWithHealth }) {
  const isRss  = source.platform === "rss"
  const isDemo = source.dataOrigin === "demo"

  return (
    <tr className={cn(
      "border-b border-border last:border-0 transition-colors hover:bg-accent",
      isDemo            && "opacity-60",
      source.isBlocked  && "opacity-50",
      source.isUserCurated && "border-l-2 border-l-teal-500/60",
    )}>
      {/* Name + URL */}
      <td className="px-5 py-3.5">
        <div className="flex items-start gap-2 flex-wrap">
          <p className={cn(
            "text-sm font-medium",
            isDemo ? "text-muted-foreground" : "text-foreground",
          )}>
            {source.name}
          </p>
          <SourceOriginBadge
            isUserCurated={source.isUserCurated}
            isOfficial={source.isOfficial}
            sourceBadgeVariant={source.sourceBadgeVariant}
            size="xs"
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[220px] truncate">
          {source.url}
        </p>
        {source.userSourceNote && (
          <p className="text-[10px] text-teal-600/70 dark:text-teal-400/60 mt-0.5 max-w-[260px] line-clamp-2">
            {source.userSourceNote}
          </p>
        )}
        {source.isBlocked && (
          <span className="text-[9px] text-danger font-medium">BLOCKED</span>
        )}
        {isDemo && (
          <span className="text-[9px] text-muted-foreground/50 font-medium">DEMO</span>
        )}
      </td>

      {/* Platform */}
      <td className="px-4 py-3.5">
        <span className={cn(
          "text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase",
          source.platform === "rss"
            ? "text-primary/70 border-primary/20 bg-primary/5"
            : "text-muted-foreground/50 border-border/40",
        )}>
          {source.platform}
        </span>
      </td>

      {/* Tier */}
      <td className="px-4 py-3.5">
        <SourceTierBadge tier={source.tier} />
      </td>

      {/* Health */}
      <td className="px-4 py-3.5 text-center">
        <HealthBadge status={source.healthStatus} isRss={isRss} />
      </td>

      {/* Health score */}
      <td className="px-4 py-3.5 text-right">
        {isRss ? (
          <span className={cn(
            "text-xs font-mono tabular-nums",
            source.healthScore >= 70 ? "text-success" :
            source.healthScore >= 40 ? "text-warning" : "text-danger",
          )}>
            {source.healthScore}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/40">—</span>
        )}
      </td>

      {/* Success / Failure counts */}
      <td className="px-4 py-3.5 text-right">
        {isRss ? (
          <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
            <span className="text-success">{source.successfulFetchCount}</span>
            <span className="text-muted-foreground/40">/</span>
            <span className={source.failedFetchCount > 0 ? "text-warning" : "text-muted-foreground"}>
              {source.failedFetchCount}
            </span>
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/40">—</span>
        )}
      </td>

      {/* Last status */}
      <td className="px-4 py-3.5">
        {isRss ? (
          <span className={cn(
            "text-[10px]",
            source.lastFetchStatus === "success" ? "text-success"
              : source.lastFetchStatus ? "text-warning"
              : "text-muted-foreground/40",
          )}>
            {fetchStatusLabel(source.lastFetchStatus)}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/40">—</span>
        )}
      </td>

      {/* Latency */}
      <td className="px-4 py-3.5">
        {isRss && source.lastLatencyMs != null ? (
          <span className={cn(
            "text-[10px] font-mono tabular-nums",
            source.lastLatencyMs > 8000 ? "text-warning" : "text-muted-foreground",
          )}>
            {source.lastLatencyMs > 1000
              ? `${(source.lastLatencyMs / 1000).toFixed(1)}s`
              : `${source.lastLatencyMs}ms`}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/40">—</span>
        )}
      </td>
    </tr>
  )
}

// ── Stat pill ─────────────────────────────────────────────────────────────────

function StatPill({
  label, value, accent,
}: { label: string; value: number; accent?: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("font-mono font-semibold tabular-nums", accent ?? "text-foreground")}>
        {value}
      </span>
      {label}
    </span>
  )
}

// ── Main client component ─────────────────────────────────────────────────────

export default function SourcesClient({ sources }: { sources: SourceWithHealth[] }) {
  const [filter, setFilter] = useState<FilterKey>("all")

  const stats = useMemo(() => {
    const rss      = sources.filter(s => s.platform === "rss")
    const healthy  = rss.filter(s => s.healthStatus === "healthy").length
    const degraded = rss.filter(s => s.healthStatus === "degraded").length
    const failing  = rss.filter(s => s.healthStatus === "failing").length
    return {
      total:       sources.length,
      myCurated:   sources.filter(s => s.isUserCurated).length,
      official:    sources.filter(s => s.isOfficial).length,
      rssCount:    rss.length,
      healthy,
      degraded,
      failing,
      blocked:     sources.filter(s => s.isBlocked).length,
      demo:        sources.filter(s => s.dataOrigin === "demo").length,
      active:      sources.filter(s => !s.isBlocked).length,
    }
  }, [sources])

  const filtered = useMemo(() => applyFilter(sources, filter), [sources, filter])

  return (
    <AppShell>
      <div className="p-8">
        {/* ── Header ── */}
        <div className="mb-6">
          <p className="page-kicker mb-1">Source Library</p>
          <div className="flex items-end justify-between">
            <h1 className="editorial-title text-3xl">信源管理</h1>
            <p className="text-xs text-muted-foreground pb-1">
              {sources.length} 个信源 · {stats.active} 个运行中
            </p>
          </div>
        </div>

        {/* ── Stats bar ── */}
        <div className="flex items-center gap-4 mb-4 px-1 flex-wrap">
          <StatPill label="Total"  value={stats.total} />
          <span className="w-px h-3 bg-border" />
          <StatPill label="我的源" value={stats.myCurated} accent="text-teal-600 dark:text-teal-400" />
          <StatPill label="官方源" value={stats.official}  accent="text-amber-600 dark:text-amber-400" />
          <span className="w-px h-3 bg-border" />
          <StatPill label="RSS"    value={stats.rssCount}  accent="text-primary/80" />
          <StatPill label="正常"   value={stats.healthy}   accent="text-success" />
          <StatPill label="不稳定" value={stats.degraded}  accent="text-warning" />
          {stats.failing  > 0 && <StatPill label="连续失败" value={stats.failing}  accent="text-danger" />}
          {stats.blocked  > 0 && <StatPill label="屏蔽"     value={stats.blocked}  accent="text-danger" />}
          {stats.demo     > 0 && (
            <>
              <span className="w-px h-3 bg-border" />
              <StatPill label="demo" value={stats.demo} accent="text-muted-foreground/50" />
            </>
          )}
        </div>

        {/* ── Filter bar ── */}
        <div className="flex items-center gap-1.5 mb-4">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-md border transition-colors",
                filter === key
                  ? key === "my"
                    ? "bg-teal-500/15 text-teal-700 border-teal-400/40 dark:text-teal-400 font-medium"
                    : "bg-primary/10 text-primary border-primary/25 font-medium"
                  : "text-muted-foreground border-border hover:border-border hover:bg-accent",
              )}
            >
              {label}
              {key === "my"      && stats.myCurated > 0 && (
                <span className="ml-1.5 font-mono text-[10px] opacity-70">{stats.myCurated}</span>
              )}
              {key === "official" && stats.official > 0 && (
                <span className="ml-1.5 font-mono text-[10px] opacity-70">{stats.official}</span>
              )}
              {key === "failing" && stats.failing > 0 && (
                <span className="ml-1.5 font-mono text-[10px] text-danger opacity-80">{stats.failing}</span>
              )}
              {key === "blocked" && stats.blocked > 0 && (
                <span className="ml-1.5 font-mono text-[10px] text-danger opacity-80">{stats.blocked}</span>
              )}
            </button>
          ))}
          {filter !== "all" && (
            <span className="ml-2 text-xs text-muted-foreground">
              显示 {filtered.length} / {sources.length}
            </span>
          )}
        </div>

        {/* ── My curated sources banner ── */}
        {filter === "my" && filtered.length > 0 && (
          <div className="mb-4 rounded border border-teal-400/30 bg-teal-50/50 dark:bg-teal-400/8 px-4 py-3">
            <p className="text-sm font-medium text-teal-700 dark:text-teal-400 mb-1">你主动接入的信息源</p>
            <p className="text-[11px] text-teal-700/70 dark:text-teal-400/60">
              这些信源由你手动接入，系统会提高观察优先级，但仍需通过证据评分与多源验证后才构成事实判断。
            </p>
          </div>
        )}

        {/* ── Table ── */}
        <div className="border border-border rounded-lg overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="text-left px-5 py-3"><span className="muted-label">信源</span></th>
                <th className="text-left px-4 py-3"><span className="muted-label">类型</span></th>
                <th className="text-left px-4 py-3"><span className="muted-label">等级</span></th>
                <th className="text-center px-4 py-3"><span className="muted-label">健康</span></th>
                <th className="text-right px-4 py-3"><span className="muted-label">得分</span></th>
                <th className="text-right px-4 py-3"><span className="muted-label">成功/失败</span></th>
                <th className="text-left px-4 py-3"><span className="muted-label">上次状态</span></th>
                <th className="text-left px-4 py-3"><span className="muted-label">延迟</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center">
                    <p className="text-sm text-muted-foreground">
                      {filter === "all" ? "暂无信源" : "当前筛选无结果"}
                    </p>
                  </td>
                </tr>
              )}
              {filtered.map(source => (
                <SourceRow key={source.id} source={source} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  )
}
