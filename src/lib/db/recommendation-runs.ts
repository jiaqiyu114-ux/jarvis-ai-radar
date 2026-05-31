/**
 * DB layer for the recommendation_runs table.
 *
 * All functions degrade gracefully when:
 *   - Supabase is not configured
 *   - The migration has not been run yet (42P01 = relation does not exist)
 *
 * The table is not in the generated Supabase types, so we use
 * `(supabaseServer as any)` — same pattern as rss_source_fetch_logs.
 */

import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'

// ── Types ─────────────────────────────────────────────────────────────────────

export type RecommendationRunStatus =
  | 'running'
  | 'success'
  | 'partial_success'
  | 'failed'

export type RecommendationRun = {
  id:                      string
  status:                  RecommendationRunStatus
  window_hours:            number
  limit_count:             number | null
  captured_total:          number
  recommended_candidates:  number
  must_read_count:         number
  high_value_count:        number
  observe_count:           number
  archive_count:           number
  started_at:              string
  finished_at:             string | null
  duration_ms:             number | null
  error_message:           string | null
  metadata:                Record<string, unknown>
}

export type RecommendationRunInsert = {
  status?:       RecommendationRunStatus
  window_hours:  number
  limit_count?:  number | null
  started_at?:   string
}

export type RecommendationRunUpdate = {
  status:                  RecommendationRunStatus
  captured_total?:         number
  recommended_candidates?: number
  must_read_count?:        number
  high_value_count?:       number
  observe_count?:          number
  archive_count?:          number
  duration_ms?:            number
  finished_at?:            string
  error_message?:          string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true for any error indicating the table/view doesn't exist yet. */
function isMissingTable(err: { code?: string | null; message?: string | null; details?: string | null }): boolean {
  const code = err.code ?? ''
  const msg  = (err.message ?? '').toLowerCase()
  const det  = (err.details  ?? '').toLowerCase()
  return (
    code === '42P01' ||                         // PostgreSQL: relation does not exist
    code === 'PGRST200' || code === 'PGRST205' || // PostgREST: relation/column not found
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||             // PostgREST schema cache miss
    msg.includes('could not find the table') ||
    msg.includes('could not find a relationship') ||
    det.includes('schema cache') ||
    det.includes('does not exist')
  )
}

// Shorthand: cast server client to bypass Supabase's typed schema for this new table.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db() { return supabaseServer as any }

// ── Public functions ──────────────────────────────────────────────────────────

/**
 * Insert a new run record. Returns the new run ID, or null if unavailable.
 * Call at the START of a recommendation run so the ID can be included in the response.
 */
export async function insertRecommendationRun(
  input: RecommendationRunInsert,
): Promise<string | null> {
  if (!isServerSupabaseConfigured || !supabaseServer) return null
  try {
    const { data, error } = await db()
      .from('recommendation_runs')
      .insert({
        status:       input.status       ?? 'running',
        window_hours: input.window_hours,
        limit_count:  input.limit_count  ?? null,
        started_at:   input.started_at   ?? new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error) {
      if (isMissingTable(error)) { console.warn('[db/recommendation-runs] table not ready (insert)'); return null }
      console.error('[db/recommendation-runs] insert:', error.message)
      return null
    }
    return (data as { id: string } | null)?.id ?? null
  } catch {
    return null
  }
}

/**
 * Update an existing run with results. Call at the END of a recommendation run.
 * Returns true on success, false on any error (non-fatal).
 */
export async function updateRecommendationRun(
  id:     string,
  update: RecommendationRunUpdate,
): Promise<boolean> {
  if (!isServerSupabaseConfigured || !supabaseServer) return false
  try {
    const payload = {
      ...update,
      finished_at: update.finished_at ?? new Date().toISOString(),
    }
    const { error } = await db()
      .from('recommendation_runs')
      .update(payload)
      .eq('id', id)

    if (error) {
      if (isMissingTable(error)) { console.warn('[db/recommendation-runs] table not ready (update)'); return false }
      console.error('[db/recommendation-runs] update:', error.message)
      return false
    }
    return true
  } catch {
    return false
  }
}

/**
 * List the most recent N recommendation runs (most-recent-first).
 * Returns [] when the table is missing or Supabase is unconfigured.
 */
export async function listRecommendationRuns(limit = 20): Promise<RecommendationRun[]> {
  if (!isServerSupabaseConfigured || !supabaseServer) return []
  try {
    const { data, error } = await db()
      .from('recommendation_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(Math.min(limit, 100))

    if (error) {
      if (isMissingTable(error)) { console.warn('[db/recommendation-runs] table not ready (list)'); return [] }
      console.error('[db/recommendation-runs] list:', error.message)
      return []
    }
    return (data ?? []) as RecommendationRun[]
  } catch {
    return []
  }
}

/**
 * Fetch the single most-recent run, or null if none exists.
 * Used by the Dashboard to show last-run status.
 */
export async function getLatestRecommendationRun(): Promise<RecommendationRun | null> {
  if (!isServerSupabaseConfigured || !supabaseServer) return null
  try {
    const { data, error } = await db()
      .from('recommendation_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      if (isMissingTable(error)) { console.warn('[db/recommendation-runs] table not ready (getLatest)'); return null }
      console.error('[db/recommendation-runs] getLatest:', error.message)
      return null
    }
    return (data as RecommendationRun | null) ?? null
  } catch {
    return null
  }
}
