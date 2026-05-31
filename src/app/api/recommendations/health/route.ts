import { NextResponse } from 'next/server'
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'
import { getRecommendations } from '@/lib/recommendations/recommendation-engine'

export const dynamic = 'force-dynamic'

/**
 * GET /api/recommendations/health
 *
 * Diagnostic endpoint for the recommendation pipeline.
 * Shows sources, recent items, recommendation tier breakdown, and failing sources.
 * Tells the user exactly WHY recommendations might be empty.
 */
export async function GET() {
  if (!isServerSupabaseConfigured || !supabaseServer) {
    return NextResponse.json({
      ok:    false,
      error: 'Supabase not configured — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local',
    }, { status: 400 })
  }

  const now      = new Date()
  const h24start = new Date(now.getTime() - 24 * 3_600_000).toISOString()
  const h72start = new Date(now.getTime() - 72 * 3_600_000).toISOString()

  // Run all queries in parallel; use allSettled so one failure doesn't kill the rest
  const [
    sourcesActive,
    sourcesTotal,
    items24,
    items72,
    engineResult,
    sourceHealth,
    lastFetch,
  ] = await Promise.allSettled([
    // Active (non-blocked) RSS sources
    supabaseServer
      .from('sources')
      .select('id', { count: 'exact', head: true })
      .eq('platform', 'rss')
      .eq('is_blocked', false),

    // All RSS sources
    supabaseServer
      .from('sources')
      .select('id', { count: 'exact', head: true })
      .eq('platform', 'rss'),

    // Real items in last 24h
    supabaseServer
      .from('items')
      .select('id', { count: 'exact', head: true })
      .eq('data_origin', 'real')
      .gte('fetched_at', h24start),

    // Real items in last 72h
    supabaseServer
      .from('items')
      .select('id', { count: 'exact', head: true })
      .eq('data_origin', 'real')
      .gte('fetched_at', h72start),

    // Engine stats (limit=0 just gets counts)
    getRecommendations({ windowHours: 72, limit: 50, includeArchive: true }),

    // Source health overview
    supabaseServer
      .from('sources')
      .select('name, url, health_status, last_fetch_at, last_error_message, failure_count')
      .eq('platform', 'rss')
      .eq('is_blocked', false)
      .order('failure_count', { ascending: false })
      .limit(20),

    // Most recent successful fetch
    supabaseServer
      .from('sources')
      .select('last_success_at, name')
      .eq('platform', 'rss')
      .not('last_success_at', 'is', null)
      .order('last_success_at', { ascending: false })
      .limit(1),
  ])

  const activeSourceCount = sourcesActive.status === 'fulfilled' ? (sourcesActive.value.count ?? 0) : 0
  const totalSourceCount  = sourcesTotal.status  === 'fulfilled' ? (sourcesTotal.value.count  ?? 0) : 0
  const items24h          = items24.status       === 'fulfilled' ? (items24.value.count        ?? 0) : 0
  const items72h          = items72.status       === 'fulfilled' ? (items72.value.count        ?? 0) : 0
  const engine            = engineResult.status  === 'fulfilled' ? engineResult.value           : null
  const healthRows        = sourceHealth.status  === 'fulfilled' ? (sourceHealth.value.data ?? [])   : []
  const lastFetchRow      = lastFetch.status     === 'fulfilled' ? (lastFetch.value.data?.[0] ?? null) : null

  // Categorise sources by health
  type HealthRow = { name: string; url: string; health_status: string | null; last_fetch_at: string | null; last_error_message: string | null; failure_count: number | null }
  const typedRows = healthRows as HealthRow[]
  const healthyCount  = typedRows.filter(r => r.health_status === 'healthy').length
  const degradedCount = typedRows.filter(r => r.health_status === 'degraded').length
  const failingCount  = typedRows.filter(r => r.health_status === 'failing' || (r.failure_count ?? 0) >= 3).length
  const unknownCount  = typedRows.filter(r => !r.health_status).length
  const failingSources = typedRows
    .filter(r => r.health_status === 'failing' || (r.failure_count ?? 0) >= 3)
    .slice(0, 5)
    .map(r => ({
      name:        r.name,
      status:      r.health_status ?? 'unknown',
      failureCount: r.failure_count ?? 0,
      lastError:   r.last_error_message?.slice(0, 120) ?? null,
      lastFetchAt: r.last_fetch_at,
    }))

  // Determine why recommendations might be empty
  const engineStats = engine?.stats
  const hints: string[] = []
  let emptyReason: string | null = null

  if (!engineStats || engineStats.recommendationCandidates === 0) {
    if (activeSourceCount === 0) {
      emptyReason = '没有活跃信源（非屏蔽 RSS 源为 0）'
      hints.push('→ 在 /sources 页面添加信源，或在 Supabase SQL Editor 执行 supabase/source-seeds-v1.sql')
      hints.push('→ 执行后再触发: POST /api/ingest/rss')
    } else if (items72h === 0) {
      emptyReason = `有 ${activeSourceCount} 个活跃信源，但最近 72h 没有抓取到真实数据`
      hints.push('→ 触发抓取: POST /api/ingest/rss')
      hints.push('→ 如果抓取返回 feedErrors，检查 RSS URL 是否有效')
    } else {
      emptyReason = `最近 72h 有 ${items72h} 条数据，但没有条目达到推荐阈值（recommendationScore ≥ 50）`
      hints.push('→ 检查 final_score 分布: GET /api/recommendations?includeArchive=true')
      hints.push('→ 降低观察阈值或接入评分更高的信源（S/A 级）')
    }
  } else if (engineStats.mustReadCount === 0 && engineStats.highValueCount === 0) {
    hints.push(`→ 当前有 ${engineStats.observeCount} 条观察候选，但没有达到 must_read/high_value 阈值`)
    hints.push('→ 接入 S/A 级官方信源（OpenAI Blog / Anthropic / DeepMind）可提升评分')
  }

  return NextResponse.json({
    ok:        true,
    checkedAt: now.toISOString(),
    sources: {
      activeRss:  activeSourceCount,
      totalRss:   totalSourceCount,
      healthy:    healthyCount,
      degraded:   degradedCount,
      failing:    failingCount,
      unknown:    unknownCount,
    },
    items: {
      last24h: items24h,
      last72h: items72h,
    },
    lastSuccessfulFetch: lastFetchRow
      ? { source: (lastFetchRow as { name: string; last_success_at: string }).name, at: (lastFetchRow as { name: string; last_success_at: string }).last_success_at }
      : null,
    recommendations: engineStats
      ? {
          windowHours:              72,
          capturedTotal:            engineStats.capturedTotal,
          recommendationCandidates: engineStats.recommendationCandidates,
          mustReadCount:            engineStats.mustReadCount,
          highValueCount:           engineStats.highValueCount,
          observeCount:             engineStats.observeCount,
          archiveCount:             engineStats.archiveCount,
        }
      : null,
    emptyReason,
    failingSources,
    hints,
  })
}
