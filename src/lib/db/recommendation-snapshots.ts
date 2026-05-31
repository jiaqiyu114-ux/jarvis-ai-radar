/**
 * DB layer for recommendation_snapshots + recommendation_snapshot_items.
 *
 * All functions degrade gracefully when:
 *   - Supabase is not configured
 *   - The migration has not been run yet (42P01 = relation does not exist)
 *
 * Uses (supabaseServer as any) for new tables not in generated Supabase types —
 * same pattern as recommendation-runs.ts and insertFetchLog in sources.ts.
 *
 * Text fields are cleaned via cleanText() before storage to prevent
 * mojibake (Ã, â€™, etc.) from appearing in snapshot items.
 */

import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'
import { cleanText } from '@/lib/text/clean-text'
import type { RecommendedItem, RecommendationTier, EngineSourceStatus, EngineEvidenceLevel } from '@/lib/recommendations/recommendation-engine'

// ── Types ─────────────────────────────────────────────────────────────────────

export type SnapshotStatus = 'success' | 'partial_success' | 'failed'

export type RecommendationSnapshotInsert = {
  run_id?:                   string | null
  status:                    SnapshotStatus
  window_hours:              number
  limit_count:               number
  captured_total:            number
  recommendation_candidates: number
  must_read_count:           number
  high_value_count:          number
  observe_count:             number
  archive_count:             number
  generated_at?:             string
  metadata?:                 Record<string, unknown>
}

export type RecommendationSnapshotView = {
  id:                        string
  run_id:                    string | null
  status:                    SnapshotStatus
  window_hours:              number
  limit_count:               number
  captured_total:            number
  recommendation_candidates: number
  must_read_count:           number
  high_value_count:          number
  observe_count:             number
  archive_count:             number
  generated_at:              string
  created_at:                string
  metadata:                  Record<string, unknown>
  items:                     RecommendedItem[]
}

export type RecommendationSnapshotSummary = Omit<RecommendationSnapshotView, 'items'>

// ── Helper: DB client cast ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db() { return supabaseServer as any }

/** Returns true for any error indicating the table/view doesn't exist yet. */
function isMissingTable(err: { code?: string | null; message?: string | null; details?: string | null }): boolean {
  const code = err.code ?? ''
  const msg  = (err.message ?? '').toLowerCase()
  const det  = (err.details  ?? '').toLowerCase()
  return (
    code === '42P01' ||                         // PostgreSQL: relation does not exist
    code === 'PGRST200' || code === 'PGRST205' || // PostgREST: relation/column not found
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||             // PostgREST schema cache miss
    msg.includes('could not find the table') ||
    msg.includes('could not find a relationship') ||
    det.includes('schema cache') ||
    det.includes('does not exist')
  )
}

/** Detect mojibake patterns that survived cleanText(). */
function looksGarbled(text: string): boolean {
  if (!text || text.length < 4) return false
  return (
    text.includes('â€') ||
    text.includes('Ã©') || text.includes('Ã ') || text.includes('Ã¨') ||
    text.includes('â‚¬') ||
    text.includes('�') ||
    /[-]/.test(text)   // C1 control chars common in mojibake
  )
}

/** Sanitize text for display: clean + garbled-check + safe fallback. */
function sanitizeDisplayText(s: string | null | undefined, fallback = ''): string {
  if (!s) return fallback
  const cleaned = cleanText(s)
  if (looksGarbled(cleaned)) return fallback
  return cleaned
}

// ── Text cleaning ─────────────────────────────────────────────────────────────

const FALLBACK_RISK   = '部分原始文本质量较差，需要人工复核。'
const FALLBACK_STEP   = '先查看原文和来源，再决定是否继续跟进。'

/** Sanitize a text field: clean mojibake, trim, fallback if empty. */
function safeText(s: string | null | undefined, fallback = ''): string {
  if (!s) return fallback
  const cleaned = cleanText(s)
  // If cleaning didn't help and result still has mojibake pattern, use fallback
  if (/[Ã¿-ÿ]{2,}|â€|Ã©/.test(cleaned)) return fallback
  return cleaned
}

// ── Map RecommendedItem → snapshot item row ───────────────────────────────────

function itemToRow(item: RecommendedItem, snapshotId: string, rank: number) {
  return {
    snapshot_id:          snapshotId,
    item_id:              item.id || null,
    rank,
    section:              item.recommendationTier,
    title:                safeText(item.title, '(标题缺失)'),
    summary:              safeText(item.summary) || null,
    url:                  item.originalUrl || null,
    source_name:          safeText(item.source) || null,
    source_tier:          item.sourceTier || null,
    category:             item.category || null,
    published_at:         item.publishedAt || null,
    fetched_at:           item.fetchedAt || null,
    final_score:          Math.round(item.finalScore),
    signal_score:         Math.round(item.signalScore),
    evidence_score:       item.evScore != null ? Math.round(item.evScore) : null,
    recommendation_score: Math.round(item.recommendationScore),
    recommendation_tier:  item.recommendationTier,
    source_status:        item.sourceStatus,
    quality_flags:        item.qualityFlags ?? [],
    recommendation_reason: safeText(item.recommendationReason) || null,
    risk_note:            safeText(item.riskNote, FALLBACK_RISK) || null,
    next_step:            safeText(item.nextStep, FALLBACK_STEP) || null,
  }
}

