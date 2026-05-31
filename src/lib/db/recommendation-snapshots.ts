/**
 * DB layer for recommendation_snapshots + recommendation_snapshot_items.
 *
 * Graceful degradation goals:
 * 1) Supabase unavailable -> return null/[] without throwing.
 * 2) Snapshot tables not migrated -> return null/[] without throwing.
 * 3) Deep-dive columns not migrated -> still write legacy rows and return stable deepDive payload.
 */

import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'
import { cleanText } from '@/lib/text/clean-text'
import {
  generateDeterministicDeepDive,
  type RecommendationDeepDive,
} from '@/lib/recommendations/deep-dive'
import type {
  RecommendedItem,
  RecommendationTier,
  EngineSourceStatus,
  EngineEvidenceLevel,
} from '@/lib/recommendations/recommendation-engine'

export type SnapshotStatus = 'success' | 'partial_success' | 'failed'

export type RecommendationSnapshotInsert = {
  run_id?: string | null
  status: SnapshotStatus
  window_hours: number
  limit_count: number
  captured_total: number
  recommendation_candidates: number
  must_read_count: number
  high_value_count: number
  observe_count: number
  archive_count: number
  generated_at?: string
  metadata?: Record<string, unknown>
}

export type RecommendationSnapshotView = {
  id: string
  run_id: string | null
  status: SnapshotStatus
  window_hours: number
  limit_count: number
  captured_total: number
  recommendation_candidates: number
  must_read_count: number
  high_value_count: number
  observe_count: number
  archive_count: number
  generated_at: string
  created_at: string
  metadata: Record<string, unknown>
  items: RecommendedItem[]
}

export type RecommendationSnapshotSummary = Omit<RecommendationSnapshotView, 'items'>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db() { return supabaseServer as any }

function isMissingTable(err: { code?: string | null; message?: string | null; details?: string | null }): boolean {
  const code = err.code ?? ''
  const msg = (err.message ?? '').toLowerCase()
  const det = (err.details ?? '').toLowerCase()
  return (
    code === '42P01' || // relation does not exist
    code === 'PGRST200' ||
    code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    msg.includes('could not find the table') ||
    msg.includes('could not find a relationship') ||
    det.includes('schema cache') ||
    det.includes('does not exist')
  )
}

function isMissingColumn(err: { code?: string | null; message?: string | null; details?: string | null }): boolean {
  const code = err.code ?? ''
  const msg = (err.message ?? '').toLowerCase()
  const det = (err.details ?? '').toLowerCase()
  return (
    code === '42703' || // undefined_column
    code === 'PGRST204' ||
    (msg.includes('column') && msg.includes('does not exist')) ||
    (msg.includes('schema cache') && msg.includes('column')) ||
    (det.includes('column') && det.includes('does not exist'))
  )
}

function looksGarbled(text: string): boolean {
  if (!text || text.length < 4) return false
  return (
    text.includes('芒鈧') ||
    text.includes('脙') ||
    text.includes('锟') ||
    text.includes('聙') ||
    /[�]/.test(text)
  )
}

function sanitizeDisplayText(value: string | null | undefined, fallback = ''): string {
  if (!value) return fallback
  const cleaned = cleanText(value)
  if (!cleaned || looksGarbled(cleaned)) return fallback
  return cleaned
}

function safeText(value: string | null | undefined, fallback = ''): string {
  if (!value) return fallback
  const cleaned = cleanText(value)
  if (!cleaned || looksGarbled(cleaned)) return fallback
  return cleaned
}

const FALLBACK_REASON = '综合分和证据基础达到推荐阈值，适合作为今日候选。'
const FALLBACK_RISK = '当前结论仍需结合后续多源信息复核。'
const FALLBACK_STEP = '优先查看原文和来源链路，再决定是否升级处理。'

function ensureDeepDive(item: RecommendedItem): RecommendationDeepDive {
  if (item.deepDive) return item.deepDive
  return generateDeterministicDeepDive({
    title: item.title,
    summary: item.summary,
    source: item.source,
    sourceTier: item.sourceTier,
    category: item.category,
    finalScore: item.finalScore,
    evScore: item.evScore,
    truthScore: item.truthScore,
    sourceTraceScore: null,
    recommendationTier: item.recommendationTier,
    sourceStatus: item.sourceStatus,
    recommendationReason: item.recommendationReason,
    riskNote: item.riskNote,
    nextStep: item.nextStep,
    shouldTrackEvent: item.shouldTrackEvent,
    shouldEnterDailyReport: item.shouldEnterDailyReport,
    shouldDeepAnalyze: item.shouldDeepAnalyze,
    analysisTier: item.analysisTier,
    publishedAt: item.publishedAt,
    fetchedAt: item.fetchedAt,
    originalUrl: item.originalUrl,
  })
}

