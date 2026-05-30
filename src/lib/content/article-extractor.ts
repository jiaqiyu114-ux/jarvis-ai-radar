/**
 * Article Content Extractor v1
 *
 * Fetches a single URL and extracts structured article content using
 * lightweight regex-based HTML parsing (no external DOM library needed).
 *
 * Does NOT:
 * - Call any AI / LLM API.
 * - Bypass login, paywalls, or robots.txt.
 * - Download images or media files.
 * - Perform batch or recursive crawling.
 */

import { createHash } from 'crypto'

// ── Constants ─────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS  = 8_000
const MAX_HTML_BYTES    = 2 * 1024 * 1024   // 2 MB
const MAX_CLEAN_TEXT    = 30_000            // chars
const MAX_MEDIA_URLS    = 10
const USER_AGENT        = 'JARVIS/1.0 (personal research bot; not for commercial use)'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ArticleExtractionSuccess = {
  status:       'fetched'
  finalUrl:     string
  title:        string | null
  siteName:     string | null
  author:       string | null
  publishedAt:  string | null   // ISO string or null
  excerpt:      string | null   // meta description / og:description
  cleanText:    string
  wordCount:    number
  coverImageUrl: string | null
  mediaUrls:    string[]
  contentHash:  string
}

export type ArticleExtractionFailure = {
  status:  'failed' | 'skipped'
  error:   string
}

export type ArticleExtractionResult = ArticleExtractionSuccess | ArticleExtractionFailure

// ── SSRF / URL safety ─────────────────────────────────────────────────────────

const PRIVATE_IP = /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|169\.254\.|127\.|0\.0\.0\.0|::1$|fc00:|fe80:)/i

const BLOCKED_HOSTS = new Set([
  'localhost', '127.0.0.1', '0.0.0.0', '::1',
])

function checkUrlSafety(raw: string): string | null {
  if (!raw?.trim()) return 'Empty URL'
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    return 'Invalid URL'
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `Protocol not allowed: ${parsed.protocol}`
  }
  const host = parsed.hostname.toLowerCase()
  if (BLOCKED_HOSTS.has(host) || PRIVATE_IP.test(host)) {
    return `Private/local host not allowed: ${host}`
  }
  return null   // safe
}

// ── HTML meta extraction helpers ──────────────────────────────────────────────

function attrVal(tag: string, attr: string): string | null {
  // Matches both attr="val" and attr='val', case-insensitive
  const re = new RegExp(`${attr}=["']([^"']{1,2000})["']`, 'i')
  return tag.match(re)?.[1]?.trim() || null
}

function extractMeta(html: string, property: string, nameAttr = 'property'): string | null {
  // Handles <meta property="..." content="..."> and <meta name="..." content="...">
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(
    `<meta[^>]+${nameAttr}=["']${escaped}["'][^>]*>`,
    'gi',
  )
  const matches = html.matchAll(re)
  for (const m of matches) {
    const val = attrVal(m[0], 'content')
    if (val) return val
  }
  // Reversed attribute order
  const re2 = new RegExp(
    `<meta[^>]+content=["'][^"']*["'][^>]+${nameAttr}=["']${escaped}["'][^>]*>`,
    'gi',
  )
  const matches2 = html.matchAll(re2)
  for (const m2 of matches2) {
    const val = attrVal(m2[0], 'content')
    if (val) return val
  }
  return null
}

function extractJsonLd(html: string): Record<string, unknown> | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  const matches = html.matchAll(re)
  for (const m of matches) {
    try {
      const data = JSON.parse(m[1]) as Record<string, unknown>
      const t = (data['@type'] as string | undefined) ?? ''
      if (t.includes('Article') || t.includes('NewsArticle') || t.includes('WebPage')) {
        return data
      }
    } catch { /* ignore malformed JSON-LD */ }
  }
  return null
}

function jsonLdStr(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key]
  if (typeof v === 'string') return v.trim() || null
  if (Array.isArray(v) && typeof v[0] === 'string') return (v[0] as string).trim() || null
  if (typeof v === 'object' && v !== null) {
    const sub = v as Record<string, unknown>
    if (typeof sub.name === 'string') return sub.name.trim() || null
    if (typeof sub['@id'] === 'string') return sub['@id'].trim() || null
  }
  return null
}

// ── Clean text extraction ─────────────────────────────────────────────────────

function stripHtmlToText(fragment: string): string {
  return fragment
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, ' ')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, ' ')
    // Block elements → newline
    .replace(/<\/(p|div|h[1-6]|li|blockquote|section|article|br)[^>]*>/gi, '\n')
    // Strip all remaining tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, ' ')
    // Normalize whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractBodyContent(html: string): string {
  // Priority: <article> → <main> → <body>
  const articleM = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
  if (articleM) return stripHtmlToText(articleM[1])

  const mainM = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
  if (mainM) return stripHtmlToText(mainM[1])

  const bodyM = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (bodyM) return stripHtmlToText(bodyM[1])

  return stripHtmlToText(html)
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

