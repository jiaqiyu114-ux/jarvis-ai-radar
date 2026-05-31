import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'
import type { DbSource, DbSourceInsert, DbSourceUpdate } from '@/types/database'

// ── URL normalisation ─────────────────────────────────────────────────────────

/** Query params that add no semantic value and should be stripped before dedup. */
const SOURCE_TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id',
  'ref', 'fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid',
]

/**
 * Normalise a source URL before DB lookup/insert to prevent duplicates from
 * trivial variants: trailing slash, uppercase hostname, UTM / tracking params.
 *
 * Does NOT merge http↔https or strip subdomains — those are intentional differences
 * that could point to different services.
 */
export function normalizeSourceUrl(raw: string): string {
  const trimmed = raw.trim()
  try {
    const parsed = new URL(trimmed)
    parsed.hostname = parsed.hostname.toLowerCase()
    // Remove trailing slash from non-root paths
    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1)
    }
    // Strip tracking params
    for (const p of SOURCE_TRACKING_PARAMS) {
      parsed.searchParams.delete(p)
    }
    return parsed.toString()
  } catch {
    return trimmed
  }
}

// ── Public read functions (use anon client — safe for UI data adapters) ────────

/** Find a source by its URL. Uses the anon client (read-only). */
export async function getSourceByUrl(url: string): Promise<DbSource | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .eq('url', normalizeSourceUrl(url))
    .maybeSingle()
  if (error) { console.error('[db/sources] getSourceByUrl:', error.message); return null }
  return data ?? null
}

/**
 * Find a source by URL, creating it if it doesn't exist.
 * Uses supabaseServer consistently for both reads and writes.
 *
 * Dedup strategy (in order):
 *   1. Exact match on normalised URL
 *   2. Exact match on name (catches cases where same source has multiple URL representations)
 *   3. INSERT if nothing found
 *   4. On 23505 (race): retry lookup by URL
 *
 * Returns { id, source_tier } or null if url is missing or server client unavailable.
 */
export async function findOrCreateSource(input: {
  name?:     string | null
  url?:      string | null
  category?: string | null
}): Promise<{ id: string; source_tier: string } | null> {
  if (!isServerSupabaseConfigured || !supabaseServer) return null
  if (!input.url) return null   // sources.url is NOT NULL

  const normUrl = normalizeSourceUrl(input.url)

  // 1. Lookup by normalised URL (server client for consistency)
  const { data: byUrl, error: e1 } = await supabaseServer
    .from('sources')
    .select('id, source_tier')
    .eq('url', normUrl)
    .maybeSingle()
  if (e1) console.error('[db/sources] findOrCreateSource lookup by url:', e1.message)
  if (byUrl?.id) return { id: byUrl.id, source_tier: byUrl.source_tier }

  // 2. Fallback: lookup by name (avoids duplicate if URL changed but source name is same)
  if (input.name) {
    const { data: byName, error: e2 } = await supabaseServer
      .from('sources')
      .select('id, source_tier')
      .eq('name', input.name)
      .maybeSingle()
    if (e2) console.error('[db/sources] findOrCreateSource lookup by name:', e2.message)
    if (byName?.id) return { id: byName.id, source_tier: byName.source_tier }
  }

  // 3. Insert
  const insertPayload = {
    name:              input.name ?? normUrl,
    url:               normUrl,
    category:          input.category ?? '其他',
    source_tier:       'C',
    base_score:        50,
    reliability_score: 50,
  } satisfies DbSourceInsert

  const { data, error } = await supabaseServer
    .from('sources')
    .insert(insertPayload)
    .select('id, source_tier')
    .single()

  if (error) {
    // Race condition: another request already inserted this URL
    if (error.code === '23505') {
      const { data: retry } = await supabaseServer
        .from('sources')
        .select('id, source_tier')
        .eq('url', normUrl)
        .maybeSingle()
      if (retry?.id) return { id: retry.id, source_tier: retry.source_tier }
      console.error('[db/sources] findOrCreateSource 23505 retry also failed')
      return null
    }
    console.error('[db/sources] findOrCreateSource insert:', error.message, '| code:', error.code)
    return null
  }

  return data ? { id: data.id, source_tier: data.source_tier } : null
}

// ── General-purpose functions (anon client) ───────────────────────────────────

export async function listSources(): Promise<DbSource[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .order('source_tier', { ascending: true })
    .order('name', { ascending: true })
  if (error) { console.error('[db/sources] listSources:', error.message); return [] }
  return data ?? []
}

export type RssSourceLoadResult = {
  sources:    DbSource[]
  error:      { message: string; code?: string; details?: string; hint?: string } | null
  attempted:  boolean   // true if a DB query was actually attempted
}

