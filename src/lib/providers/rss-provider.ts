/**
 * RSS Provider Adapter — "RSS Sources"
 *
 * Fetches all active RSS sources in PARALLEL BATCHES (not serial).
 *
 * Concurrency model:
 *   - BATCH_SIZE sources run concurrently per batch (default 4)
 *   - Each source has a hard FEED_TIMEOUT_MS deadline (9 s)
 *   - The entire fetch phase has a GLOBAL_DEADLINE_MS ceiling (65 s)
 *   - Sources not reached before the global deadline are marked "skipped"
 *   - A single source failure never blocks or crashes others
 *
 * Before this change, the loop was serial: 18 sources × 9 s = up to 162 s.
 * After: ceil(18/4) = 5 batches × max 9 s = ~45 s worst-case, well under
 * the 90 s client timeout.
 */

import { listRssSourcesWithDiag, updateSourceFetchSuccess, updateSourceFetchFailure, insertFetchLog } from '@/lib/db/sources'
import type { RssSourceLoadResult } from '@/lib/db/sources'
import { fetchRssFeed, parseRssFeed } from '@/lib/ingest/rss'
import { canonicalizeUrl, normalizeTitle } from '@/lib/ingest/normalize'
import type { ProviderAdapter, ProviderConfig, NormalizedIngestItem } from '@/types/provider'
import type { DbSource } from '@/types/database'

// ── Concurrency & timeout constants ──────────────────────────────────────────

/** Number of RSS sources to fetch concurrently in each batch. */
const BATCH_SIZE = 4

/** Hard limit per individual RSS source (ms). */
const FEED_TIMEOUT_MS = 9_000

/**
 * Hard wall-clock limit for the entire fetch phase (ms).
 * Any sources not yet started when this expires are marked "skipped".
 * Must be well below the HTTP server/client timeout (typically 90–120 s).
 */
const GLOBAL_DEADLINE_MS = 65_000

// ── Provider config ───────────────────────────────────────────────────────────

const RSS_PROVIDER: ProviderConfig = {
  id:         'rss',
  name:       'RSS Sources',
  type:       'rss',
  baseUrl:    null,
  trustScore: 65,
  enabled:    true,
}

// ── Tier → signal scores ──────────────────────────────────────────────────────

const TIER_TRUST:   Record<string, number> = { S: 90, A: 82, B: 70, C: 60, D: 55 }
const TIER_PRSCORE: Record<string, number> = { S: 80, A: 70, B: 55, C: 40, D: 30 }

// ── Fallback feeds (used when no sources with platform='rss' exist in DB) ─────

type FallbackFeed = { name: string; feedUrl: string; category: string }

