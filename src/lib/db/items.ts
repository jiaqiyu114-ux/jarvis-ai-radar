import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'
import type { DbItem, DbItemInsert, DbItemScoreUpdate, DbItemStatus, DbSourceTier } from '@/types/database'

/** Items row enriched with source name and tier via JOIN (feed display). */
export type DbItemWithSource = DbItem & {
  sources: { name: string; source_tier: DbSourceTier | null } | null
}

/** Items row enriched with full source metadata via JOIN (rule scoring). */
export type DbItemForScoring = DbItem & {
  sources: {
    name:              string
    source_tier:       DbSourceTier | null
    is_official:       boolean
    reliability_score: number
    base_score:        number
  } | null
}

/** Returned by upsertItemByCanonicalUrl — never null, throws on error. */
export type UpsertItemResult = {
  id:     string
  status: 'inserted' | 'reused'
}

export type ListItemsOptions = {
  category?:   string
  sourceTier?: DbSourceTier
  minScore?:   number
  maxScore?:   number
  limit?:      number
  offset?:     number
  search?:     string
  status?:     DbItemStatus
}

export async function listItems(options: ListItemsOptions = {}): Promise<DbItem[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const {
    category, sourceTier, minScore, maxScore,
    limit = 50, offset = 0, search, status,
  } = options

  const selectClause = sourceTier
    ? '*, sources!items_source_id_fkey(source_tier)'
    : '*'

  let query = supabase
    .from('items')
    .select(selectClause)
    .order('published_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (category)               query = query.eq('category', category)
  if (sourceTier)             query = query.eq('sources.source_tier', sourceTier)
  if (minScore !== undefined) query = query.gte('final_score', minScore)
  if (maxScore !== undefined) query = query.lte('final_score', maxScore)
  if (status)                 query = query.eq('status', status)
  if (search)                 query = query.or(`title.ilike.%${search}%,summary.ilike.%${search}%`)

  const { data, error } = await query
  if (error) { console.error('[db/items] listItems:', error.message); return [] }
  return (data ?? []) as unknown as DbItem[]
}

export async function listSelectedItems(options: Omit<ListItemsOptions, 'minScore' | 'status'> = {}): Promise<DbItem[]> {
  return listItems({ ...options, minScore: 75, status: 'selected' })
}

/**
 * Same as listItems but includes a sources JOIN for name + tier enrichment.
 * Used by the feed adapter to display source names instead of UUIDs.
 */
export async function listItemsWithSource(
  options: ListItemsOptions & { sortByScore?: boolean } = {},
): Promise<DbItemWithSource[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const {
    category, sourceTier, minScore, maxScore,
    limit = 50, offset = 0, search, status,
    sortByScore = false,
  } = options

  const selectClause = '*, sources!items_source_id_fkey(name, source_tier)'

  let query = supabase
    .from('items')
    .select(selectClause)
    .range(offset, offset + limit - 1)

  // Sort: scored items by final_score desc, then published_at desc
  if (sortByScore) {
    query = query
      .order('final_score', { ascending: false, nullsFirst: false })
      .order('published_at', { ascending: false, nullsFirst: false })
  } else {
    query = query.order('published_at', { ascending: false })
  }

  if (category)               query = query.eq('category', category)
  if (sourceTier)             query = query.eq('sources.source_tier', sourceTier)
  if (minScore !== undefined) query = query.gte('final_score', minScore)
  if (maxScore !== undefined) query = query.lte('final_score', maxScore)
  if (status)                 query = query.eq('status', status)
  if (search)                 query = query.or(`title.ilike.%${search}%,summary.ilike.%${search}%`)

  const { data, error } = await query
  if (error) { console.error('[db/items] listItemsWithSource:', error.message); return [] }
  return (data ?? []) as unknown as DbItemWithSource[]
}

export async function listSelectedItemsWithSource(
  options: Omit<ListItemsOptions, 'minScore' | 'status'> = {},
): Promise<DbItemWithSource[]> {
  return listItemsWithSource({ ...options, minScore: 75, status: 'selected' })
}

/**
 * Fetch items for rule-based scoring — joins full source metadata.
 * Returns items with status 'new' or 'scored', most recently fetched first.
 */
export async function listItemsForScoring(limit = 100): Promise<DbItemForScoring[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase
    .from('items')
    .select('*, sources!items_source_id_fkey(name, source_tier, is_official, reliability_score, base_score)')
    .in('status', ['new', 'scored'])
    .order('fetched_at', { ascending: false })
    .limit(limit)
  if (error) { console.error('[db/items] listItemsForScoring:', error.message); return [] }
  return (data ?? []) as unknown as DbItemForScoring[]
}

/**
 * Apply rule-based scores to a single item.
 * Uses supabaseServer so it works from API routes without anon-key write limits.
 */
export async function updateItemRuleScore(
  id:     string,
  scores: { source_score: number; evidence_score: number; final_score: number },
): Promise<boolean> {
  if (!isServerSupabaseConfigured || !supabaseServer) return false
  const { error } = await supabaseServer
    .from('items')
    .update({
      source_score:   scores.source_score,
      evidence_score: scores.evidence_score,
      final_score:    scores.final_score,
      status:         'scored' as DbItemStatus,
    })
    .eq('id', id)
  if (error) { console.error('[db/items] updateItemRuleScore:', error.message); return false }
  return true
}

export async function getItemById(id: string): Promise<DbItem | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('id', id)
    .single()
  if (error) { console.error('[db/items] getItemById:', error.message); return null }
  return data
}

