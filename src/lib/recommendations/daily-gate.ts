/**
 * Daily Recommendation Gate — hard rule filtering.
 *
 * Today's recommendations = only items captured today in the configured timezone.
 * No score-based age decay. The gate enforces scheduling; scores reflect quality.
 *
 * Rules for isEligibleForTodayRecommendation:
 *  1. Item not already in a recent snapshot's must_read / high_value
 *  2. capturedAt (fetched_at) local date == today in configured timezone
 *  3. publishedAt (if known) not > 1 day before today
 *
 * For "update candidates" — items whose title signals a new development on an
 * existing story — eligibility may be restored even if previously delivered.
 * This is implemented as a conservative title-keyword heuristic; future LLM hook
 * left as shouldTreatAsUpdate().
 */

import type {
  RecommendedItem,
  DailyGateResult,
  RecommendationBucket,
  DeliveryStatus,
  PreviousDeliveryInfo,
} from '@/lib/recommendations/recommendation-engine'

// Timezone for "today" determination. Configurable via env.
export const JARVIS_TIMEZONE = process.env.JARVIS_TIMEZONE ?? 'Asia/Singapore'

// ── Date helpers ──────────────────────────────────────────────────────────────

/**
 * Returns the local date string YYYY-MM-DD in the given timezone.
 * Uses Intl.DateTimeFormat — works in Edge/Node and handles DST correctly.
 */
export function getLocalDateKey(
  date: Date | string | null | undefined,
  tz = JARVIS_TIMEZONE,
): string | null {
  if (!date) return null
  try {
    const d = typeof date === 'string' ? new Date(date) : date
    if (isNaN(d.getTime())) return null
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(d)
    const y = parts.find(p => p.type === 'year')?.value
    const m = parts.find(p => p.type === 'month')?.value
    const dv = parts.find(p => p.type === 'day')?.value
    if (!y || !m || !dv) return null
    return `${y}-${m}-${dv}`
  } catch { return null }
}

/** Returns today's date key in the configured timezone. */
export function todayKey(tz = JARVIS_TIMEZONE): string {
  return getLocalDateKey(new Date(), tz) ?? new Date().toISOString().slice(0, 10)
}

/** Returns how many calendar days ago the date was (in the given timezone). */
export function calendarDaysAgo(
  date: Date | string | null | undefined,
  tz = JARVIS_TIMEZONE,
): number | null {
  const dk = getLocalDateKey(date, tz)
  if (!dk) return null
  const today = todayKey(tz)
  const diffMs = new Date(today + 'T00:00:00Z').getTime() - new Date(dk + 'T00:00:00Z').getTime()
  return Math.round(diffMs / (24 * 3_600_000))
}

// ── Gate evaluation ───────────────────────────────────────────────────────────

/**
 * Evaluate whether an item is eligible for today's recommendation slot.
 *
 * Hard rules — ALL must pass:
 * 1. Not previously delivered (in recent snapshots' must_read/high_value)
 * 2. capturedAt (fetched_at) local date == todayKey
 * 3. publishedAt (if known) is not more than 1 calendar day before today
 */
export function evaluateDailyGate(
  item:             Pick<RecommendedItem, 'fetchedAt' | 'publishedAt'>,
  prevDeliveredIds: Set<string>,
  itemId:           string,
  tz = JARVIS_TIMEZONE,
): DailyGateResult {
  const today           = todayKey(tz)
  const capturedDateKey = getLocalDateKey(item.fetchedAt, tz)
  const publishedDateKey= getLocalDateKey(item.publishedAt, tz)
  const base            = { timezone: tz, todayKey: today, capturedDateKey, publishedDateKey }

  // Rule 1: previously delivered in a recent snapshot
  if (prevDeliveredIds.has(itemId)) {
    return { ...base, eligibleForToday: false, reason: 'previously_delivered' }
  }

  // Rule 2: capturedAt must be today
  if (!capturedDateKey) {
    return { ...base, eligibleForToday: false, reason: 'captured_date_unknown' }
  }
  if (capturedDateKey !== today) {
    return { ...base, eligibleForToday: false, reason: 'captured_yesterday_or_older' }
  }

  // Rule 3: publishedAt, if known, must not be > 1 calendar day before today
  if (publishedDateKey) {
    const pubDayMs   = new Date(publishedDateKey + 'T00:00:00Z').getTime()
    const todayDayMs = new Date(today            + 'T00:00:00Z').getTime()
    const diffDays   = (todayDayMs - pubDayMs) / (24 * 3_600_000)
    if (diffDays > 1) {
      return { ...base, eligibleForToday: false, reason: 'published_too_old' }
    }
  }

  return { ...base, eligibleForToday: true, reason: 'captured_today' }
}

