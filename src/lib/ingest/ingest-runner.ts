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
  updateSourceFetchSuccess,
  updateSourceFetchFailure,
  insertFetchLog,
} from '@/lib/db/sources'
import { upsertProvider }          from '@/lib/db/providers'
import { findOrCreateSource }      from '@/lib/db/sources'
import { upsertItemByCanonicalUrl, updateItemArticleContent, markItemContentFetchFailed, updateItemRssContent } from '@/lib/db/items'
import { upsertItemMention }       from '@/lib/db/item-mentions'
import { fetchArticleContent, getArticleFetchConfig } from '@/lib/ingest/article-content'
import { fetchRssFeed, parseRssFeed } from '@/lib/ingest/rss'
import { canonicalizeUrl, normalizeTitle, detectLanguage } from '@/lib/ingest/normalize'
import { calculateProviderSignal } from '@/lib/scoring/provider-signal'
import { calculateFinalScore, type ScoreDimensions } from '@/lib/scoring/final-score'
import { cleanText }               from '@/lib/text/clean-text'
import { dedupeByCanonicalUrl }    from '@/lib/ingest/ingest-service'
import { isServerSupabaseConfigured } from '@/lib/supabase/server'
import {
  selectSourcesForIngest,
  type SourceSelectionResult,
  type SelectedFeed,
} from '@/lib/ingest/source-selector'
import type { DbItemInsert } from '@/types/database'
import type { NormalizedIngestItem } from '@/types/provider'

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
  articleFetch: {
    enabled:          boolean
    attempted:        number
    succeeded:        number
    failed:           number
    skipped:          number
    totalContentLength: number
  }
  failedSources: FailedSourceInfo[]
  hints: string[]
  // Source rotation diagnostics (set after source selection)
  sourceSelection: SourceSelectionResult | null
}

export function createAcc(): IngestAcc {
  return {
    runStatus: 'running',
    sources: { total: 0, selected: 0, processed: 0, successful: 0, failed: 0, timedOut: 0, skipped: 0 },
    items: { fetched: 0, cappedAt: 0, insertedItems: 0, reusedItems: 0, insertedMentions: 0, skippedMentions: 0, skippedWrite: 0 },
    stages: { loadSourcesMs: 0, fetchMs: 0, writeMs: 0 },
    articleFetch: { enabled: false, attempted: 0, succeeded: 0, failed: 0, skipped: 0, totalContentLength: 0 },
    failedSources: [],
    hints: [],
    sourceSelection: null,
  }
}

// ── Options ───────────────────────────────────────────────────────────────────

export type IngestRunOpts = {
  maxSources:  number    // how many sources to attempt this run
  deadline:    number    // epoch ms — stop all new work after this
  force:       boolean   // if true, include failing sources and allow maxSources up to 18
  now?:        Date      // clock override (for testing / source-selector staleness)
}

// ── Helper: deadline check ────────────────────────────────────────────────────

function remainingMs(deadline: number): number {
  return deadline - Date.now()
}

function isDeadlineClose(deadline: number, thresholdMs = 3_000): boolean {
  return remainingMs(deadline) < thresholdMs
}

// ── Stage 1: source selection (delegates to source-selector) ─────────────────

// Re-export SelectedFeed as FeedSpec alias for backward compat within this file
type FeedSpec = SelectedFeed

