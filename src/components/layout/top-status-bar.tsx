"use client"

import { cn } from "@/lib/utils"
import { cleanDisplayText } from "@/lib/text/decode-html"

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
    <header className="sticky top-0 h-10 z-30 border-b border-white/[0.07] bg-background/80 backdrop-blur-md flex items-center px-5 gap-4">

      {/* System status */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", statusDot[systemStatus])} />
        <span className="text-[9px] text-muted-foreground/60 font-mono tracking-widest">
          {statusLabel[systemStatus]}
        </span>
      </div>

      <span className="text-white/[0.08] shrink-0 select-none">|</span>

      {/* Metrics */}
      <div className="flex items-center gap-2 shrink-0 text-[10px] font-mono">
        <span className="text-muted-foreground/40">{relativeTime}</span>
        <span className="text-white/10">·</span>
        <span className="text-foreground/60 tabular-nums">{todayCount}</span>
        <span className="text-muted-foreground/30">条</span>
      </div>

      {/* Top signal ticker */}
      {topSignal && (
        <>
          <span className="text-white/[0.08] shrink-0 select-none">|</span>
          <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden">
            <span className="text-[8px] text-white/20 shrink-0 font-mono tracking-widest">TOP</span>
            <span className="text-[10px] font-bold font-mono text-primary/80 shrink-0 tabular-nums">
              {topSignal.score}
            </span>
            <span className="text-[10px] text-foreground/40 truncate">{cleanDisplayText(topSignal.title)}</span>
          </div>
        </>
      )}

      {/* Date */}
      <div
        suppressHydrationWarning
        className="shrink-0 text-[9px] text-muted-foreground/30 font-mono ml-auto tracking-widest"
      >
        {new Date().toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' })}
      </div>
    </header>
  )
}
