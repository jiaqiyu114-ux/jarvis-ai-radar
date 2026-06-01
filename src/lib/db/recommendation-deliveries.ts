/**
 * DB layer for recommendation_deliveries table.
 *
 * Tracks which items were delivered to which bucket on which date.
 * Used by the refresh pipeline to prevent same-day re-delivery and
 * to support the observe backlog (72h window of undelivered items).
 *
 * Graceful degradation: all functions return safe defaults if the
 * table doesn't exist yet (code 42P01) — run supabase/recommendation-deliveries-v1.sql.
 */

import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db() { return supabaseServer as any }

export type DeliveryBucket = 'today_recommendation' | 'observe_backlog' | 'archive'

export type DeliveryRecord = {
  itemId:         string
  snapshotId?:    string | null
  deliveryDate:   string          // YYYY-MM-DD in JARVIS_TIMEZONE
  deliveryBucket: DeliveryBucket
  tier?:          string | null
  finalScore?:    number | null
  reason?:        string | null
}

function isMissingTable(err: { code?: string | null; message?: string | null }): boolean {
  const code = err.code ?? ''
  const msg  = (err.message ?? '').toLowerCase()
  return code === '42P01' || msg.includes('does not exist') || msg.includes('schema cache')
}

/**
 * Returns the set of item IDs already delivered as today_recommendation
 * for the given delivery date. Fast — queries only today's deliveries.
 */
export async function getTodayDeliveredItemIds(
  deliveryDate: string,
): Promise<Set<string>> {
  if (!isServerSupabaseConfigured || !supabaseServer) return new Set()
  try {
    const { data, error } = await db()
      .from('recommendation_deliveries')
      .select('item_id')
      .eq('delivery_date', deliveryDate)
      .eq('delivery_bucket', 'today_recommendation')

    if (error) {
      if (isMissingTable(error)) return new Set()
      console.warn('[db/recommendation-deliveries] getTodayDeliveredItemIds:', error.message)
      return new Set()
    }

    const ids = new Set<string>()
    for (const row of (data ?? []) as { item_id: string }[]) {
      if (row.item_id) ids.add(row.item_id)
    }
    return ids
  } catch (err) {
    console.warn('[db/recommendation-deliveries] getTodayDeliveredItemIds unexpected:', err)
    return new Set()
  }
}

/**
 * Write delivery records for a batch of items.
 * Silently skips duplicates (unique constraint on item_id + delivery_date + bucket).
 * Returns counts for diagnostics.
 */
export async function writeDeliveries(
  records: DeliveryRecord[],
): Promise<{ written: number; skipped: number }> {
  if (!isServerSupabaseConfigured || !supabaseServer || records.length === 0) {
    return { written: 0, skipped: records.length }
  }
  try {
    const rows = records.map(r => ({
      item_id:         r.itemId,
      snapshot_id:     r.snapshotId ?? null,
      delivery_date:   r.deliveryDate,
      delivery_bucket: r.deliveryBucket,
      tier:            r.tier ?? null,
      final_score:     r.finalScore ?? null,
      reason:          r.reason ?? null,
    }))

    const { error } = await db()
      .from('recommendation_deliveries')
      .upsert(rows, {
        onConflict:       'item_id,delivery_date,delivery_bucket',
        ignoreDuplicates: true,
      })

    if (error) {
      if (isMissingTable(error)) {
        console.warn('[db/recommendation-deliveries] table not yet created — run recommendation-deliveries-v1.sql')
        return { written: 0, skipped: records.length }
      }
      console.error('[db/recommendation-deliveries] writeDeliveries:', error.message)
      return { written: 0, skipped: records.length }
    }

    return { written: records.length, skipped: 0 }
  } catch (err) {
    console.error('[db/recommendation-deliveries] writeDeliveries unexpected:', err)
    return { written: 0, skipped: records.length }
  }
}

/**
 * Count deliveries for a given date, broken down by bucket.
 * Used for dashboard status bar display.
 */
export async function getDeliveryStats(deliveryDate: string): Promise<{
  todayCount:   number
  observeCount: number
  archiveCount: number
}> {
  const empty = { todayCount: 0, observeCount: 0, archiveCount: 0 }
  if (!isServerSupabaseConfigured || !supabaseServer) return empty
  try {
    const { data, error } = await db()
      .from('recommendation_deliveries')
      .select('delivery_bucket')
      .eq('delivery_date', deliveryDate)

    if (error) {
      if (isMissingTable(error)) return empty
      console.warn('[db/recommendation-deliveries] getDeliveryStats:', error.message)
      return empty
    }

    const rows = (data ?? []) as { delivery_bucket: string }[]
    return {
      todayCount:   rows.filter(r => r.delivery_bucket === 'today_recommendation').length,
      observeCount: rows.filter(r => r.delivery_bucket === 'observe_backlog').length,
      archiveCount: rows.filter(r => r.delivery_bucket === 'archive').length,
    }
  } catch {
    return empty
  }
}
