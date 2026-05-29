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

import { listRssSources } from '@/lib/db/sources'
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

// ── Error types ───────────────────────────────────────────────────────────────

export type FeedError = {
  sourceName: string
  feedUrl:    string
  message:    string
}

export type ItemError = {
  sourceName: string
  title?:     string
  message:    string
}

export type RssFetchResult = {
  items:       NormalizedIngestItem[]
  feedErrors:  FeedError[]
  itemErrors:  ItemError[]
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

  // externalId: prefer guid (stable across re-fetches), fall back to canonical URL
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
    originalSourceUrl:   feedUrl,       // feed URL → findOrCreateSource can look it up
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

/**
 * Fetches and normalises items from all active RSS sources.
 *
 * Source resolution:
 *   1. RSS sources from DB (platform='rss') — preferred
 *   2. Fallback feeds — used when DB has no RSS sources (development/testing)
 *
 * Each source is fetched independently; individual feed failures are collected
 * in feedErrors and do not abort the rest.
 */
export async function fetchRssProviderItems(): Promise<RssFetchResult> {
  const fetchedAt   = new Date().toISOString()
  const feedErrors: FeedError[] = []
  const itemErrors: ItemError[] = []
  const items:      NormalizedIngestItem[] = []

  // ── Resolve feed list ─────────────────────────────────────────────────────
  const dbSources = await listRssSources()

  type FeedSpec = {
    name:           string
    feedUrl:        string
    sourceHomepage: string | null
    tier:           string
    category:       string
  }

  const feeds: FeedSpec[] = dbSources.length > 0
    ? dbSources.map((s: DbSource) => ({
        name:           s.name,
        feedUrl:        s.url,
        sourceHomepage: null,        // sources.url IS the feed URL; no separate homepage stored
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

  // ── Fetch each feed ───────────────────────────────────────────────────────
  for (const feed of feeds) {
    try {
      const xml     = await fetchRssFeed(feed.feedUrl)
      const parsed  = parseRssFeed(xml)

      let rank = 0
      for (const p of parsed) {
        rank++

        // Skip items missing title or URL
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
    } catch (err) {
      feedErrors.push({
        sourceName: feed.name,
        feedUrl:    feed.feedUrl,
        message:    err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { items, feedErrors, itemErrors }
}

// ── ProviderAdapter interface ─────────────────────────────────────────────────

export const RssProviderAdapter: ProviderAdapter = {
  provider:   RSS_PROVIDER,
  fetchItems: async () => {
    const { items } = await fetchRssProviderItems()
    return items
  },
}
