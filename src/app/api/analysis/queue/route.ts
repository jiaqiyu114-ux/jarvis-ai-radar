import { type NextRequest, NextResponse } from 'next/server'
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'

/**
 * GET /api/analysis/queue
 * Read-only view of the analysis queue.
 * Supports filtering by tier / stage / budget, and keyset pagination.
 *
 * Does NOT trigger any computation. Use POST /api/analysis/gate/batch for that.
 */

const QUEUE_SELECT = [
  'id', 'source_id', 'title', 'url', 'published_at', 'fetched_at', 'created_at',
  'data_origin', 'category', 'final_score',
  'analysis_tier', 'analysis_stage', 'analysis_priority', 'analysis_reason',
  'token_budget_tier', 'analysis_queued_at',
  'estimated_input_tokens', 'estimated_output_tokens', 'estimated_total_tokens',
  'should_deep_analyze', 'should_track_event', 'should_enter_daily_report', 'should_enter_topic_pool',
  'ev_score', 'truth_score', 'source_trace_score', 'claim_status', 'evidence_level',
  'content_fetch_status', 'content_word_count',
  'sources!items_source_id_fkey(source_tier)',
].join(', ')

type QueueRow = Record<string, unknown> & {
  sources?: { source_tier?: unknown } | null
}

function flattenSourceTier(row: QueueRow): Record<string, unknown> {
  const { sources, ...item } = row
  return {
    ...item,
    source_tier: sources?.source_tier ?? null,
  }
}

export async function GET(req: NextRequest) {
  if (!isServerSupabaseConfigured || !supabaseServer) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 400 })
  }

  const { searchParams } = new URL(req.url)
  const limit     = Math.min(Number(searchParams.get('limit')) || 100, 500)
  const cursor    = searchParams.get('cursor')
  const tier      = searchParams.get('tier')
  const stage     = searchParams.get('stage')
  const budget    = searchParams.get('budget')
  const priority  = searchParams.get('priority')
  const onlyReal  = searchParams.get('onlyReal') !== 'false'

  // ── Summary counts ───────────────────────────────────────────────────────────

  const summaryBase = supabaseServer.from('items').select('*', { count: 'exact', head: true })
  const realFilter  = onlyReal ? summaryBase.eq('data_origin', 'real') : summaryBase

  const [
    { count: totalReal },
    { count: noneCount },
    { count: lightCount },
    { count: standardCount },
    { count: deepCount },
    { count: clusterCount },
    { count: unprocessedCount },
    { count: deepReadyCount },
    { count: clusterReadyCount },
  ] = await Promise.all([
    onlyReal
      ? supabaseServer.from('items').select('*', { count: 'exact', head: true }).eq('data_origin', 'real')
      : supabaseServer.from('items').select('*', { count: 'exact', head: true }),
    realFilter.eq('analysis_tier', 'none'),
    realFilter.eq('analysis_tier', 'light'),
    realFilter.eq('analysis_tier', 'standard'),
    realFilter.eq('analysis_tier', 'deep'),
    realFilter.eq('analysis_tier', 'cluster'),
    onlyReal
      ? supabaseServer.from('items').select('*', { count: 'exact', head: true }).eq('data_origin', 'real').is('analysis_queued_at', null)
      : supabaseServer.from('items').select('*', { count: 'exact', head: true }).is('analysis_queued_at', null),
    realFilter.eq('analysis_stage', 'deep_ready'),
    realFilter.eq('analysis_stage', 'cluster_ready'),
  ])

  // ── Item list ────────────────────────────────────────────────────────────────

  let query = supabaseServer.from('items').select(QUEUE_SELECT)

  if (onlyReal) query = query.eq('data_origin', 'real')
  if (tier)     query = query.eq('analysis_tier', tier)
  if (stage)    query = query.eq('analysis_stage', stage)
  if (budget)   query = query.eq('token_budget_tier', budget)
  if (priority) query = query.eq('analysis_priority', priority)

  // Keyset pagination
  if (cursor) {
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
    .order('analysis_priority', { ascending: false }) // urgent → high → normal → low
    .order('final_score', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)

  const { data: rows, error } = await query

  if (error) {
    console.error('[queue] query error:', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const items = ((rows ?? []) as unknown as QueueRow[]).map(flattenSourceTier)
  const lastItem = items[items.length - 1]
  const nextCursor = lastItem && items.length === limit
    ? Buffer.from(JSON.stringify({ createdAt: lastItem['created_at'], id: lastItem['id'] })).toString('base64')
    : null

  return NextResponse.json({
    ok:   true,
    summary: {
      totalReal:        totalReal ?? 0,
      unprocessed:      unprocessedCount ?? 0,
      processed:        (totalReal ?? 0) - (unprocessedCount ?? 0),
      none:             noneCount ?? 0,
      light:            lightCount ?? 0,
      standard:         standardCount ?? 0,
      deep:             deepCount ?? 0,
      cluster:          clusterCount ?? 0,
      deepReady:        deepReadyCount ?? 0,
      clusterReady:     clusterReadyCount ?? 0,
    },
    limit,
    hasMore:    items.length === limit,
    nextCursor,
    items,
  })
}
