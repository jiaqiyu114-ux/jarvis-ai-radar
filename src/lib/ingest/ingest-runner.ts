/**
 * Deadline-aware RSS ingest runner.
 *
 * Guarantees the ingest work can be cut off at any point via a shared
 * accumulator (IngestAcc) + Promise.race at the caller level.
 *
 * Timeline budget (default):
 *   deadlineMs = 55_000
 *   maxSources  = 8       → ceil(8/4) = 2 batches × 9s = 18s max fetch
 *   write cap   = 120 items × ~150ms = ~18s max write
 *   → worst-case ~36s, comfortably under 55s deadline
 *
 * Key design decisions:
 *   - Health updates are fire-and-forget (don't block fetch batches)
 *   - Write loop checks deadline before each item; stops early if < 3s left
 *   - Source selection: skip consistently failing sources unless force=true
 *   - Sources prioritised: user_curated > tier S/A/B > healthy > degraded/failing
 */

import {
  listRssSourcesWithDiag,
  updateSourceFetchSuccess,
  updateSourceFetchFailure,
  insertFetchLog,
} from '@/lib/db/sources'
import { upsertProvider }          from '@/lib/db/providers'
import { findOrCreateSource }      from '@/lib/db/sources'
import { upsertItemByCanonicalUrl } from '@/lib/db/items'
import { upsertItemMention }       from '@/lib/db/item-mentions'
import { fetchRssFeed, parseRssFeed } from '@/lib/ingest/rss'
import { canonicalizeUrl, normalizeTitle, detectLanguage } from '@/lib/ingest/normalize'
import { calculateProviderSignal } from '@/lib/scoring/provider-signal'
import { calculateFinalScore, type ScoreDimensions } from '@/lib/scoring/final-score'
import { cleanText }               from '@/lib/text/clean-text'
import { dedupeByCanonicalUrl }    from '@/lib/ingest/ingest-service'
import { isServerSupabaseConfigured } from '@/lib/supabase/server'
import type { DbSource, DbItemInsert } from '@/types/database'
import type { NormalizedIngestItem }               from '@/types/provider'

// ── Constants ─────────────────────────────────────────────────────────────────

const BATCH_SIZE        = 4      // concurrent sources per fetch batch
const PER_SOURCE_TIMEOUT = 9_000  // ms before a single feed is aborted
const MAX_ITEMS_PER_SOURCE = 20   // cap items from each feed (avoid overloading)
const MAX_TOTAL_ITEMS   = 120    // cap across all feeds combined

const RSS_PROVIDER_ID   = 'rss'
const RSS_PROVIDER_NAME = 'RSS Sources'
const RSS_TRUST_SCORE   = 65

const TIER_TRUST:   Record<string, number> = { S: 90, A: 82, B: 70, C: 60, D: 55 }
const TIER_PRSCORE: Record<string, number> = { S: 80, A: 70, B: 55, C: 40, D: 30 }

// ── Accumulator (mutable shared state) ───────────────────────────────────────

export type IngestRunStatus =
  | 'running'
  | 'success'
  | 'partial_success'
  | 'timeout_partial'
  | 'failed'

export type FailedSourceInfo = {
  name:      string
  url:       string
  stage:     string
  reason:    string
  durationMs: number | null
}

export type IngestAcc = {
  runStatus: IngestRunStatus
  sources: {
    total:      number   // all non-blocked RSS sources in DB
    selected:   number   // chosen for this run (capped by maxSources)
    processed:  number   // actually started (may < selected if deadline hit first)
    successful: number
    failed:     number
    timedOut:   number
    skipped:    number   // total - selected (not started at all)
  }
  items: {
    fetched:          number  // raw items from successful feeds (before dedup/cap)
    cappedAt:         number  // if > 0, items were cut off at this limit
    insertedItems:    number
    reusedItems:      number
    insertedMentions: number
    skippedMentions:  number
    skippedWrite:     number  // items not written due to deadline
  }
  stages: {
    loadSourcesMs: number
    fetchMs:       number
    writeMs:       number
  }
  failedSources: FailedSourceInfo[]
  hints: string[]
}

