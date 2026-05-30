import { mockSources } from '@/config/mock-data'
import { listSources } from '@/lib/db/sources'
import { shouldUseDatabase } from './runtime'
import type { MockSource, SourceTier, Category } from '@/types'
import type { DataOrigin, DbSource, DbSourceTier, SourceHealthStatus } from '@/types/database'

// ── Tier mapping: DbSourceTier has 'D'; SourceTier only goes to 'C' ──────────

function toSourceTier(t: DbSourceTier): SourceTier {
  return t === 'D' ? 'C' : t
}

// ── Type-safe category validator ──────────────────────────────────────────────

const validCategories: readonly Category[] = [
  'AI技术', '商业动态', '产品发布', '监管政策', '融资并购',
  '行业趋势', '开源项目', '研究报告', '人物动态', '其他',
]

function toCategory(s: string): Category {
  return validCategories.find(c => c === s) ?? '其他'
}

// ── DbSource → MockSource mapper ─────────────────────────────────────────────

function mapDbSource(source: DbSource): MockSource {
  return {
    id:            source.id,
    name:          source.name,
    url:           source.url,
    tier:          toSourceTier(source.source_tier),
    category:      toCategory(source.category),
    enabled:       !source.is_blocked,
    lastFetchedAt: source.last_fetched_at ?? source.created_at,
    itemsToday:    source.items_today,
    avgScore:      source.base_score,
    description:   source.description ?? '',
  }
}

// ── Async function ────────────────────────────────────────────────────────────

export async function getSources(): Promise<MockSource[]> {
  if (shouldUseDatabase()) {
    const rows = await listSources()
    if (rows.length > 0) return rows.map(mapDbSource)
  }
  return mockSources
}

// ── Health-aware source type ──────────────────────────────────────────────────

export type SourceWithHealth = {
  id:                   string
  name:                 string
  url:                  string
  platform:             string
  tier:                 SourceTier
  category:             Category
  isBlocked:            boolean
  description:          string | null
  itemsToday:           number
  avgScore:             number
  dataOrigin:           DataOrigin
  healthStatus:         SourceHealthStatus
  healthScore:          number
  failureCount:         number
  lastFetchAt:          string | null
  lastSuccessAt:        string | null
  lastErrorAt:          string | null
  lastErrorMessage:     string | null
  lastLatencyMs:        number | null
  // v2 fields
  lastFetchStatus:      string | null
  lastFetchErrorStage:  string | null
  totalFetchCount:      number
  successfulFetchCount: number
  failedFetchCount:     number
}

function mapDbSourceWithHealth(source: DbSource): SourceWithHealth {
  const s = source as DbSource & {
    last_fetch_status?:      string | null
    last_fetch_error_stage?: string | null
    total_fetch_count?:      number | null
    successful_fetch_count?: number | null
    failed_fetch_count?:     number | null
    health_score?:           number | null
  }
  return {
    id:                   source.id,
    name:                 source.name,
    url:                  source.url,
    platform:             source.platform,
    tier:                 toSourceTier(source.source_tier),
    category:             toCategory(source.category),
    isBlocked:            source.is_blocked,
    description:          source.description ?? null,
    itemsToday:           source.items_today,
    avgScore:             source.base_score,
    dataOrigin:           (source.data_origin as DataOrigin | undefined) ?? 'real',
    healthStatus:         source.health_status ?? 'unknown',
    healthScore:          s.health_score ?? 50,
    failureCount:         source.failure_count ?? 0,
    lastFetchAt:          source.last_fetch_at ?? null,
    lastSuccessAt:        source.last_success_at ?? null,
    lastErrorAt:          source.last_error_at ?? null,
    lastErrorMessage:     source.last_error_message ?? null,
    lastLatencyMs:        source.last_latency_ms ?? null,
    lastFetchStatus:      s.last_fetch_status ?? null,
    lastFetchErrorStage:  s.last_fetch_error_stage ?? null,
    totalFetchCount:      s.total_fetch_count ?? 0,
    successfulFetchCount: s.successful_fetch_count ?? 0,
    failedFetchCount:     s.failed_fetch_count ?? 0,
  }
}

export async function getSourcesWithHealth(): Promise<SourceWithHealth[]> {
  const rows = await listSources()
  return rows.map(mapDbSourceWithHealth)
}
