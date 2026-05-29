import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { DbItem, DbItemInsert, DbItemScoreUpdate, DbItemStatus, DbSourceTier } from '@/types/database'

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
    .select('*, sources!items_source_id_fkey(source_tier)')
    .order('published_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (category)    query = query.eq('category', category)
  if (minScore !== undefined) query = query.gte('final_score', minScore)
  if (maxScore !== undefined) query = query.lte('final_score', maxScore)
  if (status)      query = query.eq('status', status)
  if (search)      query = query.or(`title.ilike.%${search}%,summary.ilike.%${search}%`)

  // Filter by sourceTier via the joined sources table
  if (sourceTier) {
    query = (query as ReturnType<typeof query.eq>).eq('sources.source_tier', sourceTier)
  }

  const { data, error } = await query
  if (error) { console.error('[db/items] listItems:', error.message); return [] }
  return (data ?? []) as DbItem[]
}

export async function listSelectedItems(options: Omit<ListItemsOptions, 'minScore' | 'status'> = {}): Promise<DbItem[]> {
  return listItems({ ...options, minScore: 75, status: 'selected' })
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