export function createAcc(): IngestAcc {
  return {
    runStatus: 'running',
    sources: { total: 0, selected: 0, processed: 0, successful: 0, failed: 0, timedOut: 0, skipped: 0 },
    items: { fetched: 0, cappedAt: 0, insertedItems: 0, reusedItems: 0, insertedMentions: 0, skippedMentions: 0, skippedWrite: 0 },
    stages: { loadSourcesMs: 0, fetchMs: 0, writeMs: 0 },
    failedSources: [],
    hints: [],
  }
}

// ── Options ───────────────────────────────────────────────────────────────────

export type IngestRunOpts = {
  maxSources:  number    // how many sources to attempt this run
  deadline:    number    // epoch ms — stop all new work after this
  force:       boolean   // if true, include failing sources and allow maxSources up to 18
}

// ── Helper: deadline check ────────────────────────────────────────────────────

function remainingMs(deadline: number): number {
  return deadline - Date.now()
}

function isDeadlineClose(deadline: number, thresholdMs = 3_000): boolean {
  return remainingMs(deadline) < thresholdMs
}

// ── Stage 1: source selection ─────────────────────────────────────────────────

type FeedSpec = {
  name:      string
  feedUrl:   string
  sourceId:  string
  tier:      string
  category:  string
}

const TIER_ORDER: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4 }

async function selectSources(opts: IngestRunOpts, acc: IngestAcc): Promise<FeedSpec[]> {
  const dbResult = await listRssSourcesWithDiag()
  const all      = dbResult.sources

  acc.sources.total = all.length

  if (all.length === 0) {
    acc.hints.push('No active RSS sources found in DB. Add sources via /sources page or run source-maintenance-v2.sql.')
    return []
  }

  // Filter: skip consistently failing sources unless force=true
  const eligible = opts.force
    ? all
    : all.filter((s: DbSource) => s.health_status !== 'failing' || s.is_user_curated)

  if (eligible.length < all.length) {
    const skippedCount = all.length - eligible.length
    acc.hints.push(`${skippedCount} failing source(s) skipped. Use force=true to include them.`)
  }

  // Sort: user_curated first → tier S/A/B → healthy/degraded/unknown before failing
  const HEALTH_ORDER: Record<string, number> = {
    healthy:  0,
    degraded: 1,
    unknown:  2,
    failing:  3,
    blocked:  4,
  }

  const sorted = [...eligible].sort((a: DbSource, b: DbSource) => {
    // 1. User-curated always first
    if (a.is_user_curated && !b.is_user_curated) return -1
    if (!a.is_user_curated && b.is_user_curated) return 1
    // 2. Source tier
    const tA = TIER_ORDER[a.source_tier] ?? 5
    const tB = TIER_ORDER[b.source_tier] ?? 5
    if (tA !== tB) return tA - tB
    // 3. Health status
    const hA = HEALTH_ORDER[a.health_status ?? 'unknown'] ?? 2
    const hB = HEALTH_ORDER[b.health_status ?? 'unknown'] ?? 2
    return hA - hB
  })

  const selected = sorted.slice(0, opts.maxSources)
  acc.sources.selected = selected.length
  acc.sources.skipped  = all.length - selected.length

  if (acc.sources.skipped > 0) {
    acc.hints.push(
      `${acc.sources.skipped} source(s) not selected this run (maxSources=${opts.maxSources}). ` +
      `Increase maxSources or run again to reach remaining sources.`
    )
  }

  console.log(
    `[rss ingest] selected ${selected.length}/${all.length} sources` +
    (selected.length < all.length ? ` (${acc.sources.skipped} deferred)` : ''),
  )

  return selected.map((s: DbSource) => ({
    name:     s.name,
    feedUrl:  s.url,
    sourceId: s.id,
    tier:     s.source_tier,
    category: s.category,
  }))
}

// ── Stage 2: fetch feeds (batched parallel, fire-and-forget health) ───────────

