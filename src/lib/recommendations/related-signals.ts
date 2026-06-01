/**
 * Related Signals v1.1 — Upgraded rule-based relevance matching.
 *
 * Improvements over v1:
 * - Canonical company alias map (50+ text variants → canonical company name)
 * - Product alias map (20+ product mentions → canonical product name)
 * - Topic taxonomy (14 topic IDs, English + Chinese keyword patterns)
 * - same_company / same_product score much higher than same_source
 * - same_source alone hard-capped at 20 (below threshold), never picks by itself
 * - Per-source diversity limit: max 2 signals per source name
 * - Rich RelatedSignal: matchedCompanies, matchedProducts, matchedTopics, debug
 * - Context-aware relation reason (company + topic, product + topic, etc.)
 * - noRelatedReason per item (audit only — not surfaced in main UI)
 *
 * Design constraints preserved from v1:
 * - No LLM calls. No new dependencies.
 * - O(N×M): N=final items (≤10), M=candidate pool (≤300)
 * - All compute is synchronous + cheap string ops
 * - Never affects scores or ranking
 * - Fails silently (returns []) on any error
 */

import type { RecommendedItem } from '@/lib/recommendations/recommendation-engine'

// ── Public types ──────────────────────────────────────────────────────────────

export type RelationTypeKey =
  | 'same_entity'     // kept for backward compat with v1 snapshots
  | 'same_company'    // shared canonical company name
  | 'same_product'    // shared canonical product name
  | 'same_topic'      // shared topic taxonomy ID
  | 'same_source'     // same source name or provider
  | 'shared_keyword'  // shared title tokens or tags
  | 'time_proximity'  // published within 72h of each other

export type RelatedSignal = {
  id:              string
  title:           string
  sourceName?:     string | null
  provider?:       string | null
  url?:            string | null
  publishedAt?:    string | null
  score:           number
  relationTypes:   RelationTypeKey[]
  reason:          string
  summary?:        string | null
  contentStatus?:  string | null
  contentSource?:  string | null
  tier?:           string | null
  matchedEntities?:  string[]    // backward compat — same as matchedCompanies
  matchedCompanies?: string[]
  matchedProducts?:  string[]
  matchedTopics?:    string[]
  matchedKeywords?:  string[]
  sharedTags?:       string[]
  debug?: {
    titleOverlap?:       number
    summaryOverlap?:     number
    sameSource?:         boolean
    sameProvider?:       boolean
    sameDomain?:         boolean
    timeProximityHours?: number | null
    scoreBreakdown?:     Record<string, number>
  }
}

export type NoRelatedReasonKey =
  | 'candidate_pool_too_small'
  | 'no_shared_entities'
  | 'weak_scores'
  | 'all_duplicates'
  | 'only_same_source_weak_match'

// ── Company canonical alias map ───────────────────────────────────────────────
// Lowercased text mention → canonical company name.
// Multi-word phrases listed before their substrings (greedy intent).

const COMPANY_ALIASES: ReadonlyArray<readonly [string, string]> = [
  // Multi-word first
  ['google deepmind', 'Google'],
  ['google ai', 'Google'],
  ['hugging face', 'HuggingFace'],
  ['figure ai', 'Figure'],
  ['claude code', 'Anthropic'],
  ['replit agent', 'Replit'],
  ['github copilot', 'Microsoft'],
  ['microsoft azure', 'Microsoft'],
  ['meta ai', 'Meta'],
  ['amazon aws', 'Amazon'],
  ['amazon bedrock', 'Amazon'],
  // Single terms
  ['openai', 'OpenAI'],
  ['chatgpt', 'OpenAI'],
  ['gpt-4o', 'OpenAI'],
  ['gpt-4', 'OpenAI'],
  ['gpt-5', 'OpenAI'],
  ['gpt4', 'OpenAI'],
  ['gpt5', 'OpenAI'],
  ['sora', 'OpenAI'],
  ['anthropic', 'Anthropic'],
  ['claude', 'Anthropic'],
  ['google', 'Google'],
  ['gemini', 'Google'],
  ['deepmind', 'Google'],
  ['notebooklm', 'Google'],
  ['microsoft', 'Microsoft'],
  ['github', 'Microsoft'],
  ['azure', 'Microsoft'],
  ['copilot', 'Microsoft'],
  ['nvidia', 'NVIDIA'],
  ['blackwell', 'NVIDIA'],
  ['cuda', 'NVIDIA'],
  ['geforce', 'NVIDIA'],
  ['h100', 'NVIDIA'],
  ['meta', 'Meta'],
  ['llama', 'Meta'],
  ['apple', 'Apple'],
  ['wwdc', 'Apple'],
  ['amazon', 'Amazon'],
  ['aws', 'Amazon'],
  ['bedrock', 'Amazon'],
  ['cloudflare', 'Cloudflare'],
  ['databricks', 'Databricks'],
  ['snowflake', 'Snowflake'],
  ['tesla', 'Tesla'],
  ['fsd', 'Tesla'],
  ['optimus', 'Tesla'],
  ['xai', 'xAI'],
  ['grok', 'xAI'],
  ['perplexity', 'Perplexity'],
  ['deepseek', 'DeepSeek'],
  ['huggingface', 'HuggingFace'],
  ['cursor', 'Cursor'],
  ['vercel', 'Vercel'],
  ['replit', 'Replit'],
  ['windsurf', 'Windsurf'],
  ['mistral', 'Mistral'],
  ['cohere', 'Cohere'],
  ['stability ai', 'Stability'],
  ['stability', 'Stability'],
  ['midjourney', 'Midjourney'],
  ['runway', 'Runway'],
]

