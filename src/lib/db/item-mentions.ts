import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'
import type { DbItemMentionInsert } from '@/types/database'
import type { NormalizedIngestItem } from '@/types/provider'

/**
 * Insert one item_mention row.
 *
 * The table has UNIQUE (provider_id, external_id), so:
 *   - 'inserted'  — new row written
 *   - 'existing'  — already existed (idempotent, no change)
 *   - 'error'     — unexpected failure (logged)
 *
 * This is the primary idempotency mechanism: running the same ingest twice
 * will produce 'existing' on the second run instead of 'inserted'.
 */
export async function upsertItemMention(input: {
  itemId:       string
  providerDbId: string
  item:         NormalizedIngestItem
}): Promise<'inserted' | 'existing' | 'error'> {
  if (!isServerSupabaseConfigured || !supabaseServer) return 'error'

  const row: DbItemMentionInsert = {
    item_id:           input.itemId,
    provider_id:       input.providerDbId,
    external_id:       input.item.externalId,
    provider_score:    input.item.providerScore   ?? undefined,
    provider_rank:     input.item.providerRank    ?? undefined,
    provider_category: input.item.providerCategory ?? undefined,
    provider_tags:     input.item.providerTags    ?? [],
    raw_payload:       input.item.rawPayload,
    seen_at:           input.item.fetchedAt,
  }

  const { error } = await supabaseServer.from('item_mentions').insert(row)
  if (!error) return 'inserted'
  if (error.code === '23505') return 'existing'   // UNIQUE (provider_id, external_id)
  console.error('[db/item-mentions] upsertItemMention:', error.message)
  return 'error'
}
