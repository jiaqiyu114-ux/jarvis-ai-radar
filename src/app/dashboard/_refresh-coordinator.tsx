"use client"

/**
 * DashboardRefreshCoordinator — single source of truth for all client-side
 * refresh logic on the dashboard. Replaces AutoPipelineTrigger + ProfileSync.
 *
 * Two things this component does, in strict priority order:
 *
 *  1. DISPLAY SYNC (cheap, instant, no API)
 *     If the user's recommendation profile was changed after the current
 *     snapshot was generated, call router.refresh() once so the server
 *     re-renders with the new cookie-based thresholds. No snapshot
 *     regeneration needed — all display filtering is server-side from cookie.
 *     Fires once on mount; guarded by a ref so router.refresh() can't loop it.
 *
 *  2. CONTENT FETCH (expensive, background, single lock)
 *     If the snapshot is stale (> STALE_THRESHOLD_MS), fire the full ingest +
 *     refresh pipeline once, show a loading indicator, call router.refresh()
 *     when done. Re-checks every RECHECK_INTERVAL_MS while page is open.
 *     A shared ref-lock (apiRunning) prevents concurrent API calls regardless
 *     of what else is happening on the page.
 *
 * These two operations never conflict:
 *  - Display sync only calls router.refresh() — cheap, no server mutation.
 *  - Content fetch uses the server-side running lock on recommendation_runs,
 *    so even if the manual button fires at the same time, the server dedupes.
 *  - apiRunning prevents the interval from queueing a second content fetch
 *    while one is already in flight.
 */

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { SETTINGS_STORAGE_KEY } from "@/lib/recommendations/recommendation-thresholds"

const STALE_THRESHOLD_MS  = 60 * 60 * 1000    // 1h — trigger content fetch
const RECHECK_INTERVAL_MS = 30 * 60 * 1000    // re-check every 30 min

const PIPELINE_URL =
  "/api/pipeline/recommendations" +
  "?ingest=true&refresh=true&maxSources=12&ingestTimeoutMs=45000&deepDive=deterministic&mode=manual"

type Props = {
  snapshotGeneratedAt: string | null
  profileId:           string
}

export function DashboardRefreshCoordinator({ snapshotGeneratedAt, profileId }: Props) {
  const router      = useRouter()
  const apiRunning  = useRef(false)   // shared lock — prevents concurrent API calls
  const didDisplay  = useRef(false)   // prevents display-sync from looping
  const [fetching, setFetching] = useState(false)

  // ── 1. Display sync: immediate re-render when profile is newer than snapshot ──
  useEffect(() => {
    if (didDisplay.current) return
    didDisplay.current = true

    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
      if (!raw || !snapshotGeneratedAt) return
      const { profileUpdatedAt } = JSON.parse(raw) as { profileUpdatedAt?: string }
      if (!profileUpdatedAt) return
      if (new Date(profileUpdatedAt) <= new Date(snapshotGeneratedAt)) return
      // Profile is newer — re-render to pick up the new cookie-based thresholds.
      // No background API: display filtering is server-side from cookie already.
      router.refresh()
    } catch { /* localStorage / JSON errors — skip */ }
  // Run once on mount only; props changes are intentionally ignored here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 2. Content fetch: pipeline when snapshot is stale ────────────────────────
  useEffect(() => {
    async function maybeRunPipeline() {
      if (apiRunning.current) return

      const ageMs = snapshotGeneratedAt
        ? Date.now() - new Date(snapshotGeneratedAt).getTime()
        : Infinity
      if (ageMs < STALE_THRESHOLD_MS) return

      apiRunning.current = true
      setFetching(true)
      try {
        const res  = await fetch(PIPELINE_URL, { method: "POST" })
        const data = await res.json() as { ok?: boolean }
        if (data.ok) router.refresh()
      } catch { /* network errors — next interval will retry */ }
      apiRunning.current = false
      setFetching(false)
    }

    void maybeRunPipeline()
    const id = setInterval(() => void maybeRunPipeline(), RECHECK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [snapshotGeneratedAt, router])

  if (!fetching) return null

  return (
    <div
      className="mb-4 flex items-center gap-2 rounded-lg px-4 py-2 text-[12px]"
      style={{
        border:     "1px solid var(--border-subtle)",
        background: "var(--overlay-2)",
        color:      "var(--text-tertiary)",
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full animate-pulse"
        style={{ background: "var(--primary)" }}
      />
      正在自动获取最新信号…
    </div>
  )
}
