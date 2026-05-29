import { mockSources } from '@/config/mock-data'
import { listSources } from '@/lib/db/sources'
import { shouldUseDatabase } from './runtime'
import type { MockSource, SourceTier, Category } from '@/types'
import type { DbSource, DbSourceTier } from '@/types/database'

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
