import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { DbFeedbackEventType, DbUserFeedback } from '@/types/database'

/**
 * Feedback value map.
 * Positive = signal quality / engagement confirmation.
 * Negative = disengagement / negative signal.
 */
export const FEEDBACK_VALUE_MAP: Record<DbFeedbackEventType, number> = {
  view:          0,
  click:         3,
  read_30s:      5,
  read_2m:       8,
  save:          10,
  add_to_topic:  15,
  share:         12,
  useful:        20,
  dismiss:       -3,
  not_useful:    -20,
  block_source:  -50,
}

export async function createFeedback(
  itemId:    string,
  eventType: DbFeedbackEventType,
): Promise<DbUserFeedback | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const feedback_value = FEEDBACK_VALUE_MAP[eventType] ?? 0
  const { data, error } = await supabase
    .from('user_feedback')
    .insert({ item_id: itemId, event_type: eventType, feedback_value })
    .select()
    .single()
  if (error) { console.error('[db/feedback] createFeedback:', error.message); return null }
  return data
}

export async function listFeedbackByItem(itemId: string): Promise<DbUserFeedback[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase
    .from('user_feedback')
    .select('*')
    .eq('item_id', itemId)
    .order('created_at', { ascending: false })
  if (error) { console.error('[db/feedback] listFeedbackByItem:', error.message); return [] }
  return data ?? []
}
