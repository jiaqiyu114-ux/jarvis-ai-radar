import { type NextRequest, NextResponse } from 'next/server'
import { getItemEventClusters } from '@/lib/db/event-clusters'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await ctx.params

  if (!itemId || !UUID_RE.test(itemId)) {
    return NextResponse.json({ ok: false, error: 'itemId must be a valid UUID' }, { status: 400 })
  }

  try {
    const clusters = await getItemEventClusters(itemId)
    return NextResponse.json({
      ok: true,
      itemId,
      clusters,
      hasCluster: clusters.length > 0,
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
