/**
 * Recommendation Engine V1 — Always-on unified recommendation layer.
 *
 * Design principles:
 * 1. Rule-based scoring only (no LLM calls on full item pool).
 * 2. Top-N structure preserved for future AI deep-scoring of high-quality candidates.
 * 3. User feedback NEVER used as preference/interest signal — only quality calibration.
 * 4. User-curated sources get small priority boost, NOT a quality score override.
 * 5. Single-source items have a score ceiling unless from official/very-high-tier source.
 * 6. Data origin = 'real' only; demo/mock items are excluded.
 */

import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'
import { detectLowValueNoise } from '@/lib/scoring/noise'
import { normalizeDisplayText } from '@/lib/text/normalize-display-text'

// ── Output types ──────────────────────────────────────────────────────────────

export type RecommendationTier =
  | 'must_read'   // High-signal, evidence ok, score >= 80
  | 'high_value'  // Score >= 65, not strong noise
  | 'observe'     // Score >= 50, worth watching
  | 'archive'     // Below threshold or strong noise

export type EngineSourceStatus =
  | 'official'      // isOfficial = true
  | 'user_curated'  // isUserCurated = true
  | 'multi_source'  // analysisTier = cluster
  | 'single_source' // default
  | 'weak_source'   // tier C/D + low score

export type EngineEvidenceLevel = 'strong' | 'medium' | 'weak' | 'unknown'

export type RecommendedItem = {
  // Core display fields
  id:            string
  title:         string
  summary:       string
  source:        string
  sourceTier:    string    // 'S' | 'A' | 'B' | 'C'
  publishedAt:   string
  fetchedAt:     string | null
  category:      string
  tags:          string[]
  originalUrl:   string
  finalScore:    number
  // Source curation
  isUserCurated: boolean
  isOfficial:    boolean
  // Evidence
  evScore:       number | null
  truthScore:    number | null
  // Analysis gate flags
  shouldTrackEvent:       boolean
  shouldEnterDailyReport: boolean
  shouldDeepAnalyze:      boolean
  analysisTier:           string | null
  wordCount:              number | null
  // Engine output
  signalScore:          number          // Pure rule-based signal (0-100)
  recommendationScore:  number          // Ranking score (0-100)
  recommendationTier:   RecommendationTier
  sourceStatus:         EngineSourceStatus
  evidenceLevel:        EngineEvidenceLevel
  qualityFlags:         string[]        // e.g. ['official_source', 'fresh', 'single_source']
  recommendationReason: string          // Human-readable Chinese
  riskNote:             string          // Risk explanation (empty = no notable risk)
  nextStep:             string          // Next action suggestion
}

export type RecommendationEngineOptions = {
  windowHours?:    number              // Default 72; lookback window
  limit?:          number              // Default 30; max items returned
  tier?:           RecommendationTier | null  // Filter by tier (null = all)
  includeArchive?: boolean             // Default false
}

export type RecommendationStats = {
  capturedTotal:            number
  recommendationCandidates: number
  mustReadCount:            number
  highValueCount:           number
  observeCount:             number
  archiveCount:             number
}

export type RecommendationResult = {
  windowHours: number
  windowStart: string
  windowEnd:   string
  stats:       RecommendationStats
  items:       RecommendedItem[]
}

// ── Internal DB row type ──────────────────────────────────────────────────────

type EngineSourceJoin = {
  name?:            string | null
  url?:             string | null
  source_tier?:     string | null
  is_user_curated?: boolean | null
  is_official?:     boolean | null
} | null

type EngineRow = {
  id:            string
  title:         string | null
  summary:       string | null
  url:           string | null
  source_id:     string | null
  category:      string | null
  tags:          string[] | null
  final_score:   number | null
  data_origin:   string | null
  published_at:  string | null
  fetched_at:    string | null
  ev_score:      number | null
  truth_score:   number | null
  evidence_level: string | null
  content_word_count: number | null
  content_fetch_status: string | null
  clickbait_penalty:    number | null
  marketing_penalty:    number | null
  duplicate_penalty:    number | null
  cognitive_load_penalty: number | null
  should_enter_daily_report: boolean | null
  should_track_event:        boolean | null
  should_deep_analyze:       boolean | null
  should_enter_topic_pool:   boolean | null
  analysis_tier: string | null
  sources?: EngineSourceJoin
}

