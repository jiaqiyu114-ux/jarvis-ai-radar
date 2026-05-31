"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

type RefreshState = "idle" | "loading" | "success" | "partial" | "running" | "error"

type PipelineResponse = {
  ok: boolean
  status?: string
  error?: string
  message?: string
  refresh?: {
    snapshot?: { id?: string | null } | null
  } | null
}

const RESET_DELAY_MS: Record<RefreshState, number> = {
  idle: 0,
  loading: 0,
  success: 3000,
  partial: 4000,
  running: 4000,
  error: 0,
}

export function RefreshRecommendationsButton() {
  const router = useRouter()
  const [state, setState] = useState<RefreshState>("idle")
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [snapshotHint, setSnapshotHint] = useState<string | null>(null)

  function scheduleReset(nextState: RefreshState) {
    const delay = RESET_DELAY_MS[nextState]
    if (delay <= 0) return
    setTimeout(() => {
      setState("idle")
      setSnapshotHint(null)
    }, delay)
  }

  async function handleRefresh() {
    if (state === "loading" || state === "running") return
    setState("loading")
    setErrMsg(null)
    setSnapshotHint(null)

    try {
      const pipelineUrl =
        "/api/pipeline/recommendations" +
        "?ingest=true" +
        "&refresh=true" +
        "&maxSources=8" +
        "&ingestTimeoutMs=55000" +
        "&mode=manual"

      const res = await fetch(pipelineUrl, { method: "POST" })
      const data = await res.json() as PipelineResponse
      const snapshotId = data.refresh?.snapshot?.id ?? null

      if (data.status === "already_running") {
        setState("running")
        router.refresh()
        scheduleReset("running")
      } else if (data.ok && data.status === "success") {
        setState("success")
        if (snapshotId) setSnapshotHint(`snapshot ${snapshotId.slice(0, 8)} 已更新`)
        router.refresh()
        scheduleReset("success")
      } else if (data.ok && data.status === "partial_success") {
        setState("partial")
        if (snapshotId) setSnapshotHint(`snapshot ${snapshotId.slice(0, 8)} 已更新`)
        router.refresh()
        scheduleReset("partial")
      } else {
        setState("error")
        setErrMsg(data.error ?? "生成失败，可重试")
      }
    } catch (err) {
      setState("error")
      setErrMsg(err instanceof Error ? err.message : "生成失败，可重试")
    }
  }

  const label: Record<RefreshState, string> = {
    idle: "手动生成快照",
    loading: "生成中...",
    success: "已生成稳定快照",
    partial: "部分完成，已生成可用快照",
    running: "管线运行中，稍后自动更新",
    error: "生成失败，可重试",
  }

  const buttonClass: Record<RefreshState, string> = {
    idle: "text-muted-foreground border-border/50 bg-transparent hover:bg-muted/40 hover:text-foreground cursor-pointer",
    loading: "text-muted-foreground border-border/40 bg-muted/30 cursor-not-allowed",
    success: "text-success border-success/30 bg-success/8 cursor-default",
    partial: "text-warning border-warning/30 bg-warning/8 cursor-default",
    running: "text-sky-600 border-sky-400/30 bg-sky-400/8 dark:text-sky-400 cursor-default",
    error: "text-danger/70 border-danger/20 bg-danger/5 hover:bg-danger/10 cursor-pointer",
  }

  const icon = () => {
    if (state === "success") return <CheckCircle2 className="w-3 h-3" />
    if (state === "partial") return <CheckCircle2 className="w-3 h-3" />
    if (state === "running") return <Loader2 className="w-3 h-3 animate-spin" />
    if (state === "error") return <AlertCircle className="w-3 h-3" />
    return <RefreshCw className={cn("w-3 h-3", state === "loading" && "animate-spin")} />
  }

  const isDisabled = state === "loading" || state === "success" || state === "partial" || state === "running"

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleRefresh}
        disabled={isDisabled}
        title="正常情况由定时任务自动执行，手动按钮仅用于临时补跑。"
        className={cn(
          "inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border transition-colors",
          buttonClass[state],
        )}
      >
        {icon()}
        {label[state]}
      </button>

      {snapshotHint && (
        <span className="text-[10px] text-success/80 max-w-[220px] truncate" title={snapshotHint}>
          {snapshotHint}
        </span>
      )}
      {state === "error" && errMsg && (
        <span className="text-[10px] text-danger/70 max-w-[220px] truncate" title={errMsg}>
          {errMsg}
        </span>
      )}
    </div>
  )
}
