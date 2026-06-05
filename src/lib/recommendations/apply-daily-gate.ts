/**
 * Apply the daily hard gate to a list of engine recommendations.
 *
 * Shared by every route that writes a recommendation snapshot
 * (/api/cron/pipeline, /api/pipeline/recommendations, /api/recommendations/refresh)
 * so the gate is applied consistently everywhere — historically only the
 * /refresh route applied it, which let the cron + manual pipelines store
 * ungated snapshots where stale items were never demoted. See [[daily-gate]].
 *
 * The gate does NOT remove items from the snapshot — it sets each item's
 * recommendationBucket / deliveryStatus and demotes "not eligible for today"
 * items (captured yesterday, published too old, previously delivered) from
 * must_read/high_value down to observe. The dashboard reads the bucket to
 * decide what counts as "today's recommendation" vs "observe backlog".
 */

import {
  deriveGateDecision,
  JARVIS_TIMEZONE,
  todayKey,
} from '@/lib/recommendations/daily-gate'
import { getPreviouslyRecommendedItemIds } from '@/lib/db/recommendation-snapshots'
import {
  getTodayDeliveredItemIds,
  writeDeliveries,
} from '@/lib/db/recommendation-deliveries'
import type { RecommendedItem } from '@/lib/recommendations/recommendation-engine'

export type DailyGateStats = {
  timezone:                       string
  todayKey:                       string
  todayRecommendationCount:       number   // must_read + high_value after gate
  todayMustReadCount:             number
  todayHighValueCount:            number
  observeBacklogCount:            number   // items demoted to observe by gate
  suppressedPreviousDayCount:     number   // captured_yesterday_or_older / published_too_old
  previousDeliveredExcludedCount: number   // previously in must_read/high_value
  updateCandidateCount:           number   // title signals new development
  recentUnpushedObserveCount:     number   // recent but not today → observe
}

function emptyStats(tz: string, today: string): DailyGateStats {
  return {
    timezone:                       tz,
    todayKey:                       today,
    todayRecommendationCount:       0,
    todayMustReadCount:             0,
    todayHighValueCount:            0,
    observeBacklogCount:            0,
    suppressedPreviousDayCount:     0,
    previousDeliveredExcludedCount: 0,
    updateCandidateCount:           0,
    recentUnpushedObserveCount:     0,
  }
}

/**
 * Run the daily gate over `items` (which should already exclude archive-tier).
 * Returns gated items plus a stats summary for snapshot metadata / diagnostics.
 */
export async function applyDailyGate(
  items: RecommendedItem[],
  tz = JARVIS_TIMEZONE,
): Promise<{ items: RecommendedItem[]; gateStats: DailyGateStats; today: string }> {
  const today = todayKey(tz)

  // Detect previously delivered items via BOTH the deliveries table (precise,
  // same-day) and recent snapshots (fallback for pre-migration data).
  const [snapshotDeliveredIds, deliveryTableIds] = await Promise.all([
    getPreviouslyRecommendedItemIds().catch(() => new Set<string>()),
    getTodayDeliveredItemIds(today).catch(() => new Set<string>()),
  ])
  const prevDeliveredIds = new Set<string>([...snapshotDeliveredIds, ...deliveryTableIds])

  const gateStats = emptyStats(tz, today)

  const gated = items.map(i => {
    const decision = deriveGateDecision(i, prevDeliveredIds, i.id, tz)

    if (decision.gate.reason === 'captured_yesterday_or_older' ||
        decision.gate.reason === 'published_too_old') {
      gateStats.suppressedPreviousDayCount++
    }
    if (decision.gate.reason === 'previously_delivered') {
      gateStats.previousDeliveredExcludedCount++
    }
    if (decision.isUpdate) gateStats.updateCandidateCount++
    if (decision.deliveryStatus === 'recent_unpushed') gateStats.recentUnpushedObserveCount++

    if (decision.demoteFromFinal) {
      gateStats.observeBacklogCount++
      return {
        ...i,
        recommendationTier:   'observe' as const,
        recommendationBucket: decision.bucket,
        deliveryStatus:       decision.deliveryStatus,
        dailyGate:            decision.gate,
        previousDelivery:     decision.previousDelivery,
        observeReason:        decision.observeReason,
      }
    }

    const enriched: RecommendedItem = {
      ...i,
      recommendationBucket: decision.bucket,
      deliveryStatus:       decision.deliveryStatus,
      dailyGate:            decision.gate,
      previousDelivery:     decision.previousDelivery,
      observeReason:        decision.observeReason,
    }
    if (enriched.recommendationTier === 'must_read') {
      gateStats.todayRecommendationCount++
      gateStats.todayMustReadCount++
    } else if (enriched.recommendationTier === 'high_value') {
      gateStats.todayRecommendationCount++
      gateStats.todayHighValueCount++
    }
    return enriched
  })

  return { items: gated, gateStats, today }
}

/**
 * Persist today_recommendation / observe_backlog items to the deliveries table
 * so the next refresh can quickly detect what was already delivered today.
 * Degrades to a no-op if the table isn't migrated yet.
 */
export async function persistDeliveries(
  items: RecommendedItem[],
  today: string,
  snapshotId: string | null,
): Promise<{ written: number; skipped: number }> {
  const records = items
    .filter(i => i.recommendationBucket === 'today_recommendation' || i.recommendationBucket === 'observe_backlog')
    .map(i => ({
      itemId:         i.id,
      snapshotId:     snapshotId ?? undefined,
      deliveryDate:   today,
      deliveryBucket: (i.recommendationBucket ?? 'archive') as 'today_recommendation' | 'observe_backlog' | 'archive',
      tier:           i.recommendationTier ?? null,
      finalScore:     i.finalScore ?? null,
      reason:         i.recommendationBucket === 'today_recommendation' ? 'daily_push_v1' : 'observe_backlog_v1',
    }))
  return writeDeliveries(records)
}
