import { NextRequest, NextResponse } from 'next/server'
import { getRecommendations, DEFAULT_THRESHOLDS, type TierThresholds } from '@/lib/recommendations/recommendation-engine'
import {
  attachDeepDivesToRecommendations,
  type FinalDeepDiveMode,
} from '@/lib/recommendations/deep-dive'
import { attachRelatedSignals } from '@/lib/recommendations/related-signals'
import { deriveGateDecision, JARVIS_TIMEZONE, todayKey } from '@/lib/recommendations/daily-gate'
import { getDeepDiveModel, getLlmConfig } from '@/lib/llm/deep-dive-client'
import {
  insertRecommendationRun,
  updateRecommendationRun,
} from '@/lib/db/recommendation-runs'
import {
  createRecommendationSnapshot,
  getPreviouslyRecommendedItemIds,
} from '@/lib/db/recommendation-snapshots'
import {
  getTodayDeliveredItemIds,
  writeDeliveries,
} from '@/lib/db/recommendation-deliveries'

export const dynamic = 'force-dynamic'

type RefreshRequestBody = {
  deepDive?: unknown
}

function parseDeepDiveMode(raw: unknown): FinalDeepDiveMode {
  return String(raw ?? '').toLowerCase() === 'deterministic' ? 'deterministic' : 'llm'
}

/**
 * POST /api/recommendations/refresh
 *
 * Query params:
 * - deepDive=llm|deterministic (default: llm)
 *
 * The route always writes a fresh snapshot when engine execution succeeds.
 * LLM deepDive generation is best-effort and degrades per-item.
 */
