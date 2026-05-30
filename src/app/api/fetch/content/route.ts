import { type NextRequest, NextResponse } from 'next/server'
import { isServerSupabaseConfigured } from '@/lib/supabase/server'
import { getItemForContentFetch, updateItemArticleContent, markItemContentFetchFailed } from '@/lib/db/items'
import { fetchArticleContent } from '@/lib/content/article-extractor'

/**
 * POST /api/fetch/content
 *
 * Fetches and extracts article content for a single item by ID.
 *
 * Body:
 *   { "itemId": "<uuid>", "force": false }
 *
 * - Does NOT call any AI / LLM API.
 * - Does NOT modify final_score or data_origin.
 * - Does NOT perform batch or recursive fetching.
 * - If content_fetch_status = 'fetched' and force = false, returns cached result.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  if (!isServerSupabaseConfigured) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 400 })
  }

  let body: { itemId?: unknown; force?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const itemId = typeof body.itemId === 'string' ? body.itemId.trim() : null
  const force  = body.force === true

  if (!itemId || !UUID_RE.test(itemId)) {
    return NextResponse.json({ ok: false, error: 'itemId must be a valid UUID' }, { status: 400 })
  }

  // Fetch item from DB (uses server client; URL comes from DB, not user)
  const item = await getItemForContentFetch(itemId)
  if (!item) {
    return NextResponse.json({ ok: false, itemId, error: 'Item not found' }, { status: 404 })
  }

  // Return cached result if already fetched and not forcing
  const currentStatus = (item as { content_fetch_status?: string | null }).content_fetch_status
  if (currentStatus === 'fetched' && !force) {
    return NextResponse.json({
      ok:           true,
      itemId,
      status:       'fetched',
      cached:       true,
      canonicalUrl: (item as { canonical_url?: string | null }).canonical_url ?? item.url,
      title:        (item as { article_title?: string | null }).article_title,
      excerpt:      (item as { article_excerpt?: string | null }).article_excerpt,
      wordCount:    (item as { content_word_count?: number | null }).content_word_count ?? 0,
      coverImageUrl:(item as { cover_image_url?: string | null }).cover_image_url,
      mediaUrls:    ((item as { media_urls?: unknown }).media_urls as string[] | null) ?? [],
      mediaCount:   (((item as { media_urls?: unknown }).media_urls as string[] | null) ?? []).length,
    })
  }

  // Use canonical_url first, fall back to url
  const fetchUrl = (item as { canonical_url?: string | null }).canonical_url || item.url
  if (!fetchUrl) {
    await markItemContentFetchFailed(itemId, 'No URL available on item')
    return NextResponse.json({ ok: false, itemId, status: 'failed', error: 'No URL available' }, { status: 422 })
  }

  // Fetch and extract
  const result = await fetchArticleContent(fetchUrl)

  if (result.status !== 'fetched') {
    await markItemContentFetchFailed(itemId, result.error, fetchUrl)
    return NextResponse.json({
      ok:     false,
      itemId,
      status: result.status,
      error:  result.error,
    })
  }

  // Write to DB
  const saved = await updateItemArticleContent(itemId, {
    finalUrl:     result.finalUrl,
    title:        result.title,
    siteName:     result.siteName,
    author:       result.author,
    publishedAt:  result.publishedAt,
    excerpt:      result.excerpt,
    cleanText:    result.cleanText,
    wordCount:    result.wordCount,
    coverImageUrl:result.coverImageUrl,
    mediaUrls:    result.mediaUrls,
    contentHash:  result.contentHash,
  })

  if (!saved) {
    return NextResponse.json({
      ok:     false,
      itemId,
      status: 'failed',
      error:  'Failed to save extraction result to database',
    }, { status: 500 })
  }

  return NextResponse.json({
    ok:           true,
    itemId,
    status:       'fetched',
    cached:       false,
    canonicalUrl: result.finalUrl,
    title:        result.title,
    siteName:     result.siteName,
    author:       result.author,
    excerpt:      result.excerpt,
    wordCount:    result.wordCount,
    coverImageUrl:result.coverImageUrl,
    mediaUrls:    result.mediaUrls,
    mediaCount:   result.mediaUrls.length,
  })
}

// GET: read-only status check (no fetch side effects)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const itemId = searchParams.get('itemId')

  if (!itemId || !UUID_RE.test(itemId)) {
    return NextResponse.json({ ok: false, error: 'itemId must be a valid UUID' }, { status: 400 })
  }

  if (!isServerSupabaseConfigured) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 400 })
  }

  const item = await getItemForContentFetch(itemId)
  if (!item) {
    return NextResponse.json({ ok: false, error: 'Item not found' }, { status: 404 })
  }

  return NextResponse.json({
    ok:     true,
    itemId,
    status: (item as { content_fetch_status?: string | null }).content_fetch_status ?? 'not_fetched',
    fetchedAt:    (item as { content_fetched_at?: string | null }).content_fetched_at,
    errorMessage: (item as { content_error_message?: string | null }).content_error_message,
    wordCount:    (item as { content_word_count?: number | null }).content_word_count,
  })
}
