/**
 * Related Signals v1 — Rule-based lightweight relevance matching.
 *
 * No LLM calls. No new dependencies.
 * Uses title/summary/tags/source overlap + entity detection.
 *
 * Design constraints:
 * - O(N × M) where N = final items (≤10), M = candidate pool (≤300)
 * - All compute is synchronous + cheap string ops
 * - Never affects scores or ranking
 * - Fails silently (returns []) on any error
 */

import type { RecommendedItem } from '@/lib/recommendations/recommendation-engine'

// ── Public types ──────────────────────────────────────────────────────────────

export type RelationTypeKey =
  | 'same_entity'
  | 'same_company'
  | 'same_product'
  | 'same_topic'
  | 'same_source'
  | 'shared_keyword'
  | 'time_proximity'

export type RelatedSignal = {
  id:           string
  title:        string
  sourceName?:  string | null
  url?:         string | null
  publishedAt?: string | null
  score:        number          // 0-100 internal relevance score
  relationTypes: RelationTypeKey[]
  reason:       string
  summary?:     string | null
  contentStatus?: string | null
  tier?:        string | null
}

// ── Known entity lists ────────────────────────────────────────────────────────

// Strong AI company / product entities (case-insensitive match in text)
const STRONG_ENTITIES: ReadonlySet<string> = new Set([
  'openai', 'anthropic', 'google', 'deepmind', 'meta', 'microsoft',
  'nvidia', 'claude', 'chatgpt', 'gemini', 'gpt-4', 'gpt-5', 'llama',
  'cursor', 'copilot', 'deepseek', 'grok', 'perplexity', 'xai',
  'apple', 'tesla', 'aws', 'cloudflare', 'databricks', 'snowflake',
  'github', 'mistral', 'groq', 'cohere', 'hugging face', 'huggingface',
  'stability', 'midjourney', 'sora', 'runway',
])

// Topic-level keywords (medium match)
const TOPIC_KEYWORDS: ReadonlySet<string> = new Set([
  'model', 'agent', 'agents', 'reasoning', 'inference', 'multimodal',
  'token', 'tokens', 'pricing', 'api', 'fine-tuning', 'training',
  'open-source', 'open source', 'benchmark', 'foundation model',
  'computer use', 'browser', 'coding', 'code', 'voice', 'speech',
  'chip', 'gpu', 'data center', 'cloud', 'robot', 'robotics',
  'autonomous', 'safety', 'alignment', 'regulation', 'copyright',
  '模型', '智能体', '推理', '多模态', 'token', '定价', '接口',
  '微调', '开源', '基准', '芯片', '数据中心', '云计算', '机器人',
  '自动驾驶', '安全', '监管', '版权', '语音', '编程', '工作流',
])

// English stopwords (do not create match)
const STOPWORDS: ReadonlySet<string> = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'with', 'from', 'this', 'that',
  'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'not', 'no', 'nor', 'but',
  'so', 'yet', 'both', 'either', 'neither', 'each', 'every', 'any',
  'its', 'it', 'to', 'of', 'in', 'on', 'at', 'by', 'up', 'out', 'off',
  'over', 'under', 'via', 'as', 'into', 'through', 'about', 'after',
  'before', 'since', 'until', 'while', 'because', 'although',
  'launches', 'announces', 'releases', 'introduces', 'unveils', 'says',
  'using', 'new', 'how', 'why', 'what', 'which', 'who', 'when', 'where',
])

// ── Term extraction ───────────────────────────────────────────────────────────

type ExtractedTerms = {
  entities: Set<string>    // strong entity names found in text
  topics:   Set<string>    // topic keyword matches
  tokens:   Set<string>    // normalised title tokens for overlap
  domain:   string | null  // URL hostname (www-stripped)
}

