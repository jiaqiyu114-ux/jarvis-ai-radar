"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

type RefreshState = 'idle' | 'loading' | 'success' | 'partial' | 'running' | 'error'

/**
 * Manual re-run button (降级为辅助操作).
 *
 * Primary data path: Dashboard reads stable snapshot directly from DB.
 * This button is a fallback for manual re-generation, not the main CTA.
 *
 * Calls POST /api/pipeline/recommendations (mode=manual).
 * Handles: success / partial_success / already_running / failed.
 *
 * Visual weight is intentionally low (ghost/secondary style).
 */
export function RefreshRecommendationsButton() {
  const router = useRouter()
  const [state,  setState]  = useState<RefreshState>('idle')
  const [errMsg, setErrMsg] = useState<string | null>(null)

  async function handleRefresh() {
    if (state === 'loading' || state === 'running') return
    setState('loading')
    setErrMsg(null)

    try {
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
        message?: string
      }

      if (data.status === 'already_running') {
        setState('running')
        // Show "running" for 5s then reset
        setTimeout(() => setState('idle'), 5_000)
        return
      }

      if (data.ok && data.status === 'success') {
        setState('success')
        router.refresh()
        setTimeout(() => setState('idle'), 4_000)
        return
      }

      if (data.ok && data.status === 'partial_success') {
        setState('partial')
        router.refresh()
        setTimeout(() => setState('idle'), 5_000)
        return
      }

      // ok=false or unknown status
      setErrMsg(data.error ?? `生成失败，旧快照仍有效`)
      setState('error')

    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : '网络错误，旧快照仍有效')
      setState('error')
    }
  }

  const label: Record<RefreshState, string> = {
    idle:    '重新生成快照',
    loading: '抓取并生成中…',
    success: '已生成稳定快照',
    partial: '部分源失败，已生成可用快照',
    running: '已有管线运行中',
    error:   '生成失败，可稍后重试',
  }

  // Low-weight ghost style in idle; distinct styles for other states
  const buttonClass: Record<RefreshState, string> = {
    idle:    'text-muted-foreground border-border/50 bg-transparent hover:bg-muted/40 hover:text-foreground cursor-pointer',
    loading: 'text-muted-foreground border-border/40 bg-muted/30 cursor-not-allowed',
    success: 'text-success border-success/30 bg-success/8 cursor-default',
    partial: 'text-warning border-warning/30 bg-warning/8 cursor-default',
    running: 'text-sky-600 border-sky-400/30 bg-sky-400/8 dark:text-sky-400 cursor-default',
    error:   'text-danger/70 border-danger/20 bg-danger/5 hover:bg-danger/10 cursor-pointer',
  }

  const icon = () => {
    if (state === 'success')  return <CheckCircle2 className="w-3 h-3" />
    if (state === 'partial')  return <CheckCircle2 className="w-3 h-3" />
    if (state === 'running')  return <Loader2 className="w-3 h-3 animate-spin" />
    if (state === 'error')    return <AlertCircle className="w-3 h-3" />
    return <RefreshCw className={cn('w-3 h-3', state === 'loading' && 'animate-spin')} />
  }

  const isDisabled = state === 'loading' || state === 'success' || state === 'partial' || state === 'running'

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleRefresh}
        disabled={isDisabled}
        title={state === 'running' ? '推荐管线正在运行中，请稍候' : '手动触发 RSS 抓取和推荐快照生成'}
        className={cn(
          'inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border transition-colors',
          buttonClass[state],
        )}
      >
        {icon()}
        {label[state]}
      </button>
      {state === 'error' && errMsg && (
        <span className="text-[10px] text-danger/70 max-w-[180px] truncate" title={errMsg}>
          {errMsg}
        </span>
      )}
    </div>
  )
}
