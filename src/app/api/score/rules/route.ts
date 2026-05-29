import { type NextRequest, NextResponse } from 'next/server'
import { listItemsForScoring, updateItemRuleScore } from '@/lib/db/items'
import { computeRuleScore } from '@/lib/scoring/rule-score'
import { isSupabaseConfigured } from '@/lib/supabase/client'
import { isServerSupabaseConfigured } from '@/lib/supabase/server'
import type { DbItemForScoring } from '@/lib/db/items'
import type { RuleScoreInput } from '@/lib/scoring/rule-score'

/**
 * GET /api/score/rules           — dry-run: compute scores without writing
 * GET /api/score/rules?limit=50  — dry-run with limit
 * POST /api/score/rules          — apply scores to DB
 * POST /api/score/rules?limit=50 — apply scores with limit
 *
 * Scores items with status 'new' or 'scored' using rule-based heuristics.
 * No AI calls. No external dependencies.
 *
 * Dry-run: needs only Supabase read access (anon key).
 * Write:   needs Supabase write access (server client).
 */

function toScoreInput(item: DbItemForScoring): RuleScoreInput {
  return {
    id:               item.id,
    title:            item.title,
    summary:          item.summary,
    published_at:     item.published_at,
    fetched_at:       item.fetched_at,
    provider_signal:  item.provider_signal,
    source_id:        item.source_id,
    source_tier:      item.sources?.source_tier ?? undefined,
    is_official:      item.sources?.is_official ?? false,
    reliability_score: item.sources?.reliability_score,
    base_score:       item.sources?.base_score,
    category:         item.category,
  }
}

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({
      ok:      true,
      mode:    'dry-run',
      skipped: true,
      reason:  'Supabase is not configured — dry-run requires read access',
    })
  }

  try {
    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100)

    const items = await listItemsForScoring(limit)
    if (items.length === 0) {
      return NextResponse.json({
        ok: true, mode: 'dry-run', totalCandidates: 0, sample: [],
        hint: 'No items with status="new" or "scored" found. Run POST /api/ingest/rss first.',
      })
    }

    const sample = items.slice(0, Math.min(limit, 5)).map(item => {
      const result = computeRuleScore(toScoreInput(item))
      return {
        id:             item.id,
        title:          item.title.slice(0, 80),
        oldFinalScore:  item.final_score,
        newFinalScore:  result.final_score,
        sourceScore:    result.source_score,
        evidenceScore:  result.evidence_score,
        freshnessScore: result.freshness_score,
        relevanceScore: result.relevance_score,
        penalties:      result.penalties,
        reasons:        result.reasons,
      }
    })

    return NextResponse.json({
      ok:              true,
      mode:            'dry-run',
      totalCandidates: items.length,
      sample,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/score/rules GET]', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({
      ok:    false,
      error: 'Supabase is not configured',
      hint:  'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local',
    }, { status: 400 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 500)

    const items = await listItemsForScoring(limit)
    if (items.length === 0) {
      return NextResponse.json({
        ok: true, mode: 'database', scored: 0, failed: 0, errors: [],
        hint: 'No items with status="new" or "scored" found.',
      })
    }

    let scored = 0
    let failed = 0
    const errors: Array<{ id: string; title: string; message: string }> = []

    for (const item of items) {
      try {
        const result  = computeRuleScore(toScoreInput(item))
        const success = await updateItemRuleScore(item.id, {
          source_score:   result.source_score,
          evidence_score: result.evidence_score,
          final_score:    result.final_score,
        })
        if (success) scored++
        else {
          failed++
          errors.push({ id: item.id, title: item.title.slice(0, 60), message: 'updateItemRuleScore returned false' })
        }
      } catch (err) {
        failed++
        errors.push({ id: item.id, title: item.title.slice(0, 60), message: err instanceof Error ? err.message : String(err) })
      }
    }

    const ok = scored > 0 || items.length === 0
    return NextResponse.json({ ok, mode: 'database', scored, failed, errors }, { status: ok ? 200 : 500 })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/score/rules POST]', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
