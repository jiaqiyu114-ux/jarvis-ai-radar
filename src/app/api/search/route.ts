import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'
import { mockItems, mockSources, mockTopics, mockClusters } from '@/config/mock-data'
import { normalizeDisplayText } from '@/lib/text/normalize-display-text'

export const dynamic = 'force-dynamic'

type SearchType = 'all' | 'items' | 'sources' | 'clusters' | 'topics'
type ResultType = Exclude<SearchType, 'all'> extends infer T ? T extends string ? T : never : never

type SearchResult = {
  id: string
  type: ResultType
  title: string
  subtitle: string
  href: string
  score: number | null
  source: string | null
  sourceTier: string | null
  matchedFields: string[]
  metadata: Record<string, unknown>
}

const TYPE_LABEL: Record<ResultType, string> = {
  items: '信号',
  sources: '信源',
  clusters: '事件簇',
  topics: '选题',
}

function cleanQuery(raw: string | null): string {
  return String(raw ?? '')
    .replace(/[(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

function ilikeTerm(q: string): string {
  return q.replace(/[%_\\]/g, '')
}

function text(value: unknown): string {
  return normalizeDisplayText(String(value ?? ''))
}

function lower(value: unknown): string {
  return text(value).toLowerCase()
}

function matchedFields(query: string, fields: Record<string, unknown>): string[] {
  const q = query.toLowerCase()
  return Object.entries(fields)
    .filter(([, value]) => lower(value).includes(q))
    .map(([key]) => key)
}

function relevance(query: string, fields: Record<string, unknown>, baseScore = 0): number {
  const q = query.toLowerCase()
  let score = baseScore
  const title = lower(fields.title)
  const summary = lower(fields.summary)
  const source = lower(fields.source)
  const tags = lower(fields.tags)

  if (title === q) score += 120
  else if (title.startsWith(q)) score += 90
  else if (title.includes(q)) score += 70
  if (source.includes(q)) score += 38
  if (tags.includes(q)) score += 28
  if (summary.includes(q)) score += 18
  return Math.round(score)
}

function typeEnabled(type: SearchType, target: ResultType): boolean {
  return type === 'all' || type === target
}

function stripRank(result: SearchResult & { _rank?: number }): SearchResult {
  return {
    id: result.id,
    type: result.type,
    title: result.title,
    subtitle: result.subtitle,
    href: result.href,
    score: result.score,
    source: result.source,
    sourceTier: result.sourceTier,
    matchedFields: result.matchedFields,
    metadata: result.metadata,
  }
}

async function searchDb(query: string, type: SearchType, limit: number): Promise<SearchResult[]> {
  if (!isServerSupabaseConfigured || !supabaseServer) return []
  const term = ilikeTerm(query)
  if (!term) return []
  const pattern = `%${term}%`
  const eachLimit = Math.max(4, Math.min(limit, 12))

  const tasks: Array<Promise<SearchResult[]>> = []

  if (typeEnabled(type, 'items')) {
    tasks.push((async () => {
      const { data, error } = await supabaseServer
        .from('items')
        .select('id,title,summary,url,final_score,published_at,fetched_at,category,tags,data_origin,article_title,article_excerpt,sources!items_source_id_fkey(name,source_tier,is_official,is_user_curated,user_source_note)')
        .eq('data_origin', 'real')
        .or(`title.ilike.${pattern},summary.ilike.${pattern},article_title.ilike.${pattern},article_excerpt.ilike.${pattern},clean_text.ilike.${pattern},url.ilike.${pattern}`)
        .order('final_score', { ascending: false, nullsFirst: false })
        .limit(eachLimit)

      if (error || !data) return []
      return (data as Array<Record<string, unknown>>).map(row => {
        const source = row.sources as Record<string, unknown> | null
        const title = text(row.title) || '(no title)'
        const subtitle = [source?.name, row.summary].filter(Boolean).map(text).join(' · ')
        const tags = Array.isArray(row.tags) ? row.tags.join(' ') : ''
        const sourceNote = String(source?.user_source_note ?? '').toLowerCase()
        const isOfficial = source?.is_official === true
        const isKol = sourceNote.includes('sourcepack:ai-kol-sources-v1') || sourceNote.includes('role:key_person')
        const base = Number(row.final_score ?? 0) + (isOfficial ? 16 : 0) + (isKol ? 18 : 0)

        return {
          id: String(row.id),
          type: 'items',
          title,
          subtitle,
          href: `/feed?q=${encodeURIComponent(query)}`,
          score: Number(row.final_score ?? 0),
          source: text(source?.name),
          sourceTier: text(source?.source_tier),
          matchedFields: matchedFields(query, {
            title,
            summary: row.summary,
            articleTitle: row.article_title,
            articleExcerpt: row.article_excerpt,
            source: source?.name,
            tags,
            url: row.url,
          }),
          metadata: {
            label: TYPE_LABEL.items,
            category: row.category,
            publishedAt: row.published_at,
            originalUrl: row.url,
          },
          _rank: relevance(query, { title, summary: row.summary, source: source?.name, tags }, base),
        } as SearchResult & { _rank: number }
      })
    })())
  }

  if (typeEnabled(type, 'sources')) {
    tasks.push((async () => {
      const { data, error } = await supabaseServer
        .from('sources')
        .select('id,name,url,platform,source_tier,category,is_official,is_user_curated,is_blocked,health_status,user_source_label,user_source_note,user_source_priority,last_fetch_at')
        .neq('data_origin', 'demo')
        .or(`name.ilike.${pattern},url.ilike.${pattern},category.ilike.${pattern},user_source_label.ilike.${pattern},user_source_note.ilike.${pattern}`)
        .order('source_tier', { ascending: true })
        .limit(eachLimit)

      if (error || !data) return []
      return (data as Array<Record<string, unknown>>).map(row => {
        const title = text(row.name)
        const note = String(row.user_source_note ?? '').toLowerCase()
        const isOfficial = row.is_official === true
        const isKol = note.includes('sourcepack:ai-kol-sources-v1') || note.includes('role:key_person') || note.includes('role:kol')
        const base = (isOfficial ? 80 : 0) + (isKol ? 85 : 0) + Number(row.user_source_priority ?? 0)
        return {
          id: String(row.id),
          type: 'sources',
          title,
          subtitle: [row.platform, row.url].filter(Boolean).map(text).join(' · '),
          href: `/sources?search=${encodeURIComponent(query)}`,
          score: null,
          source: title,
          sourceTier: text(row.source_tier),
          matchedFields: matchedFields(query, {
            title,
            url: row.url,
            category: row.category,
            label: row.user_source_label,
            note: row.user_source_note,
          }),
          metadata: {
            label: isKol ? 'KOL信源' : isOfficial ? '官方信源' : TYPE_LABEL.sources,
            platform: row.platform,
            healthStatus: row.health_status,
            isBlocked: row.is_blocked,
            lastFetchAt: row.last_fetch_at,
          },
          _rank: relevance(query, { title, summary: row.user_source_note, source: row.url }, base),
        } as SearchResult & { _rank: number }
      })
    })())
  }

  if (typeEnabled(type, 'clusters')) {
    tasks.push((async () => {
      const { data, error } = await supabaseServer
        .from('event_clusters')
        .select('id,title,summary,status,confidence,item_count,source_count,last_seen_at,match_reason')
        .or(`title.ilike.${pattern},summary.ilike.${pattern},match_reason.ilike.${pattern}`)
        .order('confidence', { ascending: false, nullsFirst: false })
        .limit(eachLimit)

      if (error || !data) return []
      return (data as Array<Record<string, unknown>>).map(row => {
        const title = text(row.title)
        return {
          id: String(row.id),
          type: 'clusters',
          title,
          subtitle: text(row.summary),
          href: `/clusters/${row.id}`,
          score: Number(row.confidence ?? 0),
          source: null,
          sourceTier: null,
          matchedFields: matchedFields(query, {
            title,
            summary: row.summary,
            matchReason: row.match_reason,
          }),
          metadata: {
            label: TYPE_LABEL.clusters,
            status: row.status,
            itemCount: row.item_count,
            sourceCount: row.source_count,
            lastSeenAt: row.last_seen_at,
          },
          _rank: relevance(query, { title, summary: row.summary }, Number(row.confidence ?? 0)),
        } as SearchResult & { _rank: number }
      })
    })())
  }

  if (typeEnabled(type, 'topics')) {
    tasks.push((async () => {
      const { data, error } = await supabaseServer
        .from('topics')
        .select('id,title,core_info,source_name,source_url,final_score,priority,status,created_at')
        .or(`title.ilike.${pattern},core_info.ilike.${pattern},source_name.ilike.${pattern},source_url.ilike.${pattern}`)
        .order('created_at', { ascending: false })
        .limit(eachLimit)

      if (error || !data) return []
      return (data as Array<Record<string, unknown>>).map(row => {
        const title = text(row.title)
        return {
          id: String(row.id),
          type: 'topics',
          title,
          subtitle: [row.source_name, row.core_info].filter(Boolean).map(text).join(' · '),
          href: '/topics',
          score: row.final_score == null ? null : Number(row.final_score),
          source: text(row.source_name),
          sourceTier: null,
          matchedFields: matchedFields(query, {
            title,
            coreInfo: row.core_info,
            source: row.source_name,
            url: row.source_url,
          }),
          metadata: {
            label: TYPE_LABEL.topics,
            priority: row.priority,
            status: row.status,
            createdAt: row.created_at,
          },
          _rank: relevance(query, { title, summary: row.core_info, source: row.source_name }, Number(row.final_score ?? 0)),
        } as SearchResult & { _rank: number }
      })
    })())
  }

  const groups = await Promise.all(tasks)
  return groups
    .flat()
    .sort((a, b) => ((b as SearchResult & { _rank?: number })._rank ?? 0) - ((a as SearchResult & { _rank?: number })._rank ?? 0))
    .slice(0, limit)
    .map(stripRank)
}

function searchMocks(query: string, type: SearchType, limit: number): SearchResult[] {
  const results: Array<SearchResult & { _rank: number }> = []

  if (typeEnabled(type, 'items')) {
    for (const item of mockItems) {
      const fields = { title: item.title, summary: item.summary, source: item.source, tags: item.tags.join(' ') }
      const matched = matchedFields(query, fields)
      if (matched.length === 0) continue
      results.push({
        id: item.id,
        type: 'items',
        title: item.title,
        subtitle: `${item.source} · ${item.summary}`,
        href: `/feed?q=${encodeURIComponent(query)}`,
        score: item.finalScore,
        source: item.source,
        sourceTier: item.sourceTier,
        matchedFields: matched,
        metadata: { label: TYPE_LABEL.items, category: item.category, originalUrl: item.originalUrl },
        _rank: relevance(query, fields, item.finalScore),
      })
    }
  }

  if (typeEnabled(type, 'sources')) {
    for (const source of mockSources) {
      const fields = { title: source.name, summary: source.description, source: source.url }
      const matched = matchedFields(query, fields)
      if (matched.length === 0) continue
      results.push({
        id: source.id,
        type: 'sources',
        title: source.name,
        subtitle: `${source.tier} · ${source.url}`,
        href: `/sources?search=${encodeURIComponent(query)}`,
        score: null,
        source: source.name,
        sourceTier: source.tier,
        matchedFields: matched,
        metadata: { label: TYPE_LABEL.sources, enabled: source.enabled },
        _rank: relevance(query, fields, source.avgScore),
      })
    }
  }

  if (typeEnabled(type, 'clusters')) {
    for (const cluster of mockClusters) {
      const fields = { title: cluster.title, summary: cluster.category }
      const matched = matchedFields(query, fields)
      if (matched.length === 0) continue
      results.push({
        id: cluster.id,
        type: 'clusters',
        title: cluster.title,
        subtitle: `${cluster.sourceCount} sources · ${cluster.category}`,
        href: '/clusters',
        score: cluster.momentum,
        source: null,
        sourceTier: null,
        matchedFields: matched,
        metadata: { label: TYPE_LABEL.clusters },
        _rank: relevance(query, fields, cluster.momentum),
      })
    }
  }

  if (typeEnabled(type, 'topics')) {
    for (const topic of mockTopics) {
      const fields = { title: topic.topicTitle, summary: topic.coreInfo, source: topic.sourceName }
      const matched = matchedFields(query, fields)
      if (matched.length === 0) continue
      results.push({
        id: topic.id,
        type: 'topics',
        title: topic.topicTitle,
        subtitle: topic.coreInfo,
        href: '/topics',
        score: topic.finalScore ?? null,
        source: topic.sourceName ?? null,
        sourceTier: null,
        matchedFields: matched,
        metadata: { label: TYPE_LABEL.topics, priority: topic.priority },
        _rank: relevance(query, fields, topic.finalScore ?? 0),
      })
    }
  }

  return results
    .sort((a, b) => b._rank - a._rank)
    .slice(0, limit)
    .map(stripRank)
}

export async function GET(req: NextRequest) {
  const query = cleanQuery(req.nextUrl.searchParams.get('q'))
  const typeParam = req.nextUrl.searchParams.get('type') ?? 'all'
  const type = (['all', 'items', 'sources', 'clusters', 'topics'].includes(typeParam) ? typeParam : 'all') as SearchType
  const limit = Math.max(1, Math.min(Number(req.nextUrl.searchParams.get('limit')) || 12, 30))

  if (query.length < 2) {
    return NextResponse.json({ ok: true, query, type, results: [], groups: {}, total: 0 })
  }

  const results = isServerSupabaseConfigured
    ? await searchDb(query, type, limit)
    : searchMocks(query, type, limit)

  const groups = results.reduce<Record<ResultType, SearchResult[]>>((acc, result) => {
    acc[result.type] ??= []
    acc[result.type].push(result)
    return acc
  }, { items: [], sources: [], clusters: [], topics: [] })

  return NextResponse.json({
    ok: true,
    query,
    type,
    total: results.length,
    results,
    groups,
  })
}
