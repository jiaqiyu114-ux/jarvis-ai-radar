import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'
import type { DbItem, DbItemInsert, DbItemScoreUpdate, DbItemStatus, DbSourceTier } from '@/types/database'

/** Items row enriched with source name and tier via JOIN. */
export type DbItemWithSource = DbItem & {
  sources: { name: string; source_tier: DbSourceTier } | null
}

export type ListItemsOptions = {
  category?:   string
  sourceTier?: DbSourceTier
  minScore?:   number
  maxScore?:   number
  limit?:      number
  offset?:     number
  search?:     string
  status?:     DbItemStatus
}

export async function listItems(options: ListItemsOptions = {}): Promise<DbItem[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const {
    category, sourceTier, minScore, maxScore,
    limit = 50, offset = 0, search, status,
  } = options

  let query = supabase
    .from('items')
    .select('*')
    .order('published_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (category)               query = query.eq('category', category)
  if (sourceTier)             query = query.eq('source_tier', sourceTier)
  if (minScore !== undefined) query = query.gte('final_score', minScore)
  if (maxScore !== undefined) query = query.lte('final_score', maxScore)
  if (status)                 query = query.eq('status', status)
  if (search)                 query = query.or(`title.ilike.%${search}%,summary.ilike.%${search}%`)

  const { data, error } = await query
  if (error) { console.error('[db/items] listItems:', error.message); return [] }
  return (data ?? []) as DbItem[]
}

export async function listSelectedItems(options: Omit<ListItemsOptions, 'minScore' | 'status'> = {}): Promise<DbItem[]> {
  return listItems({ ...options, minScore: 75, status: 'selected' })
}

/**
 * Same as listItems but includes a sources JOIN for name + tier enrichment.
 * Used by the feed adapter to display source names instead of UUIDs.
 */
export async function listItemsWithSource(
  options: ListItemsOptions = {},
): Promise<DbItemWithSource[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const {
    category, sourceTier, minScore, maxScore,
    limit = 50, offset = 0, search, status,
  } = options

  let query = supabase
    .from('items')
    .select('*, sources!items_source_id_fkey(name, source_tier)')
    .order('published_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (category)               query = query.eq('category', category)
  if (sourceTier)             query = query.eq('source_tier', sourceTier)
  if (minScore !== undefined) query = query.gte('final_score', minScore)
  if (maxScore !== undefined) query = query.lte('final_score', maxScore)
  if (status)                 query = query.eq('status', status)
  if (search)                 query = query.or(`title.ilike.%${search}%,summary.ilike.%${search}%`)

  const { data, error } = await query
  if (error) { console.error('[db/items] listItemsWithSource:', error.message); return [] }
  return (data ?? []) as unknown as DbItemWithSource[]
}

export async function listSelectedItemsWithSource(
  options: Omit<ListItemsOptions, 'minScore' | 'status'> = {},
): Promise<DbItemWithSource[]> {
  return listItemsWithSource({ ...options, minScore: 75, status: 'selected' })
}

export async function getItemById(id: string): Promise<DbItem | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('id', id)
    .single()
  if (error) { console.error('[db/items] getItemById:', error.message); return null }
  return data
}

export async function createItem(input: DbItemInsert): Promise<DbItem | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('items')
    .insert(input)
    .select()
    .single()
  if (error) { console.error('[db/items] createItem:', error.message); return null }
  return data
}

/**
 * Insert an item only if its URL has not been seen before.
 * Returns 'inserted' | 'duplicate' | 'error'.
 * The URL column has a UNIQUE constraint; code 23505 = unique_violation.
 */
export async function insertItemIfNew(
  input: DbItemInsert,
): Promise<'inserted' | 'duplicate' | 'error'> {
  if (!isSupabaseConfigured || !supabase) return 'error'
  const { error } = await supabase.from('items').insert(input)
  if (!error) return 'inserted'
  if (error.code === '23505') return 'duplicate'
  console.error('[db/items] insertItemIfNew:', error.message)
  return 'error'
}

/** Apply AI dimension scores + code-computed final_score.
 *  Caller MUST compute final_score via calculateFinalScore() before calling this. */
export async function updateItemScore(id: string, scoreInput: DbItemScoreUpdate): Promise<DbItem | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('items')
    .update(scoreInput)
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('[db/items] updateItemScore:', error.message); return null }
  return data
}

export async function archiveItem(id: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false
  const { error } = await supabase
    .from('items')
    .update({ status: 'archived' })
    .eq('id', id)
  if (error) { console.error('[db/items] archiveItem:', error.message); return false }
  return true
}

export async function rejectItem(id: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false
  const { error } = await supabase
    .from('items')
    .update({ status: 'rejected' })
    .eq('id', id)
  if (error) { console.error('[db/items] rejectItem:', error.message); return false }
  return true
}

/**
 * Upsert an item by canonical URL (dedup-safe, no UNIQUE constraint on canonical_url).
 *
 * Lookup order:
 *   1. canonical_url match (if provided)
 *   2. url match (UNIQUE constraint)
 *   3. Insert new item
 *
 * Returns { itemId, inserted } or null on error.
 * Uses supabaseServer so API routes can write even when RLS is added later.
 */
export async function upsertItemByCanonicalUrl(
  row: DbItemInsert,
): Promise<{ itemId: string; inserted: boolean } | null> {
  if (!isServerSupabaseConfigured || !supabaseServer) return null

  // 1. Try canonical_url lookup
  if (row.canonical_url) {
    const { data: byCanonical } = await supabaseServer
      .from('items')
      .select('id')
      .eq('canonical_url', row.canonical_url)
      .limit(1)
      .maybeSingle()
    if (byCanonical?.id) return { itemId: byCanonical.id, inserted: false }
  }

  // 2. Try url lookup (UNIQUE)
  const { data: byUrl } = await supabaseServer
    .from('items')
    .select('id')
    .eq('url', row.url)
    .maybeSingle()
  if (byUrl?.id) return { itemId: byUrl.id, inserted: false }

  // 3. Insert
  const { data, error } = await supabaseServer
    .from('items')
    .insert(row)
    .select('id')
    .single()

  if (error) {
    // Race condition on the url UNIQUE constraint
    if (error.code === '23505') {
      const { data: race } = await supabaseServer
        .from('items').select('id').eq('url', row.url).maybeSingle()
      return race?.id ? { itemId: race.id, inserted: false } : null
    }
    console.error('[db/items] upsertItemByCanonicalUrl:', error.message)
    return null
  }

  return data?.id ? { itemId: data.id, inserted: true } : null
}