// ── Media extraction ──────────────────────────────────────────────────────────

function isHttpUrl(url: string | null | undefined): url is string {
  if (!url) return false
  try {
    const p = new URL(url)
    return p.protocol === 'http:' || p.protocol === 'https:'
  } catch { return false }
}

function extractCoverImage(
  html:    string,
  jsonLd:  Record<string, unknown> | null,
): string | null {
  // 1. JSON-LD image
  if (jsonLd) {
    const img = jsonLdStr(jsonLd, 'image') ?? jsonLdStr(jsonLd, 'thumbnailUrl')
    if (isHttpUrl(img)) return img
  }
  // 2. og:image
  const og = extractMeta(html, 'og:image')
  if (isHttpUrl(og)) return og
  // 3. twitter:image
  const tw = extractMeta(html, 'twitter:image', 'name')
  if (isHttpUrl(tw)) return tw
  return null
}

function extractMediaUrls(html: string, baseUrl: string): string[] {
  const urls = new Set<string>()
  // img src
  const imgRe = /<img[^>]+src=["']([^"']{4,500})["']/gi
  for (const m of html.matchAll(imgRe)) {
    try {
      const abs = new URL(m[1], baseUrl).href
      if (isHttpUrl(abs) && !abs.includes('data:')) urls.add(abs)
    } catch { /* skip */ }
    if (urls.size >= MAX_MEDIA_URLS) break
  }
  return [...urls].slice(0, MAX_MEDIA_URLS)
}

// ── Content hash ──────────────────────────────────────────────────────────────

export function hashContent(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

// ── Main fetch function ───────────────────────────────────────────────────────

export async function fetchArticleContent(
  url:     string,
  options: { timeoutMs?: number } = {},
): Promise<ArticleExtractionResult> {
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS

  // Safety check
  const safetyError = checkUrlSafety(url)
  if (safetyError) {
    return { status: 'skipped', error: safetyError }
  }

  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(url, {
      signal:  controller.signal,
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
    })
  } catch (err) {
    clearTimeout(timer)
    const msg = err instanceof Error ? err.message : String(err)
    return { status: 'failed', error: `Fetch error: ${msg}` }
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    return { status: 'failed', error: `HTTP ${response.status} ${response.statusText}` }
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/html')) {
    return { status: 'skipped', error: `Non-HTML content-type: ${contentType.split(';')[0]}` }
  }

  // Read with size limit
  const reader   = response.body?.getReader()
  if (!reader) return { status: 'failed', error: 'No response body' }

  const chunks: Uint8Array[] = []
  let totalBytes = 0
  let truncated  = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > MAX_HTML_BYTES) { truncated = true; break }
      chunks.push(value)
    }
  } finally {
    reader.cancel().catch(() => {})
  }

  const html     = new TextDecoder('utf-8', { fatal: false }).decode(
    new Uint8Array(chunks.reduce<number[]>((acc, c) => [...acc, ...c], []))
  )
  const finalUrl = response.url || url

  // ── Extract metadata ───────────────────────────────────────────────────────

  const jsonLd = extractJsonLd(html)

  const title = (
    jsonLdStr(jsonLd ?? {}, 'headline') ??
    extractMeta(html, 'og:title') ??
    html.match(/<title[^>]*>([^<]{1,300})<\/title>/i)?.[1]?.trim() ??
    null
  )

  const siteName = (
    jsonLdStr(jsonLd ?? {}, 'publisher') ??
    extractMeta(html, 'og:site_name') ??
    null
  )

  const author = (
    jsonLdStr(jsonLd ?? {}, 'author') ??
    extractMeta(html, 'author', 'name') ??
    null
  )

  const publishedAt = (
    (jsonLd ? jsonLdStr(jsonLd, 'datePublished') : null) ??
    extractMeta(html, 'article:published_time') ??
    null
  )

  const excerpt = (
    extractMeta(html, 'og:description') ??
    extractMeta(html, 'description', 'name') ??
    null
  )

  const coverImageUrl = extractCoverImage(html, jsonLd)

  // ── Clean text ─────────────────────────────────────────────────────────────

  const rawText  = extractBodyContent(html)
  const cleanText = rawText.slice(0, MAX_CLEAN_TEXT) + (rawText.length > MAX_CLEAN_TEXT ? '\n[截断]' : '')
  const wordCount = countWords(rawText)

  const mediaUrls = extractMediaUrls(html, finalUrl)

  if (truncated) {
    console.warn(`[article-extractor] HTML truncated at ${MAX_HTML_BYTES}B for ${url}`)
  }

  return {
    status: 'fetched',
    finalUrl,
    title,
    siteName,
    author,
    publishedAt,
    excerpt,
    cleanText,
    wordCount,
    coverImageUrl,
    mediaUrls,
    contentHash: hashContent(cleanText.slice(0, 5000)),
  }
}