// ── Query config ──────────────────────────────────────────────────────────────

const ENGINE_SELECT = [
  'id', 'title', 'summary', 'url', 'source_id', 'category', 'tags',
  'final_score', 'data_origin', 'published_at', 'fetched_at',
  'ev_score', 'truth_score', 'evidence_level',
  'content_word_count', 'content_fetch_status',
  'clickbait_penalty', 'marketing_penalty', 'duplicate_penalty', 'cognitive_load_penalty',
  'should_enter_daily_report', 'should_track_event', 'should_deep_analyze', 'should_enter_topic_pool',
  'analysis_tier',
  'sources!items_source_id_fkey(name, url, source_tier, is_user_curated, is_official)',
].join(', ')

const RECOMMENDATION_OR = [
  'should_enter_daily_report.eq.true',
  'final_score.gte.65',
  'analysis_tier.in.(standard,deep,cluster)',
  'ev_score.gte.50',
].join(',')

const MAX_POOL = 300
const DEFAULT_WINDOW = 72
const DEFAULT_LIMIT  = 30

// ── Signal keywords ───────────────────────────────────────────────────────────

const AI_ENTITIES = [
  'openai', 'anthropic', 'google', 'deepmind', 'meta ai', 'microsoft',
  'nvidia', 'claude', 'chatgpt', 'gemini', 'gpt-4', 'gpt-5', 'gpt4', 'gpt5',
  'llama', 'cursor', 'mcp', 'copilot', 'hugging face', 'huggingface',
  'perplexity', 'xai', 'grok', 'mistral', 'deepseek', 'qwen', 'cohere',
  'stability ai', 'midjourney', 'sora', 'gemma', 'phi-3', 'phi-4',
  'mixtral', 'langchain', 'autogen', 'crewai', 'langsmith',
]

const EVENT_KEYWORDS = [
  'release', 'launch', 'raises', 'acquires', 'acquisition',
  'open-source', 'open source', 'benchmark', 'new model', 'new api',
  'agent', 'workflow', 'funding', 'partnership', 'safety',
  'regulation', 'lawsuit', 'developer', 'research', 'paper',
  'breakthrough', 'milestone', 'series a', 'series b', 'billion',
  'ipo', 'leaked', 'announced', 'revealed', 'api update',
]

// ── Pure scoring functions ────────────────────────────────────────────────────

function n(v: number | null | undefined): number { return v ?? 0 }
function b(v: boolean | null | undefined): boolean { return v === true }

/**
 * Detect text that contains mojibake (UTF-8 bytes decoded as Windows-1252/Latin-1).
 * Items with garbled titles are force-downgraded to 'archive' tier.
 * This prevents corrupted RSS data from appearing in recommendations.
 *
 * Common patterns:
 *   â€™  → right single quote (') stored garbled
 *   Ã©   → é stored garbled
 *   â‚¬  → € stored garbled
 *   � → Unicode replacement character
 */
function looksGarbled(text: string): boolean {
  if (!text || text.length < 4) return false
  return (
    text.includes('â€')   ||  // broken UTF-8 smart quotes/dashes
    text.includes('Ã©')   ||  // é as mojibake
    text.includes('Ã ')   ||  // à as mojibake
    text.includes('Ã¨')   ||  // è as mojibake
    text.includes('Ã¼')   ||  // ü as mojibake
    text.includes('Ã¶')   ||  // ö as mojibake
    text.includes('â‚¬')  ||  // € as mojibake
    text.includes('�')    // Unicode replacement character
  )
}

function countKeywords(text: string, kw: readonly string[]): number {
  const lower = text.toLowerCase()
  return kw.filter(k => lower.includes(k)).length
}

/**
 * Compute a pure rule-based signal score (0-100).
 * Reflects objective newsworthiness based on metadata, not AI dimension scores.
 */
