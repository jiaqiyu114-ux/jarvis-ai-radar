import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { DbSource, DbSourceInsert, DbSourceUpdate } from '@/types/database'

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
