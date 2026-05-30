import { createHash } from 'crypto'
import type { DbEventClusterRole, DbEventClusterStatus, DbSourceTier } from '@/types/database'

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'to', 'for', 'with', 'new', 'launches', 'launch', 'releases', 'release',
  'says', 'report', 'reports', 'update', 'latest', 'announces', 'announced', 'about', 'from',
  'into', 'over', 'under', 'after', 'before', 'amid', 'near', 'will', 'would', 'could', 'should',
  'and', 'or', 'of', 'in', 'on', 'at', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'it', 'its', 'that', 'this', 'these', 'those', 'as', 'via', 'ai', 'llm', 'news', 'today',
])

const TRACKING_QUERY_KEYS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'igshid', 'ref', 'ref_src', 'source',
])

const ENTITY_PATTERNS: Array<{ token: string; pattern: RegExp }> = [
  // AI labs / major tech companies
  { token: 'openai',     pattern: /\bopenai\b/i },
  { token: 'anthropic',  pattern: /\banthropic\b/i },
  { token: 'claude',     pattern: /\bclaude\b/i },
  { token: 'opus',       pattern: /\bopus\b/i },
  { token: 'gemini',     pattern: /\bgemini\b/i },
  { token: 'google',     pattern: /\bgoogle\b/i },
  { token: 'meta',       pattern: /\bmeta\b/i },
  { token: 'apple',      pattern: /\bapple\b/i },
  { token: 'microsoft',  pattern: /\bmicrosoft\b/i },
  { token: 'perplexity', pattern: /\bperplexity\b/i },
  { token: 'aws',        pattern: /\baws\b|amazon web services/i },
  { token: 'cloudflare', pattern: /\bcloudflare\b/i },
  { token: 'nvidia',     pattern: /\bnvidia\b/i },
  { token: 'amd',        pattern: /\bamd\b/i },
  { token: 'intel',      pattern: /\bintel\b/i },
  { token: 'tesla',      pattern: /\btesla\b/i },
  { token: 'xai',        pattern: /\bxai\b|\bx\.ai\b/i },
  { token: 'grok',       pattern: /\bgrok\b/i },
  { token: 'mistral',    pattern: /\bmistral\b/i },
  { token: 'deepseek',   pattern: /\bdeepseek\b/i },
  { token: 'huggingface',pattern: /hugging\s*face/i },
  { token: 'salesforce', pattern: /\bsalesforce\b/i },
  { token: 'oracle',     pattern: /\boracle\b/i },
  // AI-focused startups / products
  { token: 'replit',     pattern: /\breplit\b/i },
  { token: 'cursor',     pattern: /\bcursor\b/i },
  { token: 'windsurf',   pattern: /\bwindsurf\b/i },
  { token: 'stackai',    pattern: /\bstackai\b|stack\s+ai/i },
  { token: 'sesame',     pattern: /\bsesame\b/i },
  { token: 'asana',      pattern: /\basana\b/i },
  { token: 'visa',       pattern: /\bvisa\b/i },
  { token: 'github',     pattern: /\bgithub\b/i },
  { token: 'openrouter', pattern: /\bopenrouter\b/i },
  { token: 'aihot',      pattern: /\baihot\b/i },
  // Generic model/agent patterns
  { token: 'agent',      pattern: /\bai\s+agent(s)?\b/i },
  { token: 'model',      pattern: /\b(gpt[\w-]*|claude[\w-]*|gemini[\w-]*|llama[\w-]*|qwen[\w-]*|deepseek[\w-]*)\b/i },
]

const TIER_WEIGHT: Record<string, number> = {
  S: 4,
  A: 3,
  B: 2,
  C: 1,
  D: 0,
}

export type EventClusterInputItem = {
  id: string
  title: string
  summary: string | null
  url: string | null
  canonicalUrl: string | null
  sourceId: string | null
  sourceName: string | null
  sourceTier: DbSourceTier | string | null
  sourceIsOfficial: boolean
  finalScore: number | null
  recommendationScore: number | null
  evidenceScore: number | null
  truthScore: number | null
  sourceTraceScore: number | null
  publishedAt: string | null
  fetchedAt: string | null
}

export type EventClusterDraftItem = {
  itemId: string
  role: DbEventClusterRole
  similarityReason: string | null
  score: number | null
}

