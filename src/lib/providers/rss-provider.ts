/**
 * RSS Provider Adapter — "RSS Sources"
 *
 * Wraps the existing RSS fetch/parse pipeline into the unified ProviderAdapter
 * interface so RSS feeds flow through the same NormalizedIngestItem →
 * ingestNormalizedItemsToDatabase chain as other providers.
 *
 * Provider = "RSS Sources" (the delivery mechanism)
 * Source   = the individual feed origin (e.g. "The Verge", "Anthropic Blog")
 *
 * Source resolution: the feed URL in sources.url is used by findOrCreateSource
 * inside ingestNormalizedItemsToDatabase to look up or create the source row.
 */

import { listRssSourcesWithDiag, updateSourceFetchSuccess, updateSourceFetchFailure } from '@/lib/db/sources'
import type { RssSourceLoadResult } from '@/lib/db/sources'
import { fetchRssFeed, parseRssFeed } from '@/lib/ingest/rss'
import { canonicalizeUrl, normalizeTitle } from '@/lib/ingest/normalize'
import type { ProviderAdapter, ProviderConfig, NormalizedIngestItem } from '@/types/provider'
import type { DbSource } from '@/types/database'

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

const TIER_TRUST:  Record<string, number> = { S: 90, A: 82, B: 70, C: 60, D: 55 }
const TIER_PRSCORE: Record<string, number> = { S: 80, A: 70, B: 55, C: 40, D: 30 }

// Per-source fetch timeout (ms). Keeps slow/dead feeds from blocking the run.
const FEED_TIMEOUT_MS = 9_000

// ── Fallback feeds (used when no sources with platform='rss' exist in DB) ─────
// Only URLs already documented in this project; never fetched at build time.

type FallbackFeed = { name: string; feedUrl: string; category: string }

const FALLBACK_FEEDS: FallbackFeed[] = [
  {
    name:     'The Verge AI',
    feedUrl:  'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
    category: 'AI技术',
  },
  {
    name:     'TechCrunch AI',
    feedUrl:  'https://techcrunch.com/category/artificial-intelligence/feed/',
    category: 'AI技术',
  },
  {
    name:     'Hugging Face Blog',
    feedUrl:  'https://huggingface.co/blog/feed.xml',
    category: 'AI技术',
  },
]

// ── Error and health types ────────────────────────────────────────────────────

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
  errorMessage?: string
}

