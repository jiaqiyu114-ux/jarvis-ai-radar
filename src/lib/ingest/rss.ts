/**
 * RSS / Atom ingestion pipeline.
 *
 * Flow: listActiveSources → fetchRssFeed → parseRssFeed → normalizeRssItem
 *       → insertItemIfNew → IngestResult
 *
 * No AI calls. Scoring uses calculateFinalScore() with rule-based defaults.
 * No side effects at module load — safe for Next.js static build.
 */

import { XMLParser } from 'fast-xml-parser'
import { listActiveSources } from '@/lib/db/sources'
import { insertItemIfNew } from '@/lib/db/items'
import { calculateFinalScore } from '@/lib/scoring/final-score'
import type { DbSource, DbItemLanguage } from '@/types/database'
import type { ParsedRssItem, IngestResult } from './types'

// ── XML parser (shared instance, stateless) ───────────────────────────────────

const xmlParser = new XMLParser({
  ignoreAttributes:     false,
  attributeNamePrefix:  '@_',
  allowBooleanAttributes: true,
  parseTagValue:        false,
  trimValues:           true,
  processEntities:      true,
  // Ensure single items/entries always come back as arrays for safe iteration
  isArray: (name: string) => ['item', 'entry', 'link'].includes(name),
})

// ── XML value helpers ─────────────────────────────────────────────────────────

/** Extract a plain string from any XML node shape (string / CDATA / #text / number). */
function xmlText(node: unknown): string {
  if (typeof node === 'string') return node.trim()
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node))     return xmlText(node[0])
  if (typeof node === 'object' && node !== null) {
    const o = node as Record<string, unknown>
    if ('#text'    in o) return xmlText(o['#text'])
    if ('__cdata'  in o) return String(o['__cdata']).trim()
  }
  return ''
}

/**
 * Extract href from a link node.
 * Handles: plain string, { @_href }, [ { @_href, @_rel } ], { #text }.
 * Prefers rel=alternate (or anything that is not rel=self).
 */
function xmlLink(node: unknown): string {
  if (typeof node === 'string') return node.trim()
  if (Array.isArray(node)) {
    const links = node as Array<unknown>
    // Prefer the first non-self link
    const best = links.find(l => {
      if (typeof l !== 'object' || l === null) return false
      const rel = (l as Record<string, unknown>)['@_rel']
      return !rel || rel === 'alternate'
    }) ?? links[0]
    return xmlLink(best)
  }
  if (typeof node === 'object' && node !== null) {
    const o = node as Record<string, unknown>
    if ('@_href' in o) return String(o['@_href']).trim()
    if ('#text'   in o) return xmlText(o['#text'])
  }
  return ''
}

// ── Text utilities ────────────────────────────────────────────────────────────

/** Strip HTML tags and decode common HTML entities. */
function stripHtml(html: string): string {
  return html
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, m => m.slice(9, -3))
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Strip HTML for full-content fields (content:encoded).
 * Removes script/style blocks first to avoid their text leaking in.
 */
function stripRssHtml(html: string): string {
  return stripHtml(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
  )
}

const RSS_FULL_CONTENT_MAX = 12_000

/**
 * Extract full article text from RSS/Atom content fields.
 * Prefers content:encoded (full-text RSS standard), then Atom content.
 * Only returns content meaningfully longer than the short summary.
 */
function extractFullContent(o: Record<string, unknown>, shortSummary: string): string | null {
  const candidates = [
    xmlText(o['content:encoded']),
    xmlText(o.encoded),
    xmlText(o.content),
  ]
  for (const raw of candidates) {
    if (!raw) continue
    const stripped = stripRssHtml(raw)
    // Only use if substantially longer than the clamped summary
    if (stripped.length >= 200 && stripped.length > shortSummary.length + 80) {
      return stripped.slice(0, RSS_FULL_CONTENT_MAX)
    }
  }
  return null
}