export async function createItem(input: DbItemInsert): Promise<DbItem | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('items')
    .insert(input)
    .select()
    .single()
  if (error) { console.error('[db/items] createItem:', error.message); return null }
  return data
}

/**
 * Insert an item only if its URL has not been seen before.
 * Returns 'inserted' | 'duplicate' | 'error'.
 * The URL column has a UNIQUE constraint; code 23505 = unique_violation.
 */
export async function insertItemIfNew(
  input: DbItemInsert,
): Promise<'inserted' | 'duplicate' | 'error'> {
  if (!isSupabaseConfigured || !supabase) return 'error'
  const { error } = await supabase.from('items').insert(input)
  if (!error) return 'inserted'
  if (error.code === '23505') return 'duplicate'
  console.error('[db/items] insertItemIfNew:', error.message)
  return 'error'
}

/** Apply AI dimension scores + code-computed final_score.
 *  Caller MUST compute final_score via calculateFinalScore() before calling this. */
export async function updateItemScore(id: string, scoreInput: DbItemScoreUpdate): Promise<DbItem | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('items')
    .update(scoreInput)
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('[db/items] updateItemScore:', error.message); return null }
  return data
}

export async function archiveItem(id: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false
  const { error } = await supabase
    .from('items')
    .update({ status: 'archived' })
    .eq('id', id)
  if (error) { console.error('[db/items] archiveItem:', error.message); return false }
  return true
}

export async function rejectItem(id: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false
  const { error } = await supabase
    .from('items')
    .update({ status: 'rejected' })
    .eq('id', id)
  if (error) { console.error('[db/items] rejectItem:', error.message); return false }
  return true
}

/**
 * Upsert an item by canonical URL (dedup-safe, no UNIQUE constraint on canonical_url).
 *
 * Lookup order:
 *   1. canonical_url match (if provided)
 *   2. url match (UNIQUE constraint)
 *   3. Insert new item
 *
 * Never returns null — throws on any Supabase error with full diagnostic info.
 * Uses supabaseServer so API routes can write even when RLS is added later.
 */