export async function POST(req: NextRequest) {
  const WINDOW_HOURS = 72
  const LIMIT = 50
  const startMs = Date.now()
  const startedAt = new Date().toISOString()

  let body: RefreshRequestBody = {}
  try {
    body = await req.json() as RefreshRequestBody
  } catch {
    body = {}
  }

  const queryMode = req.nextUrl.searchParams.get('deepDive')
  const deepDiveMode = parseDeepDiveMode(queryMode ?? body.deepDive)
  const llmConfig = getLlmConfig()

  // Custom tier thresholds from query params (set by recommendation intensity presets)
  const sp = req.nextUrl.searchParams
  const thresholds: TierThresholds = {
    mustRead:  Number(sp.get('mustRead'))  || DEFAULT_THRESHOLDS.mustRead,
    highValue: Number(sp.get('highValue')) || DEFAULT_THRESHOLDS.highValue,
    observe:   Number(sp.get('observe'))   || DEFAULT_THRESHOLDS.observe,
  }

  const runId = await insertRecommendationRun({
    status: 'running',
    window_hours: WINDOW_HOURS,
    limit_count: LIMIT,
    started_at: startedAt,
  })

  try {
    const queryStart = Date.now()
    // fetchAll=true: threshold-based — every item that meets the score threshold
    // (must_read ≥ 80, high_value ≥ 65) is eligible, not just the top-LIMIT.
    // LIMIT is still used as the fallback for non-fetchAll callers and run stats.
    const result = await getRecommendations({ windowHours: WINDOW_HOURS, limit: LIMIT, includeArchive: true, fetchAll: true, thresholds })
    const queryDurationMs = Date.now() - queryStart

    const durationMs = Date.now() - startMs
    const runStatus = result.items.length > 0 ? 'success' : 'partial_success'

    if (runId) {
      await updateRecommendationRun(runId, {
        status: runStatus,
        captured_total: result.stats.capturedTotal,
        recommended_candidates: result.stats.recommendationCandidates,
        must_read_count: result.stats.mustReadCount,
        high_value_count: result.stats.highValueCount,
        observe_count: result.stats.observeCount,
        archive_count: result.stats.archiveCount,
        duration_ms: durationMs,
        finished_at: new Date().toISOString(),
      })
    }

    // ── Daily hard gate ───────────────────────────────────────────────────────
    // Uses BOTH the deliveries table (precise, same-day) and recent snapshots
    // (fallback for pre-migration data) to detect previously delivered items.
    const today = todayKey(JARVIS_TIMEZONE)
    const [snapshotDeliveredIds, deliveryTableIds] = await Promise.all([
      getPreviouslyRecommendedItemIds(),
      getTodayDeliveredItemIds(today),
    ])
    // Merge both sets — delivery table takes precedence for today's items
    const prevDeliveredIds = new Set([...snapshotDeliveredIds, ...deliveryTableIds])

    const gateStats = {
      timezone:                       JARVIS_TIMEZONE,
      todayKey:                       today,
      // Threshold-based counts — no fixed top-N
      todayRecommendationCount:       0,   // must_read + high_value after gate
      todayMustReadCount:             0,
      todayHighValueCount:            0,
      observeBacklogCount:            0,   // items demoted to observe by gate
      suppressedPreviousDayCount:     0,   // captured_yesterday_or_older
      previousDeliveredExcludedCount: 0,   // previously in must_read/high_value
      updateCandidateCount:           0,   // title signals new development
      recentUnpushedObserveCount:     0,   // recent but not today → observe
      // DeepDive coverage (all today recommendations should get deepDive)
      deepDiveEligibleCount:          0,   // must_read+high_value eligible for deepDive
    }

    const snapshotItemsBase = result.items
      .filter(i => i.recommendationTier !== 'archive')
      .map(i => {
        const decision = deriveGateDecision(i, prevDeliveredIds, i.id, JARVIS_TIMEZONE)

        // Track stats
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

        const enriched = {
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
          gateStats.deepDiveEligibleCount++
        } else if (enriched.recommendationTier === 'high_value') {
          gateStats.todayRecommendationCount++
          gateStats.todayHighValueCount++
          gateStats.deepDiveEligibleCount++
        }
        return enriched
      })

    // DeepDive: generated for ALL must_read/high_value items (no budget cap).
    // Concurrency controls parallelism only, not total count.
    // This ensures deepDive coverage doesn't hide eligible recommendations.
    const deepDiveStart = Date.now()
    const { items: snapshotItemsWithDeepDive, deepDiveStats } =
      await attachDeepDivesToRecommendations(snapshotItemsBase, {
        mode: deepDiveMode,
        concurrency: 2,
        includeSkipped: false,
      })
    const deepDiveDurationMs = Date.now() - deepDiveStart

    // Verify deepDive coverage: all today recommendations should have deepDive
    // (or a deterministic fallback). hiddenDueToDeepDiveBudget must be 0.
    const deepDiveReadyCount   = snapshotItemsWithDeepDive.filter(i =>
      (i.recommendationTier === 'must_read' || i.recommendationTier === 'high_value') && i.deepDive
    ).length
    const hiddenDueToDeepDiveBudget = 0  // always 0 — deepDive has no cap
    // deepDiveEligibleCount already tracked in gateStats above

    // Compute related signals (rule-based, no LLM). Uses the full candidate pool
    // (all tiers including archive) as the match space.
    const relatedStart = Date.now()
    const snapshotItemsFinal = attachRelatedSignals(snapshotItemsWithDeepDive, result.items)
    const relatedSignalsMs = Date.now() - relatedStart
    const relatedStats = {
      ms: relatedSignalsMs,
      candidatePoolSize: result.items.length,
      itemsWithSignals: snapshotItemsFinal.filter(i => (i.relatedSignals?.length ?? 0) > 0).length,
      avgSignals: snapshotItemsFinal.length > 0
        ? Math.round(snapshotItemsFinal.reduce((s, i) => s + (i.relatedSignals?.length ?? 0), 0) / snapshotItemsFinal.length * 10) / 10
        : 0,
    }

    const snapshotId = await createRecommendationSnapshot(
      {
        run_id: runId ?? undefined,
        status: runStatus,
        window_hours: WINDOW_HOURS,
        limit_count: LIMIT,
        captured_total: result.stats.capturedTotal,
        recommendation_candidates: result.stats.recommendationCandidates,
        must_read_count: result.stats.mustReadCount,
        high_value_count: result.stats.highValueCount,
        observe_count: result.stats.observeCount,
        archive_count: result.stats.archiveCount,
        generated_at: new Date().toISOString(),
        metadata: {
          deepDiveMode,
          deepDiveStats,
          relatedSignals: relatedStats,
          dailyGate: gateStats,
          thresholds,   // store the thresholds used for this snapshot
        },
      },
      snapshotItemsFinal,
    )

    // ── Write delivery records ────────────────────────────────────────────────
    // Persist today_recommendation and observe_backlog items to the deliveries
    // table so the next refresh can quickly check what was already delivered today.
    const deliveryRecords = snapshotItemsFinal
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
    const deliveryResult = await writeDeliveries(deliveryRecords)
    console.log(`[refresh] deliveries written=${deliveryResult.written} skipped=${deliveryResult.skipped}`)

    const run = runId
      ? { id: runId, status: runStatus, startedAt, durationMs }
      : null

    const snapshot = snapshotId
      ? {
          id: snapshotId,
          runId,
          status: runStatus,
          generatedAt: new Date().toISOString(),
          windowHours: WINDOW_HOURS,
          capturedTotal: result.stats.capturedTotal,
          recommendationCandidates: result.stats.recommendationCandidates,
          mustReadCount: result.stats.mustReadCount,
          highValueCount: result.stats.highValueCount,
          observeCount: result.stats.observeCount,
          archiveCount: result.stats.archiveCount,
        }
      : null

    return NextResponse.json({
      ok: true,
      runStatus,
      durationMs,
      timing: {
        totalMs:          durationMs,
        queryMs:          queryDurationMs,
        deepDiveMs:       deepDiveDurationMs,
        relatedSignalsMs,
      },
      deepDiveMode,
      deepDiveStats,
      relatedSignals:           relatedStats,
      dailyGate:                gateStats,
      // Threshold coverage audit: always 0 with uncapped deepDive
      hiddenDueToDeepDiveBudget: hiddenDueToDeepDiveBudget,
      deepDiveReadyCount,
      run,
      snapshot,
      stats: result.stats,
      items: snapshotItemsFinal,
    })
  } catch (err) {
    const durationMs = Date.now() - startMs
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[POST /api/recommendations/refresh]', message)

    if (runId) {
      await updateRecommendationRun(runId, {
        status: 'failed',
        error_message: message.slice(0, 500),
        duration_ms: durationMs,
        finished_at: new Date().toISOString(),
      })
    }

    return NextResponse.json(
      {
        ok: false,
        runStatus: 'failed',
        error: message,
        durationMs,
        deepDiveMode,
        deepDiveStats: {
          total: 0,
          generated: 0,
          fallback: 0,
          failed: 0,
          model: deepDiveMode === 'llm' ? getDeepDiveModel(llmConfig) : 'deterministic-v1',
          provider: deepDiveMode === 'llm' ? llmConfig.provider : 'deterministic',
          mode: deepDiveMode,
        },
        run: runId ? { id: runId, status: 'failed', startedAt, durationMs } : null,
        snapshot: null,
      },
      { status: 500 },
    )
  }
}
