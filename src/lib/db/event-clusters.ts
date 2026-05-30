import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'
import {
  buildEventClusters,
  choosePrimaryItem,
  type EventClusterDraft,
  type EventClusterInputItem,
} from '@/lib/clusters/event-clustering'
import type {
  DbEventCluster,
  DbEventClusterInsert,
  DbEventClusterItemInsert,
  DbEventClusterStatus,
  DbSourceTier,
} from '@/types/database'

const DEFAULT_WINDOW_HOURS = 168
const DEFAULT_LIMIT = 300
const MAX_LIMIT = 500

const CANDIDATE_OR = [
  'should_enter_daily_report.eq.true',
  'final_score.gte.75',
  'analysis_tier.in.(standard,deep,cluster)',
  'ev_score.gte.55',
  'truth_score.gte.55',
].join(',')

const CANDIDATE_SELECT = [
  'id',
  'title',
  'summary',
  'url',
  'canonical_url',
  'source_id',
  'data_origin',
  'published_at',
  'fetched_at',
  'final_score',
  'ev_score',
  'truth_score',
  'source_trace_score',
  'analysis_tier',
  'should_enter_daily_report',
  'should_track_event',
  'sources!items_source_id_fkey(id, name, source_tier, is_official)',
].join(', ')

type SourceJoin = {
  id?: string | null
  name?: string | null
  source_tier?: DbSourceTier | string | null
  is_official?: boolean | null
} | null

type CandidateRow = {
  id: string
  title: string | null
  summary: string | null
  url: string | null
  canonical_url: string | null
  source_id: string | null
  data_origin: string | null
  published_at: string | null
  fetched_at: string | null
  final_score: number | null
  ev_score: number | null
  truth_score: number | null
  source_trace_score: number | null
  analysis_tier: string | null
  should_enter_daily_report: boolean | null
  should_track_event: boolean | null
  sources?: SourceJoin
}

type ClusterItemJoinRow = {
  cluster_id: string
  role: string | null
  similarity_reason: string | null
  score: number | null
  added_at: string
  items?: {
    id: string
    source_id: string | null
    title: string | null
    summary: string | null
    url: string | null
    canonical_url: string | null
    final_score: number | null
    ev_score: number | null
    truth_score: number | null
    source_trace_score: number | null
    published_at: string | null
    fetched_at: string | null
    sources?: SourceJoin
  } | null
}

export type EventClusterItemPreview = {
  itemId: string
  title: string
  sourceName: string | null
  sourceTier: DbSourceTier | string | null
  role: string | null
  score: number | null
  similarityReason: string | null
  publishedAt: string | null
  fetchedAt: string | null
  finalScore: number | null
  url: string | null
}

export type EventClusterListItem = {
  id: string
  clusterKey: string
  title: string
  summary: string | null
  status: DbEventClusterStatus
  primaryItemId: string | null
  primaryItemTitle: string | null
  firstSeenAt: string | null
  lastSeenAt: string | null
  itemCount: number
  sourceCount: number
  confidence: number
  matchReason: string | null
  metadata: Record<string, unknown>
  items?: EventClusterItemPreview[]
}

export type EventClusterDetail = {
  cluster: EventClusterListItem
  timeline: EventClusterItemPreview[]
  primaryItem: EventClusterItemPreview | null
  sources: Array<{ sourceName: string; sourceTier: string | null; count: number }>
  matchReasons: string[]
}

export type GenerateEventClustersOptions = {
  windowHours?: number
  limit?: number
  dryRun?: boolean
  force?: boolean
}

export type GenerateEventClustersResult = {
  ok: boolean
  dryRun: boolean
  force: boolean
  windowHours: number
  windowStart: string
  windowEnd: string
  candidateClusters: EventClusterListItem[]
  stats: {
    itemsScanned: number
    clustersGenerated: number
    itemsLinked: number
  }
}

type PostgrestErrorLike = { code?: string | null; message?: string | null } | null | undefined

function isMissingClusterTableError(error: PostgrestErrorLike): boolean {
  if (!error) return false
  const message = String(error.message ?? '').toLowerCase()
  return error.code === '42P01'
    || message.includes('event_clusters')
    || message.includes('event_cluster_items')
    || message.includes('does not exist')
}

function toMs(value: string | null | undefined): number {
  if (!value) return 0
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : 0
}

function itemTimeMs(item: EventClusterInputItem): number {
  return Math.max(toMs(item.publishedAt), toMs(item.fetchedAt))
}