function buildNormalizedItem(
  parsed:    import('./types').ParsedRssItem,
  feed:      FeedSpec,
  rank:      number,
  fetchedAt: string,
): NormalizedIngestItem {
  const url          = parsed.url.trim()
  const canonicalUrl = canonicalizeUrl(url)
  const tier         = feed.tier.toUpperCase()
  const trustScore   = TIER_TRUST[tier]   ?? RSS_TRUST_SCORE
  const prScore      = TIER_PRSCORE[tier] ?? 50
  const externalId   = parsed.guid?.trim() || canonicalUrl || url

  return {
    providerId:          RSS_PROVIDER_ID,
    providerName:        RSS_PROVIDER_NAME,
    providerTrustScore:  trustScore,
    externalId,
    providerScore:       prScore,
    providerRank:        rank,
    providerCategory:    feed.category,
    providerTags:        [],
    featured:            false,
    title:               parsed.title,
    normalizedTitle:     normalizeTitle(parsed.title),
    summary:             parsed.summary || null,
    url,
    canonicalUrl,
    originalSourceName:  feed.name,
    originalSourceUrl:   feed.feedUrl,
    category:            feed.category,
    tags:                [],
    entities:            [],
    publishedAt:         parsed.publishedAt,
    fetchedAt,
    rawPayload: {
      guid:          parsed.guid ?? null,
      title:         parsed.title,
      pubDate:       parsed.publishedAt,
      sourceName:    feed.name,
      feedUrl:       feed.feedUrl,
      sourceHomepage: null,
    },
  }
}

/** Fetches one feed. Never throws. Pushes results into acc. */
async function fetchOneFeed(
  feed:      FeedSpec,
  acc:       IngestAcc,
  fetchedAt: string,
): Promise<NormalizedIngestItem[]> {
  const start = Date.now()
  console.log(`[rss ingest] → ${feed.name}`)

  let xml:        string
  let httpStatus: number | undefined
  let latencyMs:  number | undefined

  // ── Fetch ────────────────────────────────────────────────────────────────
  try {
    const result = await fetchRssFeed(feed.feedUrl, PER_SOURCE_TIMEOUT)
    xml        = result.text
    httpStatus = result.status
    latencyMs  = Date.now() - start
  } catch (err) {
    latencyMs  = Date.now() - start
    const msg  = err instanceof Error ? err.message : String(err)
    const isTO = msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('abort')
    const shortMsg = isTO ? `timeout after ${PER_SOURCE_TIMEOUT}ms` : msg.slice(0, 200)

    console.log(`[rss ingest] ✗ ${feed.name} — ${isTO ? 'TIMEOUT' : 'FAIL'} (${latencyMs}ms): ${shortMsg}`)

    acc.failedSources.push({ name: feed.name, url: feed.feedUrl, stage: 'fetch', reason: shortMsg, durationMs: latencyMs })

    if (isTO) acc.sources.timedOut++
    else      acc.sources.failed++

    // Fire-and-forget health update — never blocks the fetch batch
    if (feed.sourceId) {
      updateSourceFetchFailure(feed.sourceId, shortMsg, { latencyMs, httpStatus, errorStage: 'fetch' }).catch(() => {})
      insertFetchLog({ sourceId: feed.sourceId, sourceName: feed.name, feedUrl: feed.feedUrl, success: false, latencyMs, httpStatus, errorStage: 'fetch', errorMessage: shortMsg }).catch(() => {})
    }
    return []
  }

  // ── Parse ────────────────────────────────────────────────────────────────
  let parsed: import('./types').ParsedRssItem[]
  try {
    parsed = parseRssFeed(xml)
  } catch (err) {
    latencyMs = Date.now() - start
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`[rss ingest] ✗ ${feed.name} — PARSE ERROR (${latencyMs}ms)`)

    acc.failedSources.push({ name: feed.name, url: feed.feedUrl, stage: 'parse', reason: msg.slice(0, 200), durationMs: latencyMs })
    acc.sources.failed++

    if (feed.sourceId) {
      updateSourceFetchFailure(feed.sourceId, msg.slice(0, 200), { latencyMs, httpStatus, errorStage: 'parse' }).catch(() => {})
    }
    return []
  }

  latencyMs = Date.now() - start
  console.log(`[rss ingest] ✓ ${feed.name} — ${parsed.length} items (${latencyMs}ms)`)

  acc.sources.successful++
  acc.sources.processed++

  // Fire-and-forget health update
  if (feed.sourceId) {
    updateSourceFetchSuccess(feed.sourceId, latencyMs, httpStatus).catch(() => {})
    insertFetchLog({ sourceId: feed.sourceId, sourceName: feed.name, feedUrl: feed.feedUrl, success: true, latencyMs, httpStatus, itemsFound: parsed.length }).catch(() => {})
  }

  // Normalise + cap per-source items
  const items: NormalizedIngestItem[] = []
  let rank = 0
  for (const p of parsed) {
    if (rank >= MAX_ITEMS_PER_SOURCE) break
    rank++
    if (!p.title.trim() || !p.url.trim()) continue
    try {
      items.push(buildNormalizedItem(p, feed, rank, fetchedAt))
    } catch { /* skip malformed */ }
  }
  return items
}

