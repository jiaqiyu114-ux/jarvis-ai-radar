import { type NextRequest, NextResponse } from 'next/server'
import { runMockProviderIngest } from '@/lib/ingest/ingest-service'
import { isServerSupabaseConfigured } from '@/lib/supabase/server'

/**
 * GET /api/ingest/mock-provider
 * GET /api/ingest/mock-provider?write=true
 *
 * Default (no params): dry-run — returns pipeline preview, no DB writes.
 * ?write=true          — writes to Supabase if configured; returns persist stats.
 *
 * POST /api/ingest/mock-provider
 *
 * Always writes to Supabase.
 * Returns { ok: false, error: "..." } if Supabase is not configured.
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
  return null   // persist result has no items array
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const write = searchParams.get('write') === 'true'

    if (write && !isServerSupabaseConfigured) {
      return NextResponse.json({
        ok:    false,
        error: 'Supabase is not configured',
        hint:  'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) in .env.local',
      }, { status: 400 })
    }

    const result = await runMockProviderIngest({ dryRun: !write })
    const sample = buildSample(result)

    return NextResponse.json(sample ? { ...result, sample } : result)
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
      hint:  'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) in .env.local',
    }, { status: 400 })
  }

  try {
    const result = await runMockProviderIngest({ dryRun: false })
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/ingest/mock-provider POST]', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
