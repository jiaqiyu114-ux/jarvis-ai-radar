import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'
import { normalizeDisplayText } from '@/lib/text/normalize-display-text'
import { detectLowValueNoise } from '@/lib/scoring/noise'
import type {
  AnalysisGate,
  AnalysisPriority,
  AnalysisStage,
  AnalysisTier,
  ArticleContent,
  Category,
  ClaimStatus,
  ContentFetchStatus,
  EvidenceLevel,
  EvidenceProfile,
  InformationItem,
  SourceNature,
  SourceTier,
  TokenBudgetTier,
} from '@/types'
import type { DbSourceTier } from '@/types/database'

const DEFAULT_LIMIT = 12
const MAX_POOL_LIMIT = 200
const FALLBACK_HOURS = 72

const RECOMMENDATION_OR = [
  'should_enter_daily_report.eq.true',
  'final_score.gte.75',
  'analysis_tier.in.(standard,deep,cluster)',
  'ev_score.gte.55',
  'truth_score.gte.55',
].join(',')

const TODAY_SELECT = [
  'id',
  'title',
  'summary',
  'url',
  'source_id',
  'category',
  'tags',
  'final_score',
  'data_origin',
  'published_at',
  'fetched_at',
  'ai_relevance_score',
  'source_score',
  'importance_score',
  'novelty_score',
  'momentum_score',
  'credibility_score',
  'actionability_score',
  'content_potential_score',
  'personal_fit_score',
  'duplicate_penalty',
  'clickbait_penalty',
  'marketing_penalty',
  'cognitive_load_penalty',
  'content_fetch_status',
  'content_fetched_at',
  'content_error_message',
  'article_title',
  'article_author',
  'article_site_name',
  'article_excerpt',
  'clean_text',
  'content_word_count',
  'cover_image_url',
  'media_urls',
  'canonical_url',
  'ev_score',
  'truth_score',
  'source_trace_score',
  'claim_status',
  'evidence_level',
  'source_nature',
  'has_original_source',
  'has_author',
  'has_published_time',
  'has_article_content',
  'has_media_evidence',
  'evidence_notes',
  'truth_notes',
  'evidence_checked_at',
  'analysis_tier',
  'analysis_priority',
  'analysis_stage',
  'analysis_reason',
  'token_budget_tier',
  'analysis_queued_at',
  'analysis_updated_at',
  'estimated_input_tokens',
  'estimated_output_tokens',
  'estimated_total_tokens',
  'should_deep_analyze',
  'should_track_event',
  'should_enter_daily_report',
  'should_enter_topic_pool',
  'sources!items_source_id_fkey(name, url, source_tier)',
].join(', ')

const validCategories: readonly Category[] = [
  'AI技术',
  '商业动态',
  '产品发布',
  '监管政策',
  '融资并购',
  '行业趋势',
  '开源项目',
  '研究报告',
  '人物动态',
  '其他',
]

type SourceJoin = {
  name?: string | null
  url?: string | null
  source_tier?: DbSourceTier | string | null
} | null

type TodayRow = {
  id: string
  title: string | null
  summary: string | null
  url: string | null
  source_id: string | null
  category: string | null
  tags: string[] | null
  final_score: number | null
  data_origin: string | null
  published_at: string | null
  fetched_at: string | null
  ai_relevance_score: number | null
  source_score: number | null
  importance_score: number | null
  novelty_score: number | null
  momentum_score: number | null
  credibility_score: number | null
  actionability_score: number | null
  content_potential_score: number | null
  personal_fit_score: number | null
  duplicate_penalty: number | null
  clickbait_penalty: number | null
  marketing_penalty: number | null
  cognitive_load_penalty: number | null
  content_fetch_status: string | null
  content_fetched_at: string | null
  content_error_message: string | null
  article_title: string | null
  article_author: string | null
  article_site_name: string | null
  article_excerpt: string | null
  clean_text: string | null
  content_word_count: number | null
  cover_image_url: string | null
  media_urls: string[] | null
  canonical_url: string | null
  ev_score: number | null
  truth_score: number | null
  source_trace_score: number | null
  claim_status: string | null
  evidence_level: string | null
  source_nature: string | null
  has_original_source: boolean | null
  has_author: boolean | null
  has_published_time: boolean | null
  has_article_content: boolean | null
  has_media_evidence: boolean | null
  evidence_notes: string | null
  truth_notes: string | null
  evidence_checked_at: string | null
  analysis_tier: string | null
  analysis_priority: string | null
  analysis_stage: string | null
  analysis_reason: string | null
  token_budget_tier: string | null
  analysis_queued_at: string | null
  analysis_updated_at: string | null
  estimated_input_tokens: number | null
  estimated_output_tokens: number | null
  estimated_total_tokens: number | null
  should_deep_analyze: boolean | null
  should_track_event: boolean | null
  should_enter_daily_report: boolean | null
  should_enter_topic_pool: boolean | null
  sources?: SourceJoin
}

