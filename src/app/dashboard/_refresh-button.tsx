"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

type RefreshState = 'idle' | 'loading' | 'success' | 'error'

/**
 * Client-side "刷新推荐" button.
 *
 * Flow:
 *   idle → loading → success (3s) → idle   on success
 *   idle → loading → error               on failure (old snapshot preserved)
 *
 * On success: router.refresh() re-runs server components to display new snapshot.
 * On failure: old snapshot remains intact; error shown beside button.
 */
export function RefreshRecommendationsButton() {
  const router = useRouter()
  const [state,  setState]  = useState<RefreshState>('idle')
  const [errMsg, setErrMsg] = useState<string | null>(null)

  async function handleRefresh() {
    if (state === 'loading') return
    setState('loading')
    setErrMsg(null)

    try {
      const res  = await fetch('/api/recommendations/refresh', { method: 'POST' })
      const data = await res.json() as { ok: boolean; error?: string; runStatus?: string }

      if (data.ok) {
        setState('success')
        // Re-run all server components — they will now read the new snapshot
        router.refresh()
        // Reset to idle after 3 s so the button is ready for the next refresh
        setTimeout(() => setState('idle'), 3_000)
      } else {
        setErrMsg(data.error ?? `刷新失败 (${data.runStatus ?? 'unknown'})`)
        setState('error')
      }
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : '网络错误，保留上一版快照')
      setState('error')
    }
  }

  const buttonLabel = {
    idle:    '刷新推荐',
    loading: '生成中…',
    success: '已生成稳定快照',
    error:   '刷新推荐',
  }[state]

  const buttonClass = {
    idle:    "text-primary border-primary/25 bg-primary/8 hover:bg-primary/15 cursor-pointer",
    loading: "text-muted-foreground border-border/40 bg-muted/40 cursor-not-allowed",
    success: "text-success border-success/30 bg-success/8 cursor-default",
    error:   "text-primary border-primary/25 bg-primary/8 hover:bg-primary/15 cursor-pointer",
  }[state]

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleRefresh}
        disabled={state === 'loading' || state === 'success'}
        className={cn(
          "inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-colors",
          buttonClass,
        )}
      >
        {state === 'success' ? (
          <CheckCircle2 className="w-3 h-3" />
        ) : (
          <RefreshCw className={cn("w-3 h-3", state === 'loading' && "animate-spin")} />
        )}
        {buttonLabel}
      </button>
      {state === 'error' && errMsg && (
        <span className="flex items-center gap-1 text-[10px] text-danger/80">
          <AlertCircle className="w-3 h-3 shrink-0" />
          {errMsg}
        </span>
      )}
    </div>
  )
}
