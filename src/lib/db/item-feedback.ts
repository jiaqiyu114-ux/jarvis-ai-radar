import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'
import { FEEDBACK_TYPE_ORDER } from '@/lib/feedback/feedback-labels'
import type {
  DbItem,
  DbItemFeedback,
  DbItemFeedbackType,
  DbSourceTier,
} from '@/types/database'
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

export const ITEM_FEEDBACK_TYPES: DbItemFeedbackType[] = [...FEEDBACK_TYPE_ORDER]

type FeedbackSourceJoin = {
  name: string | null
  source_tier: DbSourceTier | null
} | null

type FeedbackItemRow = DbItem & {
  sources?: FeedbackSourceJoin
}

type FeedbackJoinRow = DbItemFeedback & {
  items?: FeedbackItemRow | null
}

export type RecentItemFeedback = {
  id: string
  itemId: string
  feedbackType: DbItemFeedbackType
  feedbackValue: number
  feedbackNote: string | null
  contextPage: string | null
  createdAt: string
  updatedAt: string
  item: FeedbackReviewItem | null
}

export type FeedbackReviewItem = InformationItem & {
  url: string
  sourceName: string
}

export type ListRecentItemFeedbackParams = {
  limit?: number
  feedbackType?: DbItemFeedbackType | 'all'
  contextPage?: string
}

// Light select — only fields needed for the feedback list display.
// Avoids fetching clean_text, raw_payload, media_urls etc. (can be MBs per item).
const FEEDBACK_ITEM_SELECT_LIGHT = [
  'id', 'title', 'url', 'final_score', 'category',
  'published_at', 'fetched_at', 'language',
  'summary',
  'sources!items_source_id_fkey(name, source_tier)',
].join(', ')

// Full select — kept for reference; currently unused since RECENT_FEEDBACK_SELECT
// uses the light join. Re-enable if a detail modal requires full item data.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _FEEDBACK_ITEM_SELECT_FULL = [
  '*',
  'sources!items_source_id_fkey(name, source_tier)',
].join(', ')

const RECENT_FEEDBACK_SELECT = [
  'id',
  'item_id',
  'feedback_type',
  'feedback_value',
  'feedback_note',
  'context_page',
  'created_at',
  'updated_at',
  `items!inner(${FEEDBACK_ITEM_SELECT_LIGHT})`,  // light join — avoids large content fields
].join(', ')

