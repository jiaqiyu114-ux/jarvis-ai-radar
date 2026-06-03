"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

const STALE_MS   = 60 * 60 * 1000   // trigger if snapshot older than 1h
const RECHECK_MS = 30 * 60 * 1000   // re-check every 30 minutes while page is open

const PIPELINE_URL =
  "/api/pipeline/recommendations" +
  "?ingest=true&refresh=true&maxSources=12&ingestTimeoutMs=55000&deepDive=deterministic&mode=auto"

type Props = { snapshotGeneratedAt: string | null }

export function AutoPipelineTrigger({ snapshotGeneratedAt }: Props) {
  const router  = useRouter()
  const running = useRef(false)
  const [active, setActive] = useState(false)

  useEffect(() => {
    async function maybeRefresh() {
      if (running.current) return
      const ageMs = snapshotGeneratedAt
        ? Date.now() - new Date(snapshotGeneratedAt).getTime()
        : Infinity
      if (ageMs < STALE_MS) return

      running.current = true
      setActive(true)
      try {
        const r = await fetch(PIPELINE_URL, { method: "POST" })
        const d = await r.json() as { ok?: boolean }
        if (d.ok) router.refresh()
      } catch { /* silent */ }
      running.current = false
      setActive(false)
    }

    void maybeRefresh()
    const timer = setInterval(() => void maybeRefresh(), RECHECK_MS)
    return () => clearInterval(timer)
  }, [snapshotGeneratedAt, router])

  if (!active) return null

  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg px-4 py-2 text-[12px]"
         style={{
           border:     "1px solid var(--border-subtle)",
           background: "var(--overlay-2)",
           color:      "var(--text-tertiary)",
         }}>
      <span className="h-1.5 w-1.5 rounded-full animate-pulse"
            style={{ background: "var(--primary)" }} />
      正在自动获取最新信号…
    </div>
  )
}
