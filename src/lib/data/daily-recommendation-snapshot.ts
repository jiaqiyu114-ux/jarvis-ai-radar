import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'
import { getTodaySnapshot, type TodayRecommendationItem } from '@/lib/data/today-adapter'
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
  SourceNature,
  SourceTier,
  TokenBudgetTier,
} from '@/types'
import type {
  DbDailyRecommendationItemInsert,
  DbDailyRecommendationRun,
  DbDailyRecommendationRunInsert,
  DbDailyRecommendationSection,
  DbSourceTier,
} from '@/types/database'

const DEFAULT_LIMIT = 12
const DEFAULT_WINDOW_HOURS = 24
const FALLBACK_WINDOW_HOURS = 72
const MIN_RECOMMENDATIONS_BEFORE_FALLBACK = 8
const MAX_POOL_LIMIT = 300

const RECOMMENDATION_OR = [
  'should_enter_daily_report.eq.true',
  'final_score.gte.75',
  'analysis_tier.in.(standard,deep,cluster)',
  'ev_score.gte.55',
  'truth_score.gte.55',
].join(',')

const ITEM_SELECT = [
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

type SourceJoin = {
  name?: string | null
  url?: string | null
  source_tier?: DbSourceTier | string | null
} | null

type CandidateRow = {
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

type SnapshotItemRow = {
  id: string
  run_id: string
  item_id: string
  rank: number
  section: DbDailyRecommendationSection
  recommendation_reason: string | null
  reason_tags: string[] | null
  score_snapshot: Record<string, unknown> | null
  source_snapshot: Record<string, unknown> | null
  item_snapshot: Record<string, unknown> | null
  created_at: string
  items?: CandidateRow | null
}

export type DailyRecommendationRunView = DbDailyRecommendationRun

export type DailyRecommendationSnapshotItem = TodayRecommendationItem & {
  runId: string
  rank: number
  section: DbDailyRecommendationSection
  recommendationReason: string
  recommendation_reason: string
  reasonTags: string[]
  reason_tags: string[]
  runGeneratedAt: string
  runWindowStart: string | null
  runWindowEnd: string | null
}

export type DailyRecommendationSnapshot = {
  date: string
  hasSnapshot: boolean
  run: DailyRecommendationRunView | null
  items: DailyRecommendationSnapshotItem[]
  grouped: Record<DbDailyRecommendationSection, DailyRecommendationSnapshotItem[]>
}

export type GenerateDailyRecommendationSnapshotOptions = {
  date?: string
  windowHours?: number
  limit?: number
  force?: boolean
  dryRun?: boolean
}

export type GenerateDailyRecommendationSnapshotResult = {
  date: string
  dryRun: boolean
  alreadyExists: boolean
  fallbackWindow: boolean
  windowHours: number
  windowStart: string
  windowEnd: string
  totalCandidates: number
  selectedCount: number
  mustReadCount: number
  highValueCount: number
  observeCount: number
  run: DailyRecommendationRunView | null
  items: DailyRecommendationSnapshotItem[]
}

function todayDateString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeDate(date?: string): string {
  if (!date) return todayDateString()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('date must be in YYYY-MM-DD format')
  }
  return date
}

function numberOrZero(value: number | null | undefined): number {
  return value ?? 0
}

function toSourceTier(value: DbSourceTier | string | null | undefined): SourceTier {
  const tier = String(value ?? '').trim().toUpperCase()
  if (tier === 'S' || tier === 'A' || tier === 'B' || tier === 'C') return tier
  return 'C'
}

function toCategory(value: string | null | undefined): Category {
  return (value ?? '其他') as Category
}

function windowStart(hours: number, now = new Date()): string {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString()
}

function isMissingRelationError(error: { code?: string | null; message?: string | null }): boolean {
  const message = error.message ?? ''
  return error.code === '42P01' || message.includes('daily_recommendation_') || message.includes('does not exist')
}

function rowTime(row: CandidateRow): number {
  return row.fetched_at ? new Date(row.fetched_at).getTime() : 0
}

const tierRank: Record<string, number> = {
  cluster: 5,
  deep: 4,
  standard: 3,
  light: 2,
  none: 1,
}

function sortCandidates(rows: CandidateRow[]): CandidateRow[] {
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

    const truthScore = numberOrZero(b.truth_score) - numberOrZero(a.truth_score)
    if (truthScore !== 0) return truthScore

    const traceScore = numberOrZero(b.source_trace_score) - numberOrZero(a.source_trace_score)
    if (traceScore !== 0) return traceScore

    return rowTime(b) - rowTime(a)
  })
}