/**
 * Returns non-blocked sources that have platform='rss', with full diagnostic info.
 * Use this instead of listRssSources() when you need to know WHY the result is empty.
 *
 * is_blocked filter: accepts false OR null (some rows may have NULL from older seeds).
 */
export async function listRssSourcesWithDiag(): Promise<RssSourceLoadResult> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      sources:   [],
      error:     { message: 'Supabase anon client not configured (missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY)' },
      attempted: false,
    }
  }

  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .or('is_blocked.eq.false,is_blocked.is.null')   // handles false AND null
    .eq('platform', 'rss')
    .order('source_tier', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    console.error('[db/sources] listRssSourcesWithDiag:', error.message)
    return {
      sources:   [],
      error:     { message: error.message, code: error.code ?? undefined, details: error.details ?? undefined, hint: error.hint ?? undefined },
      attempted: true,
    }
  }

  return { sources: data ?? [], error: null, attempted: true }
}

/**
 * Returns non-blocked RSS sources. Convenience wrapper — errors are logged to console.
 * Use listRssSourcesWithDiag() when you need error details in the response.
 */
export async function listRssSources(): Promise<DbSource[]> {
  const { sources } = await listRssSourcesWithDiag()
  return sources
}

/** Returns only non-blocked sources — used by the ingest pipeline. */
export async function listActiveSources(): Promise<DbSource[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .eq('is_blocked', false)
    .order('source_tier', { ascending: true })
    .order('name', { ascending: true })
  if (error) { console.error('[db/sources] listActiveSources:', error.message); return [] }
  return data ?? []
}

export async function getSourceById(id: string): Promise<DbSource | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .eq('id', id)
    .single()
  if (error) { console.error('[db/sources] getSourceById:', error.message); return null }
  return data
}

export async function createSource(input: DbSourceInsert): Promise<DbSource | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('sources')
    .insert(input)
    .select()
    .single()
  if (error) { console.error('[db/sources] createSource:', error.message); return null }
  return data
}

export async function updateSource(id: string, input: DbSourceUpdate): Promise<DbSource | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('sources')
    .update(input)
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('[db/sources] updateSource:', error.message); return null }
  return data
}

export async function blockSource(id: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false
  const { error } = await supabase
    .from('sources')
    .update({ is_blocked: true })
    .eq('id', id)
  if (error) { console.error('[db/sources] blockSource:', error.message); return false }
  return true
}

// ── RSS Source Health methods (server client — write operations) ───────────────

/**
 * Returns all RSS sources including health fields.
 * Includes blocked sources (for display). Uses the anon client (read-only).
 */
export async function listRssSourcesWithHealth(): Promise<DbSource[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .eq('platform', 'rss')
    .order('source_tier', { ascending: true })
    .order('name', { ascending: true })
  if (error) { console.error('[db/sources] listRssSourcesWithHealth:', error.message); return [] }
  return data ?? []
}

// ── Health score helpers ──────────────────────────────────────────────────────

function nextHealthScore(current: number | null, success: boolean, latencyMs?: number): number {
  let score = current ?? 50
  if (success) {
    score = Math.min(100, score + 10)
    if (latencyMs !== undefined && latencyMs > 8000) score = Math.max(0, score - 5)
  } else {
    score = Math.max(0, score - 15)
  }
  return Math.round(score)
}

function healthStatusFromFailures(failureCount: number, isBlocked: boolean): string {
  if (isBlocked)          return 'blocked'
  if (failureCount === 0) return 'healthy'
  if (failureCount <= 2)  return 'degraded'
  return 'failing'
}

// ── Insert fetch log ──────────────────────────────────────────────────────────

type FetchLogPayload = {
  sourceId?:      string
  sourceName?:    string
  feedUrl?:       string
  success:        boolean
  httpStatus?:    number
  latencyMs?:     number
  errorStage?:    string
  errorMessage?:  string
  itemsFound?:    number
  itemsInserted?: number
  itemsSkipped?:  number
}

export async function insertFetchLog(payload: FetchLogPayload): Promise<void> {
  if (!isServerSupabaseConfigured || !supabaseServer) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabaseServer as any).from('rss_source_fetch_logs').insert({
    source_id:      payload.sourceId ?? null,
    source_name:    payload.sourceName ?? null,
    feed_url:       payload.feedUrl ?? null,
    success:        payload.success,
    http_status:    payload.httpStatus ?? null,
    latency_ms:     payload.latencyMs ?? null,
    error_stage:    payload.errorStage ?? null,
    error_message:  payload.errorMessage ?? null,
    items_found:    payload.itemsFound ?? 0,
    items_inserted: payload.itemsInserted ?? 0,
    items_skipped:  payload.itemsSkipped ?? 0,
  })
  if (error) {
    // Log write failure is non-fatal — don't rethrow
    console.error('[db/sources] insertFetchLog:', error.message)
  }
}