// ── Map snapshot item row → RecommendedItem ───────────────────────────────────

// Fallback text for display layer (applied when field is empty or garbled)
const FB_REASON = '证据较完整，具有继续阅读价值。'
const FB_STEP   = '先查看原文和来源，再决定是否继续跟进。'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToItem(row: any): RecommendedItem {
  // Apply display-layer sanitization: catch any mojibake that slipped through at write time
  const title = sanitizeDisplayText(row.title, '标题解析异常，建议查看原文')
  return {
    id:            row.item_id ?? row.id,
    title,
    summary:       sanitizeDisplayText(row.summary, ''),
    source:        sanitizeDisplayText(row.source_name, 'Unknown'),
    sourceTier:    row.source_tier ?? 'C',
    publishedAt:   row.published_at ?? row.created_at,
    fetchedAt:     row.fetched_at ?? null,
    category:      row.category ?? '其他',
    tags:          [],
    originalUrl:   row.url ?? '',
    finalScore:    row.final_score ?? 0,
    isUserCurated: row.source_status === 'user_curated',
    isOfficial:    row.source_status === 'official',
    evScore:       row.evidence_score ?? null,
    truthScore:    null,
    shouldTrackEvent:       false,
    shouldEnterDailyReport: false,
    shouldDeepAnalyze:      false,
    analysisTier:   null,
    wordCount:      null,
    signalScore:         row.signal_score          ?? 0,
    recommendationScore: row.recommendation_score   ?? 0,
    recommendationTier:  (row.recommendation_tier   ?? 'observe') as RecommendationTier,
    sourceStatus:        (row.source_status          ?? 'single_source') as EngineSourceStatus,
    evidenceLevel:       'unknown' as EngineEvidenceLevel,
    qualityFlags:  Array.isArray(row.quality_flags) ? row.quality_flags : [],
    // Sanitize human-readable text with safe fallbacks
    recommendationReason: sanitizeDisplayText(row.recommendation_reason, FB_REASON),
    riskNote:             sanitizeDisplayText(row.risk_note, '') || '',
    nextStep:             sanitizeDisplayText(row.next_step, FB_STEP),
  }
}

// ── Public functions ──────────────────────────────────────────────────────────

/**
 * Persist a fresh recommendation snapshot and all its items.
 * Returns the new snapshot ID, or null if the write fails.
 *
 * Items are batch-inserted in a single round trip.
 * Text fields are cleaned before storage to prevent mojibake.
 */
export async function createRecommendationSnapshot(
  meta:  RecommendationSnapshotInsert,
  items: RecommendedItem[],
): Promise<string | null> {
  if (!isServerSupabaseConfigured || !supabaseServer) return null

  try {
    // 1. Insert snapshot metadata
    const { data: snap, error: snapErr } = await db()
      .from('recommendation_snapshots')
      .insert({
        run_id:                   meta.run_id ?? null,
        status:                   meta.status,
        window_hours:             meta.window_hours,
        limit_count:              meta.limit_count,
        captured_total:           meta.captured_total,
        recommendation_candidates: meta.recommendation_candidates,
        must_read_count:          meta.must_read_count,
        high_value_count:         meta.high_value_count,
        observe_count:            meta.observe_count,
        archive_count:            meta.archive_count,
        generated_at:             meta.generated_at ?? new Date().toISOString(),
        metadata:                 meta.metadata ?? {},
      })
      .select('id')
      .single()

    if (snapErr) {
      if (isMissingTable(snapErr)) { console.warn('[db/recommendation-snapshots] table not ready — run supabase/recommendation-snapshots-v1.sql'); return null }
      console.error('[db/recommendation-snapshots] insert snapshot:', snapErr.message)
      return null
    }

    const snapshotId = (snap as { id: string }).id

    // 2. Batch insert items (skip if no items)
    if (items.length > 0) {
      const rows = items.map((item, idx) => itemToRow(item, snapshotId, idx + 1))

      const { error: itemsErr } = await db()
        .from('recommendation_snapshot_items')
        .insert(rows)

      if (itemsErr) {
        if (!isMissingTable(itemsErr)) {
          console.error('[db/recommendation-snapshots] insert items:', itemsErr.message)
        }
        // Items failed but snapshot exists — it'll have zero items; non-fatal
      }
    }

    return snapshotId
  } catch (err) {
    console.error('[db/recommendation-snapshots] createRecommendationSnapshot:', err)
    return null
  }
}

