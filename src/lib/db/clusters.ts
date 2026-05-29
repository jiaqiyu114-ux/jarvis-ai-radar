import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { DbCluster, DbClusterInsert } from '@/types/database'

export interface ListClustersOptions {
  minScore?:    number
  minMomentum?: number
  limit?:       number
  offset?:      number
}

export async function listClusters(options: ListClustersOptions = {}): Promise<DbCluster[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { minScore, minMomentum, limit = 20, offset = 0 } = options

  let query = supabase
    .from('clusters')
    .select('*')
    .order('last_seen_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (minScore !== undefined)    query = query.gte('cluster_score', minScore)
  if (minMomentum !== undefined) query = query.gte('momentum_score', minMomentum)

  const { data, error } = await query
  if (error) { console.error('[db/clusters] listClusters:', error.message); return [] }
  return data ?? []
}

export async function getClusterById(id: string): Promise<DbCluster | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('clusters')
    .select('*')
    .eq('id', id)
    .single()
  if (error) { console.error('[db/clusters] getClusterById:', error.message); return null }
  return data
}

export async function createCluster(input: DbClusterInsert): Promise<DbCluster | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('clusters')
    .insert(input)
    .select()
    .single()
  if (error) { console.error('[db/clusters] createCluster:', error.message); return null }
  return data
}

/** Assign an item to a cluster (updates items.cluster_id). */
export async function attachItemToCluster(itemId: string, clusterId: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false
  const { error } = await supabase
    .from('items')
    .update({ cluster_id: clusterId })
    .eq('id', itemId)
  if (error) { console.error('[db/clusters] attachItemToCluster:', error.message); return false }
  return true
}

/** Recount source_count for a cluster based on attached items. */
export async function updateClusterScore(clusterId: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false

  // Count items attached to this cluster
  const { count, error: countErr } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('cluster_id', clusterId)
  if (countErr) { console.error('[db/clusters] updateClusterScore count:', countErr.message); return false }

  const { error } = await supabase
    .from('clusters')
    .update({
      source_count:  count ?? 0,
      last_seen_at:  new Date().toISOString(),
    })
    .eq('id', clusterId)
  if (error) { console.error('[db/clusters] updateClusterScore update:', error.message); return false }
  return true
}
