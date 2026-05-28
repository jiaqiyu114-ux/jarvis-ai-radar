"use client"

import { cn } from "@/lib/utils"

interface TopSignal {
  score:    number
  title:    string
  category: string
}

interface TopStatusBarProps {
  lastFetchAt?:  string
  todayCount?:   number
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

export function TopStatusBar({
  todayCount   = 147,
  systemStatus = 'ok',
  topSignal,
}: TopStatusBarProps) {
  /* Mock phase: stable static string — no Date.now() in render, no hydration mismatch.
     Real-time relative time can be added later via a client-only useEffect. */
  const relativeTime = "12m 前"

  return (
    <header className="fixed top-0 left-0 right-0 h-10 z-50 border-b border-border bg-card/95 backdrop-blur-sm flex items-center px-5 gap-4">

      {/* Brand */}
      <div className="flex items-center gap-2.5 shrink-0">
        <span className="text-sm font-semibold tracking-[0.14em] text-foreground">JARVIS</span>
        <div className="flex items-center gap-1.5">
          <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", statusDot[systemStatus])} />
          <span className="text-[10px] text-muted-foreground font-medium tracking-wider">
            {statusLabel[systemStatus]}
          </span>
        </div>
      </div>

      <span className="text-muted-foreground/40 shrink-0 select-none">·</span>

      {/* System metrics — stable mock values */}
      <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
        <span>{relativeTime}</span>
        <span>·</span>
        <span className="text-foreground font-medium font-mono tabular-nums">{todayCount}</span>
        <span>条</span>
      </div>

      {/* Top signal preview */}
      {topSignal && (
        <>
          <span className="text-muted-foreground/40 shrink-0 select-none">·</span>
          <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
            <span className="text-[10px] text-muted-foreground shrink-0">最高</span>
            <span className="text-[11px] font-bold font-mono text-primary shrink-0 tabular-nums">
              {topSignal.score}
            </span>
            <span className="text-xs text-foreground/65 truncate">{topSignal.title}</span>
            <span className="text-[10px] text-muted-foreground/70 shrink-0 hidden xl:block">
              {topSignal.category}
            </span>
          </div>
        </>
      )}

      {/* Date — flush right */}
      <div className="shrink-0 text-[11px] text-muted-foreground font-mono ml-auto">
        {new Date().toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' })}
      </div>
    </header>
  )
}