function deriveStatus(itemCount: number, sourceCount: number, lastSeenAt: string | null): DbEventClusterStatus {
  const lastMs = toMs(lastSeenAt)
  if (!lastMs) return 'watching'
  const hoursSinceLast = (Date.now() - lastMs) / 3600000
  if (hoursSinceLast > 72) return 'cooling'
  if ((itemCount >= 3 || sourceCount >= 2) && hoursSinceLast <= 48) return 'active'
  return 'watching'
}

function isEventClusterStatus(value: string): value is DbEventClusterStatus {
  return value === 'active' || value === 'watching' || value === 'cooling' || value === 'archived'
}

function mapCandidateRow(row: CandidateRow): EventClusterInputItem | null {
  const title = String(row.title ?? '').trim()
  if (!title) return null
  if (row.data_origin !== 'real') return null

  return {
    id: row.id,
    title,
    summary: row.summary ?? null,
    url: row.url ?? null,
    canonicalUrl: row.canonical_url ?? null,
    sourceId: row.source_id,
    sourceName: row.sources?.name ?? null,
    sourceTier: row.sources?.source_tier ?? null,
    sourceIsOfficial: row.sources?.is_official === true,
    finalScore: row.final_score,
    recommendationScore: row.final_score,
    evidenceScore: row.ev_score,
    truthScore: row.truth_score,
    sourceTraceScore: row.source_trace_score,
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
  }
}

function mapClusterRow(row: DbEventCluster): EventClusterListItem {
  return {
    id: row.id,
    clusterKey: row.cluster_key,
    title: row.title,
    summary: row.summary,
    status: row.status,
    primaryItemId: row.primary_item_id,
    primaryItemTitle: null,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    itemCount: row.item_count,
    sourceCount: row.source_count,
    confidence: row.confidence,
    matchReason: row.match_reason,
    metadata: row.metadata ?? {},
  }
}

function mapClusterItemRow(row: ClusterItemJoinRow): EventClusterItemPreview | null {
  if (!row.items) return null
  return {
    itemId: row.items.id,
    title: row.items.title?.trim() || '(no title)',
    sourceName: row.items.sources?.name ?? null,
    sourceTier: row.items.sources?.source_tier ?? null,
    role: row.role,
    score: row.score,
    similarityReason: row.similarity_reason,
    publishedAt: row.items.published_at,
    fetchedAt: row.items.fetched_at,
    finalScore: row.items.final_score,
    url: row.items.url,
  }
}

function mapDraftToListItem(draft: EventClusterDraft): EventClusterListItem {
  return {
    id: draft.clusterKey,
    clusterKey: draft.clusterKey,
    title: draft.title,
    summary: draft.summary,
    status: draft.status,
    primaryItemId: draft.primaryItemId,
    primaryItemTitle: null,
    firstSeenAt: draft.firstSeenAt,
    lastSeenAt: draft.lastSeenAt,
    itemCount: draft.itemCount,
    sourceCount: draft.sourceCount,
    confidence: draft.confidence,
    matchReason: draft.matchReason,
    metadata: draft.metadata,
    items: draft.items.map(entry => ({
      itemId: entry.itemId,
      title: '(pending)',
      sourceName: null,
      sourceTier: null,
      role: entry.role,
      score: entry.score,
      similarityReason: entry.similarityReason,
      publishedAt: null,
      fetchedAt: null,
      finalScore: null,
      url: null,
    })),
  }
}

async function fetchClusterItems(clusterIds: string[]): Promise<ClusterItemJoinRow[]> {
  if (!supabaseServer || clusterIds.length === 0) return []

  const { data, error } = await supabaseServer
    .from('event_cluster_items')
    .select(
      'cluster_id, role, similarity_reason, score, added_at, items!event_cluster_items_item_id_fkey(id, source_id, title, summary, url, canonical_url, final_score, ev_score, truth_score, source_trace_score, published_at, fetched_at, sources!items_source_id_fkey(name, source_tier, is_official))',
    )
    .in('cluster_id', clusterIds)

  if (error) {
    if (isMissingClusterTableError(error)) throw new Error('event cluster tables not found')
    throw new Error(error.message)
  }

  return (data ?? []) as unknown as ClusterItemJoinRow[]
}