export type EventClusterDraft = {
  clusterKey: string
  title: string
  summary: string | null
  status: DbEventClusterStatus
  primaryItemId: string | null
  firstSeenAt: string | null
  lastSeenAt: string | null
  itemCount: number
  sourceCount: number
  confidence: number
  matchReason: string | null
  metadata: Record<string, unknown>
  items: EventClusterDraftItem[]
}

type PreparedItem = EventClusterInputItem & {
  normalizedUrl: string | null
  normalizedTitle: string
  titleTokens: string[]
  entityTokens: string[]
  timeMs: number
  summaryLength: number
}

type WorkingCluster = {
  items: PreparedItem[]
  matchItems: EventClusterDraftItem[]
  sourceIds: Set<string>
  normalizedUrls: Set<string>
  titleTokens: Set<string>
  entityTokens: Set<string>
  firstSeenMs: number
  lastSeenMs: number
  urlMatchCount: number
  maxTitleSimilarity: number
  maxSharedEntityCount: number
  primaryItemId: string
}

function decodeHtmlEntities(input: string): string {
  return input
    // Named entities
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&rsquo;/gi, '’')
    .replace(/&lsquo;/gi, '‘')
    .replace(/&rdquo;/gi, '”')
    .replace(/&ldquo;/gi, '“')
    // Decimal numeric entities &#NNN;
    .replace(/&#(\d{1,6});/g, (_, code) => {
      const n = parseInt(code, 10)
      try { return String.fromCodePoint(n) } catch { return '' }
    })
    // Hex numeric entities &#xHHHH;
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (_, hex) => {
      const n = parseInt(hex, 16)
      try { return String.fromCodePoint(n) } catch { return '' }
    })
}

function normalizeSpaces(input: string): string {
  return input.replace(/\s+/g, ' ').trim()
}

function toTierScore(tier: DbSourceTier | string | null | undefined): number {
  const key = String(tier ?? '').trim().toUpperCase()
  return TIER_WEIGHT[key] ?? 0
}

function toTimeMs(value: string | null | undefined): number {
  if (!value) return 0
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : 0
}

function itemTimeMs(item: EventClusterInputItem): number {
  return Math.max(toTimeMs(item.publishedAt), toTimeMs(item.fetchedAt))
}

function hashText(value: string): string {
  return createHash('sha1').update(value).digest('hex')
}

export function normalizeUrl(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed)
    parsed.hash = ''
    for (const key of [...parsed.searchParams.keys()]) {
      const keyLower = key.toLowerCase()
      if (TRACKING_QUERY_KEYS.has(keyLower) || keyLower.startsWith('utm_')) {
        parsed.searchParams.delete(key)
      }
    }
    const sorted = [...parsed.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b))
    parsed.search = ''
    for (const [k, v] of sorted) parsed.searchParams.append(k, v)

    const protocol = parsed.protocol.toLowerCase()
    const host = parsed.host.toLowerCase()
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/'
    const search = parsed.searchParams.toString()
    return `${protocol}//${host}${pathname}${search ? `?${search}` : ''}`
  } catch {
    return trimmed.toLowerCase()
  }
}

export function normalizeTitle(value: string | null | undefined): string {
  const raw = decodeHtmlEntities(String(value ?? ''))
  const lowered = raw.toLowerCase()
  const stripped = lowered.replace(/[^\p{L}\p{N}\s]/gu, ' ')
  return normalizeSpaces(stripped)
}

function tokenizeTitle(normalized: string): string[] {
  const tokens = normalized.match(/[a-z0-9]+|[\u4e00-\u9fff]{2,}/gu) ?? []
  return tokens.filter(token => token.length > 1 && !STOP_WORDS.has(token))
}

export function extractEntityTokens(text: string): string[] {
  const normalized = decodeHtmlEntities(text).toLowerCase()
  const tokens = new Set<string>()
  for (const rule of ENTITY_PATTERNS) {
    if (rule.pattern.test(normalized)) tokens.add(rule.token)
  }
  return [...tokens]
}

export function calculateTitleSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const aSet = new Set(a)
  const bSet = new Set(b)
  let intersection = 0
  for (const token of aSet) {
    if (bSet.has(token)) intersection += 1
  }
  if (intersection === 0) return 0
  const union = aSet.size + bSet.size - intersection
  if (union <= 0) return 0
  return intersection / union
}