function stripDeepDiveColumns<T extends Record<string, unknown>>(row: T): Omit<T,
  | 'deep_dive_status'
  | 'deep_dive_generated_at'
  | 'deep_dive_model'
  | 'deep_summary'
  | 'background_context'
  | 'why_it_matters'
  | 'user_insight'
  | 'risk_and_uncertainty'
  | 'follow_up_suggestion'
  | 'source_reading_guide'
> {
  const legacy = { ...row }
  delete legacy.deep_dive_status
  delete legacy.deep_dive_generated_at
  delete legacy.deep_dive_model
  delete legacy.deep_summary
  delete legacy.background_context
  delete legacy.why_it_matters
  delete legacy.user_insight
  delete legacy.risk_and_uncertainty
  delete legacy.follow_up_suggestion
  delete legacy.source_reading_guide
  return legacy
}

function itemToRow(item: RecommendedItem, snapshotId: string, rank: number) {
  const deepDive = ensureDeepDive(item)
  return {
    snapshot_id: snapshotId,
    item_id: item.id || null,
    rank,
    section: item.recommendationTier,
    title: safeText(item.title, '(no title)'),
    summary: safeText(item.summary) || null,
    url: item.originalUrl || null,
    source_name: safeText(item.source) || null,
    source_tier: item.sourceTier || null,
    category: item.category || null,
    published_at: item.publishedAt || null,
    fetched_at: item.fetchedAt || null,
    final_score: Math.round(item.finalScore),
    signal_score: Math.round(item.signalScore),
    evidence_score: item.evScore != null ? Math.round(item.evScore) : null,
    recommendation_score: Math.round(item.recommendationScore),
    recommendation_tier: item.recommendationTier,
    source_status: item.sourceStatus,
    quality_flags: item.qualityFlags ?? [],
    recommendation_reason: safeText(item.recommendationReason, FALLBACK_REASON) || null,
    risk_note: safeText(item.riskNote, FALLBACK_RISK) || null,
    next_step: safeText(item.nextStep, FALLBACK_STEP) || null,
    deep_dive_status: safeText(deepDive.status, 'generated') || 'generated',
    deep_dive_generated_at: deepDive.generatedAt || new Date().toISOString(),
    deep_dive_model: safeText(deepDive.model, 'deterministic-v1') || 'deterministic-v1',
    deep_summary: safeText(deepDive.summary || deepDive.deepSummary) || null,
    background_context: safeText(deepDive.backgroundContext) || null,
    why_it_matters: safeText(deepDive.whyItMatters) || null,
    user_insight: safeText(deepDive.userInsight) || null,
    risk_and_uncertainty: safeText(deepDive.riskAndUncertainty) || null,
    follow_up_suggestion: safeText(deepDive.followUpSuggestion) || null,
    source_reading_guide: safeText(deepDive.sourceReadingGuide) || null,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildDeepDiveFromRow(row: any, item: RecommendedItem): RecommendationDeepDive {
  const generated = generateDeterministicDeepDive({
    title: item.title,
    summary: item.summary,
    source: item.source,
    sourceTier: item.sourceTier,
    category: item.category,
    finalScore: item.finalScore,
    evScore: item.evScore,
    truthScore: item.truthScore,
    recommendationTier: item.recommendationTier,
    sourceStatus: item.sourceStatus,
    recommendationReason: item.recommendationReason,
    riskNote: item.riskNote,
    nextStep: item.nextStep,
    shouldTrackEvent: item.shouldTrackEvent,
    shouldEnterDailyReport: item.shouldEnterDailyReport,
    shouldDeepAnalyze: item.shouldDeepAnalyze,
    analysisTier: item.analysisTier,
    publishedAt: item.publishedAt,
    fetchedAt: item.fetchedAt,
    originalUrl: item.originalUrl,
  })

  return {
    status: sanitizeDisplayText(row.deep_dive_status, generated.status) as RecommendationDeepDive['status'],
    generatedAt: row.deep_dive_generated_at ?? generated.generatedAt,
    model: sanitizeDisplayText(row.deep_dive_model, generated.model),
    summary: sanitizeDisplayText(row.deep_summary, generated.summary),
    deepSummary: sanitizeDisplayText(row.deep_summary, generated.deepSummary),
    backgroundContext: sanitizeDisplayText(row.background_context, generated.backgroundContext),
    whyItMatters: sanitizeDisplayText(row.why_it_matters, generated.whyItMatters),
    userInsight: sanitizeDisplayText(row.user_insight, generated.userInsight),
    riskAndUncertainty: sanitizeDisplayText(row.risk_and_uncertainty, generated.riskAndUncertainty),
    followUpSuggestion: sanitizeDisplayText(row.follow_up_suggestion, generated.followUpSuggestion),
    sourceReadingGuide: sanitizeDisplayText(row.source_reading_guide, generated.sourceReadingGuide),
    deepDiveStatus: sanitizeDisplayText(row.deep_dive_status, generated.deepDiveStatus) as RecommendationDeepDive['deepDiveStatus'],
    deepDiveGeneratedAt: row.deep_dive_generated_at ?? generated.deepDiveGeneratedAt,
    deepDiveModel: sanitizeDisplayText(row.deep_dive_model, generated.deepDiveModel),
  }
}

const FB_TITLE = '标题解析异常，建议查看原文。'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToItem(row: any): RecommendedItem {
  const item: RecommendedItem = {
    id: row.item_id ?? row.id,
    title: sanitizeDisplayText(row.title, FB_TITLE),
    summary: sanitizeDisplayText(row.summary, ''),
    source: sanitizeDisplayText(row.source_name, 'Unknown'),
    sourceTier: row.source_tier ?? 'C',
    publishedAt: row.published_at ?? row.created_at,
    fetchedAt: row.fetched_at ?? null,
    category: row.category ?? '其他',
    tags: [],
    originalUrl: row.url ?? '',
    finalScore: row.final_score ?? 0,
    isUserCurated: row.source_status === 'user_curated',
    isOfficial: row.source_status === 'official',
    evScore: row.evidence_score ?? null,
    truthScore: null,
    shouldTrackEvent: false,
    shouldEnterDailyReport: false,
    shouldDeepAnalyze: false,
    analysisTier: null,
    wordCount: null,
    signalScore: row.signal_score ?? 0,
    recommendationScore: row.recommendation_score ?? 0,
    recommendationTier: (row.recommendation_tier ?? 'observe') as RecommendationTier,
    sourceStatus: (row.source_status ?? 'single_source') as EngineSourceStatus,
    evidenceLevel: 'unknown' as EngineEvidenceLevel,
    qualityFlags: Array.isArray(row.quality_flags) ? row.quality_flags : [],
    recommendationReason: sanitizeDisplayText(row.recommendation_reason, FALLBACK_REASON),
    riskNote: sanitizeDisplayText(row.risk_note, FALLBACK_RISK),
    nextStep: sanitizeDisplayText(row.next_step, FALLBACK_STEP),
  }

  item.deepDive = buildDeepDiveFromRow(row, item)
  return item
}

export async function createRecommendationSnapshot(
  meta: RecommendationSnapshotInsert,
  items: RecommendedItem[],
): Promise<string | null> {
  if (!isServerSupabaseConfigured || !supabaseServer) return null

  try {
    const { data: snap, error: snapErr } = await db()
      .from('recommendation_snapshots')
      .insert({
        run_id: meta.run_id ?? null,
        status: meta.status,
        window_hours: meta.window_hours,
        limit_count: meta.limit_count,
        captured_total: meta.captured_total,
        recommendation_candidates: meta.recommendation_candidates,
        must_read_count: meta.must_read_count,
        high_value_count: meta.high_value_count,
        observe_count: meta.observe_count,
        archive_count: meta.archive_count,
        generated_at: meta.generated_at ?? new Date().toISOString(),
        metadata: meta.metadata ?? {},
      })
      .select('id')
      .single()

    if (snapErr) {
      if (isMissingTable(snapErr)) {
        console.warn('[db/recommendation-snapshots] table not ready. Run supabase/recommendation-snapshots-v1.sql')
        return null
      }
      console.error('[db/recommendation-snapshots] insert snapshot:', snapErr.message)
      return null
    }

    const snapshotId = (snap as { id: string }).id

    if (items.length > 0) {
      const rows = items.map((item, idx) => itemToRow(item, snapshotId, idx + 1))

      const { error: itemsErr } = await db()
        .from('recommendation_snapshot_items')
        .insert(rows)

      if (itemsErr) {
        if (isMissingColumn(itemsErr)) {
          console.warn('[db/recommendation-snapshots] deep-dive columns missing; writing legacy snapshot items only')
          const fallbackRows = rows.map(stripDeepDiveColumns)
          const { error: legacyErr } = await db()
            .from('recommendation_snapshot_items')
            .insert(fallbackRows)
          if (legacyErr && !isMissingTable(legacyErr)) {
            console.error('[db/recommendation-snapshots] insert legacy items failed:', legacyErr.message)
          }
        } else if (!isMissingTable(itemsErr)) {
          console.error('[db/recommendation-snapshots] insert items:', itemsErr.message)
        }
      }
    }

    return snapshotId
  } catch (err) {
    console.error('[db/recommendation-snapshots] createRecommendationSnapshot:', err)
    return null
  }
}

export async function getLatestRecommendationSnapshot(): Promise<RecommendationSnapshotView | null> {
  if (!isServerSupabaseConfigured || !supabaseServer) return null

  try {
    const { data: snap, error: snapErr } = await db()
      .from('recommendation_snapshots')
      .select('*')
      .in('status', ['success', 'partial_success'])
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (snapErr) {
      if (isMissingTable(snapErr)) return null
      console.error('[db/recommendation-snapshots] getLatest snapshot:', snapErr.message)
      return null
    }
    if (!snap) return null

    const { data: rows, error: itemsErr } = await db()
      .from('recommendation_snapshot_items')
      .select('*')
      .eq('snapshot_id', snap.id)
      .order('rank', { ascending: true })

    if (itemsErr && !isMissingTable(itemsErr)) {
      console.error('[db/recommendation-snapshots] getLatest items:', itemsErr.message)
    }

    const items = ((rows ?? []) as unknown[]).map(rowToItem)

    return {
      id: snap.id,
      run_id: snap.run_id ?? null,
      status: snap.status as SnapshotStatus,
      window_hours: snap.window_hours,
      limit_count: snap.limit_count,
      captured_total: snap.captured_total,
      recommendation_candidates: snap.recommendation_candidates,
      must_read_count: snap.must_read_count,
      high_value_count: snap.high_value_count,
      observe_count: snap.observe_count,
      archive_count: snap.archive_count,
      generated_at: snap.generated_at,
      created_at: snap.created_at,
      metadata: snap.metadata ?? {},
      items,
    }
  } catch (err) {
    console.error('[db/recommendation-snapshots] getLatestRecommendationSnapshot:', err)
    return null
  }
}

export async function getRecommendationSnapshotById(id: string): Promise<RecommendationSnapshotView | null> {
  if (!isServerSupabaseConfigured || !supabaseServer) return null

  try {
    const { data: snap, error: snapErr } = await db()
      .from('recommendation_snapshots')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (snapErr || !snap) {
      if (snapErr && !isMissingTable(snapErr)) {
        console.error('[db/recommendation-snapshots] getById snapshot:', snapErr.message)
      }
      return null
    }

    const { data: rows, error: itemsErr } = await db()
      .from('recommendation_snapshot_items')
      .select('*')
      .eq('snapshot_id', id)
      .order('rank', { ascending: true })

    if (itemsErr && !isMissingTable(itemsErr)) {
      console.error('[db/recommendation-snapshots] getById items:', itemsErr.message)
    }

    const items = ((rows ?? []) as unknown[]).map(rowToItem)

    return {
      id: snap.id,
      run_id: snap.run_id ?? null,
      status: snap.status as SnapshotStatus,
      window_hours: snap.window_hours,
      limit_count: snap.limit_count,
      captured_total: snap.captured_total,
      recommendation_candidates: snap.recommendation_candidates,
      must_read_count: snap.must_read_count,
      high_value_count: snap.high_value_count,
      observe_count: snap.observe_count,
      archive_count: snap.archive_count,
      generated_at: snap.generated_at,
      created_at: snap.created_at,
      metadata: snap.metadata ?? {},
      items,
    }
  } catch (err) {
    console.error('[db/recommendation-snapshots] getRecommendationSnapshotById:', err)
    return null
  }
}

export async function listRecommendationSnapshots(limit = 20): Promise<RecommendationSnapshotSummary[]> {
  if (!isServerSupabaseConfigured || !supabaseServer) return []

  try {
    const { data, error } = await db()
      .from('recommendation_snapshots')
      .select('*')
      .order('generated_at', { ascending: false })
      .limit(Math.min(limit, 100))

    if (error) {
      if (isMissingTable(error)) return []
      console.error('[db/recommendation-snapshots] list:', error.message)
      return []
    }

    return ((data ?? []) as unknown[]).map((row: unknown) => {
      const snap = row as Record<string, unknown>
      return {
        id: snap.id as string,
        run_id: (snap.run_id as string | null) ?? null,
        status: snap.status as SnapshotStatus,
        window_hours: snap.window_hours as number,
        limit_count: snap.limit_count as number,
        captured_total: snap.captured_total as number,
        recommendation_candidates: snap.recommendation_candidates as number,
        must_read_count: snap.must_read_count as number,
        high_value_count: snap.high_value_count as number,
        observe_count: snap.observe_count as number,
        archive_count: snap.archive_count as number,
        generated_at: snap.generated_at as string,
        created_at: snap.created_at as string,
        metadata: (snap.metadata as Record<string, unknown>) ?? {},
      }
    })
  } catch (err) {
    console.error('[db/recommendation-snapshots] list:', err)
    return []
  }
}
