import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'
import type { DbSourceUpdate, DbSourceTier, DataOrigin } from '@/types/database'

const TIER_BASE_SCORE: Record<string, number> = { S: 95, A: 82, B: 70, C: 60, D: 55 }

/** PATCH /api/sources/[sourceId] — update a source */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  if (!isServerSupabaseConfigured || !supabaseServer) {
    return NextResponse.json({ ok: false, error: 'Supabase server client not configured' }, { status: 400 })
  }

  const { sourceId } = await params
  const body: Record<string, unknown> = await req.json()

  const update: DbSourceUpdate = {}

  if ('name'                 in body) update.name                 = body.name                 as string
  if ('platform'             in body) update.platform             = body.platform             as string
  if ('source_tier'          in body) update.source_tier          = body.source_tier          as DbSourceTier
  if ('category'             in body) update.category             = body.category             as string
  if ('description'          in body) update.description          = body.description          as string | undefined
  if ('is_official'          in body) update.is_official          = body.is_official          as boolean
  if ('is_blocked'           in body) update.is_blocked           = body.is_blocked           as boolean
  if ('data_origin'          in body) update.data_origin          = body.data_origin          as DataOrigin
  if ('is_user_curated'      in body) update.is_user_curated      = body.is_user_curated      as boolean
  if ('user_source_label'    in body) update.user_source_label    = body.user_source_label    as string | null
  if ('user_source_note'     in body) update.user_source_note     = body.user_source_note     as string | null
  if ('user_source_priority' in body) update.user_source_priority = body.user_source_priority as number
  if ('source_badge_variant' in body) update.source_badge_variant = body.source_badge_variant as string | null

  if ('source_tier' in update) {
    update.base_score = TIER_BASE_SCORE[update.source_tier as string] ?? 70
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: '没有可更新的字段' }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from('sources')
    .update(update)
    .eq('id', sourceId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, source: data })
}
