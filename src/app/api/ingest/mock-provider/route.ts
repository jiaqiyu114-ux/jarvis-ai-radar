import { type NextRequest, NextResponse } from 'next/server'
import { runMockProviderIngest } from '@/lib/ingest/ingest-service'
import { isServerSupabaseConfigured } from '@/lib/supabase/server'

/**
 * GET /api/ingest/mock-provider          — dry-run, no DB writes, no Supabase needed
 * GET /api/ingest/mock-provider?write=true — write to Supabase
 * POST /api/ingest/mock-provider         — write to Supabase
 *
 * HTTP status conventions:
 *   200: partial or full success (check ok + errors[] for details)
 *   400: Supabase not configured (for write requests)
 *   500: unexpected fatal error
 */

function buildSample(result: Awaited<ReturnType<typeof runMockProviderIngest>>) {
  if (result.mode === 'dry-run') {
    return result.items.slice(0, 3).map(item => ({
      title:          item.title,
      canonicalUrl:   item.canonicalUrl,
      providerRank:   item.providerRank,
      providerScore:  item.providerScore,
      providerSignal: item.providerSignal,
      featured:       item.featured,
      originalSource: item.originalSourceName ?? '(unknown)',
      category:       item.category,
      publishedAt:    item.publishedAt,
    }))
  }
  return undefined
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const write = searchParams.get('write') === 'true'

    if (write && !isServerSupabaseConfigured) {
      return NextResponse.json({
        ok:    false,
        error: 'Supabase is not configured',
        hint:  'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local',
      }, { status: 400 })
    }

    const result  = await runMockProviderIngest({ dryRun: !write })
    const sample  = buildSample(result)
    const payload = sample ? { ...result, sample } : result
    const status  = 'ok' in result && !result.ok ? 500 : 200

    return NextResponse.json(payload, { status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/ingest/mock-provider GET]', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST() {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({
      ok:    false,
      error: 'Supabase is not configured',
      hint:  'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local',
    }, { status: 400 })
  }

  try {
    const result = await runMockProviderIngest({ dryRun: false })
    const status = result.ok ? 200 : 500
    return NextResponse.json(result, { status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/ingest/mock-provider POST]', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
