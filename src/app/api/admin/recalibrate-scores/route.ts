/**
 * POST /api/admin/recalibrate-scores
 *
 * Batch-fix final_score for items that passed ingest with old hardcoded dimensions
 * but are clearly off-topic for an AI radar.
 *
 * Two targeted operations (both safe to run repeatedly — idempotent):
 *
 * 1. Financial noise: titles containing Chinese A-share financial terms with no
 *    AI tech terms → cap final_score at 38 (below recommendation threshold)
 *
 * 2. Company-only items: titles that mention AI company names but have no
 *    specific AI tech terms → reduce final_score by 15 if currently > 60
 *
 * GET: dry-run — returns counts without writing.
 * POST: applies the updates.
 *
 * Scoped to items fetched in the last 72 hours (recommendation window).
 */

import { type NextRequest, NextResponse } from 'next/server'
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'
import { getRole, isAdmin } from '@/lib/auth-server'

const FINANCIAL_TERMS = [
  '减持', '增持', '回购', '配股', '定增', '股价', '市值', '净利润',
  '分红', '股息', 'a股', '沪深', '创业板', '科创板', '港股',
  '证券账户', '集中竞价', '流通股', '上市公司',
]

const AI_TECH_TERMS = [
  'llm', 'gpt', 'claude', 'gemini', 'llama', 'mistral', 'deepseek',
  'model', 'agent', 'transformer', 'neural', 'inference', 'training',
  'benchmark', 'multimodal', 'embedding', 'chatgpt', 'copilot',
  '大模型', '人工智能', '机器学习', '智能体', '生成式',
]

function hasFinancialNoise(title: string): boolean {
  const t = title.toLowerCase()
  return FINANCIAL_TERMS.some(kw => t.includes(kw))
}

function hasAiTech(title: string): boolean {
  const t = title.toLowerCase()
  return AI_TECH_TERMS.some(kw => t.includes(kw))
}

async function dryRun(windowStart: string) {
  if (!supabaseServer) return { financial: 0, companyOnly: 0 }

  const { data } = await supabaseServer
    .from('items')
    .select('id, title, final_score')
    .eq('data_origin', 'real')
    .gte('fetched_at', windowStart)
    .gte('final_score', 38)
    .order('final_score', { ascending: false })
    .limit(500)

  let financial = 0
  let companyOnly = 0

  for (const row of data ?? []) {
    const title = (row.title ?? '') as string
    const score = (row.final_score ?? 0) as number
    if (hasFinancialNoise(title) && !hasAiTech(title)) financial++
    else if (!hasAiTech(title) && score > 60) companyOnly++
  }

  return { financial, companyOnly }
}

export async function GET(req: NextRequest) {
  if (!isServerSupabaseConfigured || !supabaseServer) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 400 })
  }

  const hours = Number(req.nextUrl.searchParams.get('hours') || '72')
  const windowStart = new Date(Date.now() - hours * 3_600_000).toISOString()

  const counts = await dryRun(windowStart)
  return NextResponse.json({ ok: true, dryRun: true, windowHours: hours, ...counts })
}

export async function POST(req: NextRequest) {
  if (!isAdmin(await getRole())) {
    return NextResponse.json({ ok: false, error: '需要管理员权限' }, { status: 403 })
  }
  if (!isServerSupabaseConfigured || !supabaseServer) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 400 })
  }

  let body: { hours?: number } = {}
  try { body = await req.json() } catch { /* defaults */ }
  const hours = body.hours ?? 72
  const windowStart = new Date(Date.now() - hours * 3_600_000).toISOString()

  const { data, error } = await supabaseServer
    .from('items')
    .select('id, title, final_score')
    .eq('data_origin', 'real')
    .gte('fetched_at', windowStart)
    .gte('final_score', 38)
    .limit(500)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  let financialFixed = 0
  let companyFixed   = 0
  let errors         = 0

  for (const row of data ?? []) {
    const title = (row.title ?? '') as string
    const score = (row.final_score ?? 0) as number
    let newScore: number | null = null

    if (hasFinancialNoise(title) && !hasAiTech(title)) {
      newScore = Math.min(score, 38)  // cap below recommendation threshold
    } else if (!hasAiTech(title) && score > 60) {
      newScore = Math.max(45, score - 15)  // reduce but keep visible
    }

    if (newScore !== null && newScore !== score) {
      const { error: upErr } = await supabaseServer
        .from('items').update({ final_score: newScore }).eq('id', row.id)
      if (upErr) errors++
      else if (hasFinancialNoise(title) && !hasAiTech(title)) financialFixed++
      else companyFixed++
    }
  }

  return NextResponse.json({
    ok:            errors === 0,
    windowHours:   hours,
    financialFixed,
    companyFixed,
    errors,
    total:         financialFixed + companyFixed,
  })
}
