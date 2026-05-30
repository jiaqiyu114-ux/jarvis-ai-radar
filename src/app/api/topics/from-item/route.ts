import { type NextRequest, NextResponse } from 'next/server'
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'

/**
 * POST /api/topics/from-item
 *
 * Creates a topic entry from a real information item.
 * Only items with data_origin='real' can enter the topic pool.
 * Prevents duplicates via the unique index on source_item_id.
 *
 * Does NOT call any AI / LLM API.
 * Does NOT modify public.items.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ITEM_SELECT = [
  'id', 'title', 'summary', 'url', 'data_origin',
  'final_score', 'ev_score', 'truth_score',
  'content_fetch_status', 'article_excerpt', 'clean_text',
  'source_id',
  'should_enter_topic_pool',
  'content_potential_score',
  'sources!items_source_id_fkey(name, url)',
].join(', ')

function defaultAngle(): string {
  return '从这条信息延伸，判断它对 AI 产品、内容创作或行业趋势的影响。'
}

function summarise(item: {
  summary?: string | null
  article_excerpt?: string | null
  clean_text?: string | null
}): string {
  if (item.summary?.trim()) return item.summary.trim()
  if (item.article_excerpt?.trim()) return item.article_excerpt.trim()
  if (item.clean_text?.trim()) {
    const text = item.clean_text.replace(/\s+/g, ' ').trim()
    return text.length > 200 ? `${text.slice(0, 200)}…` : text
  }
  return ''
}

function priorityFor(finalScore: number | null, shouldEnterTopicPool: boolean | null): string {
  if (shouldEnterTopicPool || (finalScore != null && finalScore >= 85)) return 'high'
  if (finalScore != null && finalScore >= 70) return 'medium'
  return 'low'
}

export async function POST(req: NextRequest) {
  if (!isServerSupabaseConfigured || !supabaseServer) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 400 })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* use defaults */ }

  const itemId  = typeof body.itemId === 'string' ? body.itemId.trim() : null
  const platform = typeof body.platform === 'string' ? body.platform : '未定'
  const status   = typeof body.status   === 'string' ? body.status   : '待判断'

  if (!itemId || !UUID_RE.test(itemId)) {
    return NextResponse.json({ ok: false, error: 'itemId must be a valid UUID' }, { status: 400 })
  }

  // ── Check if already in pool ──────────────────────────────────────────────────

  const { data: existing, error: existErr } = await supabaseServer
    .from('topics')
    .select('*')
    .eq('source_item_id', itemId)
    .maybeSingle()

  if (existErr) {
    console.error('[topics/from-item] check existing:', existErr.message)
    return NextResponse.json({ ok: false, error: existErr.message }, { status: 500 })
  }

  if (existing) {
    return NextResponse.json({ ok: true, alreadyExists: true, topic: existing })
  }

  // ── Load item ──────────────────────────────────────────────────────────────────

  const { data: itemRow, error: itemErr } = await supabaseServer
    .from('items')
    .select(ITEM_SELECT)
    .eq('id', itemId)
    .maybeSingle()

  if (itemErr) {
    return NextResponse.json({ ok: false, error: itemErr.message }, { status: 500 })
  }

  if (!itemRow) {
    return NextResponse.json({ ok: false, error: 'Item not found' }, { status: 404 })
  }

  // ── Reject non-real items ────────────────────────────────────────────────────

  const item = itemRow as unknown as {
    id: string
    title: string | null
    summary: string | null
    url: string | null
    data_origin: string | null
    final_score: number | null
    ev_score: number | null
    truth_score: number | null
    content_fetch_status: string | null
    article_excerpt: string | null
    clean_text: string | null
    source_id: string | null
    should_enter_topic_pool: boolean | null
    content_potential_score: number | null
    sources?: { name?: string | null; url?: string | null } | null
  }

  if (item.data_origin !== 'real') {
    return NextResponse.json({
      ok: false,
      error: '演示数据不能加入选题池，只有真实来源的信息才能入池。',
    }, { status: 422 })
  }

  // ── Build topic payload ───────────────────────────────────────────────────────

  const sourceJoin = item.sources ?? null
  const sourceName = sourceJoin?.name ?? null
  const sourceUrl  = item.url ?? null

  const title = item.title?.trim() || '(无标题)'
  const coreInfo = summarise(item)
  const angle    = defaultAngle()
  const priority = priorityFor(item.final_score, item.should_enter_topic_pool)

  const payload = {
    source_item_id: itemId,
    title,
    core_info:    coreInfo,
    angles:       [angle],
    platform:     platform as string,
    target_reader: '',
    pain_point:   '',
    priority,
    status:       status as string,
    source_name:  sourceName,
    source_url:   sourceUrl,
    final_score:  item.final_score ?? null,
    truth_score:  item.truth_score ?? null,
    ev_score:     item.ev_score    ?? null,
  }

  // ── Insert ────────────────────────────────────────────────────────────────────

  const { data: topic, error: insertErr } = await supabaseServer
    .from('topics')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(payload as any)
    .select('*')
    .single()

  if (insertErr) {
    // Handle race-condition duplicate (unique index violation = code 23505)
    if (insertErr.code === '23505') {
      const { data: retry } = await supabaseServer
        .from('topics')
        .select('*')
        .eq('source_item_id', itemId)
        .maybeSingle()
      return NextResponse.json({ ok: true, alreadyExists: true, topic: retry })
    }
    console.error('[topics/from-item] insert:', insertErr.message)
    return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, alreadyExists: false, topic })
}
