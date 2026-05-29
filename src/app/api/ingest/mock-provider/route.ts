import { NextResponse } from 'next/server'
import { runMockProviderIngest } from '@/lib/ingest/ingest-service'

/**
 * GET /api/ingest/mock-provider
 *
 * Runs the mock provider ingest pipeline and returns the result as JSON.
 * No network calls. No Supabase required. No API keys.
 * Safe to call during local development at any time.
 *
 * Returns a sample of items (first 3) in the "sample" field to keep the
 * response readable without truncating the full items array.
 */
export async function GET() {
  try {
    const result = await runMockProviderIngest()
    return NextResponse.json({
      ...result,
      // Full items array available; include a readable sample in the top-level
      sample: result.items.slice(0, 3).map(item => ({
        title:          item.title,
        canonicalUrl:   item.canonicalUrl,
        providerRank:   item.providerRank,
        providerScore:  item.providerScore,
        providerSignal: item.providerSignal,
        featured:       item.featured,
        originalSource: item.originalSourceName ?? '(unknown)',
        category:       item.category,
        publishedAt:    item.publishedAt,
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/ingest/mock-provider]', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
