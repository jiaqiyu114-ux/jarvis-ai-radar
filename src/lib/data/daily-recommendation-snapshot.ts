import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'
import { getTodaySnapshot, type TodayRecommendationItem } from '@/lib/data/today-adapter'
import { normalizeDisplayText } from '@/lib/text/normalize-display-text'
import { detectLowValueNoise, type NoiseResult } from '@/lib/scoring/noise'
import { localDayBoundaries } from '@/lib/recommendations/daily-gate'
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
  'sources!items_source_id_fkey(name, url, source_tier, is_user_curated, is_official)',
].join(', ')

type SourceJoin = {
  name?:            string | null
  url?:             string | null
  source_tier?:     DbSourceTier | string | null
  is_user_curated?: boolean | null
  is_official?:     boolean | null
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
  isTodaySnapshot: boolean
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

function isMissingRelationError(error: { code?: string | null; message?: string | null }): boolean {
  const message = error.message ?? ''
  return error.code === '42P01' || message.includes('daily_recommendation_') || message.includes('does not exist')
}


// ── Recommendation score (ordering score for today's picks) ──────────────────
// This is NOT final_score. It is a temporary ranking value used only during
// snapshot generation to decide which items enter the recommendation output.

function computeRecommendationScore(row: CandidateRow, noise: NoiseResult): number {
  let score = numberOrZero(row.final_score)

  // Evidence quality bonus
  const ev = numberOrZero(row.ev_score)
  if (ev >= 70)       score += 6
  else if (ev >= 55)  score += 3

  const truth = numberOrZero(row.truth_score)
  if (truth >= 65)      score += 5
  else if (truth >= 50) score += 2

  // Content depth bonus
  const wc = row.content_word_count ?? 0
  if (wc >= 1200)     score += 6
  else if (wc >= 600) score += 4
  else if (wc >= 200) score += 2

  // Source tier bonus
  const tier = String(row.sources?.source_tier ?? '').toUpperCase()
  if (tier === 'S')      score += 7
  else if (tier === 'A') score += 5
  else if (tier === 'B') score += 3

  // Freshness bonus
  const fetchedMs = row.fetched_at ? new Date(row.fetched_at).getTime() : 0
  const hoursAgo  = fetchedMs > 0 ? (Date.now() - fetchedMs) / 3_600_000 : 999
  if (hoursAgo < 24)      score += 4
  else if (hoursAgo < 72) score += 2

  // Signal flags
  if (row.should_enter_daily_report === true) score += 5
  if (row.should_track_event === true)        score += 3

  // Noise penalty
  score -= noise.penalty

  return Math.max(0, Math.min(100, Math.round(score)))
}

// Section caps: don't force-fill sections if good candidates aren't available
const SECTION_CAPS: Record<DbDailyRecommendationSection, number> = {
  must_read:  3,
  high_value: 8,
  observe:    5,
}

function sectionFor(
  row:   CandidateRow,
  score: number,
  noise: NoiseResult,
): DbDailyRecommendationSection | null {
  const strongNoise = noise.penalty >= 15
  const evOk   = numberOrZero(row.ev_score) >= 65 || numberOrZero(row.truth_score) >= 65
  const trackOk = row.should_track_event === true

  // must_read: high rec score + not strong noise + evidence or event signal
  if (!strongNoise && score >= 78 && (evOk || trackOk)) return 'must_read'

  // high_value: good score + not strong noise
  if (!strongNoise && score >= 65) return 'high_value'

  // observe: moderate score, no dominant noise
  if (score >= 50 && noise.penalty < 15) return 'observe'

  return null  // excluded from snapshot
}

function sortCandidates(rows: CandidateRow[]): CandidateRow[] {
  // Pre-compute recommendation score once per row for sorting
  const scored = rows.map(r => ({
    row:   r,
    noise: detectLowValueNoise(
      normalizeDisplayText(r.title),
      r.summary ?? '',
      r.content_word_count,
    ),
    recScore: 0,
  }))
  scored.forEach(s => { s.recScore = computeRecommendationScore(s.row, s.noise) })
  scored.sort((a, b) => b.recScore - a.recScore)
  return scored.map(s => s.row)
}

function reasonTags(row: CandidateRow, section: DbDailyRecommendationSection, noise: NoiseResult): string[] {
  const tags: string[] = [section]
  if (row.should_enter_daily_report) tags.push('daily_report')
  if (row.should_track_event)        tags.push('event_tracking')
  if (row.analysis_tier)             tags.push(`analysis_${row.analysis_tier}`)
  if (numberOrZero(row.ev_score) >= 55) tags.push('evidence_strong')
  if (numberOrZero(row.truth_score) >= 55) tags.push('truth_signal')
  if (numberOrZero(row.final_score) >= 75) tags.push('high_score')
  if (noise.isNoise && noise.noiseType) tags.push(`noise_${noise.noiseType}`)
  return tags
}

function recommendationReason(
  row:     CandidateRow,
  section: DbDailyRecommendationSection,
  noise:   NoiseResult,
): string {
  if (noise.isNoise && noise.reason) return noise.reason

  const category  = row.category ?? ''
  const titleLow  = normalizeDisplayText(row.title).toLowerCase()
  const isModel   = /\b(model|gpt|claude|gemini|llama|mistral|llm|llms|agent)\b/.test(titleLow)
  const isFunding = category === '融资并购'
  const isPolicy  = category === '监管政策'
  const isProduct = category === '产品发布'
  const isResearch= category === '研究报告'
  const evOk      = numberOrZero(row.ev_score) >= 65
  const hasFetched= row.content_fetch_status === 'fetched'
  const sourceTier= String(row.sources?.source_tier ?? '').toUpperCase()
  const topSource = sourceTier === 'S' || sourceTier === 'A'
  const singleSource = !row.should_track_event

  if (section === 'must_read') {
    if (isModel)   return '模型能力或产品形态有新变化，可能影响开发工具链和内容生产方式，值得今日重点跟进。'
    if (isFunding) return '资本正在押注某类 AI 产品方向，可用于观察行业资源流向和竞争格局变化。'
    if (isPolicy)  return '监管动态可能改变行业边界，建议作为今日重要背景信息优先阅读。'
    if (isResearch)return '新研究结论可能改变对技术路线或市场走向的判断，值得深读。'
    return '证据完整、价值较高，适合进入今日重点判断列表。'
  }

  if (row.should_track_event === true) {
    return '该事件可能持续发酵，适合进入追踪队列，观察后续多家媒体跟进情况。'
  }

  if (isModel && hasFetched) {
    return '指向模型能力或 AI 工具链变化，已有完整正文，适合今日深读判断。'
  }

  if (isProduct && evOk) {
    return '指向 AI 产品新特性或发布动态，证据较完整，适合作为选题或决策背景材料。'
  }

  if (isFunding) {
    return '反映资本流向，可用于观察哪类 AI 方向正在获得市场投注。'
  }

  if (evOk && hasFetched) {
    return '来源可信且有正文，证据基础较完整，适合作为今日深度判断参考。'
  }

  if (topSource && singleSource) {
    return '来源可信度较高，但目前为单一来源，建议关注是否有更多媒体跟进。'
  }

  if (section === 'observe') {
    return '信息价值暂未达入选重点，但趋势信号值得持续观察，避免漏掉后续发酵。'
  }

  return '综合价值初步达标，适合今日轻量浏览。'
}

function excerpt(row: CandidateRow): string {
  const summary = normalizeDisplayText(row.summary)
  if (summary) return summary
  const articleExcerpt = normalizeDisplayText(row.article_excerpt)
  if (articleExcerpt) return articleExcerpt
  const cleanText = row.clean_text?.replace(/\s+/g, ' ').trim()
  if (!cleanText) return ''
  return cleanText.length > 180 ? `${cleanText.slice(0, 180)}…` : cleanText
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
    title: normalizeDisplayText(row.title) || '(no title)',
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
    isUserCurated: source?.is_user_curated ?? undefined,
    isOfficial: source?.is_official ?? undefined,
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

async function candidateCount(startIso: string, endIso?: string): Promise<number> {
  if (!supabaseServer) return 0
  let query = supabaseServer
    .from('items')
    .select('id', { count: 'exact', head: true })
    .eq('data_origin', 'real')
    .gte('fetched_at', startIso)
  if (endIso) query = query.lt('fetched_at', endIso)
  const { count, error } = await query.or(RECOMMENDATION_OR)

  if (error) throw new Error(`[daily-recommendation] count candidates: ${error.message}`)
  return count ?? 0
}

async function fetchCandidateRows(startIso: string, limit: number, endIso?: string): Promise<{ rows: CandidateRow[]; total: number }> {
  if (!supabaseServer) return { rows: [], total: 0 }

  const poolLimit = Math.min(Math.max(limit * 10, 80), MAX_POOL_LIMIT)
  let query = supabaseServer
    .from('items')
    .select(ITEM_SELECT)
    .eq('data_origin', 'real')
    .gte('fetched_at', startIso)
  if (endIso) query = query.lt('fetched_at', endIso)
  const [{ data, error }, total] = await Promise.all([
    query
      .or(RECOMMENDATION_OR)
      .order('should_enter_daily_report', { ascending: false })
      .order('should_track_event', { ascending: false })
      .order('final_score', { ascending: false, nullsFirst: false })
      .order('ev_score', { ascending: false, nullsFirst: false })
      .order('truth_score', { ascending: false, nullsFirst: false })
      .order('source_trace_score', { ascending: false, nullsFirst: false })
      .order('fetched_at', { ascending: false, nullsFirst: false })
      .limit(poolLimit),
    candidateCount(startIso, endIso),
  ])

  if (error) throw new Error(`[daily-recommendation] fetch candidates: ${error.message}`)
  return { rows: sortCandidates((data ?? []) as unknown as CandidateRow[]), total }
}

/**
 * Select candidates for one calendar day (00:00 → 24:00 in JARVIS_TIMEZONE).
 * Unlike the old rolling window, the daily report covers a fixed day — sparse
 * days produce sparse reports, which is the intended, honest behaviour.
 */
async function selectRowsForDay(
  date:  string,
  limit: number,
): Promise<{
  rows: CandidateRow[]
  totalCandidates: number
  fallbackWindow: boolean
  windowHours: number
  windowStart: string
  windowEnd: string
}> {
  const { startIso, endIso } = localDayBoundaries(date)
  const { rows, total } = await fetchCandidateRows(startIso, limit, endIso)
  return {
    rows: rows.slice(0, limit),
    totalCandidates: total,
    fallbackWindow: false,
    windowHours: 24,
    windowStart: startIso,
    windowEnd: endIso,
  }
}

function preparedItems(
  rows: CandidateRow[],
  run: Pick<DbDailyRecommendationRun, 'id' | 'generated_at' | 'window_start' | 'window_end'>,
): DailyRecommendationSnapshotItem[] {
  // rows are already sorted by computeRecommendationScore via sortCandidates
  const counts: Record<DbDailyRecommendationSection, number> = {
    must_read: 0, high_value: 0, observe: 0,
  }
  const result: DailyRecommendationSnapshotItem[] = []
  let rank = 0

  for (const row of rows) {
    const noise    = detectLowValueNoise(
      normalizeDisplayText(row.title),
      row.summary ?? '',
      row.content_word_count,
    )
    const recScore = computeRecommendationScore(row, noise)
    const section  = sectionFor(row, recScore, noise)

    if (!section) continue                         // excluded by noise or low score
    if (counts[section] >= SECTION_CAPS[section]) continue  // section cap reached

    counts[section]++
    rank++
    const reason = recommendationReason(row, section, noise)
    result.push(mapSnapshotItem(row, {
      runId:   run.id,
      rank,
      section,
      reason,
      tags:    reasonTags(row, section, noise),
      run,
    }))
  }

  return result
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
    isTodaySnapshot: false,
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
      const noise  = detectLowValueNoise(
        normalizeDisplayText(itemRow.title),
        itemRow.summary ?? '',
        itemRow.content_word_count,
      )
      const reason = row.recommendation_reason ?? recommendationReason(itemRow, section, noise)
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
    isTodaySnapshot: runDate === todayDateString(),
    run,
    items,
    grouped: groupedItems(items),
  }
}

/**
 * Returns the most recent snapshot regardless of run_date.
 * Use this on /dashboard and /reports so yesterday's snapshot is still visible today.
 */
export async function getLatestDailyRecommendationSnapshot(): Promise<DailyRecommendationSnapshot> {
  const empty: DailyRecommendationSnapshot = {
    date: todayDateString(),
    hasSnapshot: false,
    isTodaySnapshot: false,
    run: null,
    items: [],
    grouped: { must_read: [], high_value: [], observe: [] },
  }

  if (!isServerSupabaseConfigured || !supabaseServer) return empty

  const { data: run, error: runErr } = await supabaseServer
    .from('daily_recommendation_runs')
    .select('*')
    .eq('status', 'generated')
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (runErr) {
    if (isMissingRelationError(runErr)) return empty
    throw new Error(`[daily-recommendation] get latest run: ${runErr.message}`)
  }
  if (!run) return empty

  const select = [
    'id', 'run_id', 'item_id', 'rank', 'section',
    'recommendation_reason', 'reason_tags',
    'score_snapshot', 'source_snapshot', 'item_snapshot', 'created_at',
    `items!daily_recommendation_items_item_id_fkey(${ITEM_SELECT})`,
  ].join(', ')

  const { data, error } = await supabaseServer
    .from('daily_recommendation_items')
    .select(select)
    .eq('run_id', run.id)
    .order('rank', { ascending: true })

  if (error) {
    if (isMissingRelationError(error)) return empty
    throw new Error(`[daily-recommendation] get latest snapshot items: ${error.message}`)
  }

  const items = ((data ?? []) as unknown as SnapshotItemRow[])
    .filter(row => row.items)
    .map(row => {
      const itemRow = row.items as CandidateRow
      const section = row.section
      const noise   = detectLowValueNoise(
        normalizeDisplayText(itemRow.title),
        itemRow.summary ?? '',
        itemRow.content_word_count,
      )
      const reason = row.recommendation_reason ?? recommendationReason(itemRow, section, noise)
      return mapSnapshotItem(itemRow, {
        runId: row.run_id, rank: row.rank, section, reason,
        tags: row.reason_tags ?? [], run,
      })
    })

  return {
    date: run.run_date,
    hasSnapshot: true,
    isTodaySnapshot: run.run_date === todayDateString(),
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

  const selected = await selectRowsForDay(date, limit)
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