const VALID_CATEGORIES: readonly Category[] = [
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

function toCategory(value: string | null | undefined): Category {
  return VALID_CATEGORIES.find(category => category === value) ?? '其他'
}

function toSourceTier(value: DbSourceTier | string | null | undefined): SourceTier {
  const tier = String(value ?? '').trim().toUpperCase()
  if (tier === 'S' || tier === 'A' || tier === 'B' || tier === 'C') return tier
  return 'C'
}

function numberOrZero(value: number | null | undefined): number {
  return value ?? 0
}

function mapArticleContent(item: FeedbackItemRow): ArticleContent | undefined {
  const status = item.content_fetch_status as ContentFetchStatus | null
  if (!status || status === 'not_fetched') return undefined
  return {
    fetchStatus: status,
    fetchedAt: item.content_fetched_at,
    errorMessage: item.content_error_message,
    cleanText: item.clean_text,
    wordCount: item.content_word_count,
    excerpt: item.article_excerpt,
    articleTitle: item.article_title,
    authorName: item.article_author,
    siteName: item.article_site_name,
    canonicalUrl: item.canonical_url,
    coverImageUrl: item.cover_image_url,
    mediaUrls: item.media_urls ?? [],
  }
}

function mapEvidenceProfile(item: FeedbackItemRow): EvidenceProfile | undefined {
  if (
    item.ev_score == null &&
    item.truth_score == null &&
    item.source_trace_score == null &&
    item.evidence_checked_at == null
  ) {
    return undefined
  }

  return {
    truthScore: numberOrZero(item.truth_score),
    evidenceScore: numberOrZero(item.ev_score),
    sourceTraceScore: numberOrZero(item.source_trace_score),
    claimStatus: (item.claim_status as ClaimStatus) ?? 'unverified',
    evidenceLevel: (item.evidence_level as EvidenceLevel) ?? 'low',
    sourceNature: (item.source_nature as SourceNature) ?? 'unknown',
    hasOriginalSource: item.has_original_source ?? false,
    hasAuthor: item.has_author ?? false,
    hasPublishedTime: item.has_published_time ?? false,
    hasArticleContent: item.has_article_content ?? false,
    hasMediaEvidence: item.has_media_evidence ?? false,
    evidenceNotes: item.evidence_notes ?? '',
    truthNotes: item.truth_notes ?? '',
    checkedAt: item.evidence_checked_at,
  }
}

function mapAnalysisGate(item: FeedbackItemRow): AnalysisGate | undefined {
  if (!item.analysis_tier && !item.analysis_stage && !item.analysis_queued_at && !item.analysis_updated_at) {
    return undefined
  }

  return {
    analysisTier: (item.analysis_tier as AnalysisTier) ?? 'none',
    analysisPriority: (item.analysis_priority as AnalysisPriority) ?? 'low',
    analysisStage: (item.analysis_stage as AnalysisStage) ?? 'unprocessed',
    tokenBudgetTier: (item.token_budget_tier as TokenBudgetTier) ?? 'none',
    estimatedInputTokens: numberOrZero(item.estimated_input_tokens),
    estimatedOutputTokens: numberOrZero(item.estimated_output_tokens),
    estimatedTotalTokens: numberOrZero(item.estimated_total_tokens),
    shouldDeepAnalyze: item.should_deep_analyze ?? false,
    shouldTrackEvent: item.should_track_event ?? false,
    shouldEnterDailyReport: item.should_enter_daily_report ?? false,
    shouldEnterTopicPool: item.should_enter_topic_pool ?? false,
    analysisReason: item.analysis_reason ?? '',
    queuedAt: item.analysis_updated_at ?? item.analysis_queued_at,
  }
}

function mapFeedbackItem(item: FeedbackItemRow): FeedbackReviewItem {
  const source = item.sources ?? null
  const sourceName = source?.name ?? (item.source_id ? '未知信源' : 'Unknown Source')
  return {
    id: item.id,
    title: item.title || '(no title)',
    summary: item.summary ?? '',
    source: sourceName,
    sourceName,
    sourceTier: toSourceTier(source?.source_tier),
    publishedAt: item.published_at,
    fetchedAt: item.fetched_at,
    category: toCategory(item.category),
    tags: item.tags ?? [],
    finalScore: numberOrZero(item.final_score),
    scoreBreakdown: {
      ai_relevance: numberOrZero(item.ai_relevance_score),
      source_score: numberOrZero(item.source_score),
      importance: numberOrZero(item.importance_score),
      novelty: numberOrZero(item.novelty_score),
      momentum: numberOrZero(item.momentum_score),
      credibility: numberOrZero(item.credibility_score),
      actionability: numberOrZero(item.actionability_score),
      content_potential: numberOrZero(item.content_potential_score),
      personal_fit: numberOrZero(item.personal_fit_score),
    },
    penalties: {
      duplicate: numberOrZero(item.duplicate_penalty),
      clickbait: numberOrZero(item.clickbait_penalty),
      marketing: numberOrZero(item.marketing_penalty),
      cognitiveLoad: numberOrZero(item.cognitive_load_penalty),
    },
    originalUrl: item.url,
    url: item.url,
    relatedReportCount: 0,
    articleContent: mapArticleContent(item),
    evidenceProfile: mapEvidenceProfile(item),
    analysisGate: mapAnalysisGate(item),
  }
}

function mapRecentFeedback(row: FeedbackJoinRow): RecentItemFeedback {
  return {
    id: row.id,
    itemId: row.item_id,
    feedbackType: row.feedback_type,
    feedbackValue: row.feedback_value,
    feedbackNote: row.feedback_note,
    contextPage: row.context_page,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    item: row.items ? mapFeedbackItem(row.items) : null,
  }
}

export async function upsertItemFeedback(
  itemId:       string,
  feedbackType: DbItemFeedbackType,
  contextPage?: string,
): Promise<DbItemFeedback | null> {
  if (!isServerSupabaseConfigured || !supabaseServer) return null
  const now = new Date().toISOString()
  const { data, error } = await supabaseServer
    .from('item_feedback')
    .upsert(
      {
        item_id:       itemId,
        feedback_type: feedbackType,
        feedback_value: 1,
        context_page:  contextPage ?? null,
        updated_at:    now,
      },
      { onConflict: 'item_id,feedback_type' },
    )
    .select()
    .single()
  if (error) {
    console.error('[db/item-feedback] upsert:', error.message)
    return null
  }
  return data as DbItemFeedback
}

export async function deleteItemFeedback(
  itemId:       string,
  feedbackType: DbItemFeedbackType,
): Promise<boolean> {
  if (!isServerSupabaseConfigured || !supabaseServer) return false
  const { error } = await supabaseServer
    .from('item_feedback')
    .delete()
    .eq('item_id', itemId)
    .eq('feedback_type', feedbackType)
  if (error) {
    console.error('[db/item-feedback] delete:', error.message)
    return false
  }
  return true
}

export async function listItemFeedback(itemId: string): Promise<DbItemFeedback[]> {
  if (!isServerSupabaseConfigured || !supabaseServer) return []
  const { data, error } = await supabaseServer
    .from('item_feedback')
    .select('*')
    .eq('item_id', itemId)
  if (error) {
    console.error('[db/item-feedback] list:', error.message)
    return []
  }
  return (data ?? []) as DbItemFeedback[]
}

export async function listRecentItemFeedbackWithItems(
  params: ListRecentItemFeedbackParams = {},
): Promise<RecentItemFeedback[]> {
  if (!isServerSupabaseConfigured || !supabaseServer) return []

  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100)
  let query = supabaseServer
    .from('item_feedback')
    .select(RECENT_FEEDBACK_SELECT)
    .eq('items.data_origin', 'real')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (params.feedbackType && params.feedbackType !== 'all') {
    query = query.eq('feedback_type', params.feedbackType)
  }

  if (params.contextPage) {
    query = query.eq('context_page', params.contextPage)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`[db/item-feedback] list recent: ${error.message}`)
  }

  return ((data ?? []) as unknown as FeedbackJoinRow[]).map(mapRecentFeedback)
}
