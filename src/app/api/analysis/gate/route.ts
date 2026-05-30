import { type NextRequest, NextResponse } from 'next/server'
import { isServerSupabaseConfigured } from '@/lib/supabase/server'
import { getItemForContentFetch, updateItemAnalysisGate } from '@/lib/db/items'
import { buildAnalysisGate } from '@/lib/analysis/budget-gate'

/**
 * POST /api/analysis/gate
 * Compute and persist the analysis tier / budget gate decision for a single item.
 *
 * Body: { "itemId": "<uuid>", "force": false }
 *
 * GET /api/analysis/gate?itemId=<uuid>
 * Read-only status check.
 *
 * Does NOT call any AI / LLM API.
 * Does NOT modify final_score or data_origin.
 * Does NOT incorporate behavioral feedback.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 400 })
  }

  let body: { itemId?: unknown; force?: unknown }
  try { body = await req.json() }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 }) }

  const itemId = typeof body.itemId === 'string' ? body.itemId.trim() : null
  const force  = body.force === true

  if (!itemId || !UUID_RE.test(itemId)) {
    return NextResponse.json({ ok: false, error: 'itemId must be a valid UUID' }, { status: 400 })
  }

  const item = await getItemForContentFetch(itemId)
  if (!item) {
    return NextResponse.json({ ok: false, itemId, error: 'Item not found' }, { status: 404 })
  }

  // Return cached if already gated and not forced
  const alreadyGated = Boolean((item as { analysis_queued_at?: string | null }).analysis_queued_at)
  if (alreadyGated && !force) {
    const i = item as {
      analysis_tier?: string | null
      analysis_priority?: string | null
      analysis_stage?: string | null
      token_budget_tier?: string | null
      estimated_input_tokens?: number | null
      estimated_output_tokens?: number | null
      estimated_total_tokens?: number | null
      should_deep_analyze?: boolean | null
      should_track_event?: boolean | null
      should_enter_daily_report?: boolean | null
      should_enter_topic_pool?: boolean | null
      analysis_reason?: string | null
      analysis_queued_at?: string | null
    }
    return NextResponse.json({
      ok:                     true,
      itemId,
      cached:                 true,
      analysisTier:           i.analysis_tier,
      analysisPriority:       i.analysis_priority,
      analysisStage:          i.analysis_stage,
      tokenBudgetTier:        i.token_budget_tier,
      estimatedInputTokens:   i.estimated_input_tokens,
      estimatedOutputTokens:  i.estimated_output_tokens,
      estimatedTotalTokens:   i.estimated_total_tokens,
      shouldDeepAnalyze:      i.should_deep_analyze,
      shouldTrackEvent:       i.should_track_event,
      shouldEnterDailyReport: i.should_enter_daily_report,
      shouldEnterTopicPool:   i.should_enter_topic_pool,
      analysisReason:         i.analysis_reason,
      queuedAt:               i.analysis_queued_at,
    })
  }

  // Compute
  const gate = buildAnalysisGate(item)

  // Persist
  const saved = await updateItemAnalysisGate(itemId, {
    analysisTier:           gate.analysisTier,
    analysisPriority:       gate.analysisPriority,
    analysisStage:          gate.analysisStage,
    analysisReason:         gate.analysisReason,
    tokenBudgetTier:        gate.tokenBudgetTier,
    estimatedInputTokens:   gate.estimatedInputTokens,
    estimatedOutputTokens:  gate.estimatedOutputTokens,
    estimatedTotalTokens:   gate.estimatedTotalTokens,
    shouldDeepAnalyze:      gate.shouldDeepAnalyze,
    shouldTrackEvent:       gate.shouldTrackEvent,
    shouldEnterDailyReport: gate.shouldEnterDailyReport,
    shouldEnterTopicPool:   gate.shouldEnterTopicPool,
  })

  if (!saved) {
    return NextResponse.json({ ok: false, itemId, error: 'Failed to persist analysis gate' }, { status: 500 })
  }

  return NextResponse.json({
    ok:                     true,
    itemId,
    cached:                 false,
    analysisTier:           gate.analysisTier,
    analysisPriority:       gate.analysisPriority,
    analysisStage:          gate.analysisStage,
    tokenBudgetTier:        gate.tokenBudgetTier,
    estimatedInputTokens:   gate.estimatedInputTokens,
    estimatedOutputTokens:  gate.estimatedOutputTokens,
    estimatedTotalTokens:   gate.estimatedTotalTokens,
    shouldDeepAnalyze:      gate.shouldDeepAnalyze,
    shouldTrackEvent:       gate.shouldTrackEvent,
    shouldEnterDailyReport: gate.shouldEnterDailyReport,
    shouldEnterTopicPool:   gate.shouldEnterTopicPool,
    analysisReason:         gate.analysisReason,
    queuedAt:               gate.queuedAt,
  })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const itemId = searchParams.get('itemId')

  if (!itemId || !UUID_RE.test(itemId)) {
    return NextResponse.json({ ok: false, error: 'itemId must be a valid UUID' }, { status: 400 })
  }

  if (!isServerSupabaseConfigured) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 400 })
  }

  const item = await getItemForContentFetch(itemId)
  if (!item) {
    return NextResponse.json({ ok: false, error: 'Item not found' }, { status: 404 })
  }

  const i = item as {
    analysis_tier?: string | null
    analysis_priority?: string | null
    analysis_stage?: string | null
    token_budget_tier?: string | null
    estimated_total_tokens?: number | null
    analysis_reason?: string | null
    analysis_queued_at?: string | null
  }

  return NextResponse.json({
    ok:              true,
    itemId,
    analysisTier:    i.analysis_tier,
    analysisPriority:i.analysis_priority,
    analysisStage:   i.analysis_stage,
    tokenBudgetTier: i.token_budget_tier,
    estimatedTotal:  i.estimated_total_tokens,
    analysisReason:  i.analysis_reason,
    queuedAt:        i.analysis_queued_at,
  })
}
