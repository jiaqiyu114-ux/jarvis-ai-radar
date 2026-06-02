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
    <header className="sticky top-0 h-10 z-30 backdrop-blur-md flex items-center px-5 gap-4"
            style={{
              background: "rgba(8,10,11,0.80)",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}>

      {/* LIVE dot */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", statusDot[systemStatus])} />
        <span className="text-[9px] font-mono tracking-widest" style={{color:"rgba(244,241,234,0.45)"}}>
          {statusLabel[systemStatus]}
        </span>
      </div>

      <span className="shrink-0 select-none" style={{color:"rgba(255,255,255,0.12)"}}>|</span>

      {/* Metrics */}
      <div className="flex items-center gap-2 shrink-0 text-[10px] font-mono">
        <span style={{color:"rgba(244,241,234,0.38)"}}>{relativeTime}</span>
        <span style={{color:"rgba(255,255,255,0.12)"}}>·</span>
        <span className="tabular-nums" style={{color:"rgba(244,241,234,0.68)"}}>{todayCount}</span>
        <span style={{color:"rgba(244,241,234,0.30)"}}>条</span>
      </div>

      {/* Top signal ticker */}
      {topSignal && (
        <>
          <span className="shrink-0 select-none" style={{color:"rgba(255,255,255,0.12)"}}>|</span>
          <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden">
            <span className="text-[8px] font-mono tracking-widest shrink-0" style={{color:"rgba(244,241,234,0.25)"}}>TOP</span>
            <span className="text-[10px] font-bold font-mono shrink-0 tabular-nums" style={{color:"#E85D3D"}}>
              {topSignal.score}
            </span>
            <span className="text-[10px] truncate" style={{color:"rgba(244,241,234,0.50)"}}>
              {cleanDisplayText(topSignal.title)}
            </span>
          </div>
        </>
      )}

      {/* Date */}
      <div
        suppressHydrationWarning
        className="shrink-0 text-[9px] font-mono ml-auto tracking-widest"
        style={{color:"rgba(244,241,234,0.28)"}}
      >
        {new Date().toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' })}
      </div>
    </header>
  )
}
