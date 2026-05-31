export type FreshnessSeverity = 'ok' | 'warning' | 'stale' | 'missing'

export type RecommendationFreshness = {
  isFresh: boolean
  isStale: boolean
  ageMinutes: number | null
  ageHours: number | null
  reason: string
  severity: FreshnessSeverity
  shouldAutoRefresh: boolean
}

const FRESH_THRESHOLD_H = 3
const WARNING_THRESHOLD_H = 6

function ageText(ageMinutes: number): string {
  if (ageMinutes < 1) return 'just now'
  if (ageMinutes < 60) return `${ageMinutes}m ago`
  const hours = Math.floor(ageMinutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function getRecommendationFreshness({
  latestSnapshot,
  coverage,
  now = new Date(),
}: {
  latestSnapshot: { generated_at: string } | null | undefined
  latestRun?: { status?: string | null } | null
  coverage?: { needsRefresh?: boolean } | null
  now?: Date
}): RecommendationFreshness {
  const coverageNeedsRefresh = coverage?.needsRefresh ?? false

  if (!latestSnapshot) {
    return {
      isFresh: false,
      isStale: true,
      ageMinutes: null,
      ageHours: null,
      reason: 'No stable recommendation snapshot yet.',
      severity: 'missing',
      shouldAutoRefresh: true,
    }
  }

  const ageMs = now.getTime() - new Date(latestSnapshot.generated_at).getTime()
  const ageMinutes = Math.max(0, Math.round(ageMs / 60_000))
  const ageHours = Math.round((ageMs / 3_600_000) * 10) / 10

  if (ageMs < FRESH_THRESHOLD_H * 3_600_000) {
    return {
      isFresh: true,
      isStale: false,
      ageMinutes,
      ageHours,
      reason: `Stable snapshot updated ${ageText(ageMinutes)}.`,
      severity: 'ok',
      shouldAutoRefresh: coverageNeedsRefresh,
    }
  }

  if (ageMs < WARNING_THRESHOLD_H * 3_600_000) {
    return {
      isFresh: false,
      isStale: false,
      ageMinutes,
      ageHours,
      reason: `Snapshot is ${ageText(ageMinutes)} old. Refresh soon.`,
      severity: 'warning',
      shouldAutoRefresh: coverageNeedsRefresh,
    }
  }

  return {
    isFresh: false,
    isStale: true,
    ageMinutes,
    ageHours,
    reason: `Snapshot is stale (${ageText(ageMinutes)}).`,
    severity: 'stale',
    shouldAutoRefresh: true,
  }
}

export function formatSnapshotAge(ageMinutes: number | null): string {
  if (ageMinutes === null) return '-'
  if (ageMinutes < 1) return 'just now'
  if (ageMinutes < 60) return `${ageMinutes}m ago`
  const hours = Math.floor(ageMinutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