// ── Product canonical alias map ───────────────────────────────────────────────
// Lowercased text mention → canonical product name.

const PRODUCT_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ['github copilot', 'GitHub Copilot'],
  ['claude code', 'Claude Code'],
  ['replit agent', 'Replit Agent'],
  ['notebooklm', 'NotebookLM'],
  ['chatgpt', 'ChatGPT'],
  ['gemini', 'Gemini'],
  ['sora', 'Sora'],
  ['llama', 'Llama'],
  ['blackwell', 'Blackwell'],
  ['cuda', 'CUDA'],
  ['gpt-4o', 'GPT-4o'],
  ['gpt-4', 'GPT-4'],
  ['gpt-5', 'GPT-5'],
  ['gpt4', 'GPT-4'],
  ['gpt5', 'GPT-5'],
  ['fsd', 'FSD'],
  ['optimus', 'Optimus'],
  ['cursor', 'Cursor'],
  ['windsurf', 'Windsurf'],
  ['deepseek', 'DeepSeek'],
]

// ── Topic taxonomy ────────────────────────────────────────────────────────────
// Text keyword → topic ID. English + Chinese. Longer patterns listed first.

type TopicId =
  | 'ai_agent' | 'coding_agent' | 'model_release' | 'chip' | 'robotics'
  | 'autonomous_driving' | 'token_pricing' | 'multimodal' | 'voice_ai'
  | 'video_generation' | 'cloud_infra' | 'enterprise_ai' | 'devtool' | 'security'