// ── Update candidate detection ────────────────────────────────────────────────

// Title keywords that suggest a new development on an existing story.
// This is a conservative rule-based heuristic. Future: LLM-backed detection.
const UPDATE_SIGNALS = new Set([
  'update', 'updates', 'updated',
  'official', 'officially',
  'confirms', 'confirmed', 'confirmation',
  'responds', 'response', 'responded',
  'launches', 'launch', 'launched',
  'releases', 'release', 'released',
  'announces', 'announced', 'announcement',
  'breaks', 'breaking',
  '官方', '回应', '发布', '确认', '更新', '宣布', '重磅',
])

/**
 * Conservative rule: does the item title signal a new development?
 * Items that pass this check may re-enter must_read/high_value even if previously
 * delivered, provided they were captured today.
 *
 * Note: this does NOT override the capturedToday gate — only the previouslyDelivered gate.
 * Stub for future LLM integration: shouldTreatAsUpdate(baseItem, previousItems).
 */
export function shouldTreatAsUpdate(item: Pick<RecommendedItem, 'title'>): boolean {
  const lower = item.title.toLowerCase()
  return Array.from(UPDATE_SIGNALS).some(sig => lower.includes(sig))
}

// ── Bucket + status derivation ────────────────────────────────────────────────

export type GateDecision = {
  gate:                DailyGateResult
  bucket:              RecommendationBucket
  deliveryStatus:      DeliveryStatus
  previousDelivery:    PreviousDeliveryInfo
  observeReason:       string | undefined
  isUpdate:            boolean
  demoteFromFinal:     boolean  // should be moved from must_read/high_value → observe
}

/**
 * Derive the full gate decision for an item.
 * This is the single authoritative function for determining recommendation bucket/status.
 */
export function deriveGateDecision(
  item:             Pick<RecommendedItem, 'fetchedAt' | 'publishedAt' | 'title' | 'recommendationTier'>,
  prevDeliveredIds: Set<string>,
  itemId:           string,
  tz = JARVIS_TIMEZONE,
): GateDecision {
  const gate    = evaluateDailyGate(item, prevDeliveredIds, itemId, tz)
  const prevRec = prevDeliveredIds.has(itemId)

  // An update candidate can pass even if previously delivered, BUT only if captured today
  const isUpdate = gate.reason === 'previously_delivered'
    ? (gate.capturedDateKey === gate.todayKey && shouldTreatAsUpdate(item))
    : false

  const eligibleOverride = isUpdate && gate.reason === 'previously_delivered'
  const effectivelyEligible = gate.eligibleForToday || eligibleOverride

  const bucket: RecommendationBucket = effectivelyEligible
    ? 'today_recommendation'
    : 'observe_backlog'

  const deliveryStatus: DeliveryStatus = effectivelyEligible
    ? (isUpdate ? 'update_candidate' : 'new_today')
    : gate.reason === 'previously_delivered'
      ? 'previously_delivered'
      : gate.reason === 'captured_yesterday_or_older' || gate.reason === 'published_too_old'
        ? 'recent_unpushed'
        : 'old_not_eligible'

  const previousDelivery: PreviousDeliveryInfo = {
    previouslyRecommended: prevRec,
    matchedBy: prevRec ? 'item_id' : undefined,
  }

  const observeReason = effectivelyEligible ? undefined
    : gate.reason === 'previously_delivered' ? 'duplicate_of_existing_recommendation'
    : gate.reason === 'captured_yesterday_or_older' ? 'not_today_but_recent'
    : gate.reason === 'published_too_old' ? 'not_today_but_recent'
    : 'high_score_not_delivered'

  // Should the item be demoted from must_read/high_value to observe?
  const isFinalTier = item.recommendationTier === 'must_read' || item.recommendationTier === 'high_value'
  const demoteFromFinal = !effectivelyEligible && isFinalTier

  return { gate, bucket, deliveryStatus, previousDelivery, observeReason, isUpdate, demoteFromFinal }
}
