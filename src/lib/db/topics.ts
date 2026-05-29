import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { DbTopic, DbTopicInsert, DbTopicPlatform, DbTopicPriority, DbTopicStatus } from '@/types/database'

export type ListTopicsOptions = {
  status?:   DbTopicStatus
  priority?: DbTopicPriority
  platform?: DbTopicPlatform
  limit?:    number
  offset?:   number
}

export async function listTopics(options: ListTopicsOptions = {}): Promise<DbTopic[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { status, priority, platform, limit = 50, offset = 0 } = options

  let query = supabase
    .from('topics')
    .select('*')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status)   query = query.eq('status', status)
  if (priority) query = query.eq('priority', priority)
  if (platform) query = query.eq('platform', platform)

  const { data, error } = await query
  if (error) { console.error('[db/topics] listTopics:', error.message); return [] }
  return data ?? []
}

export async function createTopicFromItem(
  itemId: string,
  input: Omit<DbTopicInsert, 'source_item_id'>,
): Promise<DbTopic | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('topics')
    .insert({ ...input, source_item_id: itemId })
    .select()
    .single()
  if (error) { console.error('[db/topics] createTopicFromItem:', error.message); return null }
  return data
}

export async function updateTopicStatus(
  topicId: string,
  status:  DbTopicStatus,
): Promise<DbTopic | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('topics')
    .update({ status })
    .eq('id', topicId)
    .select()
    .single()
  if (error) { console.error('[db/topics] updateTopicStatus:', error.message); return null }
  return data
}

export async function updateTopicPriority(
  topicId:  string,
  priority: DbTopicPriority,
): Promise<DbTopic | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('topics')
    .update({ priority })
    .eq('id', topicId)
    .select()
    .single()
  if (error) { console.error('[db/topics] updateTopicPriority:', error.message); return null }
  return data
}
