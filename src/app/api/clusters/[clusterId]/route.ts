import { type NextRequest, NextResponse } from 'next/server'
import { getEventClusterDetail } from '@/lib/db/event-clusters'

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ clusterId: string }> },
) {
  const { clusterId } = await ctx.params

  if (!clusterId) {
    return NextResponse.json({ ok: false, error: 'clusterId is required' }, { status: 400 })
  }

  try {
    const detail = await getEventClusterDetail(clusterId)
    if (!detail) {
      return NextResponse.json({ ok: false, error: 'cluster not found' }, { status: 404 })
    }

    return NextResponse.json({
      ok: true,
      cluster: detail.cluster,
      timeline: detail.timeline,
      primaryItem: detail.primaryItem,
      sources: detail.sources,
      matchReasons: detail.matchReasons,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const migrationHint = message.includes('event cluster tables not found')
      ? 'Run supabase/event-clusters-v1.sql in Supabase SQL Editor, then retry.'
      : undefined

    return NextResponse.json({
      ok: false,
      error: message,
      migrationHint,
    }, { status: 500 })
  }
}