function sectionFor(row: CandidateRow): DbDailyRecommendationSection {
  if (
    numberOrZero(row.final_score) >= 88 ||
    (row.should_enter_daily_report === true && numberOrZero(row.ev_score) >= 60)
  ) {
    return 'must_read'
  }

  if (
    numberOrZero(row.final_score) >= 75 ||
    row.analysis_tier === 'standard' ||
    row.analysis_tier === 'deep' ||
    row.analysis_tier === 'cluster'
  ) {
    return 'high_value'
  }

  return 'observe'
}

function reasonTags(row: CandidateRow, section: DbDailyRecommendationSection): string[] {
  const tags: string[] = [section]
  if (row.should_enter_daily_report) tags.push('daily_report')
  if (row.should_track_event) tags.push('event_tracking')
  if (row.analysis_tier) tags.push(`analysis_${row.analysis_tier}`)
  if (numberOrZero(row.ev_score) >= 55) tags.push('evidence_strong')
  if (numberOrZero(row.truth_score) >= 55) tags.push('truth_signal')
  if (numberOrZero(row.final_score) >= 75) tags.push('high_score')
  return tags
}

function recommendationReason(row: CandidateRow, section: DbDailyRecommendationSection): string {
  if (section === 'must_read') {
    return '分数高且证据较完整，适合进入今日重点阅读。'
  }

  if (
    row.sources?.source_tier &&
    ['S', 'A'].includes(String(row.sources.source_tier).toUpperCase()) &&
    row.content_fetch_status === 'fetched'
  ) {
    return '来源可信且已抓取正文，适合作为选题候选。'
  }

  if (row.analysis_tier === 'deep' || row.analysis_tier === 'cluster' || row.analysis_stage?.endsWith('_ready')) {
    return '已进入处理队列，适合后续做深度分析。'
  }

  if (section === 'observe') {
    return '真实性线索一般，但趋势信号值得继续观察。'
  }

  return '综合价值达到推荐阈值，适合今天优先浏览。'
}

function excerpt(row: CandidateRow): string {
  const summary = row.summary?.trim()
  if (summary) return summary
  const articleExcerpt = row.article_excerpt?.trim()
  if (articleExcerpt) return articleExcerpt
  const cleanText = row.clean_text?.replace(/\s+/g, ' ').trim()
  if (!cleanText) return ''
  return cleanText.length > 180 ? `${cleanText.slice(0, 180)}...` : cleanText
}