async function stageSelectSources(opts: IngestRunOpts, acc: IngestAcc): Promise<FeedSpec[]> {
  const selection = await selectSourcesForIngest({
    maxSources: opts.maxSources,
    force:      opts.force,
    now:        opts.now,
  })

  // Populate acc counters from selection stats
  acc.sources.total    = selection.stats.totalActive
  acc.sources.selected = selection.stats.selectedCount
  acc.sources.skipped  = selection.stats.deferredCount

  // Store full selection for response diagnostics
  acc.sourceSelection = selection

  if (selection.selected.length === 0) {
    acc.hints.push('No active RSS sources found in DB or all are cooling down. Add sources via /sources page.')
    return []
  }

  if (selection.stats.deferredCount > 0) {
    acc.hints.push(
      `${selection.stats.deferredCount} source(s) deferred this run ` +
      `(maxSources=${opts.maxSources}, rotation based on staleness & cooldown). ` +
      `Run again to cover remaining sources.`
    )
  }
  if (selection.stats.skippedCoolingDown > 0) {
    acc.hints.push(`${selection.stats.skippedCoolingDown} source(s) in failure cooldown — skipped.`)
  }

  console.log(
    `[rss ingest] selected ${selection.selected.length}/${selection.stats.totalActive} sources ` +
    `(deferred=${selection.stats.deferredCount} coolingDown=${selection.stats.skippedCoolingDown} ` +
    `neverFetched=${selection.stats.selectedNeverFetched} stale=${selection.stats.selectedStale24h})`,
  )

  return selection.selected
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
    rssFullContent:      parsed.rssFullContent || null,
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
    if (feed.id) {
      updateSourceFetchFailure(feed.id, shortMsg, { latencyMs, httpStatus, errorStage: 'fetch' }).catch(() => {})
      insertFetchLog({ sourceId: feed.id, sourceName: feed.name, feedUrl: feed.feedUrl, success: false, latencyMs, httpStatus, errorStage: 'fetch', errorMessage: shortMsg }).catch(() => {})
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

    if (feed.id) {
      updateSourceFetchFailure(feed.id, msg.slice(0, 200), { latencyMs, httpStatus, errorStage: 'parse' }).catch(() => {})
    }
    return []
  }

  latencyMs = Date.now() - start
  console.log(`[rss ingest] ✓ ${feed.name} — ${parsed.length} items (${latencyMs}ms)`)

  acc.sources.successful++
  acc.sources.processed++

  // Fire-and-forget health update
  if (feed.id) {
    updateSourceFetchSuccess(feed.id, latencyMs, httpStatus).catch(() => {})
    insertFetchLog({ sourceId: feed.id, sourceName: feed.name, feedUrl: feed.feedUrl, success: true, latencyMs, httpStatus, itemsFound: parsed.length }).catch(() => {})
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

/**
 * Build rule-based dimension scores for a newly ingested RSS item.
 *
 * For an AI news radar, items from known reputable sources are inherently:
 * - AI-relevant (this is an AI-specific feed)
 * - Novel (published news)
 * - Credible (proportional to source tier)
 *
 * providerTrustScore maps to tier: S≈90, A≈82, B≈70, C≈60, D≈55.
 * These defaults are replaced by AI scoring if/when it runs.
 */
function defaultDimensions(hasSource: boolean, providerTrustScore = 65): ScoreDimensions {
  if (!hasSource) {
    return {
      ai_relevance_score:      45,
      source_score:            35,
      importance_score:        45,
      novelty_score:           50,
      momentum_score:          40,
      credibility_score:       35,
      actionability_score:     40,
      content_potential_score: 45,
      personal_fit_score:      40,
    }
  }
  const t = Math.min(92, Math.max(52, providerTrustScore))
  return {
    ai_relevance_score:      75,                    // AI news radar = always AI-relevant
    source_score:            t,                      // tier-based: 52–92
    importance_score:        65,                    // published AI news = matters
    novelty_score:           70,                    // published items = novel
    momentum_score:          58,                    // news generates momentum
    credibility_score:       Math.round(t * 0.90), // tier-based: 47–83
    actionability_score:     62,                    // creates insight / next steps
    content_potential_score: 65,                    // reputable news = content potential
    personal_fit_score:      65,                    // if in AI radar = fits interest
  }
}

async function writeItems(
  items:       NormalizedIngestItem[],
  acc:         IngestAcc,
  deadline:    number,
  providerDbId: string,
): Promise<void> {
  const writeStart = Date.now()
  const artCfg = getArticleFetchConfig()
  acc.articleFetch.enabled = artCfg.enabled

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
    const dims = defaultDimensions(sourceId !== null, item.providerTrustScore ?? 65)
    const { finalScore } = calculateFinalScore(dims, item.publishedAt ?? new Date().toISOString())
    const row = buildItemPayload(item, sourceId, providerSignal, finalScore, dims)

    try {
      const upserted = await upsertItemByCanonicalUrl(row)
      if (upserted.status === 'inserted') acc.items.insertedItems++
      else                                acc.items.reusedItems++

      // ── Article content (best-effort, only for newly inserted items) ─────────
      if (upserted.status === 'inserted') {
        const fetchUrl = item.canonicalUrl || item.url
        const timeLeft = deadline - Date.now()
        const canFetchArticle =
          artCfg.enabled &&
          fetchUrl.startsWith('http') &&
          acc.articleFetch.attempted < artCfg.maxItemsPerRun &&
          timeLeft > artCfg.timeoutMs + 8_000  // leave 8s buffer beyond fetch timeout

        let articleContentWritten = false

        if (canFetchArticle) {
          acc.articleFetch.attempted++
          const artResult = await fetchArticleContent(fetchUrl, artCfg)
          if (artResult.ok && artResult.textContent && artResult.textContent.length >= 100) {
            articleContentWritten = true
            acc.articleFetch.succeeded++
            acc.articleFetch.totalContentLength += artResult.contentLength
            updateItemArticleContent(upserted.id, {
              finalUrl:      artResult.finalUrl ?? fetchUrl,
              title:         artResult.title ?? null,
              siteName:      artResult.siteName ?? null,
              author:        artResult.byline ?? null,
              publishedAt:   artResult.publishedTime ?? null,
              excerpt:       artResult.excerpt ?? null,
              cleanText:     artResult.textContent,
              wordCount:     artResult.wordCount ?? 0,
              coverImageUrl: artResult.coverImageUrl ?? null,
              mediaUrls:     artResult.mediaUrls ?? [],
              contentHash:   `${artResult.contentLength}_${fetchUrl.length}`,
            }).catch(() => {})
          } else {
            acc.articleFetch.failed++
            markItemContentFetchFailed(
              upserted.id,
              artResult.error ?? 'no_text_extracted',
              fetchUrl,
            ).catch(() => {})
          }
        } else if (artCfg.enabled && fetchUrl.startsWith('http')) {
          acc.articleFetch.skipped++
        }

        // Fallback: write RSS content:encoded if article fetch didn't happen
        if (!articleContentWritten) {
          const rfc = item.rssFullContent
          if (rfc && rfc.length >= 200) {
            updateItemRssContent(upserted.id, rfc).catch(() => {})
          }
        }
      }

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
    const feeds = await stageSelectSources(opts, acc)
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
    articleFetch: {
      enabled:              acc.articleFetch.enabled,
      attempted:            acc.articleFetch.attempted,
      succeeded:            acc.articleFetch.succeeded,
      failed:               acc.articleFetch.failed,
      skipped:              acc.articleFetch.skipped,
      averageContentLength: acc.articleFetch.succeeded > 0
        ? Math.round(acc.articleFetch.totalContentLength / acc.articleFetch.succeeded)
        : 0,
    },
    failedSources: acc.failedSources,
    hints:         acc.hints,
    // Source rotation diagnostics
    sourceSelection: acc.sourceSelection ? {
      selectedCount:   acc.sourceSelection.stats.selectedCount,
      deferredCount:   acc.sourceSelection.stats.deferredCount,
      selectedSources: acc.sourceSelection.selected.map(s => ({
        id:              s.id,
        name:            s.name,
        tier:            s.tier,
        healthStatus:    s.healthStatus,
        failureCount:    s.failureCount,
        lastFetchStatus: s.lastFetchStatus,
        urgencyScore:    s.urgencyScore,
        reason:          s.reason,
      })),
      deferredSample: acc.sourceSelection.deferredSample,
      stats:          acc.sourceSelection.stats,
    } : null,
  }
}
