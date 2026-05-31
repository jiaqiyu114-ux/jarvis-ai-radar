/**
 * Recommendation Freshness — pure snapshot age classifier.
 *
 * Thresholds (all configurable, but sensible defaults):
 *   < 3 h  → ok      (fresh, no action needed)
 *   3–6 h  → warning (slightly old, may auto-refresh soon)
 *   > 6 h  → stale   (shouldAutoRefresh = true)
 *   absent → missing  (shouldAutoRefresh = true)
 *
 * No I/O, no DB calls. Pure function, safe to call in server components.
 */

export type FreshnessSeverity = 'ok' | 'warning' | 'stale' | 'missing'

export type RecommendationFreshness = {
  isFresh:          boolean
  isStale:          boolean
  ageMinutes:       number | null
  ageHours:         number | null    // rounded to 1 decimal
  reason:           string           // display text in zh-CN
  severity:         FreshnessSeverity
  shouldAutoRefresh: boolean
}

const FRESH_THRESHOLD_H   = 3    // < 3h: ok
const WARNING_THRESHOLD_H = 6    // 3–6h: warning; > 6h: stale

export function getRecommendationFreshness({
  latestSnapshot,
  coverage,
  now = new Date(),
}: {
  latestSnapshot: { generated_at: string } | null | undefined
  latestRun?:     { status?: string | null } | null   // reserved for future use
  coverage?:      { needsRefresh?: boolean } | null
  now?:           Date
}): RecommendationFreshness {

  const coverageNeedsRefresh = coverage?.needsRefresh ?? false

  // ── Missing snapshot ──────────────────────────────────────────────────────
  if (!latestSnapshot) {
    return {
      isFresh:          false,
      isStale:          true,
      ageMinutes:       null,
      ageHours:         null,
      reason:           '尚无稳定推荐快照，请先生成一次',
      severity:         'missing',
      shouldAutoRefresh: true,
    }
  }

  const ageMs      = now.getTime() - new Date(latestSnapshot.generated_at).getTime()
  const ageMinutes = Math.round(ageMs / 60_000)
  const ageHours   = Math.round((ageMs / 3_600_000) * 10) / 10

  // ── Fresh (< 3h) ──────────────────────────────────────────────────────────
  if (ageMs < FRESH_THRESHOLD_H * 3_600_000) {
    const displayAge = ageMinutes < 60
      ? `${ageMinutes} 分钟前`
      : `${ageHours} 小时前`
    return {
      isFresh:          true,
      isStale:          false,
      ageMinutes,
      ageHours,
      reason:           `稳定快照 ${displayAge} 更新`,
      severity:         'ok',
      shouldAutoRefresh: coverageNeedsRefresh,
    }
  }

  // ── Warning (3–6h) ────────────────────────────────────────────────────────
  if (ageMs < WARNING_THRESHOLD_H * 3_600_000) {
    return {
      isFresh:          false,
      isStale:          false,
      ageMinutes,
      ageHours,
      reason:           `推荐快照已 ${Math.round(ageHours)} 小时未更新，建议尽快刷新`,
      severity:         'warning',
      shouldAutoRefresh: coverageNeedsRefresh,
    }
  }

  // ── Stale (> 6h) ──────────────────────────────────────────────────────────
  const displayHours = ageHours < 24
    ? `${Math.round(ageHours)} 小时`
    : `${Math.round(ageHours / 24)} 天`
  return {
    isFresh:          false,
    isStale:          true,
    ageMinutes,
    ageHours,
    reason:           `推荐快照已超过 ${displayHours}，建议自动刷新`,
    severity:         'stale',
    shouldAutoRefresh: true,
  }
}

/** Format age for dashboard display (e.g. "3m 前", "2h 前"). */
export function formatSnapshotAge(ageMinutes: number | null): string {
  if (ageMinutes === null) return '—'
  if (ageMinutes < 1)   return '刚刚'
  if (ageMinutes < 60)  return `${ageMinutes}m 前`
  const h = Math.floor(ageMinutes / 60)
  if (h < 24)           return `${h}h 前`
  return `${Math.floor(h / 24)}d 前`
}