const TOPIC_PATTERNS: ReadonlyArray<readonly [string, TopicId]> = [
  // ai_agent
  ['autonomous agent', 'ai_agent'], ['multi-agent', 'ai_agent'],
  ['ai agent', 'ai_agent'], ['intelligent agent', 'ai_agent'],
  ['agentic', 'ai_agent'], ['智能体', 'ai_agent'],
  // coding_agent
  ['github copilot', 'coding_agent'], ['coding agent', 'coding_agent'],
  ['code completion', 'coding_agent'], ['ai coding', 'coding_agent'],
  ['编程助手', 'coding_agent'], ['代码补全', 'coding_agent'],
  // devtool
  ['developer tool', 'devtool'], ['devtool', 'devtool'],
  ['开发工具', 'devtool'],
  // model_release
  ['foundation model', 'model_release'], ['language model', 'model_release'],
  ['new model', 'model_release'], ['model release', 'model_release'],
  ['模型发布', 'model_release'], ['新模型', 'model_release'],
  // chip
  ['data center gpu', 'chip'], ['semiconductor', 'chip'],
  ['gpu', 'chip'], ['chip', 'chip'], ['芯片', 'chip'], ['cuda', 'chip'],
  // robotics
  ['humanoid robot', 'robotics'], ['humanoid', 'robotics'],
  ['robotics', 'robotics'], ['robot', 'robotics'], ['机器人', 'robotics'],
  // autonomous_driving
  ['autonomous driving', 'autonomous_driving'], ['self-driving', 'autonomous_driving'],
  ['robotaxi', 'autonomous_driving'], ['自动驾驶', 'autonomous_driving'],
  // token_pricing
  ['token pricing', 'token_pricing'], ['api pricing', 'token_pricing'],
  ['token cost', 'token_pricing'], ['pricing model', 'token_pricing'],
  ['定价', 'token_pricing'], ['计费', 'token_pricing'],
  // multimodal
  ['multi-modal', 'multimodal'], ['image generation', 'multimodal'],
  ['vision model', 'multimodal'], ['multimodal', 'multimodal'], ['多模态', 'multimodal'],
  // voice_ai
  ['speech recognition', 'voice_ai'], ['text-to-speech', 'voice_ai'],
  ['voice ai', 'voice_ai'], ['语音', 'voice_ai'],
  // video_generation
  ['video generation', 'video_generation'], ['text-to-video', 'video_generation'],
  ['text to video', 'video_generation'], ['视频生成', 'video_generation'],
  // cloud_infra
  ['cloud infrastructure', 'cloud_infra'], ['machine traffic', 'cloud_infra'],
  ['bot traffic', 'cloud_infra'], ['data center', 'cloud_infra'],
  ['数据中心', 'cloud_infra'], ['云基础设施', 'cloud_infra'],
  // enterprise_ai
  ['enterprise ai', 'enterprise_ai'], ['enterprise adoption', 'enterprise_ai'],
  ['企业级', 'enterprise_ai'],
  // security
  ['ai safety', 'security'], ['model safety', 'security'],
  ['ai alignment', 'security'], ['jailbreak', 'security'],
  ['alignment', 'security'], ['安全', 'security'],
]

export const TOPIC_DISPLAY_ZH: Partial<Record<string, string>> = {
  ai_agent:           'AI 智能体',
  coding_agent:       'AI 编程工具',
  model_release:      '模型发布',
  chip:               'AI 芯片',
  robotics:           '机器人',
  autonomous_driving: '自动驾驶',
  token_pricing:      'Token 定价',
  multimodal:         '多模态',
  voice_ai:           '语音 AI',
  video_generation:   '视频生成',
  cloud_infra:        '云基础设施',
  enterprise_ai:      '企业 AI',
  devtool:            '开发工具',
  security:           'AI 安全',
}

// ── RelationType display labels ───────────────────────────────────────────────

const RELATION_LABELS: Record<RelationTypeKey, string> = {
  same_entity:    '同主体',
  same_company:   '同公司',
  same_product:   '同产品',
  same_topic:     '同主题',
  same_source:    '同信源',
  shared_keyword: '关键词',
  time_proximity: '时间近',
}

export const RELATION_TYPE_LABELS = RELATION_LABELS

// ── Stopwords ─────────────────────────────────────────────────────────────────

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
  'ai', 'startup', 'gets', 'now', 'just', 'also', 'report', 'reports',
  'make', 'makes', 'made', 'build', 'builds', 'more', 'use', 'used',
  'says', 'said', 'week', 'day', 'year', 'time',
])

// ── Text helpers ──────────────────────────────────────────────────────────────

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[^\w\s一-鿿\-']/g, ' ').replace(/\s+/g, ' ').trim()
}