/** Truncate to max chars, appending ellipsis only when truncated. */
function clamp(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

/** Parse a date string safely; fall back to now() on failure. */
function safeIso(raw: string): string {
  try {
    const d = new Date(raw)
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
  } catch {
    return new Date().toISOString()
  }
}

/** Heuristic: Chinese char ratio determines language tag. */
function detectLanguage(title: string, summary: string): DbItemLanguage {
  const text = title + ' ' + summary
  const zh = (text.match(/[一-鿿]/g) ?? []).length
  const total = text.replace(/\s/g, '').length || 1
  const ratio = zh / total
  if (ratio > 0.3) return 'zh'
  if (ratio > 0.1) return 'mixed'
  return 'en'
}

// ── RSS / Atom item parsers ───────────────────────────────────────────────────

function parseRssItem(raw: unknown): ParsedRssItem {
  const o = raw as Record<string, unknown>
  const title          = xmlText(o.title)
  const rawGuid        = xmlText(o.guid)
  const url            = xmlText(o.link) || rawGuid || ''
  const guid           = rawGuid || null
  const author         = xmlText(o['dc:creator'] ?? o.author) || null
  const summary        = clamp(stripHtml(xmlText(o.description ?? o.summary ?? o.content)), 300)
  const publishedAt    = safeIso(xmlText(o.pubDate ?? o['dc:date']))
  const rssFullContent = extractFullContent(o, summary)
  return { title, url, guid, author, summary, rssFullContent, publishedAt }
}

function parseAtomEntry(raw: unknown): ParsedRssItem {
  const o = raw as Record<string, unknown>
  const title          = xmlText(o.title)
  const rawId          = xmlText(o.id)
  const url            = xmlLink(o.link) || rawId
  const guid           = rawId || null
  const authorNode     = o.author
  const author         = authorNode
    ? xmlText((authorNode as Record<string, unknown>).name ?? authorNode)
    : null
  const summary        = clamp(stripHtml(xmlText(o.summary ?? o.content)), 300)
  const publishedAt    = safeIso(xmlText(o.updated ?? o.published))
  const rssFullContent = extractFullContent(o, summary)
  return { title, url, guid, author: author || null, summary, rssFullContent, publishedAt }
}

// ── Public: parse RSS/Atom XML string → items array ──────────────────────────

export function parseRssFeed(xml: string): ParsedRssItem[] {
  const trimmed = xml.trim()
  if (!trimmed.startsWith('<?') && !trimmed.startsWith('<')) {
    throw new Error('Response is not XML (possibly an HTML error page)')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed = xmlParser.parse(xml) as Record<string, any>

  // RSS 2.0
  const rss = parsed.rss as Record<string, unknown> | undefined
  if (rss) {
    const channel = rss.channel as Record<string, unknown> | undefined
    if (channel) {
      const items = Array.isArray(channel.item) ? channel.item
        : channel.item ? [channel.item] : []
      return (items as unknown[])
        .map(parseRssItem)
        .filter(i => i.url && i.title)
    }
  }

  // Atom
  const feed = parsed.feed as Record<string, unknown> | undefined
  if (feed) {
    const entries = Array.isArray(feed.entry) ? feed.entry
      : feed.entry ? [feed.entry] : []
    return (entries as unknown[])
      .map(parseAtomEntry)
      .filter(i => i.url && i.title)
  }

  return []
}

// ── Public: fetch raw XML from a URL ─────────────────────────────────────────

export async function fetchRssFeed(
  url:        string,
  timeoutMs = 15_000,
): Promise<{ text: string; status: number }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'JARVIS-Bot/1.0 (personal RSS reader; +https://github.com/jarvis)' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)
    const text = await res.text()
    return { text, status: res.status }
  } finally {
    clearTimeout(timer)
  }
}

// ── Normalise one parsed item into a DB insert row ───────────────────────────

/** Map source tier to a default source_score (used before AI scoring). */
const TIER_SCORE: Record<string, number> = { S: 90, A: 80, B: 65, C: 50, D: 35 }

export function normalizeRssItem(
  item: ParsedRssItem,
  source: DbSource,
): Parameters<typeof insertItemIfNew>[0] {
  const sourceScore    = TIER_SCORE[source.source_tier] ?? 60
  const credibility    = Math.min(100, source.reliability_score ?? 60)

  const dimensions = {
    ai_relevance_score:      50,
    source_score:            sourceScore,
    importance_score:        50,
    novelty_score:           50,
    momentum_score:          50,
    credibility_score:       credibility,
    actionability_score:     50,
    content_potential_score: 50,
    personal_fit_score:      50,
  }
  const { finalScore } = calculateFinalScore(dimensions, item.publishedAt)

  return {
    source_id:               source.id,
    title:                   item.title,
    url:                     item.url,
    author:                  item.author ?? undefined,
    summary:                 item.summary,
    language:                detectLanguage(item.title, item.summary),
    published_at:            item.publishedAt,
    category:                source.category,
    tags:                    [],
    status:                  'new',
    ai_relevance_score:      dimensions.ai_relevance_score,
    source_score:            dimensions.source_score,
    importance_score:        dimensions.importance_score,
    novelty_score:           dimensions.novelty_score,
    momentum_score:          dimensions.momentum_score,
    credibility_score:       dimensions.credibility_score,
    actionability_score:     dimensions.actionability_score,
    content_potential_score: dimensions.content_potential_score,
    personal_fit_score:      dimensions.personal_fit_score,
    duplicate_penalty:       0,
    clickbait_penalty:       0,
    marketing_penalty:       0,
    cognitive_load_penalty:  0,
    final_score:             finalScore,
  }
}

// ── Public: run full ingest for all active sources ────────────────────────────

export async function ingestRssSources(): Promise<IngestResult> {
  const sources = await listActiveSources()

  const result: IngestResult = {
    sourcesChecked: sources.length,
    itemsParsed:    0,
    itemsInserted:  0,
    itemsSkipped:   0,
    errors:         [],
  }

  for (const source of sources) {
    try {
      const { text: xml } = await fetchRssFeed(source.url)
      const items = parseRssFeed(xml)
      result.itemsParsed += items.length

      for (const item of items) {
        if (!item.url || !item.title) { result.itemsSkipped++; continue }
        const row     = normalizeRssItem(item, source)
        const outcome = await insertItemIfNew(row)
        if (outcome === 'inserted') result.itemsInserted++
        else                        result.itemsSkipped++
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push({ source: source.name, message })
    }
  }

  return result
}