function mapArticleContent(row: CandidateRow): ArticleContent | undefined {
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

function mapEvidenceProfile(row: CandidateRow): EvidenceProfile | undefined {
  if (
    row.ev_score == null &&
    row.truth_score == null &&
    row.source_trace_score == null &&
    row.evidence_checked_at == null
  ) {
    return undefined
  }

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

function mapAnalysisGate(row: CandidateRow): AnalysisGate | undefined {
  if (!row.analysis_tier && !row.analysis_stage && !row.analysis_updated_at && !row.analysis_queued_at) {
    return undefined
  }

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

function mapBaseItem(row: CandidateRow, reason: string): TodayRecommendationItem {
  const source = row.sources ?? null
  return {
    id: row.id,
    title: row.title || '(no title)',
    summary: excerpt(row),
    source: source?.name ?? (row.source_id ? '未知信源' : 'Unknown Source'),
    sourceTier: toSourceTier(source?.source_tier),
    publishedAt: row.published_at ?? row.fetched_at ?? new Date().toISOString(),
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

function mapSnapshotItem(
  row: CandidateRow,
  meta: {
    runId: string
    rank: number
    section: DbDailyRecommendationSection
    reason: string
    tags: string[]
    run: Pick<DbDailyRecommendationRun, 'generated_at' | 'window_start' | 'window_end'>
  },
): DailyRecommendationSnapshotItem {
  return {
    ...mapBaseItem(row, meta.reason),
    runId: meta.runId,
    rank: meta.rank,
    section: meta.section,
    recommendationReason: meta.reason,
    recommendation_reason: meta.reason,
    reasonTags: meta.tags,
    reason_tags: meta.tags,
    runGeneratedAt: meta.run.generated_at,
    runWindowStart: meta.run.window_start,
    runWindowEnd: meta.run.window_end,
  }
}

function groupedItems(items: DailyRecommendationSnapshotItem[]): DailyRecommendationSnapshot['grouped'] {
  return {
    must_read: items.filter(item => item.section === 'must_read'),
    high_value: items.filter(item => item.section === 'high_value'),
    observe: items.filter(item => item.section === 'observe'),
  }
}

async function candidateCount(startIso: string): Promise<number> {
  if (!supabaseServer) return 0
  const { count, error } = await supabaseServer
    .from('items')
    .select('id', { count: 'exact', head: true })
    .eq('data_origin', 'real')
    .gte('fetched_at', startIso)
    .or(RECOMMENDATION_OR)

  if (error) throw new Error(`[daily-recommendation] count candidates: ${error.message}`)
  return count ?? 0
}

async function fetchCandidateRows(startIso: string, limit: number): Promise<{ rows: CandidateRow[]; total: number }> {
  if (!supabaseServer) return { rows: [], total: 0 }

  const poolLimit = Math.min(Math.max(limit * 10, 80), MAX_POOL_LIMIT)
  const [{ data, error }, total] = await Promise.all([
    supabaseServer
      .from('items')
      .select(ITEM_SELECT)
      .eq('data_origin', 'real')
      .gte('fetched_at', startIso)
      .or(RECOMMENDATION_OR)
      .order('should_enter_daily_report', { ascending: false })
      .order('should_track_event', { ascending: false })
      .order('final_score', { ascending: false, nullsFirst: false })
      .order('ev_score', { ascending: false, nullsFirst: false })
      .order('truth_score', { ascending: false, nullsFirst: false })
      .order('source_trace_score', { ascending: false, nullsFirst: false })
      .order('fetched_at', { ascending: false, nullsFirst: false })
      .limit(poolLimit),
    candidateCount(startIso),
  ])

  if (error) throw new Error(`[daily-recommendation] fetch candidates: ${error.message}`)
  return { rows: sortCandidates((data ?? []) as unknown as CandidateRow[]), total }
}

async function selectRowsForSnapshot(
  windowHours: number,
  limit: number,
): Promise<{
  rows: CandidateRow[]
  totalCandidates: number
  fallbackWindow: boolean
  windowHours: number
  windowStart: string
  windowEnd: string
}> {
  const now = new Date()
  const startIso = windowStart(windowHours, now)
  const first = await fetchCandidateRows(startIso, limit)

  if (first.rows.length >= MIN_RECOMMENDATIONS_BEFORE_FALLBACK || windowHours >= FALLBACK_WINDOW_HOURS) {
    return {
      rows: first.rows.slice(0, limit),
      totalCandidates: first.total,
      fallbackWindow: false,
      windowHours,
      windowStart: startIso,
      windowEnd: now.toISOString(),
    }
  }

  const fallbackStartIso = windowStart(FALLBACK_WINDOW_HOURS, now)
  const fallback = await fetchCandidateRows(fallbackStartIso, limit)
  return {
    rows: fallback.rows.slice(0, limit),
    totalCandidates: fallback.total,
    fallbackWindow: true,
    windowHours: FALLBACK_WINDOW_HOURS,
    windowStart: fallbackStartIso,
    windowEnd: now.toISOString(),
  }
}

function preparedItems(
  rows: CandidateRow[],
  run: Pick<DbDailyRecommendationRun, 'id' | 'generated_at' | 'window_start' | 'window_end'>,
): DailyRecommendationSnapshotItem[] {
  return rows.map((row, index) => {
    const section = sectionFor(row)
    const reason = recommendationReason(row, section)
    return mapSnapshotItem(row, {
      runId: run.id,
      rank: index + 1,
      section,
      reason,
      tags: reasonTags(row, section),
      run,
    })
  })
}

function runInsertPayload(args: {
  date: string
  windowStart: string
  windowEnd: string
  totalCandidates: number
  items: DailyRecommendationSnapshotItem[]
  fallbackWindow: boolean
}): DbDailyRecommendationRunInsert {
  return {
    run_date: args.date,
    status: 'generated',
    generated_at: new Date().toISOString(),
    window_start: args.windowStart,
    window_end: args.windowEnd,
    total_candidates: args.totalCandidates,
    selected_count: args.items.length,
    must_read_count: args.items.filter(item => item.section === 'must_read').length,
    high_value_count: args.items.filter(item => item.section === 'high_value').length,
    observe_count: args.items.filter(item => item.section === 'observe').length,
    notes: args.fallbackWindow ? 'Fallback to recent 72 hours because the default window had fewer than 8 candidates.' : null,
  }
}

function itemInsertPayload(item: DailyRecommendationSnapshotItem): DbDailyRecommendationItemInsert {
  return {
    run_id: item.runId,
    item_id: item.id,
    rank: item.rank,
    section: item.section,
    recommendation_reason: item.recommendationReason,
    reason_tags: item.reasonTags,
    score_snapshot: {
      final_score: item.finalScore,
      ev_score: item.evidenceScore,
      truth_score: item.truthScore,
      source_trace_score: item.sourceTraceScore,
      analysis_tier: item.analysisTier,
      analysis_stage: item.analysisStage,
      should_enter_daily_report: item.shouldEnterDailyReport,
      should_track_event: item.shouldTrackEvent,
    },
    source_snapshot: {
      source_id: item.sourceId,
      name: item.source,
      url: item.sourceUrl,
      source_tier: item.sourceTier,
    },
    item_snapshot: {
      title: item.title,
      summary: item.summary,
      url: item.originalUrl,
      category: item.category,
      tags: item.tags,
      published_at: item.publishedAt,
      fetched_at: item.fetchedAt,
      content_fetch_status: item.articleContent?.fetchStatus ?? null,
      content_word_count: item.articleContent?.wordCount ?? null,
    },
  }
}

export async function getDailyRecommendationRun(date?: string): Promise<DailyRecommendationRunView | null> {
  const runDate = normalizeDate(date)
  if (!isServerSupabaseConfigured || !supabaseServer) return null

  const { data, error } = await supabaseServer
    .from('daily_recommendation_runs')
    .select('*')
    .eq('run_date', runDate)
    .maybeSingle()

  if (error) {
    if (isMissingRelationError(error)) return null
    throw new Error(`[daily-recommendation] get run: ${error.message}`)
  }

  return data
}

export async function getDailyRecommendationSnapshot(date?: string): Promise<DailyRecommendationSnapshot> {
  const runDate = normalizeDate(date)
  const empty = {
    date: runDate,
    hasSnapshot: false,
    run: null,
    items: [],
    grouped: { must_read: [], high_value: [], observe: [] },
  }

  if (!isServerSupabaseConfigured || !supabaseServer) return empty

  const run = await getDailyRecommendationRun(runDate)
  if (!run) return empty

  const select = [
    'id',
    'run_id',
    'item_id',
    'rank',
    'section',
    'recommendation_reason',
    'reason_tags',
    'score_snapshot',
    'source_snapshot',
    'item_snapshot',
    'created_at',
    `items!daily_recommendation_items_item_id_fkey(${ITEM_SELECT})`,
  ].join(', ')

  const { data, error } = await supabaseServer
    .from('daily_recommendation_items')
    .select(select)
    .eq('run_id', run.id)
    .order('rank', { ascending: true })

  if (error) {
    if (isMissingRelationError(error)) return empty
    throw new Error(`[daily-recommendation] get snapshot items: ${error.message}`)
  }

  const items = ((data ?? []) as unknown as SnapshotItemRow[])
    .filter(row => row.items)
    .map(row => {
      const itemRow = row.items as CandidateRow
      const section = row.section
      const reason = row.recommendation_reason ?? recommendationReason(itemRow, section)
      return mapSnapshotItem(itemRow, {
        runId: row.run_id,
        rank: row.rank,
        section,
        reason,
        tags: row.reason_tags ?? [],
        run,
      })
    })

  return {
    date: runDate,
    hasSnapshot: true,
    run,
    items,
    grouped: groupedItems(items),
  }
}

export async function generateDailyRecommendationSnapshot(
  options: GenerateDailyRecommendationSnapshotOptions = {},
): Promise<GenerateDailyRecommendationSnapshotResult> {
  const date = normalizeDate(options.date)
  const requestedWindowHours = Math.min(Math.max(options.windowHours ?? DEFAULT_WINDOW_HOURS, 1), FALLBACK_WINDOW_HOURS)
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), 50)
  const dryRun = options.dryRun === true
  const force = options.force === true

  let existingRun: DailyRecommendationRunView | null = null
  try {
    existingRun = await getDailyRecommendationRun(date)
  } catch (error) {
    if (!dryRun) throw error
  }

  if (existingRun && !force) {
    const snapshot = await getDailyRecommendationSnapshot(date)
    return {
      date,
      dryRun,
      alreadyExists: true,
      fallbackWindow: false,
      windowHours: requestedWindowHours,
      windowStart: existingRun.window_start ?? '',
      windowEnd: existingRun.window_end ?? '',
      totalCandidates: existingRun.total_candidates,
      selectedCount: existingRun.selected_count,
      mustReadCount: existingRun.must_read_count,
      highValueCount: existingRun.high_value_count,
      observeCount: existingRun.observe_count,
      run: existingRun,
      items: snapshot.items,
    }
  }

  const selected = await selectRowsForSnapshot(requestedWindowHours, limit)
  const dryRunMarker = {
    id: existingRun?.id ?? 'dry-run',
    generated_at: new Date().toISOString(),
    window_start: selected.windowStart,
    window_end: selected.windowEnd,
  }
  const previewItems = preparedItems(selected.rows, dryRunMarker)
  const mustReadCount = previewItems.filter(item => item.section === 'must_read').length
  const highValueCount = previewItems.filter(item => item.section === 'high_value').length
  const observeCount = previewItems.filter(item => item.section === 'observe').length

  if (dryRun) {
    return {
      date,
      dryRun,
      alreadyExists: Boolean(existingRun && !force),
      fallbackWindow: selected.fallbackWindow,
      windowHours: selected.windowHours,
      windowStart: selected.windowStart,
      windowEnd: selected.windowEnd,
      totalCandidates: selected.totalCandidates,
      selectedCount: previewItems.length,
      mustReadCount,
      highValueCount,
      observeCount,
      run: existingRun,
      items: previewItems,
    }
  }

  if (!isServerSupabaseConfigured || !supabaseServer) {
    throw new Error('Supabase not configured')
  }

  const runPayload = runInsertPayload({
    date,
    windowStart: selected.windowStart,
    windowEnd: selected.windowEnd,
    totalCandidates: selected.totalCandidates,
    items: previewItems,
    fallbackWindow: selected.fallbackWindow,
  })

  let savedRun: DbDailyRecommendationRun
  if (existingRun && force) {
    const deleteItems = await supabaseServer
      .from('daily_recommendation_items')
      .delete()
      .eq('run_id', existingRun.id)
    if (deleteItems.error) {
      throw new Error(`[daily-recommendation] delete old items: ${deleteItems.error.message}`)
    }

    const { data, error } = await supabaseServer
      .from('daily_recommendation_runs')
      .update({ ...runPayload, updated_at: new Date().toISOString() })
      .eq('id', existingRun.id)
      .select('*')
      .single()
    if (error) throw new Error(`[daily-recommendation] update run: ${error.message}`)
    savedRun = data
  } else {
    const { data, error } = await supabaseServer
      .from('daily_recommendation_runs')
      .insert(runPayload)
      .select('*')
      .single()
    if (error) throw new Error(`[daily-recommendation] insert run: ${error.message}`)
    savedRun = data
  }

  const finalItems = preparedItems(selected.rows, savedRun)
  if (finalItems.length > 0) {
    const { error } = await supabaseServer
      .from('daily_recommendation_items')
      .insert(finalItems.map(itemInsertPayload))
    if (error) throw new Error(`[daily-recommendation] insert items: ${error.message}`)
  }

  return {
    date,
    dryRun,
    alreadyExists: false,
    fallbackWindow: selected.fallbackWindow,
    windowHours: selected.windowHours,
    windowStart: selected.windowStart,
    windowEnd: selected.windowEnd,
    totalCandidates: selected.totalCandidates,
    selectedCount: finalItems.length,
    mustReadCount: finalItems.filter(item => item.section === 'must_read').length,
    highValueCount: finalItems.filter(item => item.section === 'high_value').length,
    observeCount: finalItems.filter(item => item.section === 'observe').length,
    run: savedRun,
    items: finalItems,
  }
}

export async function getLiveDailyRecommendationPreview(limit = DEFAULT_LIMIT) {
  return getTodaySnapshot({ limit })
}
