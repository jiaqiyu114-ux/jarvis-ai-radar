import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'
import type { DbSource, DbSourceInsert, DbSourceUpdate } from '@/types/database'

// ── URL normalisation ─────────────────────────────────────────────────────────

/**
 * Normalise a source URL before DB lookup/insert to prevent duplicates from
 * trivial variants (trailing slash, uppercase hostname).
 */
function normalizeSourceUrl(raw: string): string {
  const trimmed = raw.trim()
  try {
    const parsed = new URL(trimmed)
    parsed.hostname = parsed.hostname.toLowerCase()
    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1)
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

/**
 * Returns non-blocked sources that have platform='rss'.
 * Used by RssProviderAdapter to determine which feeds to fetch.
 * Sources added without an explicit platform default to 'rss' (schema default).
 */
export async function listRssSources(): Promise<DbSource[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .eq('is_blocked', false)
    .eq('platform', 'rss')
    .order('source_tier', { ascending: true })
    .order('name', { ascending: true })
  if (error) { console.error('[db/sources] listRssSources:', error.message); return [] }
  return data ?? []
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