export async function upsertItemByCanonicalUrl(
  row: DbItemInsert,
): Promise<UpsertItemResult> {
  if (!isServerSupabaseConfigured || !supabaseServer) {
    throw new Error('[db/items] upsertItemByCanonicalUrl: supabaseServer is not configured')
  }

  // Input validation
  if (!row.title?.trim()) throw new Error('[db/items] upsertItemByCanonicalUrl: title is required')
  if (!row.url?.trim())   throw new Error('[db/items] upsertItemByCanonicalUrl: url is required')

  // 1. Try canonical_url lookup
  if (row.canonical_url) {
    const { data: byCanonical, error: e1 } = await supabaseServer
      .from('items')
      .select('id')
      .eq('canonical_url', row.canonical_url)
      .limit(1)
      .maybeSingle()
    if (e1) throw new Error(`[db/items] lookup by canonical_url: ${e1.message} (code: ${e1.code})`)
    if (byCanonical?.id) return { id: byCanonical.id, status: 'reused' }
  }

  // 2. Try url lookup (UNIQUE)
  const { data: byUrl, error: e2 } = await supabaseServer
    .from('items')
    .select('id')
    .eq('url', row.url)
    .maybeSingle()
  if (e2) throw new Error(`[db/items] lookup by url: ${e2.message} (code: ${e2.code})`)
  if (byUrl?.id) return { id: byUrl.id, status: 'reused' }

  // 3. Insert
  const { data, error } = await supabaseServer
    .from('items')
    .insert(row)
    .select('id')
    .single()

  if (error) {
    // Race condition on the url UNIQUE constraint — retry lookup
    if (error.code === '23505') {
      const { data: race } = await supabaseServer
        .from('items').select('id').eq('url', row.url).maybeSingle()
      if (race?.id) return { id: race.id, status: 'reused' }
    }
    // Include diagnostic info (no keys, no raw_payload content)
    const payloadKeys = Object.keys(row)
      .filter(k => row[k as keyof DbItemInsert] !== undefined)
      .join(', ')
    throw new Error(
      `[db/items] insert failed — ${error.message}` +
      ` | code: ${error.code ?? 'n/a'}` +
      ` | details: ${error.details ?? 'none'}` +
      ` | hint: ${error.hint ?? 'none'}` +
      ` | title: "${row.title}"` +
      ` | url: "${row.url}"` +
      ` | canonical_url: "${row.canonical_url ?? 'none'}"` +
      ` | payload keys: [${payloadKeys}]`
    )
  }

  if (!data?.id) {
    throw new Error(
      `[db/items] insert returned null without error — title: "${row.title}", url: "${row.url}"`
    )
  }

  return { id: data.id, status: 'inserted' }
}

// ── Article Content Extraction v1 ─────────────────────────────────────────────

export type ArticleContentPayload = {
  finalUrl:     string
  title:        string | null
  siteName:     string | null
  author:       string | null
  publishedAt:  string | null
  excerpt:      string | null
  cleanText:    string
  wordCount:    number
  coverImageUrl: string | null
  mediaUrls:    string[]
  contentHash:  string
}

/**
 * Write successfully extracted article content to an item.
 * Does NOT modify final_score, data_origin, or source_id.
 */
export async function updateItemArticleContent(
  itemId:  string,
  payload: ArticleContentPayload,
): Promise<boolean> {
  if (!isServerSupabaseConfigured || !supabaseServer) return false
  const { error } = await supabaseServer
    .from('items')
    .update({
      content_fetch_status:  'fetched',
      content_fetched_at:    new Date().toISOString(),
      content_error_message: null,
      content_source_url:    payload.finalUrl,
      article_title:         payload.title,
      article_author:        payload.author,
      article_site_name:     payload.siteName,
      article_published_at:  payload.publishedAt,
      article_excerpt:       payload.excerpt,
      clean_text:            payload.cleanText,
      content_word_count:    payload.wordCount,
      cover_image_url:       payload.coverImageUrl,
      media_urls:            payload.mediaUrls,
      content_hash:          payload.contentHash,
    })
    .eq('id', itemId)
  if (error) { console.error('[db/items] updateItemArticleContent:', error.message); return false }
  return true
}

/**
 * Record a failed content fetch attempt.
 */
export async function markItemContentFetchFailed(
  itemId:       string,
  errorMessage: string,
  sourceUrl?:   string,
): Promise<boolean> {
  if (!isServerSupabaseConfigured || !supabaseServer) return false
  const { error } = await supabaseServer
    .from('items')
    .update({
      content_fetch_status:  'failed',
      content_fetched_at:    new Date().toISOString(),
      content_error_message: errorMessage.slice(0, 500),
      content_source_url:    sourceUrl ?? null,
    })
    .eq('id', itemId)
  if (error) { console.error('[db/items] markItemContentFetchFailed:', error.message); return false }
  return true
}

// ── Analysis Queue / Token Budget Gate v1 ────────────────────────────────────