function computeSignalScore(row: EngineRow, isOfficial: boolean, isUserCurated: boolean): number {
  let score = 0
  const tier  = String(row.sources?.source_tier ?? 'C').toUpperCase()
  const title = normalizeDisplayText(row.title)
  const titleLen = title.length

  // Source tier (max 35)
  score += tier === 'S' ? 35 : tier === 'A' ? 28 : tier === 'B' ? 20 : 12

  // Official source bonus (max 8)
  if (isOfficial) score += 8

  // User-curated bonus — small, doesn't override quality (max 5)
  if (isUserCurated) score += 5

  // Entity keyword matches (max 15)
  const entities = countKeywords(title, AI_ENTITIES)
  score += entities >= 3 ? 15 : entities >= 2 ? 12 : entities >= 1 ? 8 : 0

  // Event keyword matches (max 12)
  const events = countKeywords(title, EVENT_KEYWORDS)
  score += events >= 2 ? 12 : events >= 1 ? 8 : 0

  // Content quality (max 10)
  const wc = n(row.content_word_count)
  if (wc >= 600)      score += 10
  else if (wc >= 200) score += 7
  else if (wc >= 50)  score += 4
  else if (row.summary && row.summary.length > 30) score += 3

  // Freshness (max 10)
  const pubMs  = row.published_at  ? new Date(row.published_at).getTime()  : 0
  const fetMs  = row.fetched_at    ? new Date(row.fetched_at).getTime()    : 0
  const bestMs = Math.max(pubMs, fetMs)
  const hoursAgo = bestMs > 0 ? (Date.now() - bestMs) / 3_600_000 : 999
  score += hoursAgo < 6 ? 10 : hoursAgo < 24 ? 7 : hoursAgo < 72 ? 4 : 1

  // Penalties
  if (!title || titleLen < 5)    score -= 20
  if (!row.url)                  score -= 10
  if (titleLen < 10)             score -= 8
  if (!row.summary && wc < 50)   score -= 5
  score -= n(row.clickbait_penalty)
  score -= n(row.marketing_penalty)
  score -= Math.round(n(row.duplicate_penalty) * 0.5)

  return Math.max(0, Math.min(100, Math.round(score)))
}

/**
 * Compute a recommendation ranking score (0-100).
 * Extends final_score with evidence/content/freshness/signal bonuses.
 * This is the ordering score — not the final_score stored in DB.
 */
function computeRecommendationScore(
  row:          EngineRow,
  isUserCurated: boolean,
  noisePenalty: number,
): number {
  let score = n(row.final_score)
  const tier     = String(row.sources?.source_tier ?? 'C').toUpperCase()
  const ev       = n(row.ev_score)
  const truth    = n(row.truth_score)
  const wc       = n(row.content_word_count)
  const fetMs    = row.fetched_at ? new Date(row.fetched_at).getTime() : 0
  const hoursAgo = fetMs > 0 ? (Date.now() - fetMs) / 3_600_000 : 999

  // Evidence bonuses
  if (ev >= 70)       score += 6
  else if (ev >= 55)  score += 3
  if (truth >= 65)      score += 5
  else if (truth >= 50) score += 2

  // Content depth
  if (wc >= 1200)     score += 6
  else if (wc >= 600) score += 4
  else if (wc >= 200) score += 2

  // Source tier
  if (tier === 'S')      score += 7
  else if (tier === 'A') score += 5
  else if (tier === 'B') score += 3

  // Freshness
  if (hoursAgo < 24)      score += 4
  else if (hoursAgo < 72) score += 2

  // Signal flags
  if (b(row.should_enter_daily_report)) score += 5
  if (b(row.should_track_event))        score += 3

  // User curated — light positive signal (prevents complete de-prioritization)
  if (isUserCurated) score += 3

  // Noise penalty
  score -= noisePenalty

  return Math.max(0, Math.min(100, Math.round(score)))
}

function classifyTier(
  recScore:    number,
  strongNoise: boolean,
  evScore:     number,
  truthScore:  number,
  titleGarbled: boolean,
): RecommendationTier {
  // Garbled titles are never recommended — they corrupt the display and suggest
  // the ingest pipeline had an encoding issue that should be fixed, not surfaced.
  if (titleGarbled) return 'archive'
  if (strongNoise && recScore < 70) return 'archive'
  const evidenceOk = evScore >= 55 || truthScore >= 55
  if (recScore >= 80 && (evidenceOk || recScore >= 88)) return 'must_read'
  if (recScore >= 65) return 'high_value'
  if (recScore >= 50) return 'observe'
  return 'archive'
}

