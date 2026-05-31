import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'

/** POST /api/sources/[sourceId]/toggle-block — toggle is_blocked */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  if (!isServerSupabaseConfigured || !supabaseServer) {
    return NextResponse.json({ ok: false, error: 'Supabase server client not configured' }, { status: 400 })
  }

  const { sourceId } = await params

  const { data: cur, error: fetchErr } = await supabaseServer
    .from('sources')
    .select('is_blocked')
    .eq('id', sourceId)
    .single()

  if (fetchErr || !cur) {
    return NextResponse.json(
      { ok: false, error: fetchErr?.message ?? 'Source not found' },
      { status: 404 },
    )
  }

  const newBlocked = !(cur.is_blocked ?? false)

  const { data, error } = await supabaseServer
    .from('sources')
    .update({ is_blocked: newBlocked })
    .eq('id', sourceId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, source: data, isBlocked: newBlocked })
}
