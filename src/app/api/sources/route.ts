import { NextRequest, NextResponse } from 'next/server'
import { getSourcesWithHealth } from '@/lib/data/sources-adapter'
import { normalizeSourceUrl } from '@/lib/db/sources'
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'
import type { DataOrigin, DbSourceTier } from '@/types/database'

export const dynamic = 'force-dynamic'

const TIER_BASE_SCORE: Record<string, number> = { S: 95, A: 82, B: 70, C: 60, D: 55 }

/** GET /api/sources - list all sources with health fields */
export async function GET() {
  const sources = await getSourcesWithHealth()
  return NextResponse.json({ ok: true, sources })
}

/** POST /api/sources - create a new source */
export async function POST(req: NextRequest) {
  if (!isServerSupabaseConfigured || !supabaseServer) {
    return NextResponse.json({ ok: false, error: 'Supabase server client not configured' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const name = (body.name as string | undefined)?.trim()
  const rawUrl = (body.url as string | undefined)?.trim()

  if (!name || !rawUrl) {
    return NextResponse.json({ ok: false, error: 'name and url are required' }, { status: 400 })
  }

  const url = normalizeSourceUrl(rawUrl)

  const { data: existingByUrl, error: existingByUrlError } = await supabaseServer
    .from('sources')
    .select('id, name, url')
    .eq('url', url)
    .maybeSingle()

  if (existingByUrlError) {
    return NextResponse.json({ ok: false, error: existingByUrlError.message }, { status: 500 })
  }
  if (existingByUrl) {
    return NextResponse.json(
      { ok: false, error: 'source already exists for this url', source: existingByUrl },
      { status: 409 },
    )
  }

  const { data: existingByName, error: existingByNameError } = await supabaseServer
    .from('sources')
    .select('id, name, url')
    .eq('name', name)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingByNameError) {
    return NextResponse.json({ ok: false, error: existingByNameError.message }, { status: 500 })
  }
  if (existingByName && normalizeSourceUrl(existingByName.url) === url) {
    return NextResponse.json(
      { ok: false, error: 'source already exists for this name and url', source: existingByName },
      { status: 409 },
    )
  }

  const tierInput = ((body.source_tier as string | undefined) ?? 'B').toUpperCase()
  const tier = (['S', 'A', 'B', 'C', 'D'].includes(tierInput) ? tierInput : 'B') as DbSourceTier
  const isCurated = body.is_user_curated !== false
  const priorityInput = Number(body.user_source_priority)
  const userSourcePriority = Number.isFinite(priorityInput) ? priorityInput : 10

  const { data, error } = await supabaseServer
    .from('sources')
    .insert({
      name,
      url,
      platform: (body.platform as string | undefined) ?? 'rss',
      source_tier: tier,
      base_score: TIER_BASE_SCORE[tier] ?? 70,
      reliability_score: 70,
      category: (body.category as string | undefined) ?? 'AI',
      is_official: (body.is_official as boolean | undefined) ?? false,
      data_origin: ((body.data_origin as string | undefined) ?? 'real') as DataOrigin,
      is_user_curated: isCurated,
      user_source_label: (body.user_source_label as string | undefined) ?? (isCurated ? 'User Curated' : null),
      user_source_note: (body.user_source_note as string | undefined) || null,
      user_source_priority: userSourcePriority,
      source_badge_variant: isCurated ? 'user_curated' : ((body.source_badge_variant as string | undefined) ?? null),
    })
    .select()
    .single()

  if (error) {
    const isConflict = error.code === '23505'
    return NextResponse.json(
      { ok: false, error: isConflict ? 'source already exists' : error.message },
      { status: isConflict ? 409 : 500 },
    )
  }

  return NextResponse.json({ ok: true, source: data }, { status: 201 })
}