export type SourceHealthSummary = {
  total:            number
  succeededThisRun: number
  failedThisRun:    number
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

// ── NormalizedIngestItem builder ──────────────────────────────────────────────

function toNormalizedItem(
  parsed:    import('@/lib/ingest/types').ParsedRssItem,
  feedUrl:   string,
  sourceName: string,
  sourceHomepage: string | null,
  sourceTier: string,
  category:  string,
  rank:      number,
  fetchedAt: string,
): NormalizedIngestItem {
  const url          = parsed.url.trim()
  const canonicalUrl = canonicalizeUrl(url)
  const tier         = sourceTier.toUpperCase()
  const trustScore   = TIER_TRUST[tier]  ?? RSS_PROVIDER.trustScore
  const prScore      = TIER_PRSCORE[tier] ?? 50

  const externalId = parsed.guid?.trim() || canonicalUrl || url

  return {
    providerId:          RSS_PROVIDER.id,
    providerName:        RSS_PROVIDER.name,
    providerTrustScore:  trustScore,
    externalId,
    providerScore:       prScore,
    providerRank:        rank,
    providerCategory:    category,
    providerTags:        [],
    featured:            false,
    title:               parsed.title,
    normalizedTitle:     normalizeTitle(parsed.title),
    summary:             parsed.summary || null,
    url,
    canonicalUrl,
    originalSourceName:  sourceName,
    originalSourceUrl:   feedUrl,
    category,
    tags:                [],
    entities:            [],
    publishedAt:         parsed.publishedAt,
    fetchedAt,
    rawPayload: {
      guid:       parsed.guid ?? null,
      title:      parsed.title,
      pubDate:    parsed.publishedAt,
      author:     parsed.author,
      sourceName,
      feedUrl,
      sourceHomepage,
    },
  }
}

// ── Core fetch function ───────────────────────────────────────────────────────

type FeedSpec = {
  name:           string
  feedUrl:        string
  sourceId?:      string   // DB UUID — present when sourceMode='database'
  sourceHomepage: string | null
  tier:           string
  category:       string
}

/**
 * Fetches and normalises items from all active RSS sources.
 *
 * Each source is fetched with an independent timeout (FEED_TIMEOUT_MS).
 * Individual feed failures are collected in feedErrors and do not abort the rest.
 *
 * opts.recordHealth — when true, calls updateSourceFetchSuccess/Failure for each
 * source. Should be false for dry-run / GET requests to avoid write side-effects.
 */
export async function fetchRssProviderItems(opts?: {
  recordHealth?: boolean
}): Promise<RssFetchResult> {
  const recordHealth = opts?.recordHealth ?? false
  const fetchedAt    = new Date().toISOString()
  const feedErrors:  FeedError[]  = []
  const itemErrors:  ItemError[]  = []
  const items:       NormalizedIngestItem[] = []

  const healthPerSource: PerSourceHealth[] = []
  let succeededThisRun = 0
  let failedThisRun    = 0

  // ── Resolve feed list with full diagnostics ───────────────────────────────
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

  // ── Fetch each feed independently ─────────────────────────────────────────
  for (const feed of feeds) {
    const start = Date.now()
    let latencyMs:  number | undefined
    let httpStatus: number | undefined

    // Stage 1: network fetch with per-source timeout
    let xml: string
    try {
      const result = await fetchRssFeed(feed.feedUrl, FEED_TIMEOUT_MS)
      xml        = result.text
      httpStatus = result.status
      latencyMs  = Date.now() - start
    } catch (err) {
      latencyMs = Date.now() - start
      const msg = err instanceof Error ? err.message : String(err)

      feedErrors.push({
        sourceId:   feed.sourceId,
        sourceName: feed.name,
        feedUrl:    feed.feedUrl,
        stage:      'fetch',
        message:    msg,
        latencyMs,
        httpStatus,
      })

      if (recordHealth && feed.sourceId) {
        try {
          await updateSourceFetchFailure(feed.sourceId, msg, latencyMs, httpStatus)
        } catch (hErr) {
          const hMsg = hErr instanceof Error ? hErr.message : String(hErr)
          console.error('[rss-provider] health update (failure) failed for', feed.name, ':', hMsg)
          feedErrors.push({
            sourceId:   feed.sourceId,
            sourceName: feed.name,
            feedUrl:    feed.feedUrl,
            stage:      'health_update',
            message:    hMsg,
          })
        }
      }

      failedThisRun++
      healthPerSource.push({ id: feed.sourceId, name: feed.name, url: feed.feedUrl, success: false, latencyMs, httpStatus, errorMessage: msg })
      continue
    }

    // Stage 2: XML parse
    let parsed: import('@/lib/ingest/types').ParsedRssItem[]
    try {
      parsed = parseRssFeed(xml)
    } catch (err) {
      latencyMs = Date.now() - start
      const msg = err instanceof Error ? err.message : String(err)

      feedErrors.push({
        sourceId:   feed.sourceId,
        sourceName: feed.name,
        feedUrl:    feed.feedUrl,
        stage:      'parse',
        message:    msg,
        latencyMs,
        httpStatus,
      })

      if (recordHealth && feed.sourceId) {
        try {
          await updateSourceFetchFailure(feed.sourceId, msg, latencyMs, httpStatus)
        } catch (hErr) {
          const hMsg = hErr instanceof Error ? hErr.message : String(hErr)
          console.error('[rss-provider] health update (parse failure) failed for', feed.name, ':', hMsg)
          feedErrors.push({
            sourceId:   feed.sourceId,
            sourceName: feed.name,
            feedUrl:    feed.feedUrl,
            stage:      'health_update',
            message:    hMsg,
          })
        }
      }

      failedThisRun++
      healthPerSource.push({ id: feed.sourceId, name: feed.name, url: feed.feedUrl, success: false, latencyMs, httpStatus, errorMessage: msg })
      continue
    }

    // Fetch + parse succeeded — record health update
    latencyMs = Date.now() - start

    if (recordHealth && feed.sourceId) {
      try {
        await updateSourceFetchSuccess(feed.sourceId, latencyMs)
      } catch (hErr) {
        const hMsg = hErr instanceof Error ? hErr.message : String(hErr)
        console.error('[rss-provider] health update (success) failed for', feed.name, ':', hMsg)
        feedErrors.push({
          sourceId:   feed.sourceId,
          sourceName: feed.name,
          feedUrl:    feed.feedUrl,
          stage:      'health_update',
          message:    hMsg,
        })
      }
    }

    succeededThisRun++
    healthPerSource.push({ id: feed.sourceId, name: feed.name, url: feed.feedUrl, success: true, latencyMs, httpStatus })

    // Stage 3: normalise individual items
    let rank = 0
    for (const p of parsed) {
      rank++

      if (!p.title.trim()) {
        itemErrors.push({ sourceName: feed.name, message: 'missing title — skipped' })
        continue
      }
      if (!p.url.trim()) {
        itemErrors.push({ sourceName: feed.name, title: p.title, message: 'missing url — skipped' })
        continue
      }

      try {
        items.push(toNormalizedItem(
          p,
          feed.feedUrl,
          feed.name,
          feed.sourceHomepage,
          feed.tier,
          feed.category,
          rank,
          fetchedAt,
        ))
      } catch (err) {
        itemErrors.push({
          sourceName: feed.name,
          title:      p.title,
          message:    err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  const sourceHealthSummary: SourceHealthSummary = {
    total:            feeds.length,
    succeededThisRun,
    failedThisRun,
    perSource:        healthPerSource,
  }

  return { items, feedErrors, itemErrors, sourceMode, sourceCount: feeds.length, sourceLoadDebug, sourceHealthSummary }
}

// ── ProviderAdapter interface ─────────────────────────────────────────────────

export const RssProviderAdapter: ProviderAdapter = {
  provider:   RSS_PROVIDER,
  fetchItems: async () => {
    const { items } = await fetchRssProviderItems()
    return items
  },
}
