/**
 * Auto-populate the topics pool from today's must_read recommendations.
 * Called from the daily maintenance cron after the snapshot is generated.
 * Uses the same insertion logic as POST /api/topics/from-item but runs in batch.
 * Idempotent — duplicate source_item_id is safely ignored (unique index).
 */

import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'

type TopicCandidate = {
  id:          string
  title:       string | null
  summary:     string | null
  url:         string | null
  final_score: number | null
  ev_score:    number | null
  truth_score: number | null
  source_name: string | null
}

export type AutoPopulateResult = {
  inserted: number
  skipped:  number   // already in pool
  errors:   number
}

export async function autoPopulateTopicsFromMustRead(
  windowHours = 24,
  limit = 20,
): Promise<AutoPopulateResult> {
  if (!isServerSupabaseConfigured || !supabaseServer) {
    return { inserted: 0, skipped: 0, errors: 0 }
  }

  const windowStart = new Date(Date.now() - windowHours * 3_600_000).toISOString()

  // Fetch recent must_read / high-value items flagged for topic pool
  const { data: items, error } = await supabaseServer
    .from('items')
    .select('id, title, summary, url, final_score, ev_score, truth_score, sources!items_source_id_fkey(name)')
    .eq('data_origin', 'real')
    .gte('fetched_at', windowStart)
    .or('should_enter_topic_pool.eq.true,final_score.gte.82')
    .order('final_score', { ascending: false })
    .limit(limit)

  if (error || !items || items.length === 0) {
    if (error) console.error('[auto-populate-topics] query error:', error.message)
    return { inserted: 0, skipped: 0, errors: 0 }
  }

  // Check which are already in topics pool (avoid N+1 queries)
  const ids = items.map(i => i.id)
  const { data: existing } = await supabaseServer
    .from('topics')
    .select('source_item_id')
    .in('source_item_id', ids)

  const existingIds = new Set((existing ?? []).map(r => r.source_item_id as string))

  let inserted = 0
  let skipped  = 0
  let errors   = 0

  for (const raw of items) {
    const item = raw as unknown as TopicCandidate & {
      sources?: { name?: string | null } | null
    }

    if (existingIds.has(item.id)) { skipped++; continue }

    const title      = item.title?.trim() || '(无标题)'
    const sourceName = item.sources?.name ?? null
    const priority   = (item.final_score ?? 0) >= 85 ? 'high'
                     : (item.final_score ?? 0) >= 75 ? 'medium'
                     : 'low'

    // Bare-minimum payload — only columns present in the base topics schema.
    // Score/source columns from later migrations are written via a follow-up
    // update so a missing column degrades gracefully instead of failing the insert.
    void sourceName
    const payload = {
      source_item_id: item.id,
      title,
      priority,
      status: '待判断',
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertErr } = await supabaseServer.from('topics').insert(payload as any)

    if (insertErr) {
      if (insertErr.code === '23505') { skipped++; continue }  // duplicate, race condition
      // Schema mismatch (PGRST204 = column not found): abort loop — retrying every
      // row produces identical errors. Surface one clear hint and stop.
      if (insertErr.code === 'PGRST204' || insertErr.message.includes('schema cache')) {
        console.error(
          `[auto-populate-topics] topics table schema mismatch (${insertErr.message}). ` +
          `Run supabase/schema.sql to align the topics table, then reload the PostgREST schema cache.`
        )
        errors++
        break
      }
      console.error('[auto-populate-topics] insert error:', insertErr.message)
      errors++
    } else {
      inserted++
    }
  }

  console.log(`[auto-populate-topics] done — inserted=${inserted} skipped=${skipped} errors=${errors}`)
  return { inserted, skipped, errors }
}
