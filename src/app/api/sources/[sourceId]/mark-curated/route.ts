import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'

/** POST /api/sources/[sourceId]/mark-curated — mark a source as user curated */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  if (!isServerSupabaseConfigured || !supabaseServer) {
    return NextResponse.json({ ok: false, error: 'Supabase server client not configured' }, { status: 400 })
  }

  const { sourceId } = await params
  const body: Record<string, unknown> = await req.json().catch(() => ({}))

  const { data, error } = await supabaseServer
    .from('sources')
    .update({
      is_user_curated:      true,
      user_source_label:    (body.label    as string | undefined) ?? '外部精选源',
      user_source_note:     (body.note     as string | undefined) ?? null,
      user_source_priority: (body.priority as number | undefined) ?? 10,
      source_badge_variant: 'user_curated',
    })
    .eq('id', sourceId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, source: data })
}