function normaliseText(s: string): string {
  return s.toLowerCase().replace(/[^\w\s\-']/g, ' ').replace(/\s+/g, ' ').trim()
}

function tokenise(s: string): string[] {
  return s.split(/\s+/)
    .map(t => t.replace(/[^\w\-']/g, ''))
    .filter(t => t.length >= 2 && !STOPWORDS.has(t))
}

function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch { return null }
}

/** Scan text for known entities and topic keywords. Case-insensitive. */
function scanText(text: string, entities: Set<string>, topics: Set<string>): void {
  const lower = text.toLowerCase()
  for (const ent of STRONG_ENTITIES) {
    if (lower.includes(ent)) entities.add(ent)
  }
  for (const kw of TOPIC_KEYWORDS) {
    if (lower.includes(kw)) topics.add(kw)
  }
}

export function extractTerms(item: RecommendedItem): ExtractedTerms {
  const entities = new Set<string>()
  const topics   = new Set<string>()

  const titleNorm = normaliseText(item.title)
  const sumNorm   = normaliseText(item.summary || '')
  // Use first 1500 chars of fullContent for topic/entity scan — lightweight
  const fcNorm    = item.fullContent ? normaliseText(item.fullContent.slice(0, 1500)) : ''

  // Scan title + summary + beginning of fullContent
  const combined = `${titleNorm} ${sumNorm} ${fcNorm}`
  scanText(combined, entities, topics)

  // Also scan tags as entities/topics
  for (const tag of item.tags ?? []) {
    scanText(normaliseText(tag), entities, topics)
  }

  // Tokenise title for keyword-overlap scoring
  const tokens = new Set(tokenise(titleNorm))

  return {
    entities,
    topics,
    tokens,
    domain: extractDomain(item.originalUrl),
  }
}

// ── Scoring ───────────────────────────────────────────────────────────────────

const SCORE_SAME_SOURCE    = 10
const SCORE_ENTITY_HIT     = 20   // per entity, capped
const SCORE_ENTITY_CAP     = 60
const SCORE_TOPIC_HIT      = 8    // per topic keyword, capped
const SCORE_TOPIC_CAP      = 32
const SCORE_TAG_HIT        = 8    // per shared tag, capped
const SCORE_TAG_CAP        = 24
const SCORE_TITLE_OVERLAP  = 25   // max (Jaccard × 25)
const SCORE_SUMMARY_OVERLAP= 15   // max
const SCORE_DOMAIN         = 8
const SCORE_FRESH_24H      = 10
const SCORE_FRESH_72H      = 5
const SCORE_HIGH_TIER      = 8
const SCORE_FULL_CONTENT   = 5
const PENALTY_SHORT_TITLE  = -5
const PENALTY_NO_SUMMARY   = -5
const MIN_INCLUDE_SCORE    = 25

type ScoreResult = {
  score:         number
  relationTypes: RelationTypeKey[]
  sharedEntities: string[]
  sharedTopics:  string[]
  sharedSource:  boolean
}

function jaccardTokens(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const t of a) { if (b.has(t)) intersection++ }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

function normalisedTitle(title: string): string {
  return title.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
}

function scoreCandidate(
  baseTerms:  ExtractedTerms,
  baseItem:   RecommendedItem,
  candidate:  RecommendedItem,
  candTerms:  ExtractedTerms,
): ScoreResult | null {
  // Hard exclusions
  if (candidate.id === baseItem.id) return null
  if (candidate.originalUrl && candidate.originalUrl === baseItem.originalUrl) return null
  if (normalisedTitle(candidate.title) === normalisedTitle(baseItem.title)) return null

  let score = 0
  const types = new Set<RelationTypeKey>()
  const sharedEntities: string[] = []
  const sharedTopics: string[] = []
  let sharedSource = false

  // Same source
  if (baseItem.source && candidate.source && baseItem.source === candidate.source) {
    score += SCORE_SAME_SOURCE
    types.add('same_source')
    sharedSource = true
  }

  // Shared strong entities
  let entityScore = 0
  for (const ent of baseTerms.entities) {
    if (candTerms.entities.has(ent) && entityScore < SCORE_ENTITY_CAP) {
      entityScore += SCORE_ENTITY_HIT
      sharedEntities.push(ent)
    }
  }
  if (entityScore > 0) {
    score += Math.min(entityScore, SCORE_ENTITY_CAP)
    types.add('same_entity')
  }

  // Shared topic keywords
  let topicScore = 0
  for (const kw of baseTerms.topics) {
    if (candTerms.topics.has(kw) && topicScore < SCORE_TOPIC_CAP) {
      topicScore += SCORE_TOPIC_HIT
      sharedTopics.push(kw)
    }
  }
  if (topicScore > 0) {
    score += Math.min(topicScore, SCORE_TOPIC_CAP)
    types.add('same_topic')
  }

  // Shared tags
  const baseTags = new Set((baseItem.tags ?? []).map(t => t.toLowerCase()))
  let tagScore = 0
  for (const tag of (candidate.tags ?? [])) {
    if (baseTags.has(tag.toLowerCase()) && tagScore < SCORE_TAG_CAP) {
      tagScore += SCORE_TAG_HIT
    }
  }
  score += Math.min(tagScore, SCORE_TAG_CAP)
  if (tagScore > 0) types.add('shared_keyword')

  // Title token overlap (Jaccard)
  const titleJ = jaccardTokens(baseTerms.tokens, candTerms.tokens)
  score += Math.round(titleJ * SCORE_TITLE_OVERLAP)
  if (titleJ > 0.1) types.add('shared_keyword')

  // Summary token overlap (lightweight)
  const baseSum = new Set(tokenise(normaliseText(baseItem.summary || '')))
  const candSum = new Set(tokenise(normaliseText(candidate.summary || '')))
  const sumJ = jaccardTokens(baseSum, candSum)
  score += Math.round(sumJ * SCORE_SUMMARY_OVERLAP)

  // Same domain
  if (baseTerms.domain && candTerms.domain && baseTerms.domain === candTerms.domain) {
    score += SCORE_DOMAIN
  }

  // Time proximity
  const basePub = baseItem.publishedAt ? new Date(baseItem.publishedAt).getTime() : 0
  const candPub = candidate.publishedAt ? new Date(candidate.publishedAt).getTime() : 0
  if (basePub > 0 && candPub > 0) {
    const diffH = Math.abs(basePub - candPub) / 3_600_000
    if (diffH < 24) { score += SCORE_FRESH_24H; types.add('time_proximity') }
    else if (diffH < 72) { score += SCORE_FRESH_72H; types.add('time_proximity') }
  }

  // Quality bonuses
  if (candidate.recommendationTier === 'must_read' || candidate.recommendationTier === 'high_value') {
    score += SCORE_HIGH_TIER
  }
  const cs = (candidate.contentFetchStatus ?? '')
  if (cs === 'fetched' || cs === 'rss_content') {
    score += SCORE_FULL_CONTENT
  }

  // Penalties
  if (candidate.title.length < 15) score += PENALTY_SHORT_TITLE
  if (!candidate.summary || candidate.summary.length < 20) score += PENALTY_NO_SUMMARY

  // Guard: if only "same_source" with no content overlap, score should be low
  if (types.size === 1 && types.has('same_source') && sharedEntities.length === 0 && sharedTopics.length === 0) {
    score = Math.min(score, 15) // capped at 15 for pure same-source with nothing else
  }

  if (score < MIN_INCLUDE_SCORE) return null

  return {
    score:          Math.min(100, Math.max(0, Math.round(score))),
    relationTypes:  Array.from(types),
    sharedEntities,
    sharedTopics,
    sharedSource,
  }
}

// ── Reason generation ─────────────────────────────────────────────────────────

// Display-friendly labels for relation types
const RELATION_LABELS: Record<RelationTypeKey, string> = {
  same_entity:   '同主体',
  same_company:  '同公司',
  same_product:  '同产品',
  same_topic:    '同主题',
  same_source:   '同信源',
  shared_keyword:'关键词重合',
  time_proximity:'时间接近',
}

export const RELATION_TYPE_LABELS = RELATION_LABELS

function toDisplayName(ent: string): string {
  // Capitalise known brands, keep others as-is
  const map: Record<string, string> = {
    openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google',
    deepmind: 'DeepMind', meta: 'Meta', microsoft: 'Microsoft',
    nvidia: 'NVIDIA', claude: 'Claude', chatgpt: 'ChatGPT',
    gemini: 'Gemini', llama: 'Llama', cursor: 'Cursor',
    copilot: 'Copilot', deepseek: 'DeepSeek', grok: 'Grok',
    perplexity: 'Perplexity', xai: 'xAI', apple: 'Apple',
    tesla: 'Tesla', aws: 'AWS', cloudflare: 'Cloudflare',
    databricks: 'Databricks', snowflake: 'Snowflake',
    github: 'GitHub', mistral: 'Mistral', groq: 'Groq',
    'hugging face': 'Hugging Face', huggingface: 'HuggingFace',
    stability: 'Stability AI', midjourney: 'Midjourney',
    sora: 'Sora', runway: 'Runway',
  }
  return map[ent.toLowerCase()] ?? ent
}

function buildReason(sr: ScoreResult, candidate: RecommendedItem): string {
  const parts: string[] = []

  if (sr.sharedEntities.length > 0) {
    const names = sr.sharedEntities.slice(0, 3).map(toDisplayName)
    parts.push(`共同涉及 ${names.join('、')}`)
  }
  if (sr.sharedTopics.length > 0 && sr.sharedEntities.length === 0) {
    const kws = sr.sharedTopics.slice(0, 2)
    parts.push(`涉及 ${kws.join('、')} 相关主题`)
  }
  if (sr.sharedSource && sr.sharedEntities.length === 0) {
    parts.push(`来自同一信源 ${candidate.source}`)
  }
  if (sr.relationTypes.includes('time_proximity') && parts.length === 0) {
    parts.push('发布时间接近')
  }
  if (parts.length === 0) {
    parts.push('内容有一定关联')
  }
  return parts.join('，') + '。'
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute related signals for a single item from a candidate pool.
 * Never throws. Returns [] on any error.
 */
export function computeRelatedSignals(
  item:        RecommendedItem,
  candidates:  RecommendedItem[],
  maxResults = 5,
): RelatedSignal[] {
  try {
    const baseTerms = extractTerms(item)
    const scored: Array<{ cand: RecommendedItem; sr: ScoreResult }> = []

    for (const cand of candidates) {
      try {
        const candTerms = extractTerms(cand)
        const sr = scoreCandidate(baseTerms, item, cand, candTerms)
        if (sr) scored.push({ cand, sr })
      } catch { /* skip malformed candidate */ }
    }

    // Sort by score descending
    scored.sort((a, b) => b.sr.score - a.sr.score)

    // De-duplicate: max 2 signals per source (Enhancement A)
    const sourceCount = new Map<string, number>()
    const kept: typeof scored = []
    for (const entry of scored) {
      if (kept.length >= maxResults) break
      const src = entry.cand.source || '__unknown__'
      const cnt = sourceCount.get(src) ?? 0
      if (cnt >= 2) continue
      sourceCount.set(src, cnt + 1)
      kept.push(entry)
    }

    return kept.map(({ cand, sr }) => ({
      id:            cand.id,
      title:         cand.title,
      sourceName:    cand.source || null,
      url:           cand.originalUrl || null,
      publishedAt:   cand.publishedAt || null,
      score:         sr.score,
      relationTypes: sr.relationTypes,
      reason:        buildReason(sr, cand),
      summary:       cand.summary || null,
      contentStatus: cand.deepDive?.contentStatus || null,
      tier:          cand.recommendationTier || null,
    }))
  } catch (err) {
    console.warn('[related-signals] computeRelatedSignals error:', err)
    return []
  }
}

/**
 * Attach related signals to all must_read/high_value items.
 * Uses `candidatePool` as the match space.
 * Returns a new array — does not mutate inputs.
 */
export function attachRelatedSignals(
  finalItems:    RecommendedItem[],
  candidatePool: RecommendedItem[],
  maxPerItem = 5,
): RecommendedItem[] {
  return finalItems.map(item => {
    // Only compute for must_read / high_value
    if (item.recommendationTier !== 'must_read' && item.recommendationTier !== 'high_value') {
      return item
    }
    const relatedSignals = computeRelatedSignals(item, candidatePool, maxPerItem)
    return { ...item, relatedSignals }
  })
}
