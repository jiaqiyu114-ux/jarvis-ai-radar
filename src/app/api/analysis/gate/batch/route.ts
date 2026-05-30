import { type NextRequest, NextResponse } from 'next/server'
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'
import { buildAnalysisGate } from '@/lib/analysis/budget-gate'
import { updateItemAnalysisGate } from '@/lib/db/items'
import type { DbItem } from '@/types/database'

/**
 * POST /api/analysis/gate/batch
 *
 * Batch-compute and persist analysis gate decisions for multiple items.
 * Uses keyset pagination to avoid loading the entire table at once.
 *
 * Does NOT call any AI / LLM API.
 * Does NOT modify final_score, data_origin, or evidence/truth fields.
 * Does NOT incorporate user behavior feedback.
 */

// Columns that the batch process needs — excludes large text fields (clean_text, raw_payload, etc.)
const BATCH_SELECT = [
  'id', 'title', 'url', 'summary', 'source_tier', 'published_at', 'fetched_at', 'created_at',
  'data_origin', 'category', 'final_score',
  'importance_score', 'novelty_score', 'momentum_score', 'credibility_score',
  'actionability_score', 'content_potential_score', 'personal_fit_score',
  'source_score', 'ai_relevance_score', 'provider_signal',
  'ev_score', 'truth_score', 'source_trace_score',
  'source_nature', 'claim_status', 'evidence_level',
  'has_article_content', 'has_author', 'has_published_time', 'has_media_evidence',
  'content_fetch_status', 'content_word_count',
  'analysis_tier', 'analysis_stage', 'analysis_priority', 'analysis_reason',
  'token_budget_tier', 'analysis_queued_at', 'analysis_updated_at',
  'estimated_input_tokens', 'estimated_output_tokens', 'estimated_total_tokens',
  'should_deep_analyze', 'should_track_event', 'should_enter_daily_report', 'should_enter_topic_pool',
].join(', ')

const MAX_LIMIT = 200
const DEFAULT_LIMIT = 100

export async function POST(req: NextRequest) {
  if (!isServerSupabaseConfigured || !supabaseServer) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 400 })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* use defaults */ }

  const limit      = Math.min(Number(body.limit) || DEFAULT_LIMIT, MAX_LIMIT)
  const cursor     = typeof body.cursor === 'string' ? body.cursor : null
  const dryRun     = body.dryRun !== false   // default true (safe)
  const force      = body.force === true
  const onlyReal   = body.onlyReal !== false  // default true
  const minScore   = Number(body.minScore) || 0

  // ── Build query ──────────────────────────────────────────────────────────────

  let query = supabaseServer.from('items').select(BATCH_SELECT)

  if (onlyReal) {
    query = query.eq('data_origin', 'real')
  }

  if (minScore > 0) {
    query = query.gte('final_score', minScore)
  }

  if (!force) {
    // Only process items that haven't been gated yet
    query = query.or('analysis_queued_at.is.null,analysis_stage.eq.unprocessed')
  }

  // Keyset pagination using created_at + id (both always non-null)
  if (cursor) {
    // cursor format: base64(JSON({ createdAt, id }))
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8')) as { createdAt: string; id: string }
      query = query.or(
        `created_at.lt.${decoded.createdAt},and(created_at.eq.${decoded.createdAt},id.lt.${decoded.id})`
      )
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid cursor' }, { status: 400 })
    }
  }

  query = query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)

  const { data: rows, error } = await query

  if (error) {
    console.error('[batch/gate] query error:', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const items = (rows ?? []) as unknown as DbItem[]

  // ── Process each item ────────────────────────────────────────────────────────

  const results: Array<{
    id: string; title: string; finalScore: number
    analysisTier: string; analysisPriority: string; analysisStage: string
    tokenBudgetTier: string; estimatedTotalTokens: number
    shouldDeepAnalyze: boolean; shouldTrackEvent: boolean
    shouldEnterDailyReport: boolean; shouldEnterTopicPool: boolean
    analysisReason: string
  }> = []

  const errors: Array<{ id: string; title: string; error: string }> = []

  const summary = { none: 0, light: 0, standard: 0, deep: 0, cluster: 0, estimatedTotalTokens: 0 }

  for (const item of items) {
    try {
      const gate = buildAnalysisGate(item)

      summary[gate.analysisTier as keyof typeof summary] =
        (summary[gate.analysisTier as keyof typeof summary] as number) + 1
      summary.estimatedTotalTokens += gate.estimatedTotalTokens

      results.push({
        id:                  item.id,
        title:               item.title,
        finalScore:          item.final_score ?? 0,
        analysisTier:        gate.analysisTier,
        analysisPriority:    gate.analysisPriority,
        analysisStage:       gate.analysisStage,
        tokenBudgetTier:     gate.tokenBudgetTier,
        estimatedTotalTokens:gate.estimatedTotalTokens,
        shouldDeepAnalyze:   gate.shouldDeepAnalyze,
        shouldTrackEvent:    gate.shouldTrackEvent,
        shouldEnterDailyReport: gate.shouldEnterDailyReport,
        shouldEnterTopicPool:   gate.shouldEnterTopicPool,
        analysisReason:      gate.analysisReason,
      })

      if (!dryRun) {
        await updateItemAnalysisGate(item.id, {
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
      }
    } catch (err) {
      errors.push({
        id:    item.id,
        title: item.title,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // ── Cursor for next page ─────────────────────────────────────────────────────

  const lastItem = items[items.length - 1]
  const nextCursor = lastItem && items.length === limit
    ? Buffer.from(JSON.stringify({ createdAt: lastItem.created_at, id: lastItem.id })).toString('base64')
    : null

  return NextResponse.json({
    ok:        true,
    dryRun,
    limit,
    processed: items.length,
    updated:   dryRun ? 0 : results.length - errors.length,
    skipped:   0,
    failed:    errors.length,
    hasMore:   items.length === limit,
    nextCursor,
    summary,
    items:     results,
    errors:    errors.length > 0 ? errors : undefined,
  })
}
