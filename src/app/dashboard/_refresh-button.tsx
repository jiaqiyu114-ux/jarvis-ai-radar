"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Client-side "刷新推荐" button.
 * Calls POST /api/recommendations/refresh, then re-runs server components
 * via router.refresh() so the new snapshot appears without a full page reload.
 */
export function RefreshRecommendationsButton() {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState<string | null>(null)

  async function handleRefresh() {
    if (state === 'loading') return
    setState('loading')
    setErrMsg(null)

    try {
      const res  = await fetch('/api/recommendations/refresh', { method: 'POST' })
      const data = await res.json() as { ok: boolean; error?: string; runStatus?: string }

      if (data.ok) {
        // Re-run all server components — they will now read the new snapshot
        router.refresh()
        setState('idle')
      } else {
        setErrMsg(data.error ?? `刷新失败 (${data.runStatus ?? 'unknown'})`)
        setState('error')
      }
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : '网络错误')
      setState('error')
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleRefresh}
        disabled={state === 'loading'}
        className={cn(
          "inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-colors",
          state === 'loading'
            ? "text-muted-foreground border-border/40 bg-muted/40 cursor-not-allowed"
            : "text-primary border-primary/25 bg-primary/8 hover:bg-primary/15 cursor-pointer",
        )}
      >
        <RefreshCw className={cn("w-3 h-3", state === 'loading' && "animate-spin")} />
        {state === 'loading' ? '生成中…' : '刷新推荐'}
      </button>
      {state === 'error' && errMsg && (
        <span className="text-[10px] text-danger/80">{errMsg}</span>
      )}
    </div>
  )
}