function classifySourceStatus(
  row:           EngineRow,
  isOfficial:    boolean,
  isUserCurated: boolean,
): EngineSourceStatus {
  if (isOfficial)                         return 'official'
  if (isUserCurated)                      return 'user_curated'
  if (row.analysis_tier === 'cluster')    return 'multi_source'
  const tier = String(row.sources?.source_tier ?? 'C').toUpperCase()
  if ((tier === 'C' || tier === 'D') && n(row.final_score) < 60) return 'weak_source'
  return 'single_source'
}

function classifyEvidenceLevel(ev: number, truth: number): EngineEvidenceLevel {
  if (ev === 0 && truth === 0) return 'unknown'
  if (ev >= 70 && truth >= 65) return 'strong'
  if (ev >= 50 || truth >= 50) return 'medium'
  return 'weak'
}

function buildQualityFlags(
  row:           EngineRow,
  isOfficial:    boolean,
  isUserCurated: boolean,
  signalScore:   number,
  evLevel:       EngineEvidenceLevel,
  noiseType:     string | undefined,
  titleGarbled:  boolean,
): string[] {
  const flags: string[] = []
  const tier = String(row.sources?.source_tier ?? 'C').toUpperCase()
  const wc   = n(row.content_word_count)
  const pubMs = row.published_at ? new Date(row.published_at).getTime() : 0
  const hours = pubMs > 0 ? (Date.now() - pubMs) / 3_600_000 : 999

  if (titleGarbled)  flags.push('garbled_title')  // encoding corruption detected
  if (isOfficial)    flags.push('official_source')
  if (isUserCurated) flags.push('user_curated_source')
  if (tier === 'S' || tier === 'A') flags.push('high_quality_media')
  if (hours < 24)    flags.push('fresh')

  if (evLevel === 'strong')  flags.push('strong_evidence')
  if (evLevel === 'weak')    flags.push('weak_evidence')
  if (evLevel === 'unknown') flags.push('no_evidence_score')

  if (!b(row.should_track_event) && row.analysis_tier !== 'cluster') flags.push('single_source')
  if (n(row.duplicate_penalty) >= 5)  flags.push('possible_duplicate')
  if (!row.summary || row.summary.length < 20) flags.push('missing_summary')
  if (noiseType === 'event_marketing' || noiseType === 'generic_product_marketing') flags.push('title_noise')
  if (noiseType === 'job_hiring') flags.push('job_listing')

  if (signalScore >= 70) flags.push('high_signal')
  else if (signalScore < 30) flags.push('low_signal')

  if (wc >= 600) flags.push('has_full_content')
  return flags
}

function buildReason(
  row:          EngineRow,
  tier:         RecommendationTier,
  sourceStatus: EngineSourceStatus,
): string {
  const category = row.category ?? ''
  const title    = normalizeDisplayText(row.title).toLowerCase()
  const isModel  = /\b(model|gpt|claude|gemini|llama|mistral|llm|agent)\b/.test(title)
  const isFunding  = category === '融资并购'
  const isPolicy   = category === '监管政策'
  const isResearch = category === '研究报告'
  const isProduct  = category === '产品发布'
  const ev         = n(row.ev_score)

  if (tier === 'must_read') {
    if (isModel)    return '模型能力或产品形态有新变化，值得今日重点跟进。'
    if (isFunding)  return '资本正在押注某类 AI 方向，反映行业资源流向，适合今日优先阅读。'
    if (isPolicy)   return '监管动态可能影响行业边界，建议今日优先关注。'
    if (isResearch) return '新研究结论可能改变技术路线判断，值得深读。'
    return '综合评分较高且证据信号充分，适合今日重点阅读。'
  }

  if (b(row.should_track_event)) return '该事件可能持续发酵，适合进入追踪队列观察后续进展。'
  if (b(row.should_enter_daily_report)) return '已通过日报入选条件，适合纳入今日摘要。'
  if (sourceStatus === 'official') return '来自官方一手信源，真实性权重较高，适合直接参考。'
  if (sourceStatus === 'user_curated') return '来自你主动接入的信源，具备初始参考价值，仍需多源验证。'
  if (isModel && ev >= 60) return '指向模型能力变化，证据较完整，适合今日深读判断。'
  if (isProduct && ev >= 55) return '指向 AI 产品新动态，证据基础较完整，可作为选题素材。'
  if (isFunding) return '反映资本流向，可用于判断 AI 行业资源分布变化。'
  if (tier === 'observe') return '信号价值暂未达高价值门槛，但趋势值得持续观察。'
  return '综合信号初步达标，适合今日轻量浏览。'
}

