"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

type RefreshState = 'idle' | 'loading' | 'success' | 'error'

/**
 * "刷新推荐" button — calls the unified pipeline API:
 *   POST /api/pipeline/recommendations?ingest=true&refresh=true&maxSources=8&ingestTimeoutMs=55000
 *
 * This triggers:
 *   1. RSS ingest (latest 8 sources, up to 55 s)
 *   2. Recommendation snapshot generation (72 h window)
 *
 * Flow:
 *   idle → loading → success (3 s) → idle   on success
 *   idle → loading → error               on failure (old snapshot preserved)
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
      // Pipeline URL: all & are inside single-quoted template literal parts to be safe
      const pipelineUrl =
        '/api/pipeline/recommendations' +
        '?ingest=true' +
        '&refresh=true' +
        '&maxSources=8' +
        '&ingestTimeoutMs=55000' +
        '&mode=manual'

      const res  = await fetch(pipelineUrl, { method: 'POST' })
      const data = await res.json() as {
        ok:      boolean
        status?: string
        error?:  string
        refresh?: { ok?: boolean; snapshot?: { id?: string } | null } | null
      }

      if (data.ok) {
        setState('success')
        // Re-run all server components — they will now read the new snapshot
        router.refresh()
        setTimeout(() => setState('idle'), 3_000)
      } else {
        // Pipeline returned ok=false — old snapshot preserved
        setErrMsg(data.error ?? `管线失败 (${data.status ?? 'unknown'})，保留上一版快照`)
        setState('error')
      }
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : '网络错误，保留上一版快照')
      setState('error')
    }
  }

  const buttonLabel = {
    idle:    '刷新推荐',
    loading: '抓取并生成中…',
    success: '已更新稳定快照',
    error:   '刷新失败，可重试',
  }[state]

  const buttonClass = {
    idle:    'text-primary border-primary/25 bg-primary/8 hover:bg-primary/15 cursor-pointer',
    loading: 'text-muted-foreground border-border/40 bg-muted/40 cursor-not-allowed',
    success: 'text-success border-success/30 bg-success/8 cursor-default',
    error:   'text-danger/80 border-danger/20 bg-danger/5 hover:bg-danger/10 cursor-pointer',
  }[state]

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleRefresh}
        disabled={state === 'loading' || state === 'success'}
        className={cn(
          'inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-colors',
          buttonClass,
        )}
      >
        {state === 'success' ? (
          <CheckCircle2 className="w-3 h-3" />
        ) : state === 'error' ? (
          <AlertCircle className="w-3 h-3" />
        ) : (
          <RefreshCw className={cn('w-3 h-3', state === 'loading' && 'animate-spin')} />
        )}
        {buttonLabel}
      </button>
      {state === 'error' && errMsg && (
        <span className="text-[10px] text-danger/80 max-w-[200px] truncate" title={errMsg}>
          {errMsg}
        </span>
      )}
    </div>
  )
}