async function fetchAllFeeds(
  feeds:    FeedSpec[],
  acc:      IngestAcc,
  deadline: number,
): Promise<NormalizedIngestItem[]> {
  const fetchedAt = new Date().toISOString()
  const allItems: NormalizedIngestItem[] = []

  for (let i = 0; i < feeds.length; i += BATCH_SIZE) {
    if (isDeadlineClose(deadline, 5_000)) {
      const remaining = feeds.length - i
      console.log(`[rss ingest] deadline close, skipping ${remaining} sources`)
      acc.hints.push(`${remaining} source(s) skipped due to approaching deadline.`)
      break
    }

    const batch     = feeds.slice(i, i + BATCH_SIZE)
    const batchNum  = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(feeds.length / BATCH_SIZE)
    console.log(`[rss ingest] batch ${batchNum}/${totalBatches}: ${batch.map(f => f.name).join(', ')}`)

    acc.sources.processed += batch.length

    const results = await Promise.allSettled(
      batch.map(feed => fetchOneFeed(feed, acc, fetchedAt))
    )

    for (const r of results) {
      if (r.status === 'fulfilled') allItems.push(...r.value)
    }
  }

  return allItems
}

// ── Stage 3: write items to DB ────────────────────────────────────────────────

function buildItemPayload(
  item:           NormalizedIngestItem,
  sourceId:       string | null,
  providerSignal: number,
  finalScore:     number,
  dims:           ScoreDimensions,
): DbItemInsert {
  const cleanTitle   = cleanText(item.title)
  const cleanSummary = cleanText(item.summary)
  return {
    title:                  cleanTitle || item.title,
    url:                    item.url,
    canonical_url:          item.canonicalUrl || undefined,
    summary:                cleanSummary,
    source_id:              sourceId ?? undefined,
    published_at:           item.publishedAt ?? new Date().toISOString(),
    category:               item.category ?? '其他',
    tags:                   item.tags ?? [],
    entities:               item.entities ?? [],
    language:               detectLanguage(cleanTitle || item.title, cleanSummary),
    provider_signal:        providerSignal,
    raw_payload:            item.rawPayload,
    status:                 'new',
    final_score:            finalScore,
    ...dims,
    duplicate_penalty:      0,
    clickbait_penalty:      0,
    marketing_penalty:      0,
    cognitive_load_penalty: 0,
  }
}

