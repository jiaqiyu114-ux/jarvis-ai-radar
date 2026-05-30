import { type NextRequest, NextResponse } from 'next/server'
import { isServerSupabaseConfigured } from '@/lib/supabase/server'
import { getItemForContentFetch, updateItemEvidenceProfile } from '@/lib/db/items'
import { buildEvidenceProfile } from '@/lib/scoring/evidence'

/**
 * POST /api/score/evidence
 * Compute and persist evidence/truth profile for a single item.
 *
 * Body: { "itemId": "<uuid>", "force": false }
 *
 * GET /api/score/evidence?itemId=<uuid>
 * Read-only — returns current stored profile without recomputing.
 *
 * Does NOT:
 * - Call any AI / LLM API.
 * - Modify final_score or data_origin.
 * - Use behavioral feedback signals.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 400 })
  }

  let body: { itemId?: unknown; force?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const itemId = typeof body.itemId === 'string' ? body.itemId.trim() : null
  const force  = body.force === true

  if (!itemId || !UUID_RE.test(itemId)) {
    return NextResponse.json({ ok: false, error: 'itemId must be a valid UUID' }, { status: 400 })
  }

  const item = await getItemForContentFetch(itemId)
  if (!item) {
    return NextResponse.json({ ok: false, itemId, error: 'Item not found' }, { status: 404 })
  }

  // Skip if already scored and not forced
  const alreadyScored = Boolean(
    (item as { evidence_checked_at?: string | null }).evidence_checked_at
  )
  if (alreadyScored && !force) {
    const stored = item as {
      truth_score?: number | null
      ev_score?: number | null
      source_trace_score?: number | null
      claim_status?: string | null
      evidence_level?: string | null
      source_nature?: string | null
      has_original_source?: boolean | null
      has_author?: boolean | null
      has_published_time?: boolean | null
      has_article_content?: boolean | null
      has_media_evidence?: boolean | null
      evidence_notes?: string | null
      truth_notes?: string | null
      evidence_checked_at?: string | null
    }
    return NextResponse.json({
      ok:              true,
      itemId,
      cached:          true,
      truthScore:      stored.truth_score,
      evidenceScore:   stored.ev_score,
      sourceTraceScore:stored.source_trace_score,
      claimStatus:     stored.claim_status,
      evidenceLevel:   stored.evidence_level,
      sourceNature:    stored.source_nature,
      hasOriginalSource: stored.has_original_source,
      hasAuthor:       stored.has_author,
      hasPublishedTime:stored.has_published_time,
      hasArticleContent:stored.has_article_content,
      hasMediaEvidence:stored.has_media_evidence,
      evidenceNotes:   stored.evidence_notes,
      truthNotes:      stored.truth_notes,
      checkedAt:       stored.evidence_checked_at,
    })
  }

  // Compute
  const profile = buildEvidenceProfile(item)

  // Persist
  const saved = await updateItemEvidenceProfile(itemId, {
    truthScore:        profile.truthScore,
    evScore:           profile.evidenceScore,
    sourceTraceScore:  profile.sourceTraceScore,
    claimStatus:       profile.claimStatus,
    evidenceLevel:     profile.evidenceLevel,
    sourceNature:      profile.sourceNature,
    hasOriginalSource: profile.hasOriginalSource,
    hasAuthor:         profile.hasAuthor,
    hasPublishedTime:  profile.hasPublishedTime,
    hasArticleContent: profile.hasArticleContent,
    hasMediaEvidence:  profile.hasMediaEvidence,
    evidenceNotes:     profile.evidenceNotes,
    truthNotes:        profile.truthNotes,
  })

  if (!saved) {
    return NextResponse.json({ ok: false, itemId, error: 'Failed to persist evidence profile' }, { status: 500 })
  }

  return NextResponse.json({
    ok:               true,
    itemId,
    cached:           false,
    truthScore:       profile.truthScore,
    evidenceScore:    profile.evidenceScore,
    sourceTraceScore: profile.sourceTraceScore,
    claimStatus:      profile.claimStatus,
    evidenceLevel:    profile.evidenceLevel,
    sourceNature:     profile.sourceNature,
    hasOriginalSource:profile.hasOriginalSource,
    hasAuthor:        profile.hasAuthor,
    hasPublishedTime: profile.hasPublishedTime,
    hasArticleContent:profile.hasArticleContent,
    hasMediaEvidence: profile.hasMediaEvidence,
    evidenceNotes:    profile.evidenceNotes,
    truthNotes:       profile.truthNotes,
    checkedAt:        profile.checkedAt,
  })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const itemId = searchParams.get('itemId')

  if (!itemId || !UUID_RE.test(itemId)) {
    return NextResponse.json({ ok: false, error: 'itemId must be a valid UUID' }, { status: 400 })
  }

  if (!isServerSupabaseConfigured) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 400 })
  }

  const item = await getItemForContentFetch(itemId)
  if (!item) {
    return NextResponse.json({ ok: false, error: 'Item not found' }, { status: 404 })
  }

  const stored = item as {
    truth_score?: number | null
    ev_score?: number | null
    source_trace_score?: number | null
    claim_status?: string | null
    evidence_level?: string | null
    source_nature?: string | null
    evidence_checked_at?: string | null
  }

  return NextResponse.json({
    ok:              true,
    itemId,
    truthScore:      stored.truth_score,
    evidenceScore:   stored.ev_score,
    sourceTraceScore:stored.source_trace_score,
    claimStatus:     stored.claim_status,
    evidenceLevel:   stored.evidence_level,
    sourceNature:    stored.source_nature,
    checkedAt:       stored.evidence_checked_at,
  })
}