function sharedTokenCount(a: string[], b: Set<string>): number {
  let count = 0
  for (const token of a) {
    if (b.has(token)) count += 1
  }
  return count
}

export function choosePrimaryItem(items: EventClusterInputItem[]): EventClusterInputItem {
  if (items.length === 1) return items[0]

  const sorted = [...items].sort((a, b) => {
    const officialDelta = Number(b.sourceIsOfficial) - Number(a.sourceIsOfficial)
    if (officialDelta !== 0) return officialDelta

    const tierDelta = toTierScore(b.sourceTier) - toTierScore(a.sourceTier)
    if (tierDelta !== 0) return tierDelta

    const recA = a.recommendationScore ?? a.finalScore ?? 0
    const recB = b.recommendationScore ?? b.finalScore ?? 0
    if (recB !== recA) return recB - recA

    const evA = a.evidenceScore ?? 0
    const evB = b.evidenceScore ?? 0
    if (evB !== evA) return evB - evA

    const summaryLenA = (a.summary ?? '').trim().length
    const summaryLenB = (b.summary ?? '').trim().length
    if (summaryLenB !== summaryLenA) return summaryLenB - summaryLenA

    const publishA = toTimeMs(a.publishedAt) || toTimeMs(a.fetchedAt)
    const publishB = toTimeMs(b.publishedAt) || toTimeMs(b.fetchedAt)
    if (publishA !== publishB) return publishA - publishB

    return a.id.localeCompare(b.id)
  })

  return sorted[0]
}

function statusFromCluster(itemCount: number, sourceCount: number, lastSeenMs: number, nowMs: number): DbEventClusterStatus {
  const hoursSinceLast = lastSeenMs > 0 ? (nowMs - lastSeenMs) / 3600000 : 0
  if (hoursSinceLast > 72) return 'cooling'
  if ((itemCount >= 3 || sourceCount >= 2) && hoursSinceLast <= 48) return 'active'
  return 'watching'
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max)
}

function confidenceFromCluster(cluster: WorkingCluster): number {
  const spanHours = cluster.lastSeenMs > cluster.firstSeenMs
    ? (cluster.lastSeenMs - cluster.firstSeenMs) / 3600000
    : 0

  let score = 0
  if (cluster.urlMatchCount > 0) score += 40

  if (cluster.maxTitleSimilarity >= 0.65) score += 25
  else if (cluster.maxTitleSimilarity >= 0.45) score += 18

  if (cluster.maxSharedEntityCount >= 2) score += 20
  else if (cluster.maxSharedEntityCount >= 1) score += 10

  if (cluster.sourceIds.size >= 2) score += 10
  if (spanHours <= 24) score += 5

  if (cluster.items.length === 1) score = Math.min(score, 20)
  else if (cluster.sourceIds.size === 1) score = Math.min(score, 55)

  return clampInt(score, 0, 100)
}

function buildClusterKey(cluster: WorkingCluster): string {
  const urlCandidates = [...cluster.normalizedUrls]
  if (urlCandidates.length > 0) {
    const key = urlCandidates.sort()[0]
    return `url:${hashText(key)}`
  }

  const rankedTokens = [...cluster.titleTokens]
    .filter(token => token.length > 1)
    .sort()
    .slice(0, 16)

  const entityTokens = [...cluster.entityTokens].sort()
  const signature = [...entityTokens, ...rankedTokens].join('|')
  return `title:${hashText(signature || cluster.primaryItemId)}`
}

function createWorkingCluster(item: PreparedItem): WorkingCluster {
  const sourceKey = item.sourceId ?? `source:${item.sourceName ?? 'unknown'}`
  const urls = new Set<string>()
  if (item.normalizedUrl) urls.add(item.normalizedUrl)
  const titleTokens = new Set(item.titleTokens)
  const entityTokens = new Set(item.entityTokens)

  return {
    items: [item],
    matchItems: [{
      itemId: item.id,
      role: 'primary',
      similarityReason: '初始主条',
      score: null,
    }],
    sourceIds: new Set([sourceKey]),
    normalizedUrls: urls,
    titleTokens,
    entityTokens,
    firstSeenMs: item.timeMs,
    lastSeenMs: item.timeMs,
    urlMatchCount: 0,
    maxTitleSimilarity: 0,
    maxSharedEntityCount: 0,
    primaryItemId: item.id,
  }
}

