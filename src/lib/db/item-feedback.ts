import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'
import type { DbItemFeedback, DbItemFeedbackType } from '@/types/database'

export const ITEM_FEEDBACK_TYPES: DbItemFeedbackType[] = [
  'save_reference',
  'add_to_watch',
  'worth_writing',
  'project_related',
  'strong_evidence',
  'weak_evidence',
  'overestimated',
  'underestimated',
  'clickbait_or_marketing',
  'duplicate_info',
  'not_worth_reading',
]

export async function upsertItemFeedback(
  itemId:       string,
  feedbackType: DbItemFeedbackType,
  contextPage?: string,
): Promise<DbItemFeedback | null> {
  if (!isServerSupabaseConfigured || !supabaseServer) return null
  const now = new Date().toISOString()
  const { data, error } = await supabaseServer
    .from('item_feedback')
    .upsert(
      {
        item_id:       itemId,
        feedback_type: feedbackType,
        feedback_value: 1,
        context_page:  contextPage ?? null,
        updated_at:    now,
      },
      { onConflict: 'item_id,feedback_type' },
    )
    .select()
    .single()
  if (error) {
    console.error('[db/item-feedback] upsert:', error.message)
    return null
  }
  return data as DbItemFeedback
}

export async function deleteItemFeedback(
  itemId:       string,
  feedbackType: DbItemFeedbackType,
): Promise<boolean> {
  if (!isServerSupabaseConfigured || !supabaseServer) return false
  const { error } = await supabaseServer
    .from('item_feedback')
    .delete()
    .eq('item_id', itemId)
    .eq('feedback_type', feedbackType)
  if (error) {
    console.error('[db/item-feedback] delete:', error.message)
    return false
  }
  return true
}

export async function listItemFeedback(itemId: string): Promise<DbItemFeedback[]> {
  if (!isServerSupabaseConfigured || !supabaseServer) return []
  const { data, error } = await supabaseServer
    .from('item_feedback')
    .select('*')
    .eq('item_id', itemId)
  if (error) {
    console.error('[db/item-feedback] list:', error.message)
    return []
  }
  return (data ?? []) as DbItemFeedback[]
}
