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
 *   - Second run insertedItems = 0, reusedItems = N
 *   - Second run insertedMentions = 0, skippedMentions = N
 */

import { upsertProvider }             from '@/lib/db/providers'
import { findOrCreateSource }         from '@/lib/db/sources'
import { upsertItemByCanonicalUrl }   from '@/lib/db/items'
import { upsertItemMention }          from '@/lib/db/item-mentions'
import { calculateProviderSignal }    from '@/lib/scoring/provider-signal'
import { calculateFinalScore }        from '@/lib/scoring/final-score'
import { detectLanguage }             from '@/lib/ingest/normalize'
import { cleanText }                  from '@/lib/text/clean-text'
import { isServerSupabaseConfigured } from '@/lib/supabase/server'
import type { NormalizedIngestItem, ProviderConfig } from '@/types/provider'
import type { DataOrigin, DbItemInsert } from '@/types/database'

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

// ── Result types ──────────────────────────────────────────────────────────────

export type PersistError = {
  externalId: string
  stage:      'upsert_provider' | 'find_source' | 'upsert_item' | 'upsert_mention' | 'unknown'
  message:    string
}

export type PersistDebug = {
  providerResolved:      boolean
  providerDbId:          string | null
  firstSourceResolved:   boolean
  firstSourceId:         string | null
  firstItemPayloadKeys:  string[]
}

export type PersistResult = {
  ok:               boolean
  mode:             'database'
  provider:         string
  fetched:          number
  uniqueItems:      number
  insertedItems:    number
  reusedItems:      number
  insertedMentions: number
  skippedMentions:  number
  errors:           PersistError[]
  debug:            PersistDebug
}

// ── Build safe insert payload (only columns confirmed in the base schema) ─────

function buildInsertPayload(
  item:           NormalizedIngestItem,
  sourceId:       string | null,
  providerSignal: number,
  finalScore:     number,
  dims:           ReturnType<typeof defaultDimensions>,
  dataOrigin:     DataOrigin,
): DbItemInsert {
  // NOTE: source_tier, author are intentionally excluded.
  //       They exist in our TypeScript types but are NOT in the base schema.sql.
  //       Including them causes "column does not exist" errors on Supabase installs
  //       that ran schema.sql without the extended migration.
  // NOTE: data_origin is only included when non-default ('demo', 'seed', etc.)
  //       so installs that haven't run data-hygiene-real-feed-v1.sql don't break.
  //       Real items rely on the SQL column DEFAULT 'real'.
  const cleanTitle   = cleanText(item.title)
  const cleanSummary = cleanText(item.summary)

  return {
    title:                   cleanTitle || item.title,
    url:                     item.url,
    canonical_url:           item.canonicalUrl || undefined,
    summary:                 cleanSummary,
    source_id:               sourceId ?? undefined,
    published_at:            item.publishedAt ?? new Date().toISOString(),
    category:                item.category ?? '其他',
    tags:                    item.tags ?? [],
    entities:                item.entities ?? [],
    language:                detectLanguage(cleanTitle || item.title, cleanSummary),
    provider_signal:         providerSignal,
    raw_payload:             item.rawPayload,
    status:                  'new',
    final_score:             finalScore,
    ...dims,
    duplicate_penalty:       0,
    clickbait_penalty:       0,
    marketing_penalty:       0,
    cognitive_load_penalty:  0,
    ...(dataOrigin !== 'real' && { data_origin: dataOrigin }),
  }
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function ingestNormalizedItemsToDatabase(
  items:          NormalizedIngestItem[],
  providerConfig: ProviderConfig,
): Promise<PersistResult> {
  if (!isServerSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured — set NEXT_PUBLIC_SUPABASE_URL and ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) in .env.local'
    )
  }

  const debug: PersistDebug = {
    providerResolved:    false,
    providerDbId:        null,
    firstSourceResolved: false,
    firstSourceId:       null,
    firstItemPayloadKeys: [],
  }

  // 1. Upsert provider
  const providerDbId = await upsertProvider(providerConfig)
  if (!providerDbId) {
    throw new Error(`Failed to upsert provider '${providerConfig.name}'`)
  }
  debug.providerResolved = true
  debug.providerDbId     = providerDbId

  const stats = {
    insertedItems:    0,
    reusedItems:      0,
    insertedMentions: 0,
    skippedMentions:  0,
    errors:           [] as PersistError[],
  }

  for (const item of items) {
    // Stage: find_source
    let sourceId: string | null = null
    try {
      const source = await findOrCreateSource({
        name:     item.originalSourceName,
        url:      item.originalSourceUrl,
        category: item.category,
      })
      sourceId = source?.id ?? null

      // Capture debug info from first item
      if (debug.firstSourceId === null) {
        debug.firstSourceResolved = sourceId !== null
        debug.firstSourceId       = sourceId
      }
    } catch (err) {
      stats.errors.push({
        externalId: item.externalId,
        stage:      'find_source',
        message:    err instanceof Error ? err.message : String(err),
      })
      continue
    }

    // Stage: upsert_item
    let upserted: Awaited<ReturnType<typeof upsertItemByCanonicalUrl>> | null = null
    try {
      const providerSignal = calculateProviderSignal({
        providerTrustScore: item.providerTrustScore,
        providerScore:      item.providerScore  ?? undefined,
        providerRank:       item.providerRank   ?? undefined,
        featured:           item.featured,
        mentionCount:       1,
      })

      const dims        = defaultDimensions(sourceId !== null)
      const { finalScore } = calculateFinalScore(
        dims,
        item.publishedAt ?? new Date().toISOString(),
      )

      const row = buildInsertPayload(item, sourceId, providerSignal, finalScore, dims, providerConfig.dataOrigin ?? 'real')

      // Capture debug info from first item
      if (debug.firstItemPayloadKeys.length === 0) {
        debug.firstItemPayloadKeys = Object.keys(row).filter(
          k => row[k as keyof typeof row] !== undefined
        )
      }

      upserted = await upsertItemByCanonicalUrl(row)

      if (upserted.status === 'inserted') stats.insertedItems++
      else                                 stats.reusedItems++

    } catch (err) {
      stats.errors.push({
        externalId: item.externalId,
        stage:      'upsert_item',
        message:    err instanceof Error ? err.message : String(err),
      })
      continue
    }

    // Stage: upsert_mention
    try {
      const mentionResult = await upsertItemMention({
        itemId:       upserted.id,
        providerDbId,
        item,
      })
      if (mentionResult === 'inserted') stats.insertedMentions++
      else if (mentionResult === 'existing') stats.skippedMentions++
    } catch (err) {
      stats.errors.push({
        externalId: item.externalId,
        stage:      'upsert_mention',
        message:    err instanceof Error ? err.message : String(err),
      })
    }
  }

  const processedCount = stats.insertedItems + stats.reusedItems
  const ok             = processedCount > 0 || items.length === 0

  return {
    ok,
    mode:        'database',
    provider:    providerConfig.name,
    fetched:     items.length,
    uniqueItems: items.length,
    ...stats,
    debug,
  }
}