function tryMatchCluster(item: PreparedItem, cluster: WorkingCluster, maxClusterSpanHours: number): {
  matched: boolean
  byUrl: boolean
  similarity: number
  sharedEntityCount: number
} {
  if (item.normalizedUrl && cluster.normalizedUrls.has(item.normalizedUrl)) {
    return { matched: true, byUrl: true, similarity: 1, sharedEntityCount: 3 }
  }

  const maxSpanMs = maxClusterSpanHours * 3600000
  if (cluster.lastSeenMs > 0 && Math.abs(item.timeMs - cluster.lastSeenMs) > maxSpanMs) {
    return { matched: false, byUrl: false, similarity: 0, sharedEntityCount: 0 }
  }

  const similarity = calculateTitleSimilarity(item.titleTokens, [...cluster.titleTokens])
  const sharedEntityCount = sharedTokenCount(item.entityTokens, cluster.entityTokens)
  const threshold = sharedEntityCount >= 2 ? 0.35 : 0.45
  const matched = similarity >= threshold && (sharedEntityCount > 0 || similarity >= 0.55)

  return {
    matched,
    byUrl: false,
    similarity,
    sharedEntityCount,
  }
}

function similarityReason(byUrl: boolean, similarity: number, sharedEntityCount: number): string {
  if (byUrl) return 'URL 规范化后一致'
  const similarityPct = clampInt(similarity * 100, 0, 100)
  if (sharedEntityCount > 0) {
    return `标题相似 ${similarityPct}% + 共享实体 ${sharedEntityCount}`
  }
  return `标题相似 ${similarityPct}%`
}

function mergeIntoCluster(
  cluster: WorkingCluster,
  item: PreparedItem,
  byUrl: boolean,
  similarity: number,
  sharedEntityCount: number,
): void {
  const previousLastSeen = cluster.lastSeenMs
  cluster.items.push(item)

  const sourceKey = item.sourceId ?? `source:${item.sourceName ?? 'unknown'}`
  cluster.sourceIds.add(sourceKey)

  if (item.normalizedUrl) cluster.normalizedUrls.add(item.normalizedUrl)
  for (const token of item.titleTokens) cluster.titleTokens.add(token)
  for (const token of item.entityTokens) cluster.entityTokens.add(token)

  cluster.firstSeenMs = Math.min(cluster.firstSeenMs, item.timeMs)
  cluster.lastSeenMs = Math.max(cluster.lastSeenMs, item.timeMs)

  if (byUrl) cluster.urlMatchCount += 1
  cluster.maxTitleSimilarity = Math.max(cluster.maxTitleSimilarity, similarity)
  cluster.maxSharedEntityCount = Math.max(cluster.maxSharedEntityCount, sharedEntityCount)

  const role: DbEventClusterRole = byUrl
    ? 'duplicate'
    : (similarity >= 0.62 && item.timeMs >= previousLastSeen ? 'update' : 'supporting')

  cluster.matchItems.push({
    itemId: item.id,
    role,
    similarityReason: similarityReason(byUrl, similarity, sharedEntityCount),
    score: clampInt(similarity * 100, 0, 100),
  })
}

export type BuildEventClustersOptions = {
  now?: Date
  maxClusterSpanHours?: number
}

