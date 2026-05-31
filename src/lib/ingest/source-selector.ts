/**
 * Source Rotation Selector — selectSourcesForIngest()
 *
 * Determines which RSS sources to fetch on this run, with rotation logic
 * so that over multiple runs all active sources are covered, not just the
 * same top-N by tier/priority.
 *
 * Rotation mechanism: staleness-weighted urgency score.
 * A source that was fetched 3 days ago scores higher than one fetched 1 h ago,
 * even if the older source has a lower tier. This naturally rotates coverage.
 *
 * Priority layers (higher = more urgent):
 *   1. Staleness: never fetched > 24h > 6h > fresh   (dominant factor)
 *   2. User-curated flag (+200)
 *   3. Source tier: S(+150) A(+100) B(+50) C(+0) D(-20)
 *   4. user_source_priority field (+5 per point, max 20)
 *   5. Health penalty: degraded(-20) failing(-100, but may be cooled down)
 *
 * Failure cooldown:
 *   failure_count 0-1  → no cooldown
 *   failure_count 2-3  → skip if last attempt < 6 h ago
 *   failure_count 4-5  → skip if last attempt < 24 h ago
 *   failure_count ≥ 6  → skip if last attempt < 72 h ago
 *   (user-curated sources bypass cooldown — they're always eligible)
 *
 * No new DB migration needed. Uses existing fields:
 *   health_status, failure_count, last_fetch_at, last_error_at,
 *   is_user_curated, user_source_priority, source_tier, is_blocked
 */

import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'
import type { DbSource } from '@/types/database'

// ── Public types ──────────────────────────────────────────────────────────────

export type SelectedFeed = {
  id:          string
  name:        string
  feedUrl:     string
  tier:        string
  category:    string
  healthStatus: string | null
  reason:      string   // why this source was selected
}

export type DeferredFeedSummary = {
  id:          string
  name:        string
  tier:        string
  healthStatus: string | null
  reason:      string   // why this source was deferred
}

export type SourceSelectionStats = {
  totalActive:         number   // non-blocked RSS sources
  selectedCount:       number
  deferredCount:       number
  skippedBlocked:      number
  skippedCoolingDown:  number
  selectedUserCurated: number
  selectedTierSA:      number   // S or A tier
  selectedNeverFetched: number
  selectedStale24h:    number   // last fetched > 24h ago
}

export type SourceSelectionResult = {
  selected:         SelectedFeed[]
  deferredSample:   DeferredFeedSummary[]   // up to 10 for diagnostics
  deferredCount:    number
  reasonBySourceId: Record<string, string>
  stats:            SourceSelectionStats
}

export type SelectSourcesOpts = {
  maxSources:     number
  force:          boolean
  now?:           Date
  includeFailing?: boolean  // if true, ignore cooldown (subset of force)
}

// ── Cooldown ──────────────────────────────────────────────────────────────────

const COOLDOWN_HOURS: Array<[minFailures: number, hours: number]> = [
  [6, 72],
  [4, 24],
  [2, 6],
  [0, 0],
]

function cooldownHoursFor(failureCount: number): number {
  for (const [min, hours] of COOLDOWN_HOURS) {
    if (failureCount >= min) return hours
  }
  return 0
}

function getCooldownInfo(
  source: DbSource,
  now: Date,
): { isCooling: boolean; remainingHours: number; reason: string } {
  const fc = source.failure_count ?? 0
  const coolHours = cooldownHoursFor(fc)
  if (coolHours === 0) return { isCooling: false, remainingHours: 0, reason: '' }

  // Use last_error_at if available, fall back to last_fetch_at / updated_at
  const lastAttemptIso = source.last_error_at ?? source.last_fetch_at ?? null
  if (!lastAttemptIso) return { isCooling: false, remainingHours: 0, reason: '' }

  const ageMs    = now.getTime() - new Date(lastAttemptIso).getTime()
  const ageHours = ageMs / 3_600_000

  if (ageHours < coolHours) {
    const remaining = Math.ceil(coolHours - ageHours)
    return {
      isCooling: true,
      remainingHours: remaining,
      reason: `failure_count=${fc}, cooling ${remaining}h remaining (${coolHours}h total)`,
    }
  }

  return { isCooling: false, remainingHours: 0, reason: '' }
}

// ── Urgency score ─────────────────────────────────────────────────────────────

const TIER_BOOST: Record<string, number> = { S: 150, A: 100, B: 50, C: 0, D: -20 }
const HEALTH_MODIFIER: Record<string, number> = {
  healthy: 0, degraded: -20, unknown: 0, failing: -100,
}