function buildRiskNote(
  sourceStatus: EngineSourceStatus,
  flags:        string[],
  tier:         RecommendationTier,
): string {
  if (flags.includes('title_noise'))      return '标题含营销或推广特征，建议核实内容价值后再处理。'
  if (flags.includes('possible_duplicate')) return '内容可能与已入库信息重复，建议检查原文后再决定是否深度处理。'
  if (flags.includes('job_listing'))       return '疑似招聘信息，推荐权重已降低。'
  if (flags.includes('weak_evidence'))     return '证据信号偏弱，当前结论仅供参考，不宜直接引用。'
  if (sourceStatus === 'user_curated')     return '来自用户认可源，仍需等待多家媒体跟进才能作为事实依据。'
  if (flags.includes('single_source') && sourceStatus !== 'official')
    return '当前仅有单一媒体报道，建议等待更多来源确认后再深度处理。'
  if (tier === 'observe') return '暂入观察队列，信号价值待后续多源验证。'
  return ''
}

function buildNextStep(
  tier:         RecommendationTier,
  flags:        string[],
  sourceStatus: EngineSourceStatus,
  shouldTrack:  boolean,
): string {
  if (shouldTrack) return '建议加入事件追踪队列，关注多源跟进动态。'
  if (tier === 'must_read' && flags.includes('high_signal')) return '建议今日优先阅读，适合进入日报或作为选题核心素材。'
  if (tier === 'must_read') return '建议今日重点阅读，证据充分时适合进入日报。'
  if (tier === 'high_value' && flags.includes('has_full_content')) return '适合今日精读，内容较完整，可深度消化。'
  if (tier === 'high_value') return '适合纳入今日浏览，视后续多源情况决定是否深度处理。'
  if (sourceStatus === 'user_curated') return '先加入观察，待其他来源跟进确认后再决定处理方式。'
  return '轻量浏览即可，如有多源跟进再重新评估。'
}

// ── Row mapper ────────────────────────────────────────────────────────────────

function mapRow(row: EngineRow): RecommendedItem {
  const source        = row.sources
  const isOfficial    = source?.is_official    ?? false
  const isUserCurated = source?.is_user_curated ?? false
  const title         = normalizeDisplayText(row.title) || '(no title)'
  const summary       = normalizeDisplayText(row.summary)

  const titleGarbled = looksGarbled(row.title ?? '') || looksGarbled(title)
  const noise       = detectLowValueNoise(title, summary, row.content_word_count)
  const signalScore = computeSignalScore(row, isOfficial, isUserCurated)
  const recScore    = computeRecommendationScore(row, isUserCurated, noise.penalty)
  const evScore     = n(row.ev_score)
  const truthScore  = n(row.truth_score)
  const tier        = classifyTier(recScore, noise.penalty >= 15, evScore, truthScore, titleGarbled)
  const sourceStatus = classifySourceStatus(row, isOfficial, isUserCurated)
  const evLevel      = classifyEvidenceLevel(evScore, truthScore)
  const qualityFlags = buildQualityFlags(row, isOfficial, isUserCurated, signalScore, evLevel, noise.noiseType, titleGarbled)

  const reason  = buildReason(row, tier, sourceStatus)
  const risk    = buildRiskNote(sourceStatus, qualityFlags, tier)
  const next    = buildNextStep(tier, qualityFlags, sourceStatus, b(row.should_track_event))

  return {
    id:          row.id,
    title,
    summary,
    source:      source?.name ?? (row.source_id ? '未知信源' : 'Unknown Source'),
    sourceTier:  String(source?.source_tier ?? 'C').toUpperCase(),
    publishedAt: row.published_at ?? row.fetched_at ?? new Date().toISOString(),
    fetchedAt:   row.fetched_at,
    category:    row.category ?? '其他',
    tags:        row.tags ?? [],
    originalUrl: row.url ?? '',
    finalScore:  n(row.final_score),
    isUserCurated,
    isOfficial,
    evScore:     row.ev_score,
    truthScore:  row.truth_score,
    shouldTrackEvent:       b(row.should_track_event),
    shouldEnterDailyReport: b(row.should_enter_daily_report),
    shouldDeepAnalyze:      b(row.should_deep_analyze),
    analysisTier:           row.analysis_tier,
    wordCount:              row.content_word_count,
    signalScore,
    recommendationScore:  recScore,
    recommendationTier:   tier,
    sourceStatus,
    evidenceLevel:        evLevel,
    qualityFlags,
    recommendationReason: reason,
    riskNote:             risk,
    nextStep:             next,
  }
}