/**
 * Fetch the most recent success/partial_success snapshot with its items.
 * Returns null when no snapshot exists or the table is missing.
 */
export async function getLatestRecommendationSnapshot(): Promise<RecommendationSnapshotView | null> {
  if (!isServerSupabaseConfigured || !supabaseServer) return null

  try {
    // 1. Get latest snapshot metadata
    const { data: snap, error: snapErr } = await db()
      .from('recommendation_snapshots')
      .select('*')
      .in('status', ['success', 'partial_success'])
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (snapErr) {
      if (isMissingTable(snapErr)) { console.warn('[db/recommendation-snapshots] table not ready (getLatest)'); return null }
      console.error('[db/recommendation-snapshots] getLatest snapshot:', snapErr.message)
      return null
    }
    if (!snap) return null

    // 2. Get items ordered by rank
    const { data: rows, error: itemsErr } = await db()
      .from('recommendation_snapshot_items')
      .select('*')
      .eq('snapshot_id', snap.id)
      .order('rank', { ascending: true })

    if (itemsErr) {
      if (!isMissingTable(itemsErr)) {
        console.error('[db/recommendation-snapshots] getLatest items:', itemsErr.message)
      }
    }

    const items = ((rows ?? []) as unknown[]).map(rowToItem)

    return {
      id:                        snap.id,
      run_id:                    snap.run_id ?? null,
      status:                    snap.status as SnapshotStatus,
      window_hours:              snap.window_hours,
      limit_count:               snap.limit_count,
      captured_total:            snap.captured_total,
      recommendation_candidates: snap.recommendation_candidates,
      must_read_count:           snap.must_read_count,
      high_value_count:          snap.high_value_count,
      observe_count:             snap.observe_count,
      archive_count:             snap.archive_count,
      generated_at:              snap.generated_at,
      created_at:                snap.created_at,
      metadata:                  snap.metadata ?? {},
      items,
    }
  } catch (err) {
    console.error('[db/recommendation-snapshots] getLatestRecommendationSnapshot:', err)
    return null
  }
}

/**
 * Fetch a specific snapshot by ID with its items.
 */
export async function getRecommendationSnapshotById(
  id: string,
): Promise<RecommendationSnapshotView | null> {
  if (!isServerSupabaseConfigured || !supabaseServer) return null

  try {
    const { data: snap, error: snapErr } = await db()
      .from('recommendation_snapshots')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (snapErr || !snap) {
      if (snapErr && !isMissingTable(snapErr)) {
        console.error('[db/recommendation-snapshots] getById:', snapErr.message)
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
      id:                        snap.id,
      run_id:                    snap.run_id ?? null,
      status:                    snap.status as SnapshotStatus,
      window_hours:              snap.window_hours,
      limit_count:               snap.limit_count,
      captured_total:            snap.captured_total,
      recommendation_candidates: snap.recommendation_candidates,
      must_read_count:           snap.must_read_count,
      high_value_count:          snap.high_value_count,
      observe_count:             snap.observe_count,
      archive_count:             snap.archive_count,
      generated_at:              snap.generated_at,
      created_at:                snap.created_at,
      metadata:                  snap.metadata ?? {},
      items,
    }
  } catch (err) {
    console.error('[db/recommendation-snapshots] getRecommendationSnapshotById:', err)
    return null
  }
}

/**
 * List recent snapshots (metadata only, no items).
 */
export async function listRecommendationSnapshots(
  limit = 20,
): Promise<RecommendationSnapshotSummary[]> {
  if (!isServerSupabaseConfigured || !supabaseServer) return []

  try {
    const { data, error } = await db()
      .from('recommendation_snapshots')
      .select('*')
      .order('generated_at', { ascending: false })
      .limit(Math.min(limit, 100))

    if (error) {
      if (isMissingTable(error)) { console.warn('[db/recommendation-snapshots] table not ready (list)'); return [] }
      console.error('[db/recommendation-snapshots] list:', error.message)
      return []
    }

    return ((data ?? []) as unknown[]).map((s: unknown) => {
      const snap = s as Record<string, unknown>
      return {
        id:                        snap.id as string,
        run_id:                    (snap.run_id as string | null) ?? null,
        status:                    (snap.status as SnapshotStatus),
        window_hours:              snap.window_hours as number,
        limit_count:               snap.limit_count as number,
        captured_total:            snap.captured_total as number,
        recommendation_candidates: snap.recommendation_candidates as number,
        must_read_count:           snap.must_read_count as number,
        high_value_count:          snap.high_value_count as number,
        observe_count:             snap.observe_count as number,
        archive_count:             snap.archive_count as number,
        generated_at:              snap.generated_at as string,
        created_at:                snap.created_at as string,
        metadata:                  (snap.metadata as Record<string, unknown>) ?? {},
      }
    })
  } catch (err) {
    console.error('[db/recommendation-snapshots] list:', err)
    return []
  }
}