function computeUrgencyScore(source: DbSource, now: Date): { score: number; stalenessBucket: string } {
  let score = 0
  let stalenessBucket = 'fresh'

  // ── Staleness (dominant factor) ───────────────────────────────────────────
  const lastFetch  = source.last_fetch_at ? new Date(source.last_fetch_at).getTime() : null
  const ageMs      = lastFetch ? now.getTime() - lastFetch : Infinity
  const ageHours   = ageMs / 3_600_000

  if (!lastFetch) {
    score += 1_000
    stalenessBucket = 'never_fetched'
  } else if (ageHours > 24) {
    score += 800
    stalenessBucket = 'stale_24h'
  } else if (ageHours > 6) {
    score += 400
    stalenessBucket = 'stale_6h'
  } else {
    score += 50
    stalenessBucket = 'fresh'
  }

  // ── Priority boosters ─────────────────────────────────────────────────────
  if (source.is_user_curated) score += 200
  score += TIER_BOOST[source.source_tier] ?? 0
  score += Math.min((source.user_source_priority ?? 0) * 5, 100)

  // ── Health modifier ───────────────────────────────────────────────────────
  score += HEALTH_MODIFIER[source.health_status ?? 'unknown'] ?? 0

  return { score, stalenessBucket }
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Select which RSS sources to ingest on this run.
 *
 * Returns a scored, sorted list of FeedSpec for the ingest runner,
 * plus diagnostic information about deferred sources.
 */
export async function selectSourcesForIngest(
  opts: SelectSourcesOpts,
): Promise<SourceSelectionResult> {
  const now             = opts.now ?? new Date()
  const reasonBySourceId: Record<string, string> = {}

  const empty: SourceSelectionResult = {
    selected:         [],
    deferredSample:   [],
    deferredCount:    0,
    reasonBySourceId: {},
    stats: {
      totalActive: 0, selectedCount: 0, deferredCount: 0,
      skippedBlocked: 0, skippedCoolingDown: 0,
      selectedUserCurated: 0, selectedTierSA: 0,
      selectedNeverFetched: 0, selectedStale24h: 0,
    },
  }

  if (!isServerSupabaseConfigured || !supabaseServer) return empty

  // ── Query all non-blocked RSS sources ────────────────────────────────────
  const { data, error } = await supabaseServer
    .from('sources')
    .select(
      'id, name, url, source_tier, category, platform, is_blocked, data_origin, ' +
      'health_status, failure_count, last_fetch_at, last_error_at, last_success_at, ' +
      'is_user_curated, user_source_priority',
    )
    .eq('platform', 'rss')
    .neq('data_origin', 'demo')
    .order('source_tier', { ascending: true })

  if (error || !data) {
    console.error('[source-selector] query failed:', error?.message)
    return empty
  }

  const all = data as unknown as DbSource[]
  let skippedBlocked     = 0
  let skippedCoolingDown = 0

  const eligible: Array<{ source: DbSource; score: number; stalenessBucket: string; reason: string }> = []
  const excluded: DbSource[] = []

  for (const source of all) {
    // Hard exclude: blocked or empty URL
    if (source.is_blocked || !source.url?.trim()) {
      skippedBlocked++
      reasonBySourceId[source.id] = 'blocked or missing URL'
      excluded.push(source)
      continue
    }

    // Cooldown check (skip for user-curated and force mode)
    if (!opts.force && !source.is_user_curated) {
      const cooldown = getCooldownInfo(source, now)
      if (cooldown.isCooling) {
        skippedCoolingDown++
        reasonBySourceId[source.id] = `cooling down: ${cooldown.reason}`
        excluded.push(source)
        continue
      }
    }

    // Exclude consistently failing non-curated sources (unless force)
    if (!opts.force && !source.is_user_curated) {
      if (source.health_status === 'failing' && (source.failure_count ?? 0) >= 4) {
        skippedCoolingDown++
        reasonBySourceId[source.id] = `health_status=failing, failure_count=${source.failure_count ?? 0}, use force=true to include`
        excluded.push(source)
        continue
      }
    }

    const { score, stalenessBucket } = computeUrgencyScore(source, now)
    const reason = [
      stalenessBucket === 'never_fetched' ? 'never fetched (+1000)' :
      stalenessBucket === 'stale_24h' ? `stale >24h (+800)` :
      stalenessBucket === 'stale_6h' ? `stale >6h (+400)` : 'fresh (+50)',
      source.is_user_curated ? 'user_curated (+200)' : null,
      `tier ${source.source_tier}`,
      source.health_status ? `health=${source.health_status}` : null,
    ].filter(Boolean).join(', ')

    eligible.push({ source, score, stalenessBucket, reason: `urgency=${score}: ${reason}` })
  }

  // Sort by urgency score descending
  eligible.sort((a, b) => b.score - a.score)

  const maxSel = Math.min(opts.maxSources, eligible.length)
  const selectedEntries = eligible.slice(0, maxSel)
  const deferredEntries = eligible.slice(maxSel)

  // ── Build selected feeds ──────────────────────────────────────────────────
  const selected: SelectedFeed[] = selectedEntries.map(e => {
    reasonBySourceId[e.source.id] = `selected: ${e.reason}`
    return {
      id:          e.source.id,
      name:        e.source.name,
      feedUrl:     e.source.url,
      tier:        e.source.source_tier,
      category:    e.source.category,
      healthStatus: e.source.health_status ?? null,
      reason:      e.reason,
    }
  })

  // ── Build deferred sample (top 10 for diagnostics) ────────────────────────
  const deferredSample: DeferredFeedSummary[] = deferredEntries.slice(0, 10).map(e => {
    reasonBySourceId[e.source.id] = `deferred: ${e.reason}`
    return {
      id:          e.source.id,
      name:        e.source.name,
      tier:        e.source.source_tier,
      healthStatus: e.source.health_status ?? null,
      reason:      `deferred (urgency=${e.score}): ${e.reason}`,
    }
  })

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats: SourceSelectionStats = {
    totalActive:         all.filter(s => !s.is_blocked).length,
    selectedCount:       selected.length,
    deferredCount:       deferredEntries.length,
    skippedBlocked,
    skippedCoolingDown,
    selectedUserCurated: selectedEntries.filter(e => e.source.is_user_curated).length,
    selectedTierSA:      selectedEntries.filter(e => e.source.source_tier === 'S' || e.source.source_tier === 'A').length,
    selectedNeverFetched: selectedEntries.filter(e => e.stalenessBucket === 'never_fetched').length,
    selectedStale24h:    selectedEntries.filter(e => e.stalenessBucket === 'stale_24h').length,
  }

  console.log(
    `[source-selector] selected=${selected.length} deferred=${deferredEntries.length} ` +
    `coolingDown=${skippedCoolingDown} blocked=${skippedBlocked} ` +
    `neverFetched=${stats.selectedNeverFetched} stale=${stats.selectedStale24h}`,
  )

  return { selected, deferredSample, deferredCount: deferredEntries.length, reasonBySourceId, stats }
}

// ── Coverage query (for pipeline GET health) ──────────────────────────────────

export type SourceCoverageStats = {
  totalActiveRss:       number
  healthySources:       number
  degradedSources:      number
  failingSources:       number
  neverFetchedSources:  number
  fetchedLast6h:        number
  fetchedLast24h:       number
  oldestLastFetchAt:    string | null
  suggestedNextMaxSources: number
  needsRefresh:         boolean
  reason:               string
}

export async function getSourceCoverageStats(): Promise<SourceCoverageStats | null> {
  if (!isServerSupabaseConfigured || !supabaseServer) return null

  const now       = new Date()
  const h6start   = new Date(now.getTime() -  6 * 3_600_000).toISOString()
  const h24start  = new Date(now.getTime() - 24 * 3_600_000).toISOString()

  const { data, error } = await supabaseServer
    .from('sources')
    .select('health_status, last_fetch_at, is_blocked')
    .eq('platform', 'rss')
    .neq('data_origin', 'demo')

  if (error || !data) return null

  const sources = data as Array<{ health_status: string | null; last_fetch_at: string | null; is_blocked: boolean | null }>
  const active  = sources.filter(s => !s.is_blocked)

  const healthySources      = active.filter(s => s.health_status === 'healthy').length
  const degradedSources     = active.filter(s => s.health_status === 'degraded').length
  const failingSources      = active.filter(s => s.health_status === 'failing').length
  const neverFetchedSources = active.filter(s => !s.last_fetch_at).length
  const fetchedLast6h       = active.filter(s => s.last_fetch_at && s.last_fetch_at >= h6start).length
  const fetchedLast24h      = active.filter(s => s.last_fetch_at && s.last_fetch_at >= h24start).length

  // Oldest last_fetch_at (to show most overdue source)
  const fetchedSources = active.filter(s => s.last_fetch_at).map(s => s.last_fetch_at as string)
  const oldestLastFetchAt = fetchedSources.length > 0
    ? fetchedSources.sort()[0]
    : null

  // Suggest maxSources based on stale/unfetched sources
  const unfetchedOrStale = neverFetchedSources +
    active.filter(s => s.last_fetch_at && s.last_fetch_at < h24start).length
  const suggestedNextMaxSources = Math.min(Math.max(unfetchedOrStale, 4), 16)

  // Needs refresh if many sources haven't been fetched recently
  const needsRefresh = neverFetchedSources > 0 || fetchedLast24h < Math.ceil(active.length * 0.5)
  const reason = neverFetchedSources > 0
    ? `${neverFetchedSources} sources never fetched`
    : fetchedLast24h < active.length
      ? `${active.length - fetchedLast24h} sources not fetched in 24h`
      : 'all active sources fetched recently'

  return {
    totalActiveRss:        active.length,
    healthySources,
    degradedSources,
    failingSources,
    neverFetchedSources,
    fetchedLast6h,
    fetchedLast24h,
    oldestLastFetchAt,
    suggestedNextMaxSources,
    needsRefresh,
    reason,
  }
}
