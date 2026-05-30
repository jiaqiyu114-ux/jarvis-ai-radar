export const dynamic = 'force-dynamic'

import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'
import AnalysisClient from './_analysis-client'

type QueueSummary = {
  totalReal:    number
  unprocessed:  number
  processed:    number
  none:         number
  light:        number
  standard:     number
  deep:         number
  cluster:      number
  deepReady:    number
  clusterReady: number
}

async function fetchSummary(): Promise<QueueSummary | null> {
  if (!isServerSupabaseConfigured || !supabaseServer) return null

  const base = (extra?: Record<string, string | boolean | null>) => {
    let q = supabaseServer!.from('items').select('*', { count: 'exact', head: true }).eq('data_origin', 'real')
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        if (v === null) {
          q = q.is(k, null)
        } else {
          q = q.eq(k, v)
        }
      }
    }
    return q
  }

  const [
    { count: totalReal },
    { count: noneC },
    { count: lightC },
    { count: standardC },
    { count: deepC },
    { count: clusterC },
    { count: unprocessedC },
    { count: deepReadyC },
    { count: clusterReadyC },
  ] = await Promise.all([
    base(),
    base({ analysis_tier: 'none' }),
    base({ analysis_tier: 'light' }),
    base({ analysis_tier: 'standard' }),
    base({ analysis_tier: 'deep' }),
    base({ analysis_tier: 'cluster' }),
    base({ analysis_queued_at: null }),
    base({ analysis_stage: 'deep_ready' }),
    base({ analysis_stage: 'cluster_ready' }),
  ])

  const total = totalReal ?? 0
  const unproc = unprocessedC ?? 0

  return {
    totalReal:    total,
    unprocessed:  unproc,
    processed:    total - unproc,
    none:         noneC ?? 0,
    light:        lightC ?? 0,
    standard:     standardC ?? 0,
    deep:         deepC ?? 0,
    cluster:      clusterC ?? 0,
    deepReady:    deepReadyC ?? 0,
    clusterReady: clusterReadyC ?? 0,
  }
}

async function fetchInitialItems() {
  if (!isServerSupabaseConfigured || !supabaseServer) return []

  const SELECT = [
    'id', 'title', 'final_score', 'source_tier', 'category',
    'published_at', 'fetched_at', 'created_at', 'data_origin',
    'analysis_tier', 'analysis_stage', 'analysis_priority', 'analysis_reason',
    'token_budget_tier', 'analysis_queued_at',
    'estimated_total_tokens', 'estimated_input_tokens', 'estimated_output_tokens',
    'should_deep_analyze', 'should_track_event', 'should_enter_daily_report', 'should_enter_topic_pool',
    'ev_score', 'truth_score', 'claim_status', 'source_trace_score',
    'content_fetch_status', 'content_word_count',
  ].join(', ')

  const { data } = await supabaseServer
    .from('items')
    .select(SELECT)
    .eq('data_origin', 'real')
    .not('analysis_queued_at', 'is', null)
    .order('final_score', { ascending: false, nullsFirst: false })
    .limit(50)

  return data ?? []
}

export default async function AnalysisPage() {
  const [summary, items] = await Promise.all([fetchSummary(), fetchInitialItems()])

  return (
    <AnalysisClient
      initialSummary={summary}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialItems={items as any}
      topSignal={undefined}
    />
  )
}
