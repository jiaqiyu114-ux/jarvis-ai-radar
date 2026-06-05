"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { getProfileThresholds, SETTINGS_STORAGE_KEY } from "@/lib/recommendations/recommendation-thresholds"

/**
 * Runs once after mount. Checks whether the recommendation profile was changed
 * after the current snapshot was generated. If so, triggers a background refresh
 * with the new thresholds and reloads the page data via router.refresh().
 *
 * No UI rendered — runs silently in background.
 */
export function ProfileSync({
  snapshotGeneratedAt,
  profileId,
}: {
  snapshotGeneratedAt: string | null
  profileId:           string
}) {
  const router  = useRouter()
  const didSync = useRef(false)

  useEffect(() => {
    if (didSync.current) return
    didSync.current = true

    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
      if (!raw) return
      const settings = JSON.parse(raw) as { profileUpdatedAt?: string }
      const updatedAt = settings.profileUpdatedAt
      if (!updatedAt || !snapshotGeneratedAt) return

      // Only refresh if the profile was changed AFTER the last snapshot was generated
      if (new Date(updatedAt) <= new Date(snapshotGeneratedAt)) return

      // Re-render immediately so the new thresholds take effect on screen.
      // The snapshot regeneration (which also uses the new thresholds) runs in
      // the background — the display filter is already correct from the cookie.
      router.refresh()

      const t = getProfileThresholds(profileId)
      fetch(
        `/api/recommendations/refresh?deepDive=deterministic&mustRead=${t.mustRead}&highValue=${t.highValue}&observe=${t.observe}`,
        { method: 'POST' },
      ).catch(() => {/* silent */})
    } catch {
      // localStorage or JSON parse errors — silently skip
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
