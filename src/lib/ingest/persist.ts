/**
 * Provider Persistence — writes NormalizedIngestItems to Supabase.
 *
 * Flow per item:
 *   1. Upsert provider  → get providerDbId (UUID)
 *   2. Find/create source from originalSourceUrl → sourceId
 *   3. Compute provider_signal (rule-based)
 *   4. Compute final_score via calculateFinalScore (no AI yet)
 *   5. Upsert item by canonical_url / url → itemId
 *   6. Upsert item_mention (provider_id + external_id dedup)
 *
 * Idempotent: running twice produces:
 *   - Second run insertedItems ≈ 0, reusedItems increases
 *   - Second run insertedMentions = 0, skippedMentions increases
 */

import { upsertProvider }         from '@/lib/db/providers'
import { findOrCreateSource }     from '@/lib/db/sources'
import { upsertItemByCanonicalUrl } from '@/lib/db/items'
import { upsertItemMention }      from '@/lib/db/item-mentions'
import { calculateProviderSignal } from '@/lib/scoring/provider-signal'
import { calculateFinalScore }    from '@/lib/scoring/final-score'
import { detectLanguage }         from '@/lib/ingest/normalize'
import { isServerSupabaseConfigured } from '@/lib/supabase/server'
import type { NormalizedIngestItem, ProviderConfig } from '@/types/provider'
import type { DbItemInsert, DbSourceTier } from '@/types/database'

// ── Default dimension scores (pre-AI scoring) ─────────────────────────────────

function defaultDimensions(hasKnownSource: boolean) {
  const base = hasKnownSource ? 65 : 35
  return {
    ai_relevance_score:      50,
    source_score:            base,
    importance_score:        50,
    novelty_score:           50,
    momentum_score:          50,
    credibility_score:       base,
    actionability_score:     50,
    content_potential_score: 50,
    personal_fit_score:      50,
  }
}

// ── Result type ───────────────────────────────────────────────────────────────

export type PersistResult = {
  ok:               true
  mode:             'database'
  provider:         string
  fetched:          number
  uniqueItems:      number
  insertedItems:    number
  reusedItems:      number
  insertedMentions: number
  skippedMentions:  number
  errors:           Array<{ externalId: string; message: string }>
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function ingestNormalizedItemsToDatabase(
  items:          NormalizedIngestItem[],
  providerConfig: ProviderConfig,
): Promise<PersistResult> {
  if (!isServerSupabaseConfigured) {
    throw new Error('Supabase is not configured — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) in .env.local')
  }

  // 1. Upsert provider
  const providerDbId = await upsertProvider(providerConfig)
  if (!providerDbId) {
    throw new Error(`Failed to upsert provider '${providerConfig.name}'`)
  }

  const stats = {
    insertedItems:    0,
    reusedItems:      0,
    insertedMentions: 0,
    skippedMentions:  0,
    errors:           [] as Array<{ externalId: string; message: string }>,
  }

  for (const item of items) {
    try {
      // 2. Resolve source
      const source = await findOrCreateSource({
        name:     item.originalSourceName,
        url:      item.originalSourceUrl,
        category: item.category,
      })
      const sourceId   = source?.id ?? null
      const sourceTier = (source?.source_tier ?? 'C') as DbSourceTier

      // 3. provider_signal
      const providerSignal = calculateProviderSignal({
        providerTrustScore: item.providerTrustScore,
        providerScore:      item.providerScore  ?? undefined,
        providerRank:       item.providerRank   ?? undefined,
        featured:           item.featured,
        mentionCount:       1,
      })

      // 4. final_score (rule-based, no AI)
      const dims = defaultDimensions(sourceId !== null)
      const { finalScore } = calculateFinalScore(
        dims,
        item.publishedAt ?? new Date().toISOString(),
      )

      // 5. Upsert item
      const row: DbItemInsert = {
        title:                   item.title,
        url:                     item.url,
        canonical_url:           item.canonicalUrl || undefined,
        summary:                 item.summary ?? '',
        source_id:               sourceId ?? undefined,
        source_tier:             sourceTier,
        published_at:            item.publishedAt ?? new Date().toISOString(),
        category:                item.category ?? '其他',
        tags:                    item.tags ?? [],
        entities:                item.entities ?? [],
        language:                detectLanguage(item.title, item.summary ?? ''),
        provider_signal:         providerSignal,
        raw_payload:             item.rawPayload,
        status:                  'new',
        final_score:             finalScore,
        // Rule-based dimension scores (replaced by AI scoring in a later sprint)
        ...dims,
        duplicate_penalty:       0,
        clickbait_penalty:       0,
        marketing_penalty:       0,
        cognitive_load_penalty:  0,
      }

      const upserted = await upsertItemByCanonicalUrl(row)
      if (!upserted) {
        stats.errors.push({ externalId: item.externalId, message: 'upsertItemByCanonicalUrl returned null' })
        continue
      }

      if (upserted.inserted) stats.insertedItems++
      else                    stats.reusedItems++

      // 6. Upsert mention (idempotent via UNIQUE constraint)
      const mentionResult = await upsertItemMention({
        itemId:       upserted.itemId,
        providerDbId,
        item,
      })
      if (mentionResult === 'inserted') stats.insertedMentions++
      else if (mentionResult === 'existing') stats.skippedMentions++

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      stats.errors.push({ externalId: item.externalId, message })
    }
  }

  return {
    ok:          true,
    mode:        'database',
    provider:    providerConfig.name,
    fetched:     items.length,
    uniqueItems: items.length,
    ...stats,
  }
}
