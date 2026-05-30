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
import type { FeedError, ItemError, SourceLoadDebug, SourceHealthSummary } from '@/lib/providers/rss-provider'

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
  ok:                  boolean
  runStatus:           'full_success' | 'partial_success' | 'full_failure'
  mode:                'dry-run'
  provider:            string
  fetched:             number
  uniqueItems:         number
  sourceMode:          'database' | 'fallback'
  sourceCount:         number
  sourceLoadDebug:     SourceLoadDebug
  feedErrors:          FeedError[]
  itemErrors:          ItemError[]
  sourceHealthSummary: SourceHealthSummary
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
  runStatus:           'full_success' | 'partial_success' | 'full_failure'
  feedErrors:          FeedError[]
  itemErrors:          ItemError[]
  sourceMode:          'database' | 'fallback'
  sourceCount:         number
  sourceLoadDebug:     SourceLoadDebug
  sourceHealthSummary: SourceHealthSummary
}

export async function runRssProviderIngest(opts?: { dryRun?: boolean; recordHealth?: boolean }): Promise<
  RssDryRunResult | RssWriteResult
> {
  const dryRun       = opts?.dryRun !== false   // default true
  // recordHealth defaults to false for dry-run, true for write mode
  const recordHealth = opts?.recordHealth ?? !dryRun

  // 1. Fetch + normalise from all RSS sources
  const { items: raw, feedErrors, itemErrors, sourceMode, sourceCount, sourceLoadDebug, sourceHealthSummary } =
    await fetchRssProviderItems({ recordHealth })

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

    // partial_success when at least one source fetched items, even if others failed
    const dryRunProcessedAny = unique.length > 0 || sourceHealthSummary.succeededThisRun > 0
    const ok = dryRunProcessedAny || feedErrors.length === 0
    const runStatus: 'full_success' | 'partial_success' | 'full_failure' =
      feedErrors.length === 0
        ? 'full_success'
        : dryRunProcessedAny
          ? 'partial_success'
          : 'full_failure'

    return {
      ok,
      runStatus,
      mode:                'dry-run',
      provider:            RssProviderAdapter.provider.name,
      fetched:             raw.length,
      uniqueItems:         unique.length,
      sourceMode,
      sourceCount,
      sourceLoadDebug,
      feedErrors,
      itemErrors,
      sourceHealthSummary,
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

  // Write to DB — wrapped in try-catch so a provider-upsert or DB failure
  // does not crash the entire ingest when some sources already succeeded.
  let persistResult: Awaited<ReturnType<typeof ingestNormalizedItemsToDatabase>>
  try {
    persistResult = await ingestNormalizedItemsToDatabase(
      unique,
      RssProviderAdapter.provider,
    )
  } catch (persistErr) {
    const msg = persistErr instanceof Error ? persistErr.message : String(persistErr)
    console.error('[ingest-service] ingestNormalizedItemsToDatabase failed:', msg)

    // Even though persist failed, the sources that fetched successfully are known.
    // Return a structured result so the route can return 200 for partial_success.
    const anyFetched = raw.length > 0 || sourceHealthSummary.succeededThisRun > 0
    return {
      ok:               anyFetched,
      runStatus:        anyFetched ? 'partial_success' as const : 'full_failure' as const,
      mode:             'database' as const,
      provider:         RssProviderAdapter.provider.name,
      fetched:          raw.length,
      uniqueItems:      unique.length,
      insertedItems:    0,
      reusedItems:      0,
      insertedMentions: 0,
      skippedMentions:  0,
      errors:           [{ externalId: 'persist', stage: 'upsert_provider' as const, message: msg }],
      debug:            { providerResolved: false, providerDbId: null, firstSourceResolved: false, firstSourceId: null, firstItemPayloadKeys: [] },
      feedErrors,
      itemErrors,
      sourceMode,
      sourceCount,
      sourceLoadDebug,
      sourceHealthSummary,
    }
  }

  // runStatus rules:
  //   full_success    — no feedErrors
  //   partial_success — at least one source succeeded OR items were processed (incl. reused)
  //   full_failure    — all sources failed AND no items were processed at all
  const processedAny = (persistResult.insertedItems + persistResult.reusedItems) > 0
    || raw.length > 0
    || sourceHealthSummary.succeededThisRun > 0
  const writeRunStatus: 'full_success' | 'partial_success' | 'full_failure' =
    feedErrors.length === 0
      ? 'full_success'
      : processedAny
        ? 'partial_success'
        : 'full_failure'

  return { ...persistResult, runStatus: writeRunStatus, feedErrors, itemErrors, sourceMode, sourceCount, sourceLoadDebug, sourceHealthSummary }
}