// ── Main public API ───────────────────────────────────────────────────────────

/**
 * Get recommendations from the DB using the unified engine.
 * Returns items ordered by recommendationScore desc, with tier classification.
 */
export async function getRecommendations(
  options: RecommendationEngineOptions = {},
): Promise<RecommendationResult> {
  const windowHours = Math.min(Math.max(options.windowHours ?? DEFAULT_WINDOW, 1), 168)
  const limit       = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), 100)
  const now         = new Date()
  const windowEnd   = now.toISOString()
  const windowStart = new Date(now.getTime() - windowHours * 3_600_000).toISOString()

  const empty: RecommendationResult = {
    windowHours, windowStart, windowEnd,
    stats: { capturedTotal: 0, recommendationCandidates: 0, mustReadCount: 0, highValueCount: 0, observeCount: 0, archiveCount: 0 },
    items: [],
  }

  if (!isServerSupabaseConfigured || !supabaseServer) return empty

  const poolLimit = Math.min(limit * 8, MAX_POOL)

  try {
    const [{ data, error }, countResult] = await Promise.all([
      supabaseServer
        .from('items')
        .select(ENGINE_SELECT)
        .eq('data_origin', 'real')
        .gte('fetched_at', windowStart)
        .or(RECOMMENDATION_OR)
        .order('should_enter_daily_report', { ascending: false })
        .order('should_track_event',        { ascending: false })
        .order('final_score',               { ascending: false, nullsFirst: false })
        .limit(poolLimit),
      supabaseServer
        .from('items')
        .select('id', { count: 'exact', head: true })
        .eq('data_origin', 'real')
        .gte('fetched_at', windowStart),
    ])

    if (error) {
      console.error('[recommendation-engine] query failed:', error.message)
      return empty
    }

    const rows = (data ?? []) as unknown as EngineRow[]
    const mapped = rows.map(mapRow)

    // Sort by recommendationScore descending
    mapped.sort((a, b) => b.recommendationScore - a.recommendationScore)

    // Apply tier filter if specified
    const filtered = options.tier
      ? mapped.filter(item => item.recommendationTier === options.tier)
      : options.includeArchive
        ? mapped
        : mapped.filter(item => item.recommendationTier !== 'archive')

    const output = filtered.slice(0, limit)

    const stats: RecommendationStats = {
      capturedTotal:            countResult.count ?? 0,
      recommendationCandidates: mapped.length,
      mustReadCount:            mapped.filter(i => i.recommendationTier === 'must_read').length,
      highValueCount:           mapped.filter(i => i.recommendationTier === 'high_value').length,
      observeCount:             mapped.filter(i => i.recommendationTier === 'observe').length,
      archiveCount:             mapped.filter(i => i.recommendationTier === 'archive').length,
    }

    return { windowHours, windowStart, windowEnd, stats, items: output }
  } catch (err) {
    console.error('[recommendation-engine] unexpected error:', err)
    return empty
  }
}

/**
 * Enrich an existing item with engine classification without DB I/O.
 * Useful for enriching items already fetched by other adapters.
 */
