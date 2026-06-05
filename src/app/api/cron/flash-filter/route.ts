/**
 * GET /api/cron/flash-filter
 *
 * Daily maintenance cron (Vercel sends GET).
 * Runs 30 min after the main pipeline cron to process its output.
 *
 * Pipeline cron  (23:30 UTC): ingest + recommendation refresh
 * This cron      (00:30 UTC): flash-filter + evidence + clustering + daily snapshot
 *
 * All steps are rule-based or cheap LLM (DeepSeek-chat). No expensive AI calls.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { runFlashFilter } from '@/lib/analysis/flash-filter'
import { runBatchEvidenceScoring } from '@/lib/ingest/evidence-batch'
import { generateDailyRecommendationSnapshot } from '@/lib/data/daily-recommendation-snapshot'
import { autoPopulateTopicsFromMustRead } from '@/lib/topics/auto-populate'
import { verifyCronRequest } from '@/lib/cron/verify-cron'

export const dynamic = 'force-dynamic'
// Vercel Hobby caps function execution at 60s. Per-run work is bounded below so
// the whole batch finishes well under this; a large backlog clears across runs.
// Event clustering is ~O(N²) and too slow for this budget — it is NOT run here;
// trigger it on demand via POST /api/clusters/generate when needed.
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const auth = verifyCronRequest(req)
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const start = Date.now()
  console.log('[cron/maintenance] start — flash-filter + evidence + daily-snapshot + topics')
  if (auth.warning) console.warn('[cron/maintenance]', auth.warning)

  // Flash-filter + evidence run in parallel (independent). Clustering is excluded
  // to stay within the Hobby 60s budget. A light clustering pass (limit 60, 48h)
  // is attempted only if there's clearly time — capped tight so it can't blow the budget.
  const [flashResult, evidenceResult] = await Promise.allSettled([
    runFlashFilter({ maxItems: 40 }),
    runBatchEvidenceScoring(60),
  ])

  const flash    = flashResult.status   === 'fulfilled' ? flashResult.value   : null
  const evidence = evidenceResult.status === 'fulfilled' ? evidenceResult.value : null

  if (flashResult.status   === 'rejected') console.error('[cron/maintenance] flash-filter error:', flashResult.reason)
  if (evidenceResult.status === 'rejected') console.error('[cron/maintenance] evidence error:',     evidenceResult.reason)

  // Event clustering is intentionally NOT run here — it is ~O(N²) with a DB write
  // per cluster and takes ~55s even at limit 60, which blows the Hobby 60s budget.
  // Trigger it on demand: POST /api/clusters/generate (admin / processing queue UI).

  // Daily snapshot + topic auto-populate (sequential — depend on evidence scores)
  let snapshotResult: { ok: boolean; date?: string; itemCount?: number } | null = null
  let topicsResult:   { inserted: number; skipped: number } | null = null
  try {
    // force: regenerate even if today's run exists, so the report reflects the
    // latest scores/evidence written earlier in this same maintenance run.
    const snap = await generateDailyRecommendationSnapshot({ dryRun: false, force: true })
    snapshotResult = { ok: true, date: snap.date, itemCount: snap.selectedCount }
    console.log(`[cron/maintenance] daily-snapshot done — date=${snap.date} items=${snap.selectedCount} fallback=${snap.fallbackWindow}`)
  } catch (err) {
    console.error('[cron/maintenance] daily-snapshot error:', err instanceof Error ? err.message : err)
  }
  try {
    topicsResult = await autoPopulateTopicsFromMustRead(24, 20)
  } catch (err) {
    console.error('[cron/maintenance] topics error:', err instanceof Error ? err.message : err)
  }

  console.log(
    `[cron/maintenance] done in ${Date.now() - start}ms — ` +
    `flash=${flash ? `${flash.passed}pass/${flash.rejected}rej` : 'err'} ` +
    `evidence=${evidence ? `${evidence.updated}/${evidence.processed}` : 'err'} ` +
    `clusters=skip`
  )

  return NextResponse.json({
    ok:        true,
    trigger:   'vercel-cron',
    durationMs: Date.now() - start,
    flashFilter: flash    ? { passed: flash.passed, rejected: flash.rejected, processed: flash.processed } : null,
    evidence:    evidence ? { updated: evidence.updated, processed: evidence.processed }                    : null,
    clusters:    null,   // run on demand via POST /api/clusters/generate
    dailySnapshot: snapshotResult as { ok: boolean; date?: string; itemCount?: number } | null,
    topics:        topicsResult,
  })
}