export type AnalysisGatePayload = {
  analysisTier:           string
  analysisPriority:       string
  analysisStage:          string
  analysisReason:         string
  tokenBudgetTier:        string
  estimatedInputTokens:   number
  estimatedOutputTokens:  number
  estimatedTotalTokens:   number
  shouldDeepAnalyze:      boolean
  shouldTrackEvent:       boolean
  shouldEnterDailyReport: boolean
  shouldEnterTopicPool:   boolean
}

/**
 * Write analysis gate decision to an item.
 * Does NOT modify final_score, data_origin, or content fields.
 */
export async function updateItemAnalysisGate(
  itemId:  string,
  payload: AnalysisGatePayload,
): Promise<boolean> {
  if (!isServerSupabaseConfigured || !supabaseServer) return false
  const now = new Date().toISOString()
  const { error } = await supabaseServer
    .from('items')
    .update({
      analysis_tier:              payload.analysisTier,
      analysis_priority:          payload.analysisPriority,
      analysis_stage:             payload.analysisStage,
      analysis_reason:            payload.analysisReason,
      token_budget_tier:          payload.tokenBudgetTier,
      estimated_input_tokens:     payload.estimatedInputTokens,
      estimated_output_tokens:    payload.estimatedOutputTokens,
      estimated_total_tokens:     payload.estimatedTotalTokens,
      should_deep_analyze:        payload.shouldDeepAnalyze,
      should_track_event:         payload.shouldTrackEvent,
      should_enter_daily_report:  payload.shouldEnterDailyReport,
      should_enter_topic_pool:    payload.shouldEnterTopicPool,
      analysis_queued_at:         now,
      analysis_updated_at:        now,
    })
    .eq('id', itemId)
  if (error) { console.error('[db/items] updateItemAnalysisGate:', error.message); return false }
  return true
}

// ── Evidence & Truth Scoring v1 ───────────────────────────────────────────────

export type EvidenceUpdatePayload = {
  truthScore:        number
  evScore:           number
  sourceTraceScore:  number
  claimStatus:       string
  evidenceLevel:     string
  sourceNature:      string
  hasOriginalSource: boolean
  hasAuthor:         boolean
  hasPublishedTime:  boolean
  hasArticleContent: boolean
  hasMediaEvidence:  boolean
  evidenceNotes:     string
  truthNotes:        string
}

/**
 * Write evidence/truth profile to an item.
 * Does NOT modify final_score, data_origin, source_id, or content fields.
 */
export async function updateItemEvidenceProfile(
  itemId:  string,
  payload: EvidenceUpdatePayload,
): Promise<boolean> {
  if (!isServerSupabaseConfigured || !supabaseServer) return false
  const { error } = await supabaseServer
    .from('items')
    .update({
      truth_score:          payload.truthScore,
      ev_score:             payload.evScore,
      source_trace_score:   payload.sourceTraceScore,
      claim_status:         payload.claimStatus,
      evidence_level:       payload.evidenceLevel,
      source_nature:        payload.sourceNature,
      has_original_source:  payload.hasOriginalSource,
      has_author:           payload.hasAuthor,
      has_published_time:   payload.hasPublishedTime,
      has_article_content:  payload.hasArticleContent,
      has_media_evidence:   payload.hasMediaEvidence,
      evidence_notes:       payload.evidenceNotes,
      truth_notes:          payload.truthNotes,
      evidence_checked_at:  new Date().toISOString(),
    })
    .eq('id', itemId)
  if (error) { console.error('[db/items] updateItemEvidenceProfile:', error.message); return false }
  return true
}

/**
 * Fetch a single item by ID for content extraction (uses server client).
 */
export async function getItemForContentFetch(itemId: string): Promise<DbItem | null> {
  if (!isServerSupabaseConfigured || !supabaseServer) return null
  const { data, error } = await supabaseServer
    .from('items')
    .select('*, sources!items_source_id_fkey(source_tier)')
    .eq('id', itemId)
    .single()
  if (error) { console.error('[db/items] getItemForContentFetch:', error.message); return null }
  const row = data as DbItem & { sources?: { source_tier?: DbSourceTier | null } | null }
  const { sources, ...item } = row
  return { ...item, source_tier: sources?.source_tier ?? null }
}