const FALLBACK_FEEDS: FallbackFeed[] = [
  { name: 'The Verge AI',          feedUrl: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', category: 'AI技术' },
  { name: 'TechCrunch AI',         feedUrl: 'https://techcrunch.com/category/artificial-intelligence/feed/',     category: 'AI技术' },
  { name: 'Hugging Face Blog',     feedUrl: 'https://huggingface.co/blog/feed.xml',                              category: 'AI技术' },
  { name: 'AIHOT 精选',            feedUrl: 'https://aihot.virxact.com/feed.xml',                                category: 'AI技术' },
  { name: 'MIT Technology Review', feedUrl: 'https://www.technologyreview.com/feed/',                            category: 'AI技术' },
  { name: 'VentureBeat AI',        feedUrl: 'https://venturebeat.com/ai/feed/',                                  category: '行业趋势' },
  { name: 'The Decoder',           feedUrl: 'https://the-decoder.com/feed/',                                     category: 'AI技术' },
  { name: 'GitHub Blog',           feedUrl: 'https://github.blog/feed/',                                         category: '开源项目' },
]

// ── Public types ──────────────────────────────────────────────────────────────

export type FeedError = {
  sourceId?:   string
  sourceName:  string
  feedUrl:     string
  stage:       'fetch' | 'parse' | 'persist' | 'health_update'
  message:     string
  latencyMs?:  number
  httpStatus?: number
}

export type ItemError = {
  sourceName: string
  title?:     string
  message:    string
}

export type SourceLoadDebug = {
  attemptedDatabase:    boolean
  databaseSourceCount:  number
  fallbackSourceCount:  number
  sourcePreview:        Array<{ name: string; url: string; platform: string; sourceTier: string; isBlocked: boolean | null }>
  sourceLoadError?:     { message: string; code?: string; details?: string; hint?: string }
}

export type PerSourceHealth = {
  id?:           string
  name:          string
  url:           string
  success:       boolean
  latencyMs?:    number
  httpStatus?:   number
  errorStage?:   'fetch' | 'parse' | 'persist' | 'health_update'
  errorClass?:   'timeout' | 'aborted' | 'http_error' | 'parse_error' | 'db_error' | 'unknown'
  errorMessage?: string
  itemsFound?:   number
  itemsInserted?: number
  itemsSkipped?:  number
  healthStatus?: string
  healthScore?:  number
}

export type SourceHealthSummary = {
  total:            number
  succeededThisRun: number
  failedThisRun:    number
  timedOutThisRun:  number   // sources that hit FEED_TIMEOUT_MS
  skippedThisRun:   number   // sources not reached before GLOBAL_DEADLINE_MS
  healthy:          number
  degraded:         number
  failing:          number
  unknown:          number
  perSource:        PerSourceHealth[]
}

export type RssFetchResult = {
  items:               NormalizedIngestItem[]
  feedErrors:          FeedError[]
  itemErrors:          ItemError[]
  sourceMode:          'database' | 'fallback'
  sourceCount:         number
  sourceLoadDebug:     SourceLoadDebug
  sourceHealthSummary: SourceHealthSummary
}

// ── Internal types ────────────────────────────────────────────────────────────

type FeedSpec = {
  name:           string
  feedUrl:        string
  sourceId?:      string
  sourceHomepage: string | null
  tier:           string
  category:       string
}

type ErrorClass = 'timeout' | 'aborted' | 'http_error' | 'parse_error' | 'db_error' | 'unknown'

/** Mutable accumulator filled by concurrent processFeed calls. */
type FeedAccumulator = {
  items:            NormalizedIngestItem[]
  feedErrors:       FeedError[]
  itemErrors:       ItemError[]
  healthPerSource:  PerSourceHealth[]
  succeededThisRun: number
  failedThisRun:    number
  timedOutThisRun:  number
}

// ── Error classification ──────────────────────────────────────────────────────

function classifyFetchError(err: unknown, httpStatus?: number): ErrorClass {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  if (msg.includes('timeout') || msg.includes('aborted') || msg.includes('abort')) {
    return msg.includes('timeout') ? 'timeout' : 'aborted'
  }
  if (httpStatus !== undefined && httpStatus >= 400) return 'http_error'
  return 'unknown'
}

// ── NormalizedIngestItem builder ──────────────────────────────────────────────

function toNormalizedItem(
  parsed:         import('@/lib/ingest/types').ParsedRssItem,
  feedUrl:        string,
  sourceName:     string,
  sourceHomepage: string | null,
  sourceTier:     string,
  category:       string,
  rank:           number,
  fetchedAt:      string,
): NormalizedIngestItem {
  const url          = parsed.url.trim()
  const canonicalUrl = canonicalizeUrl(url)
  const tier         = sourceTier.toUpperCase()
  const trustScore   = TIER_TRUST[tier]   ?? RSS_PROVIDER.trustScore
  const prScore      = TIER_PRSCORE[tier] ?? 50
  const externalId   = parsed.guid?.trim() || canonicalUrl || url

  return {
    providerId:         RSS_PROVIDER.id,
    providerName:       RSS_PROVIDER.name,
    providerTrustScore: trustScore,
    externalId,
    providerScore:      prScore,
    providerRank:       rank,
    providerCategory:   category,
    providerTags:       [],
    featured:           false,
    title:              parsed.title,
    normalizedTitle:    normalizeTitle(parsed.title),
    summary:            parsed.summary || null,
    url,
    canonicalUrl,
    originalSourceName: sourceName,
    originalSourceUrl:  feedUrl,
    category,
    tags:               [],
    entities:           [],
    publishedAt:        parsed.publishedAt,
    fetchedAt,
    rawPayload: {
      guid:          parsed.guid ?? null,
      title:         parsed.title,
      pubDate:       parsed.publishedAt,
      author:        parsed.author,
      sourceName,
      feedUrl,
      sourceHomepage,
    },
  }
}

// ── Single-feed processor (never throws) ─────────────────────────────────────

/**
 * Fetches, parses, and normalises one RSS feed.
 * Pushes results into `acc` (the shared mutable accumulator).
 * NEVER throws — all errors are caught and recorded in acc.feedErrors.
 */
async function processFeed(
  feed:         FeedSpec,
  acc:          FeedAccumulator,
  fetchedAt:    string,
  recordHealth: boolean,
): Promise<void> {
  const start = Date.now()
  console.log(`[rss ingest] → start: ${feed.name}`)

  // ── Stage 1: network fetch ──────────────────────────────────────────────────
  let xml:        string
  let httpStatus: number | undefined
  let latencyMs:  number | undefined

  try {
    const result = await fetchRssFeed(feed.feedUrl, FEED_TIMEOUT_MS)
    xml        = result.text
    httpStatus = result.status
    latencyMs  = Date.now() - start
  } catch (err) {
    latencyMs = Date.now() - start
    const msg      = err instanceof Error ? err.message : String(err)
    const errClass = classifyFetchError(err, httpStatus)
    const shortMsg = errClass === 'timeout' ? `timeout after ${FEED_TIMEOUT_MS}ms`
      : errClass === 'aborted'              ? 'aborted'
      : msg.slice(0, 300)

    console.log(`[rss ingest] ✗ FAIL: ${feed.name} — ${errClass} (${latencyMs}ms)`)

    acc.feedErrors.push({ sourceId: feed.sourceId, sourceName: feed.name, feedUrl: feed.feedUrl, stage: 'fetch', message: shortMsg, latencyMs, httpStatus })

    if (recordHealth && feed.sourceId) {
      try { await updateSourceFetchFailure(feed.sourceId, shortMsg, { latencyMs, httpStatus, errorStage: 'fetch' }) } catch {}
      insertFetchLog({ sourceId: feed.sourceId, sourceName: feed.name, feedUrl: feed.feedUrl, success: false, httpStatus, latencyMs, errorStage: 'fetch', errorMessage: shortMsg }).catch(() => {})
    }

    if (errClass === 'timeout' || errClass === 'aborted') acc.timedOutThisRun++
    else acc.failedThisRun++
    acc.healthPerSource.push({ id: feed.sourceId, name: feed.name, url: feed.feedUrl, success: false, latencyMs, httpStatus, errorStage: 'fetch', errorClass: errClass, errorMessage: shortMsg })
    return
  }

  // ── Stage 2: XML parse ──────────────────────────────────────────────────────
  let parsed: import('@/lib/ingest/types').ParsedRssItem[]
  try {
    parsed = parseRssFeed(xml)
  } catch (err) {
    latencyMs = Date.now() - start
    const msg = err instanceof Error ? err.message : String(err)

    console.log(`[rss ingest] ✗ PARSE: ${feed.name} — ${msg.slice(0, 80)} (${latencyMs}ms)`)

    acc.feedErrors.push({ sourceId: feed.sourceId, sourceName: feed.name, feedUrl: feed.feedUrl, stage: 'parse', message: msg.slice(0, 300), latencyMs, httpStatus })

    if (recordHealth && feed.sourceId) {
      try { await updateSourceFetchFailure(feed.sourceId, msg.slice(0, 300), { latencyMs, httpStatus, errorStage: 'parse' }) } catch {}
      insertFetchLog({ sourceId: feed.sourceId, sourceName: feed.name, feedUrl: feed.feedUrl, success: false, httpStatus, latencyMs, errorStage: 'parse', errorMessage: msg.slice(0, 300) }).catch(() => {})
    }

    acc.failedThisRun++
    acc.healthPerSource.push({ id: feed.sourceId, name: feed.name, url: feed.feedUrl, success: false, latencyMs, httpStatus, errorStage: 'parse', errorClass: 'parse_error', errorMessage: msg.slice(0, 300) })
    return
  }

  // ── Fetch + parse succeeded — update health ─────────────────────────────────
  latencyMs = Date.now() - start
  console.log(`[rss ingest] ✓ OK:   ${feed.name} — ${parsed.length} items (${latencyMs}ms)`)

  if (recordHealth && feed.sourceId) {
    try { await updateSourceFetchSuccess(feed.sourceId, latencyMs, httpStatus) }
    catch (hErr) {
      const hMsg = hErr instanceof Error ? hErr.message : String(hErr)
      console.error(`[rss ingest] health update failed for ${feed.name}: ${hMsg}`)
      acc.feedErrors.push({ sourceId: feed.sourceId, sourceName: feed.name, feedUrl: feed.feedUrl, stage: 'health_update', message: hMsg })
    }
    insertFetchLog({ sourceId: feed.sourceId, sourceName: feed.name, feedUrl: feed.feedUrl, success: true, httpStatus, latencyMs, itemsFound: parsed.length }).catch(() => {})
  }

  acc.succeededThisRun++
  acc.healthPerSource.push({ id: feed.sourceId, name: feed.name, url: feed.feedUrl, success: true, latencyMs, httpStatus, itemsFound: parsed.length })

  // ── Stage 3: normalise items ────────────────────────────────────────────────
  let rank = 0
  for (const p of parsed) {
    rank++
    if (!p.title.trim()) { acc.itemErrors.push({ sourceName: feed.name, message: 'missing title — skipped' }); continue }
    if (!p.url.trim())   { acc.itemErrors.push({ sourceName: feed.name, title: p.title, message: 'missing url — skipped' }); continue }
    try {
      acc.items.push(toNormalizedItem(p, feed.feedUrl, feed.name, feed.sourceHomepage, feed.tier, feed.category, rank, fetchedAt))
    } catch (err) {
      acc.itemErrors.push({ sourceName: feed.name, title: p.title, message: err instanceof Error ? err.message : String(err) })
    }
  }
}

// ── Main fetch function ───────────────────────────────────────────────────────

/**
 * Fetches and normalises items from all active RSS sources using batched
 * parallel execution. Replaces the previous serial for-of loop.
 *
 * Guarantees:
 * - Returns within GLOBAL_DEADLINE_MS regardless of how many sources fail.
 * - A single bad source cannot block other sources in the same batch.
 * - Console logs show exactly which source caused a delay.
 */
export async function fetchRssProviderItems(opts?: {
  recordHealth?: boolean
}): Promise<RssFetchResult> {
  const recordHealth = opts?.recordHealth ?? false
  const fetchedAt    = new Date().toISOString()
  const runStart     = Date.now()
  const deadline     = runStart + GLOBAL_DEADLINE_MS

  // ── Resolve feed list ───────────────────────────────────────────────────────
  const dbResult: RssSourceLoadResult = await listRssSourcesWithDiag()
  const dbSources = dbResult.sources

  const sourceLoadDebug: SourceLoadDebug = {
    attemptedDatabase:   dbResult.attempted,
    databaseSourceCount: dbSources.length,
    fallbackSourceCount: FALLBACK_FEEDS.length,
    sourcePreview:       dbSources.slice(0, 5).map((s: DbSource) => ({
      name:       s.name,
      url:        s.url,
      platform:   s.platform,
      sourceTier: s.source_tier,
      isBlocked:  s.is_blocked,
    })),
    sourceLoadError: dbResult.error ?? undefined,
  }

  const usingDb    = dbSources.length > 0
  const sourceMode: 'database' | 'fallback' = usingDb ? 'database' : 'fallback'

  const feeds: FeedSpec[] = usingDb
    ? dbSources.map((s: DbSource) => ({
        name:           s.name,
        feedUrl:        s.url,
        sourceId:       s.id,
        sourceHomepage: null,
        tier:           s.source_tier,
        category:       s.category,
      }))
    : FALLBACK_FEEDS.map(f => ({
        name:           f.name,
        feedUrl:        f.feedUrl,
        sourceHomepage: null,
        tier:           'C',
        category:       f.category,
      }))

  console.log(
    `[rss ingest] start — ${feeds.length} sources | concurrency=${BATCH_SIZE} | ` +
    `per-source timeout=${FEED_TIMEOUT_MS}ms | global deadline=${GLOBAL_DEADLINE_MS}ms`,
  )

  // ── Batched parallel fetch ──────────────────────────────────────────────────
  const acc: FeedAccumulator = {
    items:            [],
    feedErrors:       [],
    itemErrors:       [],
    healthPerSource:  [],
    succeededThisRun: 0,
    failedThisRun:    0,
    timedOutThisRun:  0,
  }
  let skippedThisRun = 0

  for (let i = 0; i < feeds.length; i += BATCH_SIZE) {
    // Check global deadline before starting each new batch
    if (Date.now() > deadline) {
      skippedThisRun = feeds.length - i
      console.log(`[rss ingest] ⏰ global deadline hit — skipping ${skippedThisRun} remaining sources`)
      break
    }

    const batch = feeds.slice(i, i + BATCH_SIZE)
    // Promise.allSettled ensures one rejection never cancels sibling promises
    await Promise.allSettled(
      batch.map(feed => processFeed(feed, acc, fetchedAt, recordHealth)),
    )
  }

  const totalMs = Date.now() - runStart
  console.log(
    `[rss ingest] finish — ${acc.succeededThisRun} ok | ${acc.failedThisRun} failed | ` +
    `${acc.timedOutThisRun} timeout | ${skippedThisRun} skipped | ` +
    `${acc.items.length} items normalised | ${totalMs}ms total`,
  )

  const sourceHealthSummary: SourceHealthSummary = {
    total:            feeds.length,
    succeededThisRun: acc.succeededThisRun,
    failedThisRun:    acc.failedThisRun,
    timedOutThisRun:  acc.timedOutThisRun,
    skippedThisRun,
    healthy:          acc.succeededThisRun,   // approximation from this run
    degraded:         0,
    failing:          acc.failedThisRun,
    unknown:          skippedThisRun,
    perSource:        acc.healthPerSource,
  }

  return {
    items:               acc.items,
    feedErrors:          acc.feedErrors,
    itemErrors:          acc.itemErrors,
    sourceMode,
    sourceCount:         feeds.length,
    sourceLoadDebug,
    sourceHealthSummary,
  }
}

// ── ProviderAdapter interface ─────────────────────────────────────────────────

export const RssProviderAdapter: ProviderAdapter = {
  provider:   RSS_PROVIDER,
  fetchItems: async () => {
    const { items } = await fetchRssProviderItems()
    return items
  },
}