/**
 * Records a successful fetch for a source. (v2)
 * Resets failure_count; updates health_status, health_score, counters, latency.
 * Throws on DB error so callers can catch and log without blocking main flow.
 */
export async function updateSourceFetchSuccess(
  sourceId:   string,
  latencyMs?: number,
  httpStatus?: number,
): Promise<void> {
  if (!isServerSupabaseConfigured || !supabaseServer) return

  const { data: cur } = await supabaseServer
    .from('sources')
    .select('avg_latency_ms, total_fetch_count, successful_fetch_count, health_score')
    .eq('id', sourceId)
    .single()

  const existing      = (cur?.avg_latency_ms as number | null) ?? null
  const newAvg        = latencyMs !== undefined
    ? (existing === null ? latencyMs : Math.round(existing * 0.7 + latencyMs * 0.3))
    : null
  const currentScore  = (cur?.health_score as number | null) ?? 50
  const newScore      = nextHealthScore(currentScore, true, latencyMs)
  const now           = new Date().toISOString()

  const { error } = await supabaseServer
    .from('sources')
    .update({
      health_status:          'healthy',
      health_score:           newScore,
      failure_count:          0,
      last_fetch_at:          now,
      last_success_at:        now,
      last_fetch_status:      'success',
      last_fetch_error_stage: null,
      last_error_message:     null,
      total_fetch_count:      ((cur?.total_fetch_count as number | null) ?? 0) + 1,
      successful_fetch_count: ((cur?.successful_fetch_count as number | null) ?? 0) + 1,
      ...(latencyMs  !== undefined && { last_latency_ms:  latencyMs }),
      ...(newAvg     !== null      && { avg_latency_ms:   newAvg }),
      ...(httpStatus !== undefined && { last_http_status: httpStatus }),
    })
    .eq('id', sourceId)

  if (error) {
    // Health update failure is non-fatal: log it but never throw.
    // The ingest pipeline must not fail because a health column is missing or
    // the migration hasn't been applied yet.
    console.error('[db/sources] updateSourceFetchSuccess:', error.message,
      '| hint: run supabase/rss-source-health-v2.sql if missing columns')
  }
}

/**
 * Records a failed fetch for a source. (v2)
 * Increments failure_count, updates health_status/score, classifies error.
 * Throws on DB error so callers can catch and log without blocking main flow.
 */
export async function updateSourceFetchFailure(
  sourceId:     string,
  errorMessage: string,
  opts?: {
    latencyMs?:  number
    httpStatus?: number
    errorStage?: 'fetch' | 'parse' | 'persist' | 'health_update'
  },
): Promise<void> {
  if (!isServerSupabaseConfigured || !supabaseServer) return

  const { data: cur } = await supabaseServer
    .from('sources')
    .select('failure_count, avg_latency_ms, is_blocked, total_fetch_count, failed_fetch_count, health_score')
    .eq('id', sourceId)
    .single()

  const currentFailures = (cur?.failure_count as number | null) ?? 0
  const isBlocked       = (cur?.is_blocked as boolean | null) ?? false
  const newFailureCount = currentFailures + 1
  const currentScore    = (cur?.health_score as number | null) ?? 50
  const newScore        = nextHealthScore(currentScore, false, opts?.latencyMs)
  const newHealthStatus = healthStatusFromFailures(newFailureCount, isBlocked)

  const existing = (cur?.avg_latency_ms as number | null) ?? null
  const newAvg   = opts?.latencyMs !== undefined
    ? (existing === null ? opts.latencyMs : Math.round(existing * 0.7 + opts.latencyMs * 0.3))
    : null
  const truncated = errorMessage.slice(0, 500)
  const now       = new Date().toISOString()

  const { error } = await supabaseServer
    .from('sources')
    .update({
      health_status:          newHealthStatus,
      health_score:           newScore,
      failure_count:          newFailureCount,
      last_fetch_at:          now,
      last_error_at:          now,
      last_fetch_status:      'failed',
      last_fetch_error_stage: opts?.errorStage ?? 'fetch',
      last_error_message:     truncated,
      total_fetch_count:      ((cur?.total_fetch_count as number | null) ?? 0) + 1,
      failed_fetch_count:     ((cur?.failed_fetch_count as number | null) ?? 0) + 1,
      ...(opts?.latencyMs  !== undefined && { last_latency_ms:  opts.latencyMs }),
      ...(newAvg           !== null      && { avg_latency_ms:   newAvg }),
      ...(opts?.httpStatus !== undefined && { last_http_status: opts.httpStatus }),
    })
    .eq('id', sourceId)

  if (error) {
    // Health update failure is non-fatal: log it but never throw.
    console.error('[db/sources] updateSourceFetchFailure:', error.message,
      '| hint: run supabase/rss-source-health-v2.sql if missing columns')
  }
}
