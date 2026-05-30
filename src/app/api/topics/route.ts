import { type NextRequest, NextResponse } from 'next/server'
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'

/**
 * GET /api/topics
 * Returns topics from public.topics, ordered by created_at DESC.
 * No mock fallback. Empty array when no topics exist.
 */
export async function GET(req: NextRequest) {
  if (!isServerSupabaseConfigured || !supabaseServer) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured', topics: [] }, { status: 400 })
  }

  const { searchParams } = new URL(req.url)
  const status   = searchParams.get('status')
  const priority = searchParams.get('priority')
  const limit    = Math.min(Number(searchParams.get('limit')) || 100, 500)

  let query = supabaseServer
    .from('topics')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (status)   query = query.eq('status',   status   as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (priority) query = query.eq('priority', priority as any)

  const { data, error } = await query

  if (error) {
    console.error('[api/topics] list:', error.message)
    return NextResponse.json({ ok: false, error: error.message, topics: [] }, { status: 500 })
  }

  return NextResponse.json({ ok: true, topics: data ?? [] })
}
