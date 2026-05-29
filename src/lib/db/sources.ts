import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'
import type { DbSource, DbSourceInsert, DbSourceUpdate } from '@/types/database'

/** Find a source by its URL (unique column). */
export async function getSourceByUrl(url: string): Promise<DbSource | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .eq('url', url)
    .maybeSingle()
  if (error) { console.error('[db/sources] getSourceByUrl:', error.message); return null }
  return data ?? null
}

/**
 * Find a source by URL, creating it if it doesn't exist.
 * Returns { id, source_tier } or null if url is missing (can't create without URL).
 *
 * Used by the ingest pipeline to resolve originalSourceUrl → source_id.
 * Newly created sources get source_tier 'C' (unknown tier) and reliability_score 50.
 */
export async function findOrCreateSource(input: {
  name?:     string | null
  url?:      string | null
  category?: string | null
}): Promise<{ id: string; source_tier: string } | null> {
  if (!isServerSupabaseConfigured || !supabaseServer) return null
  if (!input.url) return null   // sources table requires url NOT NULL

  // Look up by URL
  const existing = await getSourceByUrl(input.url)
  if (existing) return { id: existing.id, source_tier: existing.source_tier }

  // Create new source with conservative defaults
  const { data, error } = await supabaseServer
    .from('sources')
    .insert({
      name:              input.name ?? input.url,
      url:               input.url,
      category:          input.category ?? '其他',
      source_tier:       'C',
      base_score:        50,
      reliability_score: 50,
    } satisfies DbSourceInsert)
    .select('id, source_tier')
    .single()

  if (error) {
    // Race condition: another process just inserted this URL
    if (error.code === '23505') {
      const retry = await getSourceByUrl(input.url)
      return retry ? { id: retry.id, source_tier: retry.source_tier } : null
    }
    console.error('[db/sources] findOrCreateSource:', error.message)
    return null
  }
  return data ? { id: data.id, source_tier: data.source_tier } : null
}

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
