/**
 * Ingest service — orchestrates provider → normalise → dedup → score → persist.
 *
 * Two modes:
 *   dryRun = true  (default) — in-memory only, no DB writes, always works
 *   dryRun = false            — writes to Supabase if configured; throws if not
 */

import { MockProviderAdapter, RssProviderAdapter } from '@/lib/providers'
import { fetchRssProviderItems } from '@/lib/providers/rss-provider'
import { calculateProviderSignal } from '@/lib/scoring/provider-signal'
import { ingestNormalizedItemsToDatabase } from '@/lib/ingest/persist'
import type { NormalizedIngestItem, ItemMention } from '@/types/provider'
import type { FeedError, ItemError } from '@/lib/providers/rss-provider'

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
      if (newScore > existingScore) seen.set(key, item)
    }
  }

  return Array.from(seen.values())
}

// ── Mention builder (dry-run only) ────────────────────────────────────────────

/**
 * Build in-memory ItemMention objects for dry-run previews.
 * itemId is a surrogate — must be replaced with real DB UUID before writing.
 */
export function buildMentionsFromNormalizedItems(
  items: NormalizedIngestItem[],
): ItemMention[] {
  return items.map(item => ({
    id:               `mention-${item.providerId}-${item.externalId}`,
    itemId:           `item-by-url:${item.canonicalUrl || item.url}`,  // ⚠️ surrogate
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

// ── Result types ──────────────────────────────────────────────────────────────

export type DryRunResult = {
  ok:          true
  mode:        'dry-run'
  provider:    string
  fetched:     number
  normalized:  number
  uniqueItems: number
  mentions:    number
  items:       Array<NormalizedIngestItem & { providerSignal: number }>
}

// ── Mock provider ingest ──────────────────────────────────────────────────────

export async function runMockProviderIngest(opts?: { dryRun?: boolean }): Promise<
  DryRunResult | import('./persist').PersistResult
> {
  const dryRun = opts?.dryRun !== false   // default true

  // 1. Fetch from mock provider
  const raw = await MockProviderAdapter.fetchItems()

  // 2. Dedup
  const unique = dedupeByCanonicalUrl(raw)

  if (dryRun) {
    // In-memory only — safe without DB, works at build time
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
    const mentions = buildMentionsFromNormalizedItems(unique)
    return {
      ok:          true,
      mode:        'dry-run',
      provider:    MockProviderAdapter.provider.name,
      fetched:     raw.length,
      normalized:  raw.length,
      uniqueItems: unique.length,
      mentions:    mentions.length,
      items:       scored,
    }
  }

  // Write to DB
  return ingestNormalizedItemsToDatabase(unique, MockProviderAdapter.provider)
}

// ── RSS provider ingest ───────────────────────────────────────────────────────

export type RssDryRunResult = {
  ok:          boolean   // false when all feeds failed; true if at least one item was fetched
  mode:        'dry-run'
  provider:    string
  fetched:     number
  uniqueItems: number
  feedErrors:  FeedError[]
  itemErrors:  ItemError[]
  sample:      Array<{
    title:          string
    canonicalUrl:   string
    providerRank:   number | null | undefined
    providerSignal: number
    originalSource: string
    category:       string | null | undefined
    publishedAt:    string | null | undefined
  }>
}

export type RssWriteResult = import('./persist').PersistResult & {
  feedErrors: FeedError[]
  itemErrors: ItemError[]
}

export async function runRssProviderIngest(opts?: { dryRun?: boolean }): Promise<
  RssDryRunResult | RssWriteResult
> {
  const dryRun = opts?.dryRun !== false   // default true

  // 1. Fetch + normalise from all RSS sources
  const { items: raw, feedErrors, itemErrors } = await fetchRssProviderItems()

  // 2. Dedup by canonical URL
  const unique = dedupeByCanonicalUrl(raw)

  if (dryRun) {
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

    // ok=false only when there were feeds to process but ALL of them failed
    const ok = unique.length > 0 || feedErrors.length === 0

    return {
      ok,
      mode:        'dry-run',
      provider:    RssProviderAdapter.provider.name,
      fetched:     raw.length,
      uniqueItems: unique.length,
      feedErrors,
      itemErrors,
      sample:      scored.slice(0, 5).map(item => ({
        title:          item.title,
        canonicalUrl:   item.canonicalUrl,
        providerRank:   item.providerRank,
        providerSignal: item.providerSignal,
        originalSource: item.originalSourceName ?? '(unknown)',
        category:       item.category,
        publishedAt:    item.publishedAt,
      })),
    }
  }

  // Write to DB
  const persistResult = await ingestNormalizedItemsToDatabase(
    unique,
    RssProviderAdapter.provider,
  )

  return { ...persistResult, feedErrors, itemErrors }
}