function defaultDimensions(hasSource: boolean): ScoreDimensions {
  const base = hasSource ? 65 : 35
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

async function writeItems(
  items:       NormalizedIngestItem[],
  acc:         IngestAcc,
  deadline:    number,
  providerDbId: string,
): Promise<void> {
  const writeStart = Date.now()

  // Pre-resolve unique source IDs (one DB call per unique source URL)
  const sourceUrlToId = new Map<string, string | null>()
  const uniqueUrls    = [...new Set(items.map(i => i.originalSourceUrl).filter((u): u is string => !!u))]

  for (const sourceUrl of uniqueUrls) {
    if (isDeadlineClose(deadline, 4_000)) break
    try {
      const match = items.find(i => i.originalSourceUrl === sourceUrl)
      const src = await findOrCreateSource({
        name:     match?.originalSourceName ?? undefined,
        url:      sourceUrl,
        category: match?.category ?? undefined,
      })
      sourceUrlToId.set(sourceUrl, src?.id ?? null)
    } catch {
      sourceUrlToId.set(sourceUrl, null)
    }
  }

  let written = 0
  for (const item of items) {
    // Hard deadline check before each item write
    if (isDeadlineClose(deadline, 3_000)) {
      acc.items.skippedWrite = items.length - written
      console.log(`[rss ingest] deadline close in write phase, skipped ${acc.items.skippedWrite} items`)
      acc.hints.push(`Write phase stopped early: ${acc.items.skippedWrite} items not written (deadline).`)
      break
    }

    const sourceId      = sourceUrlToId.get(item.originalSourceUrl ?? '') ?? null
    const providerSignal = calculateProviderSignal({
      providerTrustScore: item.providerTrustScore,
      providerScore:      item.providerScore  ?? undefined,
      providerRank:       item.providerRank   ?? undefined,
      featured:           item.featured,
      mentionCount:       1,
    })
    const dims = defaultDimensions(sourceId !== null)
    const { finalScore } = calculateFinalScore(dims, item.publishedAt ?? new Date().toISOString())
    const row = buildItemPayload(item, sourceId, providerSignal, finalScore, dims)

    try {
      const upserted = await upsertItemByCanonicalUrl(row)
      if (upserted.status === 'inserted') acc.items.insertedItems++
      else                                acc.items.reusedItems++

      try {
        const m = await upsertItemMention({ itemId: upserted.id, providerDbId, item })
        if (m === 'inserted')  acc.items.insertedMentions++
        if (m === 'existing')  acc.items.skippedMentions++
      } catch { /* mention errors are non-fatal */ }

    } catch { /* item write error is non-fatal; continue */ }

    written++
  }

  acc.stages.writeMs = Date.now() - writeStart
  console.log(
    `[rss ingest] write finish — inserted=${acc.items.insertedItems} ` +
    `reused=${acc.items.reusedItems} skipped=${acc.items.skippedWrite} ` +
    `duration=${acc.stages.writeMs}ms`
  )
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

/**
 * Runs the full ingest pipeline. Designed to run inside Promise.race —
 * if the caller's timeout fires first, whatever state acc holds is returned.
 *
 * Never throws. All errors are captured in acc.
 */
export async function runDeadlineAwareIngest(
  acc:  IngestAcc,
  opts: IngestRunOpts,
): Promise<void> {
  if (!isServerSupabaseConfigured) {
    acc.runStatus = 'failed'
    acc.hints.push('Supabase not configured — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
    return
  }

  try {
    // ── Stage 1: source selection ───────────────────────────────────────────
    const loadStart = Date.now()
    const feeds = await selectSources(opts, acc)
    acc.stages.loadSourcesMs = Date.now() - loadStart

    if (feeds.length === 0) {
      acc.runStatus = 'failed'
      return
    }

    if (isDeadlineClose(opts.deadline, 10_000)) {
      acc.runStatus = 'timeout_partial'
      acc.hints.push('Deadline hit before fetch could start — increase timeoutMs or reduce maxSources.')
      return
    }

    // ── Stage 2: fetch feeds ────────────────────────────────────────────────
    const fetchStart = Date.now()
    console.log(
      `[rss ingest] fetch start: ${feeds.length} sources | ` +
      `concurrency=${BATCH_SIZE} | per-source=${PER_SOURCE_TIMEOUT}ms | ` +
      `remaining=${remainingMs(opts.deadline)}ms`
    )
    const rawItems = await fetchAllFeeds(feeds, acc, opts.deadline)
    acc.stages.fetchMs = Date.now() - fetchStart
    console.log(`[rss ingest] fetch done: ${rawItems.length} raw items in ${acc.stages.fetchMs}ms`)

    if (isDeadlineClose(opts.deadline, 5_000)) {
      acc.items.fetched = rawItems.length
      acc.runStatus = 'timeout_partial'
      acc.hints.push('Deadline hit after fetch — items not written to DB. Run again.')
      return
    }

    // ── Stage 3: dedup + cap ────────────────────────────────────────────────
    const unique = dedupeByCanonicalUrl(rawItems)
    acc.items.fetched = unique.length

    let toWrite = unique
    if (unique.length > MAX_TOTAL_ITEMS) {
      toWrite = unique.slice(0, MAX_TOTAL_ITEMS)
      acc.items.cappedAt = MAX_TOTAL_ITEMS
      acc.hints.push(
        `${unique.length - MAX_TOTAL_ITEMS} items beyond the cap of ${MAX_TOTAL_ITEMS} ` +
        `were not written. Run again to process the next batch.`
      )
    }

    // ── Stage 4: upsert provider (once) ────────────────────────────────────
    const providerConfig = {
      id: RSS_PROVIDER_ID, name: RSS_PROVIDER_NAME, type: 'rss' as const,
      baseUrl: null, trustScore: RSS_TRUST_SCORE, enabled: true,
    }
    let providerDbId: string | null = null
    try {
      providerDbId = await upsertProvider(providerConfig)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[rss ingest] upsertProvider failed:', msg)
      acc.hints.push(`Provider upsert failed: ${msg}. Items were fetched but not written.`)
      acc.runStatus = 'partial_success'
      return
    }

    if (!providerDbId) {
      acc.hints.push('Provider upsert returned null — items not written.')
      acc.runStatus = 'partial_success'
      return
    }

    // ── Stage 5: write items ────────────────────────────────────────────────
    console.log(`[rss ingest] write start: ${toWrite.length} items (cap=${MAX_TOTAL_ITEMS})`)
    await writeItems(toWrite, acc, opts.deadline, providerDbId)

    // ── Determine final status ──────────────────────────────────────────────
    const anySuccess = acc.sources.successful > 0
    const anyWritten = (acc.items.insertedItems + acc.items.reusedItems) > 0

    if (!anySuccess) {
      acc.runStatus = 'failed'
    } else if (acc.failedSources.length === 0 && acc.items.skippedWrite === 0) {
      acc.runStatus = 'success'
    } else {
      acc.runStatus = 'partial_success'
    }

    console.log(
      `[rss ingest] finish: runStatus=${acc.runStatus} ` +
      `sources=${acc.sources.successful}ok/${acc.sources.failed}fail/${acc.sources.timedOut}timeout ` +
      `items=+${acc.items.insertedItems}/~${acc.items.reusedItems}`
    )

    if (anySuccess && !anyWritten) {
      acc.hints.push('Feeds fetched successfully but no items were inserted or reused (all may be duplicates).')
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[rss ingest] unexpected error in runDeadlineAwareIngest:', msg)
    acc.runStatus = 'partial_success'
    acc.hints.push(`Unexpected error: ${msg}`)
  }
}

// ── Response builder ──────────────────────────────────────────────────────────

export function buildIngestResponse(
  acc:        IngestAcc,
  durationMs: number,
  deadlineMs: number,
): Record<string, unknown> {
  const finalStatus = acc.runStatus === 'running' ? 'timeout_partial' : acc.runStatus

  return {
    ok:         finalStatus !== 'failed',
    runStatus:  finalStatus,
    durationMs,
    deadlineMs,
    sources: {
      total:      acc.sources.total,
      selected:   acc.sources.selected,
      processed:  acc.sources.processed,
      successful: acc.sources.successful,
      failed:     acc.sources.failed,
      timedOut:   acc.sources.timedOut,
      skipped:    acc.sources.skipped,
    },
    items: {
      fetched:          acc.items.fetched,
      insertedItems:    acc.items.insertedItems,
      reusedItems:      acc.items.reusedItems,
      insertedMentions: acc.items.insertedMentions,
      skippedMentions:  acc.items.skippedMentions,
      skippedWrite:     acc.items.skippedWrite,
      ...(acc.items.cappedAt > 0 && { cappedAt: acc.items.cappedAt }),
    },
    stages: {
      loadSourcesMs: acc.stages.loadSourcesMs,
      fetchMs:       acc.stages.fetchMs,
      writeMs:       acc.stages.writeMs,
      totalMs:       durationMs,
    },
    failedSources: acc.failedSources,
    hints:         acc.hints,
  }
}