function tokenize(s: string): string[] {
  return s.split(/[\s一-鿿]+/)
    .map(t => t.replace(/[^\w\-']/g, ''))
    .filter(t => t.length >= 3 && !STOPWORDS.has(t))
}

function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase() }
  catch { return null }
}

/** Scan lowercased text for company mentions, returning canonical names. */
function scanCompanies(lower: string): Set<string> {
  const found = new Set<string>()
  for (const [alias, canonical] of COMPANY_ALIASES) {
    if (lower.includes(alias)) found.add(canonical)
  }
  return found
}

/** Scan lowercased text for product mentions, returning canonical names. */
function scanProducts(lower: string): Set<string> {
  const found = new Set<string>()
  for (const [alias, canonical] of PRODUCT_ALIASES) {
    if (lower.includes(alias)) found.add(canonical)
  }
  return found
}

/** Scan lowercased text for topic keyword matches, returning topic IDs. */
function scanTopics(lower: string): Set<string> {
  const found = new Set<string>()
  for (const [pattern, topicId] of TOPIC_PATTERNS) {
    if (lower.includes(pattern)) found.add(topicId)
  }
  return found
}

// ── Term extraction ───────────────────────────────────────────────────────────

type ExtractedTerms = {
  companies: Set<string>   // canonical company names
  products:  Set<string>   // canonical product names
  topics:    Set<string>   // topic IDs
  keywords:  Set<string>   // normalized title tokens (for Jaccard)
  tags:      Set<string>   // item tags (lowercase)
  domain:    string | null
  source:    string | null
  provider:  string | null
}

export function extractTerms(item: RecommendedItem): ExtractedTerms {
  const titleNorm   = normalizeText(item.title)
  const sumNorm     = normalizeText(item.summary || '')
  // Scan first 1500 chars of fullContent only — lightweight
  const fcNorm      = item.fullContent ? normalizeText(item.fullContent.slice(0, 1500)) : ''
  const combined    = `${titleNorm} ${sumNorm} ${fcNorm}`

  // Tags as extra scan text
  const tagsText = (item.tags ?? []).map(t => t.toLowerCase()).join(' ')
  const allText  = `${combined} ${tagsText}`

  const companies = scanCompanies(allText)
  const products  = scanProducts(allText)
  const topics    = scanTopics(allText)

  // Title keyword tokens for Jaccard overlap
  const keywords = new Set(tokenize(titleNorm))

  return {
    companies,
    products,
    topics,
    keywords,
    tags:     new Set((item.tags ?? []).map(t => t.toLowerCase())),
    domain:   extractDomain(item.originalUrl),
    source:   item.source || null,
    provider: item.deepDive?.provider || null,
  }
}

// ── Scoring constants (v1.1) ──────────────────────────────────────────────────

const SCORE_SAME_COMPANY   = 25   // per shared canonical company
const SCORE_COMPANY_CAP    = 60
const SCORE_SAME_PRODUCT   = 25   // per shared canonical product
const SCORE_PRODUCT_CAP    = 60
const SCORE_SAME_TOPIC     = 14   // per shared topic ID
const SCORE_TOPIC_CAP      = 42
const SCORE_TAG_HIT        = 8    // per shared tag
const SCORE_TAG_CAP        = 24
const SCORE_TITLE_OVERLAP  = 20   // max (Jaccard × 20)
const SCORE_SUMMARY_OVERLAP= 12   // max
const SCORE_SAME_SOURCE    = 8
const SCORE_SAME_PROVIDER  = 4
const SCORE_SAME_DOMAIN    = 6
const SCORE_FRESH_24H      = 8
const SCORE_FRESH_72H      = 4
const SCORE_HIGH_TIER      = 6
const SCORE_FULL_CONTENT   = 4
const PENALTY_SHORT_TITLE  = -5
const PENALTY_NO_SUMMARY   = -5
const SAME_SOURCE_ONLY_CAP = 20   // hard cap when only same_source, no semantic match
const MIN_INCLUDE_SCORE    = 30   // raised from v1's 25

// ── Jaccard similarity ────────────────────────────────────────────────────────

function jaccardTokens(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const t of a) { if (b.has(t)) intersection++ }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

// ── Scoring ───────────────────────────────────────────────────────────────────

type ScoreResult = {
  score:             number
  relationTypes:     RelationTypeKey[]
  matchedCompanies:  string[]
  matchedProducts:   string[]
  matchedTopics:     string[]
  matchedKeywords:   string[]
  sharedTags:        string[]
  sameSource:        boolean
  debug: {
    titleOverlap:        number
    summaryOverlap:      number
    sameSource:          boolean
    sameProvider:        boolean
    sameDomain:          boolean
    timeProximityHours:  number | null
    scoreBreakdown:      Record<string, number>
  }
}

function normalizedTitle(title: string): string {
  return title.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
}

function scoreCandidate(
  baseTerms: ExtractedTerms,
  baseItem:  RecommendedItem,
  candidate: RecommendedItem,
  candTerms: ExtractedTerms,
): ScoreResult | null {
  // Hard exclusions
  if (candidate.id === baseItem.id) return null
  if (candidate.originalUrl && candidate.originalUrl === baseItem.originalUrl) return null
  if (normalizedTitle(candidate.title) === normalizedTitle(baseItem.title)) return null

  let score = 0
  const types    = new Set<RelationTypeKey>()
  const breakdown: Record<string, number> = {}
  const matchedCompanies: string[] = []
  const matchedProducts:  string[] = []
  const matchedTopics:    string[] = []
  const matchedKeywords:  string[] = []
  const sharedTags:       string[] = []
  let sameSource    = false
  let sameProvider  = false
  let sameDomain    = false

  // ── Same source ────────────────────────────────────────────────────────────
  if (baseTerms.source && candTerms.source && baseTerms.source === candTerms.source) {
    score += SCORE_SAME_SOURCE; breakdown['same_source'] = SCORE_SAME_SOURCE
    types.add('same_source'); sameSource = true
  } else if (baseTerms.provider && candTerms.provider && baseTerms.provider === candTerms.provider) {
    score += SCORE_SAME_PROVIDER; breakdown['same_provider'] = SCORE_SAME_PROVIDER
    types.add('same_source'); sameProvider = true
  }

  // ── Shared companies ───────────────────────────────────────────────────────
  let companyScore = 0
  for (const co of baseTerms.companies) {
    if (candTerms.companies.has(co) && companyScore < SCORE_COMPANY_CAP) {
      companyScore += SCORE_SAME_COMPANY
      matchedCompanies.push(co)
    }
  }
  if (companyScore > 0) {
    const capped = Math.min(companyScore, SCORE_COMPANY_CAP)
    score += capped; breakdown['same_company'] = capped
    types.add('same_company')
  }

  // ── Shared products ────────────────────────────────────────────────────────
  let productScore = 0
  for (const p of baseTerms.products) {
    if (candTerms.products.has(p) && productScore < SCORE_PRODUCT_CAP) {
      productScore += SCORE_SAME_PRODUCT
      matchedProducts.push(p)
    }
  }
  if (productScore > 0) {
    const capped = Math.min(productScore, SCORE_PRODUCT_CAP)
    score += capped; breakdown['same_product'] = capped
    types.add('same_product')
  }

  // ── Shared topics ──────────────────────────────────────────────────────────
  let topicScore = 0
  for (const t of baseTerms.topics) {
    if (candTerms.topics.has(t) && topicScore < SCORE_TOPIC_CAP) {
      topicScore += SCORE_SAME_TOPIC
      matchedTopics.push(t)
    }
  }
  if (topicScore > 0) {
    const capped = Math.min(topicScore, SCORE_TOPIC_CAP)
    score += capped; breakdown['same_topic'] = capped
    types.add('same_topic')
  }

  // ── Shared tags ────────────────────────────────────────────────────────────
  let tagScore = 0
  for (const tag of candTerms.tags) {
    if (baseTerms.tags.has(tag) && tagScore < SCORE_TAG_CAP) {
      tagScore += SCORE_TAG_HIT
      sharedTags.push(tag)
    }
  }
  if (tagScore > 0) {
    score += Math.min(tagScore, SCORE_TAG_CAP)
    breakdown['shared_tag'] = Math.min(tagScore, SCORE_TAG_CAP)
    types.add('shared_keyword')
  }

  // ── Title token overlap (Jaccard) ──────────────────────────────────────────
  const titleJ = jaccardTokens(baseTerms.keywords, candTerms.keywords)
  const titleOverlapScore = Math.round(titleJ * SCORE_TITLE_OVERLAP)
  if (titleOverlapScore > 0) {
    score += titleOverlapScore; breakdown['title_overlap'] = titleOverlapScore
    if (titleJ > 0.1) types.add('shared_keyword')
    // Collect matched title keywords for metadata
    for (const kw of baseTerms.keywords) {
      if (candTerms.keywords.has(kw) && !STOPWORDS.has(kw)) matchedKeywords.push(kw)
    }
  }

  // ── Summary token overlap ──────────────────────────────────────────────────
  const baseSum = new Set(tokenize(normalizeText(baseItem.summary || '')))
  const candSum = new Set(tokenize(normalizeText(candidate.summary || '')))
  const sumJ = jaccardTokens(baseSum, candSum)
  const sumOverlapScore = Math.round(sumJ * SCORE_SUMMARY_OVERLAP)
  if (sumOverlapScore > 0) {
    score += sumOverlapScore; breakdown['summary_overlap'] = sumOverlapScore
  }

  // ── Same domain ────────────────────────────────────────────────────────────
  if (baseTerms.domain && candTerms.domain && baseTerms.domain === candTerms.domain) {
    score += SCORE_SAME_DOMAIN; breakdown['same_domain'] = SCORE_SAME_DOMAIN
    sameDomain = true
  }

  // ── Time proximity ─────────────────────────────────────────────────────────
  const basePub = baseItem.publishedAt ? new Date(baseItem.publishedAt).getTime() : 0
  const candPub = candidate.publishedAt ? new Date(candidate.publishedAt).getTime() : 0
  let timeProximityHours: number | null = null
  if (basePub > 0 && candPub > 0) {
    const diffH = Math.abs(basePub - candPub) / 3_600_000
    timeProximityHours = diffH
    if (diffH < 24) {
      score += SCORE_FRESH_24H; breakdown['time_proximity_24h'] = SCORE_FRESH_24H
      types.add('time_proximity')
    } else if (diffH < 72) {
      score += SCORE_FRESH_72H; breakdown['time_proximity_72h'] = SCORE_FRESH_72H
      types.add('time_proximity')
    }
  }

  // ── Quality bonuses ────────────────────────────────────────────────────────
  if (candidate.recommendationTier === 'must_read' || candidate.recommendationTier === 'high_value') {
    score += SCORE_HIGH_TIER; breakdown['high_tier'] = SCORE_HIGH_TIER
  }
  const cs = candidate.contentFetchStatus ?? ''
  if (cs === 'fetched' || cs === 'rss_content') {
    score += SCORE_FULL_CONTENT; breakdown['full_content'] = SCORE_FULL_CONTENT
  }

  // ── Penalties ──────────────────────────────────────────────────────────────
  if (candidate.title.length < 15) { score += PENALTY_SHORT_TITLE; breakdown['short_title'] = PENALTY_SHORT_TITLE }
  if (!candidate.summary || candidate.summary.length < 20) { score += PENALTY_NO_SUMMARY; breakdown['no_summary'] = PENALTY_NO_SUMMARY }

  // ── Anti-spam guard: same_source only without any semantic match ───────────
  const hasSemanticMatch =
    matchedCompanies.length > 0 ||
    matchedProducts.length  > 0 ||
    matchedTopics.length    > 0 ||
    matchedKeywords.length  > 0 ||
    sharedTags.length       > 0
  if (!hasSemanticMatch && score > SAME_SOURCE_ONLY_CAP) {
    score = SAME_SOURCE_ONLY_CAP   // hard cap: same-source-only can never reach threshold
  }

  if (score < MIN_INCLUDE_SCORE) return null

  const finalScore = Math.min(100, Math.max(0, Math.round(score)))

  return {
    score:            finalScore,
    relationTypes:    Array.from(types),
    matchedCompanies: [...new Set(matchedCompanies)],
    matchedProducts:  [...new Set(matchedProducts)],
    matchedTopics:    [...new Set(matchedTopics)],
    matchedKeywords:  matchedKeywords.slice(0, 5),
    sharedTags:       sharedTags.slice(0, 5),
    sameSource,
    debug: {
      titleOverlap:       Math.round(titleJ * 100) / 100,
      summaryOverlap:     Math.round(sumJ * 100) / 100,
      sameSource,
      sameProvider,
      sameDomain,
      timeProximityHours: timeProximityHours !== null ? Math.round(timeProximityHours) : null,
      scoreBreakdown:     breakdown,
    },
  }
}

// ── Reason generation ─────────────────────────────────────────────────────────

function topicDisplayName(id: string): string {
  return TOPIC_DISPLAY_ZH[id] ?? id
}

function buildRelationReason(sr: ScoreResult, candidate: RecommendedItem): string {
  const co  = sr.matchedCompanies.slice(0, 2)
  const pr  = sr.matchedProducts.slice(0, 2)
  const to  = sr.matchedTopics.slice(0, 2).map(topicDisplayName)

  // Company + topic: most informative
  if (co.length > 0 && to.length > 0) {
    return `共同命中 ${co.join('、')} 与 ${to.join('、')}，可作为同一趋势下的关联信号。`
  }
  // Product + topic
  if (pr.length > 0 && to.length > 0) {
    return `共同涉及 ${pr.join('、')} 与 ${to.join('、')}，更像同一产品方向变化。`
  }
  // Company only
  if (co.length > 0) {
    return `共同涉及 ${co.join('、')}，或指向同一主体近期动态。`
  }
  // Product only
  if (pr.length > 0) {
    return `共同涉及 ${pr.join('、')}，指向同一产品动态。`
  }
  // Topic only
  if (to.length > 0) {
    if (sr.sameSource && sr.matchedTopics.length > 0) {
      const src = candidate.source ? candidate.source : '同信源'
      return `${src}近期连续关注 ${to.join('、')}，可能指向持续性事件。`
    }
    if (sr.debug.timeProximityHours !== null && sr.debug.timeProximityHours < 48) {
      return `发布时间接近，均指向 ${to.join('、')} 方向，可一起观察。`
    }
    return `均属 ${to.join('、')} 方向，可作为趋势关联参考。`
  }
  // Keyword overlap fallback
  if (sr.matchedKeywords.length > 0) {
    const kws = sr.matchedKeywords.slice(0, 2)
    return `标题关键词重合：${kws.join('、')}，内容有一定关联。`
  }
  // Same source with tags
  if (sr.sameSource && sr.sharedTags.length > 0) {
    return `同信源近期发布且标签重合（${sr.sharedTags.slice(0, 2).join('、')}），可作为候补参考。`
  }
  return '内容有一定关联，可作为候补参考。'
}

// ── noRelatedReason (audit only) ──────────────────────────────────────────────

function inferNoRelatedReason(
  item:       RecommendedItem,
  candidates: RecommendedItem[],
  allScored:  number[],  // scores of all candidates that passed hard exclusions
): NoRelatedReasonKey {
  if (candidates.length < 20) return 'candidate_pool_too_small'
  if (allScored.length === 0) return 'no_shared_entities'
  if (allScored.every(s => s < MIN_INCLUDE_SCORE)) {
    const maxScore = Math.max(...allScored)
    if (maxScore < 20) return 'no_shared_entities'
    if (maxScore < MIN_INCLUDE_SCORE) {
      // Check if same_source-only contributed
      return 'only_same_source_weak_match'
    }
    return 'weak_scores'
  }
  return 'all_duplicates'
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
): { signals: RelatedSignal[]; noRelatedReason?: NoRelatedReasonKey } {
  try {
    const baseTerms = extractTerms(item)
    const scored: Array<{ cand: RecommendedItem; sr: ScoreResult }> = []
    const allPreFilterScores: number[] = []

    for (const cand of candidates) {
      try {
        if (cand.id === item.id) continue
        if (cand.originalUrl && cand.originalUrl === item.originalUrl) continue
        const candTerms = extractTerms(cand)
        const sr = scoreCandidate(baseTerms, item, cand, candTerms)
        if (sr) {
          scored.push({ cand, sr })
          allPreFilterScores.push(sr.score)
        } else {
          // Track pre-threshold scores for noRelatedReason
          allPreFilterScores.push(0)
        }
      } catch { /* skip malformed candidate */ }
    }

    // Sort by score descending
    scored.sort((a, b) => b.sr.score - a.sr.score)

    // Per-source diversity: max 2 signals per source name
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

    if (kept.length === 0) {
      const noRelatedReason = inferNoRelatedReason(item, candidates, allPreFilterScores)
      return { signals: [], noRelatedReason }
    }

    const signals = kept.map(({ cand, sr }) => ({
      id:              cand.id,
      title:           cand.title,
      sourceName:      cand.source || null,
      provider:        cand.deepDive?.provider || null,
      url:             cand.originalUrl || null,
      publishedAt:     cand.publishedAt || null,
      score:           sr.score,
      relationTypes:   sr.relationTypes,
      reason:          buildRelationReason(sr, cand),
      summary:         cand.summary || null,
      contentStatus:   cand.deepDive?.contentStatus || null,
      contentSource:   cand.deepDive?.inputDiagnostics?.contentSource || null,
      tier:            cand.recommendationTier || null,
      matchedEntities: sr.matchedCompanies,    // backward compat alias
      matchedCompanies: sr.matchedCompanies,
      matchedProducts:  sr.matchedProducts,
      matchedTopics:    sr.matchedTopics,
      matchedKeywords:  sr.matchedKeywords,
      sharedTags:       sr.sharedTags,
      debug:            sr.debug,
    }))

    return { signals }
  } catch (err) {
    console.warn('[related-signals] computeRelatedSignals error:', err)
    return { signals: [] }
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
    if (item.recommendationTier !== 'must_read' && item.recommendationTier !== 'high_value') {
      return item
    }
    const { signals } = computeRelatedSignals(item, candidatePool, maxPerItem)
    return { ...item, relatedSignals: signals }
  })
}
