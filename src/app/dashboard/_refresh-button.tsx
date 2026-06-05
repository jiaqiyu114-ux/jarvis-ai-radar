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
      // Skip RSS ingest — only re-score existing DB items and write a new snapshot.
      // This takes ~3s instead of ~50s, giving near-instant feedback.
      const pipelineUrl =
        "/api/pipeline/recommendations" +
        "?ingest=false" +
        "&refresh=true" +
        "&deepDive=deterministic" +
        "&mode=manual"

      const res = await fetch(pipelineUrl, { method: "POST" })
      const data = await res.json() as PipelineResponse
      const snapshotId = data.refresh?.snapshot?.id ?? null

      if (data.status === "already_running") {
        setState("running")
        router.refresh()
        scheduleReset("running")
      } else if (data.ok) {
        setState("success")
        if (snapshotId) setSnapshotHint(`snapshot ${snapshotId.slice(0, 8)} 已更新`)
        router.refresh()
        scheduleReset("success")
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
    idle: "text-white border-[color:var(--primary)] bg-[color:var(--primary)] hover:opacity-90 cursor-pointer",
    loading: "text-white/70 border-[color:var(--primary)] bg-[color:var(--primary)]/70 cursor-not-allowed",
    success: "text-success border-success/30 bg-success/8 cursor-default",
    partial: "text-warning border-warning/30 bg-warning/8 cursor-default",
    running: "text-sky-400 border-sky-400/30 bg-sky-400/8 cursor-default",
    error: "text-danger/80 border-danger/25 bg-danger/8 hover:bg-danger/12 cursor-pointer",
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
          "inline-flex items-center gap-1.5 text-[11px] px-3 py-2 rounded-[14px] border backdrop-blur-md transition-colors",
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