export type TodayRecommendationItem = InformationItem & {
  sourceId: string | null
  sourceUrl: string | null
  fetchedAt: string | null
  recommendationReason: string
  recommendation_reason: string
  evidenceScore: number | null
  truthScore: number | null
  sourceTraceScore: number | null
  analysisTier: string | null
  analysisStage: string | null
  tokenBudgetTier: string | null
  shouldEnterDailyReport: boolean
  shouldTrackEvent: boolean
  shouldDeepAnalyze: boolean
}

export type TodayWindowKind = 'today' | 'recent72h'

export type TodayWindow = {
  kind: TodayWindowKind
  label: string
  startIso: string
  endIso: string
  usedFallback: boolean
}

export type TodaySnapshot = {
  window: TodayWindow
  stats: {
    captureTotal: number
    recommendationCount: number
    dailyReportCount: number
    eventCandidateCount: number
    deepCandidateCount: number
  }
  recommendations: TodayRecommendationItem[]
  highScoreReference: TodayRecommendationItem[]
  eventCandidates: TodayRecommendationItem[]
  pendingCandidates: TodayRecommendationItem[]
}

export type TodayRecommendationOptions = {
  limit?: number
  now?: Date
}

function startOfToday(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function recentWindowStart(now = new Date()): Date {
  return new Date(now.getTime() - FALLBACK_HOURS * 60 * 60 * 1000)
}

function buildWindow(kind: TodayWindowKind, now: Date, usedFallback: boolean): TodayWindow {
  const start = kind === 'today' ? startOfToday(now) : recentWindowStart(now)
  return {
    kind,
    label: kind === 'today' ? '今日' : '最近72小时补足',
    startIso: start.toISOString(),
    endIso: now.toISOString(),
    usedFallback,
  }
}

function toCategory(value: string | null | undefined): Category {
  return validCategories.find(c => c === value) ?? '其他'
}

function toSourceTier(value: DbSourceTier | string | null | undefined): SourceTier {
  const tier = String(value ?? '').trim().toUpperCase()
  if (tier === 'S' || tier === 'A' || tier === 'B' || tier === 'C') return tier
  return 'C'
}

function numberOrZero(value: number | null | undefined): number {
  return value ?? 0
}

function cleanExcerpt(row: TodayRow): string {
  const fromSummary = normalizeDisplayText(row.summary)
  if (fromSummary) return fromSummary

  const fromArticle = normalizeDisplayText(row.article_excerpt)
  if (fromArticle) return fromArticle

  const text = row.clean_text?.replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > 180 ? `${text.slice(0, 180)}...` : text
}

function mapArticleContent(row: TodayRow): ArticleContent | undefined {
  const status = row.content_fetch_status as ContentFetchStatus | null
  if (!status || status === 'not_fetched') return undefined

  return {
    fetchStatus: status,
    fetchedAt: row.content_fetched_at,
    errorMessage: row.content_error_message,
    cleanText: row.clean_text,
    wordCount: row.content_word_count,
    excerpt: row.article_excerpt,
    articleTitle: row.article_title,
    authorName: row.article_author,
    siteName: row.article_site_name,
    canonicalUrl: row.canonical_url,
    coverImageUrl: row.cover_image_url,
    mediaUrls: row.media_urls ?? [],
  }
}

function hasEvidenceProfile(row: TodayRow): boolean {
  return [
    row.truth_score,
    row.ev_score,
    row.source_trace_score,
    row.claim_status,
    row.evidence_level,
    row.source_nature,
    row.evidence_notes,
    row.truth_notes,
  ].some(value => value !== null && value !== undefined)
}

function mapEvidenceProfile(row: TodayRow): EvidenceProfile | undefined {
  if (!hasEvidenceProfile(row)) return undefined

  return {
    truthScore: numberOrZero(row.truth_score),
    evidenceScore: numberOrZero(row.ev_score),
    sourceTraceScore: numberOrZero(row.source_trace_score),
    claimStatus: (row.claim_status as ClaimStatus) ?? 'unverified',
    evidenceLevel: (row.evidence_level as EvidenceLevel) ?? 'low',
    sourceNature: (row.source_nature as SourceNature) ?? 'unknown',
    hasOriginalSource: row.has_original_source ?? false,
    hasAuthor: row.has_author ?? false,
    hasPublishedTime: row.has_published_time ?? false,
    hasArticleContent: row.has_article_content ?? false,
    hasMediaEvidence: row.has_media_evidence ?? false,
    evidenceNotes: row.evidence_notes ?? '',
    truthNotes: row.truth_notes ?? '',
    checkedAt: row.evidence_checked_at,
  }
}

function mapAnalysisGate(row: TodayRow): AnalysisGate | undefined {
  if (!row.analysis_tier && !row.analysis_stage && !row.analysis_updated_at) return undefined

  return {
    analysisTier: (row.analysis_tier as AnalysisTier) ?? 'none',
    analysisPriority: (row.analysis_priority as AnalysisPriority) ?? 'low',
    analysisStage: (row.analysis_stage as AnalysisStage) ?? 'unprocessed',
    tokenBudgetTier: (row.token_budget_tier as TokenBudgetTier) ?? 'none',
    estimatedInputTokens: numberOrZero(row.estimated_input_tokens),
    estimatedOutputTokens: numberOrZero(row.estimated_output_tokens),
    estimatedTotalTokens: numberOrZero(row.estimated_total_tokens),
    shouldDeepAnalyze: row.should_deep_analyze ?? false,
    shouldTrackEvent: row.should_track_event ?? false,
    shouldEnterDailyReport: row.should_enter_daily_report ?? false,
    shouldEnterTopicPool: row.should_enter_topic_pool ?? false,
    analysisReason: row.analysis_reason ?? '',
    queuedAt: row.analysis_updated_at ?? row.analysis_queued_at,
  }
}

function isRecommendationCandidate(row: TodayRow): boolean {
  if (row.data_origin !== 'real') return false
  const noise = detectLowValueNoise(
    normalizeDisplayText(row.title),
    row.summary ?? '',
    row.content_word_count,
  )
  // Strong noise with low score is excluded from today's picks
  if (noise.penalty >= 15 && numberOrZero(row.final_score) < 60) return false

  return (
    row.should_enter_daily_report === true ||
    numberOrZero(row.final_score) >= 65 ||
    row.analysis_tier === 'standard' ||
    row.analysis_tier === 'deep' ||
    row.analysis_tier === 'cluster' ||
    numberOrZero(row.ev_score) >= 55 ||
    numberOrZero(row.truth_score) >= 55
  )
}

function recommendationReason(row: TodayRow): string {
  const noise     = detectLowValueNoise(
    normalizeDisplayText(row.title),
    row.summary ?? '',
    row.content_word_count,
  )
  if (noise.isNoise && noise.reason) return noise.reason

  const category  = row.category ?? ''
  const titleLow  = normalizeDisplayText(row.title).toLowerCase()
  const isModel   = /\b(model|gpt|claude|gemini|llama|mistral|llm|llms|agent)\b/.test(titleLow)
  const isFunding = category === '融资并购'
  const isPolicy  = category === '监管政策'
  const isResearch= category === '研究报告'
  const evOk      = numberOrZero(row.ev_score) >= 65

  if (row.should_enter_daily_report === true) {
    if (isModel)    return '模型能力或产品形态有新变化，值得今日重点跟进。'
    if (isFunding)  return '资本正在押注某类 AI 产品方向，可用于观察行业资源流向。'
    if (isPolicy)   return '监管动态可能改变行业边界，建议今日优先阅读。'
    if (isResearch) return '新研究结论可能改变对技术路线的判断，值得深读。'
    return '证据和价值达到日报候选标准，适合今天重点阅读。'
  }

  if (row.should_track_event === true) {
    return '该事件可能持续发酵，适合进入追踪队列观察后续进展。'
  }

  if (isModel && evOk) return '指向模型能力变化，证据较完整，适合今日深读判断。'
  if (isFunding)       return '反映资本流向，可用于判断 AI 行业资源分布变化。'

  if (numberOrZero(row.source_trace_score) >= 75) {
    return '来源链路完整，方便进一步核查，适合作为判断背景材料。'
  }

  if (numberOrZero(row.ev_score) >= 55) {
    return '证据基础较完整，但尚无足够多源验证，适合先行观察。'
  }

  return '信息价值初步达标，适合今日轻量浏览。'
}

const tierRank: Record<string, number> = {
  cluster: 5,
  deep: 4,
  standard: 3,
  light: 2,
  none: 1,
}

function rowTime(row: TodayRow): number {
  const published = row.published_at ? new Date(row.published_at).getTime() : 0
  const fetched = row.fetched_at ? new Date(row.fetched_at).getTime() : 0
  return Math.max(published, fetched)
}

function sortRecommendationRows(rows: TodayRow[]): TodayRow[] {
  return [...rows].sort((a, b) => {
    const daily = Number(b.should_enter_daily_report === true) - Number(a.should_enter_daily_report === true)
    if (daily !== 0) return daily

    const track = Number(b.should_track_event === true) - Number(a.should_track_event === true)
    if (track !== 0) return track

    const tier = (tierRank[b.analysis_tier ?? 'none'] ?? 0) - (tierRank[a.analysis_tier ?? 'none'] ?? 0)
    if (tier !== 0) return tier

    const finalScore = numberOrZero(b.final_score) - numberOrZero(a.final_score)
    if (finalScore !== 0) return finalScore

    const evScore = numberOrZero(b.ev_score) - numberOrZero(a.ev_score)
    if (evScore !== 0) return evScore

    const traceScore = numberOrZero(b.source_trace_score) - numberOrZero(a.source_trace_score)
    if (traceScore !== 0) return traceScore

    return rowTime(b) - rowTime(a)
  })
}

function mapRecommendation(row: TodayRow): TodayRecommendationItem {
  const source = row.sources ?? null
  const reason = recommendationReason(row)
  const publishedAt = row.published_at ?? row.fetched_at ?? new Date().toISOString()

  return {
    id: row.id,
    title: normalizeDisplayText(row.title) || '(no title)',
    summary: cleanExcerpt(row),
    source: source?.name ?? (row.source_id ? '未知信源' : 'Unknown Source'),
    sourceTier: toSourceTier(source?.source_tier),
    publishedAt,
    fetchedAt: row.fetched_at,
    category: toCategory(row.category),
    tags: row.tags ?? [],
    finalScore: numberOrZero(row.final_score),
    scoreBreakdown: {
      ai_relevance: numberOrZero(row.ai_relevance_score),
      source_score: numberOrZero(row.source_score),
      importance: numberOrZero(row.importance_score),
      novelty: numberOrZero(row.novelty_score),
      momentum: numberOrZero(row.momentum_score),
      credibility: numberOrZero(row.credibility_score),
      actionability: numberOrZero(row.actionability_score),
      content_potential: numberOrZero(row.content_potential_score),
      personal_fit: numberOrZero(row.personal_fit_score),
    },
    penalties: {
      duplicate: numberOrZero(row.duplicate_penalty),
      clickbait: numberOrZero(row.clickbait_penalty),
      marketing: numberOrZero(row.marketing_penalty),
      cognitiveLoad: numberOrZero(row.cognitive_load_penalty),
    },
    originalUrl: row.url ?? '',
    relatedReportCount: 0,
    articleContent: mapArticleContent(row),
    evidenceProfile: mapEvidenceProfile(row),
    analysisGate: mapAnalysisGate(row),
    sourceId: row.source_id,
    sourceUrl: source?.url ?? null,
    recommendationReason: reason,
    recommendation_reason: reason,
    evidenceScore: row.ev_score,
    truthScore: row.truth_score,
    sourceTraceScore: row.source_trace_score,
    analysisTier: row.analysis_tier,
    analysisStage: row.analysis_stage,
    tokenBudgetTier: row.token_budget_tier,
    shouldEnterDailyReport: row.should_enter_daily_report ?? false,
    shouldTrackEvent: row.should_track_event ?? false,
    shouldDeepAnalyze: row.should_deep_analyze ?? false,
  }
}

async function countWindowRows(startIso: string): Promise<number> {
  if (!supabaseServer) return 0

  const { count, error } = await supabaseServer
    .from('items')
    .select('id', { count: 'exact', head: true })
    .eq('data_origin', 'real')
    .gte('fetched_at', startIso)

  if (error) {
    console.error('[today-adapter] countWindowRows:', error.message)
    return 0
  }
  return count ?? 0
}

async function countRecommendationRows(startIso: string): Promise<number> {
  if (!supabaseServer) return 0

  const { count, error } = await supabaseServer
    .from('items')
    .select('id', { count: 'exact', head: true })
    .eq('data_origin', 'real')
    .gte('fetched_at', startIso)
    .or(RECOMMENDATION_OR)

  if (error) {
    console.error('[today-adapter] countRecommendationRows:', error.message)
    return 0
  }
  return count ?? 0
}

async function countDailyReportRows(startIso: string): Promise<number> {
  if (!supabaseServer) return 0

  const { count, error } = await supabaseServer
    .from('items')
    .select('id', { count: 'exact', head: true })
    .eq('data_origin', 'real')
    .gte('fetched_at', startIso)
    .eq('should_enter_daily_report', true)

  if (error) {
    console.error('[today-adapter] countDailyReportRows:', error.message)
    return 0
  }
  return count ?? 0
}

async function countEventRows(startIso: string): Promise<number> {
  if (!supabaseServer) return 0

  const { count, error } = await supabaseServer
    .from('items')
    .select('id', { count: 'exact', head: true })
    .eq('data_origin', 'real')
    .gte('fetched_at', startIso)
    .eq('should_track_event', true)

  if (error) {
    console.error('[today-adapter] countEventRows:', error.message)
    return 0
  }
  return count ?? 0
}

async function countDeepRows(startIso: string): Promise<number> {
  if (!supabaseServer) return 0

  const { count, error } = await supabaseServer
    .from('items')
    .select('id', { count: 'exact', head: true })
    .eq('data_origin', 'real')
    .gte('fetched_at', startIso)
    .or('should_deep_analyze.eq.true,analysis_tier.in.(deep,cluster)')

  if (error) {
    console.error('[today-adapter] countDeepRows:', error.message)
    return 0
  }
  return count ?? 0
}

async function fetchRecommendationRows(startIso: string, limit: number): Promise<TodayRow[]> {
  if (!supabaseServer) return []

  const poolLimit = Math.min(Math.max(limit * 8, 80), MAX_POOL_LIMIT)
  const { data, error } = await supabaseServer
    .from('items')
    .select(TODAY_SELECT)
    .eq('data_origin', 'real')
    .gte('fetched_at', startIso)
    .or(RECOMMENDATION_OR)
    .order('should_enter_daily_report', { ascending: false })
    .order('should_track_event', { ascending: false })
    .order('final_score', { ascending: false, nullsFirst: false })
    .order('ev_score', { ascending: false, nullsFirst: false })
    .order('source_trace_score', { ascending: false, nullsFirst: false })
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('fetched_at', { ascending: false, nullsFirst: false })
    .limit(poolLimit)

  if (error) {
    console.error('[today-adapter] fetchRecommendationRows:', error.message)
    return []
  }

  return ((data ?? []) as unknown as TodayRow[]).filter(isRecommendationCandidate)
}

async function buildSnapshotForWindow(window: TodayWindow, limit: number): Promise<TodaySnapshot> {
  const [
    rows,
    captureTotal,
    recommendationCount,
    dailyReportCount,
    eventCandidateCount,
    deepCandidateCount,
  ] = await Promise.all([
    fetchRecommendationRows(window.startIso, limit),
    countWindowRows(window.startIso),
    countRecommendationRows(window.startIso),
    countDailyReportRows(window.startIso),
    countEventRows(window.startIso),
    countDeepRows(window.startIso),
  ])

  const recommendations = sortRecommendationRows(rows).slice(0, limit).map(mapRecommendation)

  return {
    window,
    stats: {
      captureTotal,
      recommendationCount,
      dailyReportCount,
      eventCandidateCount,
      deepCandidateCount,
    },
    recommendations,
    highScoreReference: [...recommendations]
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, 5),
    eventCandidates: recommendations
      .filter(item => item.shouldTrackEvent || item.analysisTier === 'cluster')
      .slice(0, 5),
    pendingCandidates: recommendations
      .filter(item => item.analysisStage === 'unprocessed' || item.analysisStage === null)
      .slice(0, 5),
  }
}