export function enrichItemWithEngine(
  item: {
    finalScore:    number
    sourceTier:    string
    title:         string
    summary:       string
    publishedAt:   string
    fetchedAt?:    string | null
    isOfficial?:   boolean
    isUserCurated?: boolean
    evScore?:      number | null
    truthScore?:   number | null
    penalties?:    { clickbait?: number; marketing?: number; duplicate?: number } | null
    wordCount?:    number | null
    shouldTrackEvent?:       boolean
    shouldEnterDailyReport?: boolean
    analysisTier?: string | null
    summary_raw?:  string
  },
): Pick<RecommendedItem, 'signalScore' | 'recommendationScore' | 'recommendationTier' | 'sourceStatus' | 'evidenceLevel' | 'qualityFlags' | 'riskNote' | 'nextStep' | 'recommendationReason'> {
  const isOfficial    = item.isOfficial    ?? false
  const isUserCurated = item.isUserCurated ?? false
  const title         = normalizeDisplayText(item.title)
  const summary       = normalizeDisplayText(item.summary)

  const fakeRow: EngineRow = {
    id: '',
    title: item.title,
    summary: item.summary,
    url: '',
    source_id: null,
    category: null,
    tags: null,
    final_score: item.finalScore,
    data_origin: 'real',
    published_at: item.publishedAt,
    fetched_at: item.fetchedAt ?? null,
    ev_score: item.evScore ?? null,
    truth_score: item.truthScore ?? null,
    evidence_level: null,
    content_word_count: item.wordCount ?? null,
    content_fetch_status: null,
    clickbait_penalty: item.penalties?.clickbait ?? null,
    marketing_penalty: item.penalties?.marketing ?? null,
    duplicate_penalty: item.penalties?.duplicate ?? null,
    cognitive_load_penalty: null,
    should_enter_daily_report: item.shouldEnterDailyReport ?? null,
    should_track_event: item.shouldTrackEvent ?? null,
    should_deep_analyze: null,
    should_enter_topic_pool: null,
    analysis_tier: item.analysisTier ?? null,
    sources: {
      name: null,
      url: null,
      source_tier: item.sourceTier,
      is_user_curated: isUserCurated,
      is_official: isOfficial,
    },
  }

  const noise       = detectLowValueNoise(title, summary, item.wordCount ?? null)
  const signalScore = computeSignalScore(fakeRow, isOfficial, isUserCurated)
  const recScore    = computeRecommendationScore(fakeRow, isUserCurated, noise.penalty)
  const ev          = item.evScore ?? 0
  const truth       = item.truthScore ?? 0
  const titleGarbledEnrich = looksGarbled(item.title ?? '')
  const tier        = classifyTier(recScore, noise.penalty >= 15, ev, truth, titleGarbledEnrich)
  const sourceStatus = classifySourceStatus(fakeRow, isOfficial, isUserCurated)
  const evLevel      = classifyEvidenceLevel(ev, truth)
  const flags        = buildQualityFlags(fakeRow, isOfficial, isUserCurated, signalScore, evLevel, noise.noiseType, titleGarbledEnrich)

  return {
    signalScore,
    recommendationScore:  recScore,
    recommendationTier:   tier,
    sourceStatus,
    evidenceLevel:        evLevel,
    qualityFlags:         flags,
    recommendationReason: buildReason(fakeRow, tier, sourceStatus),
    riskNote:             buildRiskNote(sourceStatus, flags, tier),
    nextStep:             buildNextStep(tier, flags, sourceStatus, item.shouldTrackEvent ?? false),
  }
}

// ── Helper: Tier label for display ───────────────────────────────────────────

export const TIER_LABELS: Record<RecommendationTier, string> = {
  must_read:  '重点推荐',
  high_value: '高价值',
  observe:    '观察',
  archive:    '归档',
}

export const TIER_COLORS: Record<RecommendationTier, string> = {
  must_read:  'text-success border-success/30 bg-success/10',
  high_value: 'text-primary border-primary/30 bg-primary/10',
  observe:    'text-sky-600 border-sky-400/30 bg-sky-400/10 dark:text-sky-400',
  archive:    'text-muted-foreground border-border bg-muted/40',
}

export function getTierFromScore(finalScore: number): RecommendationTier {
  if (finalScore >= 80) return 'must_read'
  if (finalScore >= 65) return 'high_value'
  if (finalScore >= 50) return 'observe'
  return 'archive'
}
