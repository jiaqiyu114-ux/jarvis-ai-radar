/**
 * Article Content Extraction v1
 *
 * Fetches article HTML and extracts clean text, meta information, and images.
 * Pure implementation — no external HTML parsing library required.
 * Uses fetch() + index-based traversal to avoid regex catastrophic backtracking.
 */

// ── Config ────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS     = 7_000
const DEFAULT_MAX_CHARS      = 16_000
const DEFAULT_MAX_ITEMS      = 20
const PARSE_HTML_LIMIT       = 400_000  // truncate HTML before parsing (performance guard)

export type ArticleFetchConfig = {
  enabled:         boolean
  timeoutMs:       number
  maxCharsPerItem: number
  maxItemsPerRun:  number
}

function parsePositiveInt(v: string | undefined, fallback: number): number {
  const n = Number(v ?? '')
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback
}

export function getArticleFetchConfig(): ArticleFetchConfig {
  return {
    // Default false — enables only when explicitly set (avoids breaking existing deployments)
    enabled:         (process.env.ARTICLE_FETCH_ENABLED ?? 'false').toLowerCase() === 'true',
    timeoutMs:       parsePositiveInt(process.env.ARTICLE_FETCH_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maxCharsPerItem: parsePositiveInt(process.env.ARTICLE_CONTENT_MAX_CHARS, DEFAULT_MAX_CHARS),
    maxItemsPerRun:  parsePositiveInt(process.env.ARTICLE_FETCH_MAX_ITEMS_PER_RUN, DEFAULT_MAX_ITEMS),
  }
}

// ── Result type ───────────────────────────────────────────────────────────────

export type ArticleContentResult = {
  ok:            boolean
  url:           string
  finalUrl?:     string
  title?:        string
  excerpt?:      string
  textContent?:  string
  contentLength: number
  wordCount?:    number
  coverImageUrl?:string
  mediaUrls?:    string[]
  siteName?:     string
  byline?:       string
  publishedTime?:string
  statusCode?:   number
  contentType?:  string
  error?:        string
  fetchedAt:     string
}

// ── HTML parsing helpers ──────────────────────────────────────────────────────

/** Limit HTML to PARSE_HTML_LIMIT chars before any regex to prevent slow operations. */
function guard(html: string): string {
  return html.length > PARSE_HTML_LIMIT ? html.slice(0, PARSE_HTML_LIMIT) : html
}

/**
 * Extract <meta> tag content by property or name attribute.
 * Uses bounded patterns ([^>]{0,300}) to avoid catastrophic backtracking.
 */
function extractMeta(html: string, names: string[]): string | undefined {
  const h = guard(html)
  for (const name of names) {
    // property/name before content
    const r1 = new RegExp(
      `<meta[^>]{0,300}(?:property|name)=["']${name}["'][^>]{0,300}content=["']([^"']{1,800})["']`,
      'i',
    )
    const m1 = r1.exec(h)
    if (m1?.[1]) return decodeEntities(m1[1].trim())

    // content before property/name
    const r2 = new RegExp(
      `<meta[^>]{0,300}content=["']([^"']{1,800})["'][^>]{0,300}(?:property|name)=["']${name}["']`,
      'i',
    )
    const m2 = r2.exec(h)
    if (m2?.[1]) return decodeEntities(m2[1].trim())
  }
  return undefined
}

function extractTitle(html: string): string | undefined {
  const m = /<title[^>]{0,100}>([^<]{1,300})<\/title>/i.exec(guard(html))
  return m?.[1] ? decodeEntities(m[1].trim()) : undefined
}

/**
 * Find the innermost <article> or <main> block using indexOf for safety.
 * Falls back to the full (stripped) HTML.
 */
function findMainContentBlock(html: string): string {
  const lower = html.toLowerCase()
  for (const tag of ['article', 'main']) {
    const openIdx = lower.indexOf(`<${tag}`)
    if (openIdx < 0) continue
    // Find corresponding closing tag (first occurrence after open)
    const closeIdx = lower.indexOf(`</${tag}>`, openIdx + tag.length + 1)
    if (closeIdx < 0) continue
    const block = html.slice(openIdx, closeIdx + tag.length + 3)
    if (block.length > 200) return block
  }
  // role=main on a div/section
  const roleIdx = lower.search(/<(?:div|section)[^>]{0,200}role=["']main["']/)
  if (roleIdx >= 0) {
    // Find the next </div> or </section> — not perfect, but good enough for fallback
    const closeDiv = lower.indexOf('</div>', roleIdx + 10)
    if (closeDiv > roleIdx + 200) return html.slice(roleIdx, closeDiv + 6)
  }
  return html
}

/**
 * Strip non-content HTML blocks (scripts, styles, nav, etc.) using simple
 * index-based removal to avoid backtracking issues with large documents.
 */
function stripBlocks(html: string, tag: string): string {
  const openTag  = `<${tag}`
  const closeTag = `</${tag}>`
  const lo = html.toLowerCase()
  const parts: string[] = []
  let cursor = 0
  let searchFrom = 0
  while (true) {
    const startIdx = lo.indexOf(openTag, searchFrom)
    if (startIdx < 0) break
    // Look for the NEXT closing tag after the start
    const endIdx = lo.indexOf(closeTag, startIdx + openTag.length)
    if (endIdx < 0) break
    parts.push(html.slice(cursor, startIdx))
    parts.push(' ')
    cursor = endIdx + closeTag.length
    searchFrom = cursor
  }
  parts.push(html.slice(cursor))
  return parts.join('')
}

function stripAllBlocks(html: string): string {
  let h = html
  for (const tag of ['script', 'style', 'noscript', 'nav', 'header', 'footer', 'aside', 'iframe', 'svg']) {
    h = stripBlocks(h, tag)
  }
  // Also strip HTML comments
  h = h.replace(/<!--[\s\S]{0,10000}?-->/g, ' ')
  return h
}

function stripTags(html: string): string {
  return html.replace(/<[^>]{0,500}>/g, ' ')
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x[0-9a-f]{1,6};/gi, ' ')
    .replace(/&#[0-9]{1,6};/g, ' ')
    .replace(/&[a-z]{2,10};/gi, ' ')
}

function normalizeWhitespace(text: string): string {
  return text.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

function estimateWordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

function isValidImageUrl(url: string): boolean {
  if (!url || !url.startsWith('http') || url.length > 600) return false
  const low = url.toLowerCase()
  // Skip tracking pixels, data URIs, small icons
  if (low.includes('pixel') || low.includes('1x1') || low.includes('blank.') ||
      low.includes('spacer') || low.includes('icon') || low.includes('logo') ||
      low.startsWith('data:')) return false
  // Accept common image formats or CDN-style URLs without extension
  return /\.(jpe?g|png|gif|webp|avif)(\?.*)?$/i.test(low) ||
    /\b(cdn|media|img|image|photo|asset|pic|picture|thumb)\b/i.test(low)
}

function resolveUrl(href: string, base: string): string | null {
  if (!href) return null
  href = href.trim()
  if (href.startsWith('data:') || href.startsWith('//')) {
    return href.startsWith('//') ? `https:${href}` : null
  }
  if (href.startsWith('http')) return href
  try {
    const baseUrl = new URL(base)
    if (href.startsWith('/')) return `${baseUrl.protocol}//${baseUrl.host}${href}`
  } catch { /* ignore */ }
  return null
}

function extractMediaUrls(html: string, baseUrl: string): string[] {
  const seen = new Set<string>()
  const results: string[] = []
  // Extract img src values using bounded [^"']{1,600}
  const imgRx = /<img\b[^>]{0,400}\bsrc=["']([^"']{1,600})["']/gi
  let m: RegExpExecArray | null
  const h = guard(html)
  while ((m = imgRx.exec(h)) !== null && results.length < 12) {
    const resolved = resolveUrl(m[1], baseUrl)
    if (resolved && !seen.has(resolved) && isValidImageUrl(resolved)) {
      seen.add(resolved)
      results.push(resolved)
    }
  }
  return results
}

function extractArticleText(html: string, maxChars: number): string {
  const stripped = stripAllBlocks(guard(html))
  const mainBlock = findMainContentBlock(stripped)
  const plain = stripTags(mainBlock)
  const decoded = decodeEntities(plain)
  return normalizeWhitespace(decoded).slice(0, maxChars)
}

function parseHtmlContent(
  html:    string,
  baseUrl: string,
  maxChars: number,
): Omit<ArticleContentResult, 'ok' | 'url' | 'finalUrl' | 'statusCode' | 'contentType' | 'error' | 'fetchedAt'> {
  const title        = extractMeta(html, ['og:title', 'twitter:title']) || extractTitle(html)
  const excerpt      = extractMeta(html, ['og:description', 'description', 'twitter:description'])
  const coverUrl     = extractMeta(html, ['og:image', 'twitter:image'])
  const siteName     = extractMeta(html, ['og:site_name'])
  const publishedTime= extractMeta(html, ['article:published_time', 'datePublished', 'og:article:published_time'])
  const byline       = extractMeta(html, ['author', 'article:author'])

  const textContent  = extractArticleText(html, maxChars)
  const contentLength = textContent.length
  const wordCount    = estimateWordCount(textContent)

  const resolvedCover = coverUrl ? resolveUrl(coverUrl, baseUrl) ?? undefined : undefined
  const safeCover    = resolvedCover && isValidImageUrl(resolvedCover) ? resolvedCover : undefined

  const mediaUrls    = extractMediaUrls(html, baseUrl).slice(0, 8)
  const coverImageUrl = safeCover || (mediaUrls.length > 0 ? mediaUrls[0] : undefined)

  return {
    title:         title      || undefined,
    excerpt:       excerpt    ? excerpt.slice(0, 400) : undefined,
    textContent:   textContent || undefined,
    contentLength,
    wordCount:     wordCount  || undefined,
    coverImageUrl,
    mediaUrls:     mediaUrls.length > 0 ? mediaUrls : undefined,
    siteName:      siteName   || undefined,
    byline:        byline     || undefined,
    publishedTime: publishedTime || undefined,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchArticleContent(
  url:    string,
  config: Partial<ArticleFetchConfig> = {},
): Promise<ArticleContentResult> {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxChars  = config.maxCharsPerItem ?? DEFAULT_MAX_CHARS
  const fetchedAt = new Date().toISOString()

  if (!url || !url.startsWith('http')) {
    return { ok: false, url, contentLength: 0, fetchedAt, error: 'invalid_url' }
  }

  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      signal:  controller.signal,
      redirect:'follow',
      headers: {
        'User-Agent':      'JARVIS-Bot/1.0 (AI information radar; contact via GitHub)',
        'Accept':          'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    })

    const contentType = res.headers.get('content-type') ?? ''
    const statusCode  = res.status
    const finalUrl    = res.url || url

    if (!res.ok) {
      return { ok: false, url, finalUrl, statusCode, contentType, contentLength: 0, fetchedAt, error: `http_${statusCode}` }
    }

    const isHtml = contentType.includes('text/html') ||
      contentType.includes('application/xhtml') ||
      contentType.includes('text/xml')
    if (!isHtml) {
      return { ok: false, url, finalUrl, statusCode, contentType, contentLength: 0, fetchedAt, error: 'non_html_content' }
    }

    const html    = await res.text()
    const parsed  = parseHtmlContent(html, finalUrl, maxChars)

    console.info(
      `[article-content] ok url=${url.slice(0, 80)} ` +
      `textLen=${parsed.contentLength} cover=${!!parsed.coverImageUrl}`,
    )

    return { ok: true, url, finalUrl, statusCode, contentType, fetchedAt, ...parsed }

  } catch (err) {
    const msg     = err instanceof Error ? err.message : String(err)
    const isAbort = msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('cancel')
    const errCode = isAbort ? 'timeout' : `fetch_error:${msg.slice(0, 100)}`
    console.warn(`[article-content] fail url=${url.slice(0, 80)} err=${errCode}`)
    return { ok: false, url, contentLength: 0, fetchedAt, error: errCode }
  } finally {
    clearTimeout(timer)
  }
}
