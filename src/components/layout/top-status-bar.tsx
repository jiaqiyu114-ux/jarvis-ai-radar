"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Search, FileText, Settings, Mic } from "lucide-react"
import { cn } from "@/lib/utils"
import { cleanDisplayText } from "@/lib/text/decode-html"
import { ClientRelativeTime } from "@/components/time/client-relative-time"

interface TopSignal {
  score:    number
  title:    string
  category: string
}

interface TopStatusBarProps {
  /** ISO timestamp of the latest snapshot / fetch — rendered client-only. */
  lastUpdated?:  string | null
  /** Number of items captured (real value passed from the page). */
  capturedCount?: number
  systemStatus?: 'ok' | 'fetching' | 'error'
  topSignal?:    TopSignal
}

const statusDot: Record<string, string> = {
  ok:       'bg-success',
  fetching: 'bg-warning animate-pulse',
  error:    'bg-danger',
}

const statusLabel: Record<string, string> = {
  ok:       'LIVE',
  fetching: 'SYNC',
  error:    'ERR',
}

/** Client-only date — avoids SSR/client locale + timezone mismatch. */
function ClientDate() {
  const [text, setText] = useState("")
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(new Date().toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' }))
  }, [])
  return (
    <span suppressHydrationWarning className="shrink-0 text-[10px] font-mono tracking-widest"
          style={{ color: "var(--text-muted)" }}>
      {text}
    </span>
  )
}

export function TopStatusBar({
  lastUpdated,
  capturedCount,
  systemStatus = 'ok',
  topSignal,
}: TopStatusBarProps) {
  return (
    <header className="rf-toolbar">

      {/* ── Left: live status + snapshot meta ── */}
      <div className="flex shrink-0 items-center gap-2.5">
        <div className="flex items-center gap-1.5">
          <div className={cn("h-1.5 w-1.5 rounded-full shadow-[0_0_12px_currentColor]", statusDot[systemStatus])} />
          <span className="text-[10px] font-mono tracking-widest" style={{ color: "var(--text-tertiary)" }}>
            {statusLabel[systemStatus]}
          </span>
        </div>
        {(lastUpdated || capturedCount != null) && (
          <div className="rf-breadcrumb">
            <span style={{ color: "rgba(255,255,255,0.16)" }}>/</span>
            {lastUpdated && <ClientRelativeTime value={lastUpdated} className="tabular-nums font-mono" fallback="—" />}
            {capturedCount != null && (
              <>
                <span style={{ color: "rgba(255,255,255,0.16)" }}>·</span>
                <span className="font-mono tabular-nums" style={{ color: "var(--text-tertiary)" }}>{capturedCount}</span>
                <span>条</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Center: search ── */}
      <Link href="/feed" className="rf-tool-search">
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1">搜索信号、信源、事件簇…</span>
        <Mic className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
      </Link>

      {/* ── Top signal ticker ── */}
      {topSignal && (
        <div className="hidden min-w-0 items-center gap-2 lg:flex" style={{ maxWidth: "260px" }}>
          <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-mono font-bold tracking-widest"
                style={{ background: "var(--rf-purple-soft)", color: "#C5BCFF" }}>TOP</span>
          <span className="shrink-0 font-mono text-[12px] font-bold tabular-nums" style={{ color: "var(--accent-purple)" }}>
            {topSignal.score}
          </span>
          <span className="truncate text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            {cleanDisplayText(topSignal.title)}
          </span>
        </div>
      )}

      {/* ── Right: actions + date ── */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Link href="/reports" className="rf-icon-btn" aria-label="日报">
          <FileText className="h-4 w-4" />
        </Link>
        <Link href="/settings" className="rf-icon-btn" aria-label="配置">
          <Settings className="h-4 w-4" />
          {systemStatus === 'error' && <span className="rf-icon-dot" />}
        </Link>
        <ClientDate />
      </div>
    </header>
  )
}