export async function getTodaySnapshot(options: TodayRecommendationOptions = {}): Promise<TodaySnapshot> {
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), DEFAULT_LIMIT)
  const now = options.now ?? new Date()

  const emptyToday = buildWindow('today', now, false)
  if (!isServerSupabaseConfigured || !supabaseServer) {
    return {
      window: emptyToday,
      stats: {
        captureTotal: 0,
        recommendationCount: 0,
        dailyReportCount: 0,
        eventCandidateCount: 0,
        deepCandidateCount: 0,
      },
      recommendations: [],
      highScoreReference: [],
      eventCandidates: [],
      pendingCandidates: [],
    }
  }

  const todaySnapshot = await buildSnapshotForWindow(emptyToday, limit)
  if (todaySnapshot.recommendations.length >= limit) return todaySnapshot

  const fallbackWindow = buildWindow('recent72h', now, true)
  const fallbackSnapshot = await buildSnapshotForWindow(fallbackWindow, limit)
  return fallbackSnapshot.recommendations.length > todaySnapshot.recommendations.length
    ? fallbackSnapshot
    : todaySnapshot
}

export async function getTodayRecommendations(
  options: TodayRecommendationOptions = {},
): Promise<TodayRecommendationItem[]> {
  const snapshot = await getTodaySnapshot(options)
  return snapshot.recommendations
}
