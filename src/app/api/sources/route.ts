import { NextRequest, NextResponse } from 'next/server'
import { getSourcesWithHealth } from '@/lib/data/sources-adapter'
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'
import type { DataOrigin, DbSourceTier } from '@/types/database'

export const dynamic = 'force-dynamic'

const TIER_BASE_SCORE: Record<string, number> = { S: 95, A: 82, B: 70, C: 60, D: 55 }

/** GET /api/sources — list all sources with health fields */
export async function GET() {
  const sources = await getSourcesWithHealth()
  return NextResponse.json({ ok: true, sources })
}

/** POST /api/sources — create a new source */
export async function POST(req: NextRequest) {
  if (!isServerSupabaseConfigured || !supabaseServer) {
    return NextResponse.json({ ok: false, error: 'Supabase server client not configured' }, { status: 400 })
  }

  const body: Record<string, unknown> = await req.json()
  const name = (body.name as string | undefined)?.trim()
  const url  = (body.url  as string | undefined)?.trim()

  if (!name || !url) {
    return NextResponse.json({ ok: false, error: '名称和 URL 不能为空' }, { status: 400 })
  }

  const tier      = ((body.source_tier as string | undefined) ?? 'B') as DbSourceTier
  const isCurated = body.is_user_curated !== false

  const { data, error } = await supabaseServer
    .from('sources')
    .insert({
      name,
      url,
      platform:             (body.platform             as string  | undefined) ?? 'rss',
      source_tier:          tier,
      base_score:           TIER_BASE_SCORE[tier]     ?? 70,
      reliability_score:    70,
      category:             (body.category             as string  | undefined) ?? 'AI技术',
      is_official:          (body.is_official          as boolean | undefined) ?? false,
      data_origin:          ((body.data_origin          as string  | undefined) ?? 'real') as DataOrigin,
      is_user_curated:      isCurated,
      user_source_label:    (body.user_source_label    as string  | undefined) ?? (isCurated ? '外部精选源' : null),
      user_source_note:     (body.user_source_note     as string  | undefined) || null,
      user_source_priority: (body.user_source_priority as number  | undefined) ?? 10,
      source_badge_variant: isCurated ? 'user_curated' : ((body.source_badge_variant as string | undefined) ?? null),
    })
    .select()
    .single()

  if (error) {
    const isConflict = error.code === '23505'
    return NextResponse.json(
      { ok: false, error: isConflict ? '该 URL 已存在，请勿重复添加' : error.message },
      { status: isConflict ? 409 : 500 },
    )
  }

  return NextResponse.json({ ok: true, source: data }, { status: 201 })
}