export function buildEventClusters(
  inputItems: EventClusterInputItem[],
  options: BuildEventClustersOptions = {},
): EventClusterDraft[] {
  const now = options.now ?? new Date()
  const nowMs = now.getTime()
  const maxClusterSpanHours = Math.max(options.maxClusterSpanHours ?? 168, 24)

  const preparedItems: PreparedItem[] = inputItems
    .filter(item => item.title.trim().length > 0)
    .map(item => {
      const normalizedTitle = normalizeTitle(item.title)
      return {
        ...item,
        normalizedUrl: normalizeUrl(item.canonicalUrl ?? item.url),
        normalizedTitle,
        titleTokens: tokenizeTitle(normalizedTitle),
        entityTokens: extractEntityTokens(`${item.title} ${item.summary ?? ''}`),
        timeMs: itemTimeMs(item),
        summaryLength: (item.summary ?? '').trim().length,
      }
    })
    .filter(item => item.titleTokens.length > 0 || item.entityTokens.length > 0)
    .sort((a, b) => {
      if (a.timeMs !== b.timeMs) return a.timeMs - b.timeMs
      return a.id.localeCompare(b.id)
    })

  const clusters: WorkingCluster[] = []

  for (const item of preparedItems) {
    let bestMatchIndex = -1
    let bestScore = -1
    let bestByUrl = false
    let bestSimilarity = 0
    let bestSharedEntity = 0

    for (let i = 0; i < clusters.length; i += 1) {
      const cluster = clusters[i]
      const match = tryMatchCluster(item, cluster, maxClusterSpanHours)
      if (!match.matched) continue

      const score = match.byUrl
        ? 100
        : (match.similarity * 100 + match.sharedEntityCount * 10)

      if (score > bestScore) {
        bestScore = score
        bestMatchIndex = i
        bestByUrl = match.byUrl
        bestSimilarity = match.similarity
        bestSharedEntity = match.sharedEntityCount
      }
    }

    if (bestMatchIndex === -1) {
      clusters.push(createWorkingCluster(item))
      continue
    }

    mergeIntoCluster(
      clusters[bestMatchIndex],
      item,
      bestByUrl,
      bestSimilarity,
      bestSharedEntity,
    )
  }

  const drafts = clusters.map(cluster => {
    const primary = choosePrimaryItem(cluster.items)
    cluster.primaryItemId = primary.id

    for (const matchItem of cluster.matchItems) {
      if (matchItem.itemId === cluster.primaryItemId) {
        matchItem.role = 'primary'
        matchItem.similarityReason = matchItem.similarityReason ?? '主条'
      }
    }

    const itemCount = cluster.items.length
    const sourceCount = cluster.sourceIds.size
    const confidence = confidenceFromCluster(cluster)
    const status = statusFromCluster(itemCount, sourceCount, cluster.lastSeenMs, nowMs)
    const clusterKey = buildClusterKey(cluster)

    const summary = (primary.summary ?? '').trim() || null
    // Decode HTML entities in title before storing
    const title = decodeHtmlEntities(primary.title.trim()).replace(/\s+/g, ' ').trim()

    let matchReason: string
    if (itemCount === 1) {
      matchReason = '单条观察，尚未形成多源事件'
    } else if (cluster.urlMatchCount > 0) {
      matchReason = 'URL 规范化后一致，事件链路清晰'
    } else if (cluster.maxSharedEntityCount >= 2) {
      matchReason = `共享核心实体，标题相似度 ${clampInt(cluster.maxTitleSimilarity * 100, 0, 100)}%`
    } else {
      matchReason = `标题相似度 ${clampInt(cluster.maxTitleSimilarity * 100, 0, 100)}%`
    }

    const firstSeenAt = cluster.firstSeenMs > 0 ? new Date(cluster.firstSeenMs).toISOString() : null
    const lastSeenAt = cluster.lastSeenMs > 0 ? new Date(cluster.lastSeenMs).toISOString() : null

    return {
      clusterKey,
      title,
      summary,
      status,
      primaryItemId: cluster.primaryItemId,
      firstSeenAt,
      lastSeenAt,
      itemCount,
      sourceCount,
      confidence,
      matchReason,
      metadata: {
        urlMatchCount: cluster.urlMatchCount,
        maxTitleSimilarity: Number(cluster.maxTitleSimilarity.toFixed(4)),
        maxSharedEntityCount: cluster.maxSharedEntityCount,
        entityTokens: [...cluster.entityTokens].sort(),
      },
      items: cluster.matchItems.sort((a, b) => {
        if (a.role === 'primary' && b.role !== 'primary') return -1
        if (a.role !== 'primary' && b.role === 'primary') return 1
        return a.itemId.localeCompare(b.itemId)
      }),
    } satisfies EventClusterDraft
  })

  return drafts.sort((a, b) => {
    const aLast = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0
    const bLast = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0
    if (bLast !== aLast) return bLast - aLast
    if (b.confidence !== a.confidence) return b.confidence - a.confidence
    return b.itemCount - a.itemCount
  })
}
