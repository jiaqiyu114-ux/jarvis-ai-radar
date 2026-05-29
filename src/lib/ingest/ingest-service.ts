/**
 * Ingest service — orchestrates provider → normalise → dedup → score → mentions.
 *
 * Currently operates in-memory (no DB writes).
 * DB integration will be added once the provider architecture stabilises.
 */

import { MockProviderAdapter } from '@/lib/providers'
import { calculateProviderSignal } from '@/lib/scoring/provider-signal'
import type { NormalizedIngestItem, ItemMention } from '@/types/provider'

// ── Deduplication ─────────────────────────────────────────────────────────────

/**
 * Deduplicate items by canonicalUrl.
 *
 * When two items share the same canonicalUrl:
 *   1. Keep the one with a lower providerRank (1 is best).
 *   2. Tie-break on higher providerScore.
 *   3. If still tied, keep the first encountered.
 *
 * Deliberately conservative: no fuzzy title matching.
 * Missing canonicalUrl falls back to raw url as dedup key.
 */
export function dedupeByCanonicalUrl(
  items: NormalizedIngestItem[],
): NormalizedIngestItem[] {
  const seen = new Map<string, NormalizedIngestItem>()

  for (const item of items) {
    const key = item.canonicalUrl || item.url
    const existing = seen.get(key)

    if (!existing) {
      seen.set(key, item)
      continue
    }

    const existingRank = existing.providerRank ?? Infinity
    const newRank      = item.providerRank      ?? Infinity

    if (newRank < existingRank) {
      seen.set(key, item)
      continue
    }

    if (newRank === existingRank) {
      const existingScore = existing.providerScore ?? 0
      const newScore      = item.providerScore      ?? 0
      if (newScore > existingScore) {
        seen.set(key, item)
      }
    }
  }

  return Array.from(seen.values())
}

// ── Mention builder ───────────────────────────────────────────────────────────

/**
 * Build one ItemMention per NormalizedIngestItem.
 *
 * In production: itemId comes from the DB row returned after upsert.
 * In mock mode: itemId is derived from canonicalUrl as a stable surrogate.
 * Callers MUST replace the surrogate itemId before writing to the DB.
 */
export function buildMentionsFromNormalizedItems(
  items: NormalizedIngestItem[],
): ItemMention[] {
  return items.map(item => ({
    id:               `mention-${item.providerId}-${item.externalId}`,
    // ⚠️ MOCK surrogate — replace with real DB item UUID in production
    itemId:           `item-by-url:${item.canonicalUrl || item.url}`,
    providerId:       item.providerId,
    externalId:       item.externalId,
    providerScore:    item.providerScore   ?? null,
    providerRank:     item.providerRank    ?? null,
    providerCategory: item.providerCategory ?? null,
    providerTags:     item.providerTags    ?? [],
    rawPayload:       item.rawPayload,
    seenAt:           item.fetchedAt,
  }))
}

// ── Mock provider ingest run ──────────────────────────────────────────────────

export type MockIngestResult = {
  ok:          true
  provider:    string
  fetched:     number
  normalized:  number
  uniqueItems: number
  mentions:    number
  items:       Array<NormalizedIngestItem & { providerSignal: number }>
}

/**
 * Full mock ingest pipeline:
 *   fetch → dedup → provider_signal → mentions → stats
 *
 * No network calls. No DB writes. Safe to call during build-time checks.
 */
export async function runMockProviderIngest(): Promise<MockIngestResult> {
  // 1. Fetch from mock provider
  const raw = await MockProviderAdapter.fetchItems()

  // 2. Dedup
  const unique = dedupeByCanonicalUrl(raw)

  // 3. Compute provider_signal per item
  const scored = unique.map(item => ({
    ...item,
    providerSignal: calculateProviderSignal({
      providerTrustScore: item.providerTrustScore,
      providerScore:      item.providerScore  ?? undefined,
      providerRank:       item.providerRank   ?? undefined,
      featured:           item.featured,
      mentionCount:       1,
    }),
  }))

  // 4. Build mentions
  const mentions = buildMentionsFromNormalizedItems(unique)

  return {
    ok:          true,
    provider:    MockProviderAdapter.provider.name,
    fetched:     raw.length,
    normalized:  raw.length,
    uniqueItems: unique.length,
    mentions:    mentions.length,
    items:       scored,
  }
}