async function fetchCandidateItems(windowStartIso: string, limit: number): Promise<EventClusterInputItem[]> {
  if (!supabaseServer) return []

  const { data, error } = await supabaseServer
    .from('items')
    .select(CANDIDATE_SELECT)
    .eq('data_origin', 'real')
    .gte('fetched_at', windowStartIso)
    .or(CANDIDATE_OR)
    .order('fetched_at', { ascending: false, nullsFirst: false })
    .order('final_score', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (error) {
    throw new Error(error.message)
  }

  return ((data ?? []) as unknown as CandidateRow[])
    .map(mapCandidateRow)
    .filter((item): item is EventClusterInputItem => item !== null)
}

async function reconcileClusterAggregate(
  clusterId: string,
  fallbackDraft: EventClusterDraft,
): Promise<DbEventClusterInsert> {
  const rows = await fetchClusterItems([clusterId])
  const linkedItems: EventClusterInputItem[] = rows
    .map(row => row.items)
    .filter((item): item is NonNullable<ClusterItemJoinRow['items']> => Boolean(item))
    .map(item => ({
      id: item.id,
      title: item.title?.trim() || '(no title)',
      summary: item.summary,
      url: item.url,
      canonicalUrl: item.canonical_url,
      sourceId: item.source_id,
      sourceName: item.sources?.name ?? null,
      sourceTier: item.sources?.source_tier ?? null,
      sourceIsOfficial: item.sources?.is_official === true,
      finalScore: item.final_score,
      recommendationScore: item.final_score,
      evidenceScore: item.ev_score,
      truthScore: item.truth_score,
      sourceTraceScore: item.source_trace_score,
      publishedAt: item.published_at,
      fetchedAt: item.fetched_at,
    }))

  const items = linkedItems.length > 0 ? linkedItems : []
  const primary = items.length > 0 ? choosePrimaryItem(items) : null

  const timeList = items.map(itemTimeMs).filter(ms => ms > 0)
  const firstSeenAt = timeList.length > 0 ? new Date(Math.min(...timeList)).toISOString() : fallbackDraft.firstSeenAt
  const lastSeenAt = timeList.length > 0 ? new Date(Math.max(...timeList)).toISOString() : fallbackDraft.lastSeenAt

  const sourceKey = (item: EventClusterInputItem): string =>
    item.sourceId ?? `source:${item.sourceName ?? 'unknown'}`
  const sourceCount = new Set(items.map(sourceKey)).size
  const itemCount = items.length > 0 ? items.length : fallbackDraft.itemCount

  return {
    cluster_key: fallbackDraft.clusterKey,
    title: primary?.title ?? fallbackDraft.title,
    summary: primary?.summary ?? fallbackDraft.summary,
    status: deriveStatus(itemCount, sourceCount, lastSeenAt),
    primary_item_id: primary?.id ?? fallbackDraft.primaryItemId,
    first_seen_at: firstSeenAt,
    last_seen_at: lastSeenAt,
    item_count: itemCount,
    source_count: sourceCount || fallbackDraft.sourceCount,
    confidence: fallbackDraft.confidence,
    match_reason: fallbackDraft.matchReason,
    metadata: fallbackDraft.metadata,
  }
}

async function upsertClusterAndItems(
  draft: EventClusterDraft,
  force: boolean,
): Promise<{ clusterId: string; insertedItems: number }> {
  if (!supabaseServer) return { clusterId: draft.clusterKey, insertedItems: 0 }

  const { data: existingRows, error: existingError } = await supabaseServer
    .from('event_clusters')
    .select('*')
    .eq('cluster_key', draft.clusterKey)
    .limit(1)

  if (existingError) {
    if (isMissingClusterTableError(existingError)) throw new Error('event cluster tables not found')
    throw new Error(existingError.message)
  }

  const existing = (existingRows?.[0] as DbEventCluster | undefined) ?? null
  const nowIso = new Date().toISOString()
  const payload: DbEventClusterInsert = {
    cluster_key: draft.clusterKey,
    title: draft.title,
    summary: draft.summary,
    status: draft.status,
    primary_item_id: draft.primaryItemId,
    first_seen_at: draft.firstSeenAt,
    last_seen_at: draft.lastSeenAt,
    item_count: draft.itemCount,
    source_count: draft.sourceCount,
    confidence: draft.confidence,
    match_reason: draft.matchReason,
    metadata: draft.metadata,
  }

  let clusterId = existing?.id ?? ''
  if (!existing || force) {
    if (!existing) {
      const { data, error } = await supabaseServer
        .from('event_clusters')
        .insert(payload)
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      clusterId = (data as DbEventCluster).id
    } else {
      const { error } = await supabaseServer
        .from('event_clusters')
        .update({ ...payload, updated_at: nowIso })
        .eq('id', existing.id)
      if (error) throw new Error(error.message)
      clusterId = existing.id
    }
  } else {
    clusterId = existing.id
  }

  const itemPayload: DbEventClusterItemInsert[] = draft.items.map(item => ({
    cluster_id: clusterId,
    item_id: item.itemId,
    role: item.role,
    similarity_reason: item.similarityReason,
    score: item.score,
  }))

  if (itemPayload.length > 0) {
    const { error } = await supabaseServer
      .from('event_cluster_items')
      .upsert(itemPayload, { onConflict: 'cluster_id,item_id' })
    if (error) throw new Error(error.message)
  }

  const aggregate = await reconcileClusterAggregate(clusterId, draft)
  const { error: updateError } = await supabaseServer
    .from('event_clusters')
    .update({ ...aggregate, updated_at: nowIso })
    .eq('id', clusterId)
  if (updateError) throw new Error(updateError.message)

  return {
    clusterId,
    insertedItems: itemPayload.length,
  }
}

export async function generateEventClusters(
  options: GenerateEventClustersOptions = {},
): Promise<GenerateEventClustersResult> {
  if (!isServerSupabaseConfigured || !supabaseServer) {
    return {
      ok: true,
      dryRun: options.dryRun !== false,
      force: options.force === true,
      windowHours: options.windowHours ?? DEFAULT_WINDOW_HOURS,
      windowStart: new Date(Date.now() - (options.windowHours ?? DEFAULT_WINDOW_HOURS) * 3600000).toISOString(),
      windowEnd: new Date().toISOString(),
      candidateClusters: [],
      stats: { itemsScanned: 0, clustersGenerated: 0, itemsLinked: 0 },
    }
  }

  const windowHours = Math.min(Math.max(Math.floor(options.windowHours ?? DEFAULT_WINDOW_HOURS), 24), 24 * 30)
  const limit = Math.min(Math.max(Math.floor(options.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT)
  const dryRun = options.dryRun !== false
  const force = options.force === true

  const windowEnd = new Date()
  const windowStart = new Date(windowEnd.getTime() - windowHours * 3600000)
  const windowStartIso = windowStart.toISOString()
  const windowEndIso = windowEnd.toISOString()

  const candidates = await fetchCandidateItems(windowStartIso, limit)
  const drafts = buildEventClusters(candidates, {
    now: windowEnd,
    maxClusterSpanHours: windowHours,
  })

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      force,
      windowHours,
      windowStart: windowStartIso,
      windowEnd: windowEndIso,
      candidateClusters: drafts.map(mapDraftToListItem),
      stats: {
        itemsScanned: candidates.length,
        clustersGenerated: drafts.length,
        itemsLinked: drafts.reduce((sum, draft) => sum + draft.items.length, 0),
      },
    }
  }

  let itemsLinked = 0
  for (const draft of drafts) {
    const result = await upsertClusterAndItems(draft, force)
    itemsLinked += result.insertedItems
  }

  const stored = await listEventClusters({ limit: drafts.length || 20, includeItems: false })
  const listByKey = new Map(stored.clusters.map(cluster => [cluster.clusterKey, cluster]))
  const candidateClusters = drafts
    .map(draft => listByKey.get(draft.clusterKey) ?? mapDraftToListItem(draft))

  return {
    ok: true,
    dryRun: false,
    force,
    windowHours,
    windowStart: windowStartIso,
    windowEnd: windowEndIso,
    candidateClusters,
    stats: {
      itemsScanned: candidates.length,
      clustersGenerated: drafts.length,
      itemsLinked,
    },
  }
}

export async function listEventClusters(options: {
  status?: string
  limit?: number
  includeItems?: boolean
} = {}): Promise<{ clusters: EventClusterListItem[] }> {
  if (!isServerSupabaseConfigured || !supabaseServer) return { clusters: [] }

  const limit = Math.min(Math.max(Math.floor(options.limit ?? 20), 1), 100)

  let query = supabaseServer
    .from('event_clusters')
    .select('*')
    .order('last_seen_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (options.status && options.status !== 'all') {
    if (!isEventClusterStatus(options.status)) {
      throw new Error('status must be one of: active, watching, cooling, archived')
    }
    query = query.eq('status', options.status)
  }

  const { data, error } = await query
  if (error) {
    if (isMissingClusterTableError(error)) throw new Error('event cluster tables not found')
    throw new Error(error.message)
  }

  const clusters = ((data ?? []) as DbEventCluster[]).map(mapClusterRow)
  if (!options.includeItems || clusters.length === 0) return { clusters }

  const clusterIds = clusters.map(cluster => cluster.id)
  const itemRows = await fetchClusterItems(clusterIds)
  const grouped = new Map<string, EventClusterItemPreview[]>()
  for (const row of itemRows) {
    const mapped = mapClusterItemRow(row)
    if (!mapped) continue
    const list = grouped.get(row.cluster_id) ?? []
    list.push(mapped)
    grouped.set(row.cluster_id, list)
  }

  const primaryTitles = new Map<string, string>()
  for (const cluster of clusters) {
    const items = grouped.get(cluster.id) ?? []
    const sortedItems = [...items].sort((a, b) => {
      if (a.role === 'primary' && b.role !== 'primary') return -1
      if (a.role !== 'primary' && b.role === 'primary') return 1
      const aTime = Math.max(toMs(a.publishedAt), toMs(a.fetchedAt))
      const bTime = Math.max(toMs(b.publishedAt), toMs(b.fetchedAt))
      return bTime - aTime
    })
    const preview = sortedItems.slice(0, 5)
    const primary = sortedItems.find(item => item.role === 'primary')
      ?? sortedItems.find(item => item.itemId === cluster.primaryItemId)
      ?? sortedItems[0]
    if (primary?.title) primaryTitles.set(cluster.id, primary.title)
    cluster.items = preview
    cluster.primaryItemTitle = primary?.title ?? null
  }

  return { clusters }
}

export async function getEventClusterDetail(clusterId: string): Promise<EventClusterDetail | null> {
  if (!isServerSupabaseConfigured || !supabaseServer) return null

  const { data: clusterRow, error: clusterError } = await supabaseServer
    .from('event_clusters')
    .select('*')
    .eq('id', clusterId)
    .maybeSingle()

  if (clusterError) {
    if (isMissingClusterTableError(clusterError)) throw new Error('event cluster tables not found')
    throw new Error(clusterError.message)
  }
  if (!clusterRow) return null

  const cluster = mapClusterRow(clusterRow as DbEventCluster)
  const itemRows = await fetchClusterItems([clusterId])

  const timeline = itemRows
    .map(mapClusterItemRow)
    .filter((item): item is EventClusterItemPreview => item !== null)
    .sort((a, b) => {
      const aTime = Math.max(toMs(a.publishedAt), toMs(a.fetchedAt))
      const bTime = Math.max(toMs(b.publishedAt), toMs(b.fetchedAt))
      if (aTime !== bTime) return aTime - bTime
      return a.itemId.localeCompare(b.itemId)
    })

  const primaryItem = timeline.find(item => item.role === 'primary')
    ?? timeline.find(item => item.itemId === cluster.primaryItemId)
    ?? timeline[0]
    ?? null

  cluster.primaryItemTitle = primaryItem?.title ?? null
  cluster.items = timeline.slice(0, 5)

  const sourceStats = new Map<string, { sourceName: string; sourceTier: string | null; count: number }>()
  for (const item of timeline) {
    const name = item.sourceName ?? 'Unknown Source'
    const key = `${name}|${item.sourceTier ?? ''}`
    const current = sourceStats.get(key) ?? { sourceName: name, sourceTier: item.sourceTier, count: 0 }
    current.count += 1
    sourceStats.set(key, current)
  }

  const sources = [...sourceStats.values()].sort((a, b) => b.count - a.count)
  const matchReasons = [...new Set(
    timeline
      .map(item => item.similarityReason)
      .filter((value): value is string => Boolean(value && value.trim())),
  )]

  return {
    cluster,
    timeline,
    primaryItem,
    sources,
    matchReasons,
  }
}

export async function getItemEventClusters(itemId: string): Promise<EventClusterListItem[]> {
  if (!isServerSupabaseConfigured || !supabaseServer) return []

  const { data, error } = await supabaseServer
    .from('event_cluster_items')
    .select('cluster_id, role, score, similarity_reason, event_clusters!event_cluster_items_cluster_id_fkey(*)')
    .eq('item_id', itemId)

  if (error) {
    if (isMissingClusterTableError(error)) return []
    throw new Error(error.message)
  }

  type Joined = {
    cluster_id: string
    role: string | null
    score: number | null
    similarity_reason: string | null
    event_clusters?: DbEventCluster | null
  }

  const joinedRows = (data ?? []) as unknown as Joined[]
  return joinedRows
    .filter(row => Boolean(row.event_clusters))
    .map(row => {
      const cluster = mapClusterRow(row.event_clusters as DbEventCluster)
      cluster.items = [{
        itemId,
        title: cluster.title,
        sourceName: null,
        sourceTier: null,
        role: row.role,
        score: row.score,
        similarityReason: row.similarity_reason,
        publishedAt: null,
        fetchedAt: null,
        finalScore: null,
        url: null,
      }]
      return cluster
    })
    .sort((a, b) => {
      const aTime = toMs(a.lastSeenAt)
      const bTime = toMs(b.lastSeenAt)
      if (bTime !== aTime) return bTime - aTime
      return b.confidence - a.confidence
    })
}
