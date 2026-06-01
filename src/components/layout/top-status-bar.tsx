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
    <header className="fixed top-0 left-0 right-0 h-10 z-50 border-b border-white/[0.07] bg-background/85 backdrop-blur-md flex items-center px-5 gap-4">

      {/* Brand */}
      <div className="flex items-center gap-2.5 shrink-0">
        <span className="text-[11px] font-bold tracking-[0.22em] text-foreground font-mono">J.A.R.V.I.S</span>
        <div className="flex items-center gap-1.5 border border-white/[0.08] rounded px-1.5 py-0.5">
          <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", statusDot[systemStatus])} />
          <span className="text-[9px] text-muted-foreground font-mono tracking-widest">
            {statusLabel[systemStatus]}
          </span>
        </div>
      </div>

      <span className="text-white/10 shrink-0 select-none">|</span>

      {/* System metrics */}
      <div className="flex items-center gap-2 shrink-0 text-[11px] text-muted-foreground font-mono">
        <span className="text-white/30">{relativeTime}</span>
        <span className="text-white/10">·</span>
        <span className="text-foreground/70 tabular-nums">{todayCount}</span>
        <span className="text-white/20">条捕捉</span>
      </div>

      {/* Top signal preview */}
      {topSignal && (
        <>
          <span className="text-white/10 shrink-0 select-none">|</span>
          <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
            <span className="text-[9px] text-white/25 shrink-0 font-mono tracking-widest">TOP</span>
            <span className="text-[11px] font-bold font-mono text-primary shrink-0 tabular-nums">
              {topSignal.score}
            </span>
            <span className="text-[11px] text-foreground/50 truncate">{cleanDisplayText(topSignal.title)}</span>
          </div>
        </>
      )}

      {/* Date — flush right */}
      <div
        suppressHydrationWarning
        className="shrink-0 text-[10px] text-muted-foreground/40 font-mono ml-auto tracking-widest"
      >
        {new Date().toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' })}
      </div>
    </header>
  )
}
