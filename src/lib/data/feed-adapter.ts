import { mockItems, mockStats } from '@/config/mock-data'
import { listItemsWithSource, listSelectedItemsWithSource, listItems } from '@/lib/db/items'
import { shouldUseDatabase } from './runtime'
import type { InformationItem, DashboardStats, Category, SourceTier } from '@/types'
import type { DbItemWithSource } from '@/lib/db/items'
import type { DbSourceTier } from '@/types/database'

// ── Type-safe category validator ──────────────────────────────────────────────

const validCategories: readonly Category[] = [
  'AI技术', '商业动态', '产品发布', '监管政策', '融资并购',
  '行业趋势', '开源项目', '研究报告', '人物动态', '其他',
]

function toCategory(s: string): Category {
  return validCategories.find(c => c === s) ?? '其他'
}

// Safe tier normaliser: handles null/undefined/'D'/lowercase/unknown from DB rows
function toSourceTier(t: DbSourceTier | string | null | undefined): SourceTier {
  const s = String(t ?? '').trim().toUpperCase()
  if (s === 'S' || s === 'A' || s === 'B' || s === 'C') return s
  return 'C'   // D, null, undefined, empty → C
}

// ── DbItemWithSource → InformationItem mapper ─────────────────────────────────
// sources JOIN provides name + tier; falls back to cached source_tier if JOIN null.
// All fields are defensively defaulted so a single dirty DB row never crashes.

function mapDbItem(item: DbItemWithSource): InformationItem {
  const sourceName = item.sources?.name ?? (item.source_id ? '未知信源' : 'Unknown Source')
  const rawTier    = item.sources?.source_tier ?? item.source_tier

  return {
    id:          item.id,
    title:       item.title || '(no title)',
    summary:     item.summary || '',
    source:      sourceName,
    sourceTier:  toSourceTier(rawTier),
    publishedAt: item.published_at,
    category:    toCategory(item.category),
    tags:        item.tags ?? [],
    finalScore:  item.final_score,
    scoreBreakdown: {
      ai_relevance:      item.ai_relevance_score,
      source_score:      item.source_score,
      importance:        item.importance_score,
      novelty:           item.novelty_score,
      momentum:          item.momentum_score,
      credibility:       item.credibility_score,
      actionability:     item.actionability_score,
      content_potential: item.content_potential_score,
      personal_fit:      item.personal_fit_score,
    },
    originalUrl:        item.url,
    relatedReportCount: 0,
  }
}

// ── Sync constants (Client Components) — always mock ─────────────────────────
// Client Components cannot await at module load; they use these as initial data.

export const allItems:       InformationItem[] = mockItems
export const dashboardStats: DashboardStats    = mockStats

// ── Async functions (Server Components + DB integration) ──────────────────────
// Pattern: try DB first; fall back to mock if DB returns nothing or is unconfigured.

export async function getFeedItems(): Promise<InformationItem[]> {
  if (shouldUseDatabase()) {
    // Sort by final_score desc so highest-quality items appear first in the feed
    const rows = await listItemsWithSource({ sortByScore: true })
    if (rows.length > 0) return rows.map(mapDbItem)
  }
  return mockItems
}

export async function getSelectedItems(): Promise<InformationItem[]> {
  if (shouldUseDatabase()) {
    const rows = await listSelectedItemsWithSource()
    if (rows.length > 0) return rows.map(mapDbItem)
  }
  return mockItems.filter(item => item.finalScore >= 75)
}

export async function getDashboardStats(): Promise<DashboardStats> {
  if (shouldUseDatabase()) {
    const [all, selected] = await Promise.all([
      listItems({ limit: 500 }),
      listItems({ minScore: 75, limit: 500 }),
    ])
    if (all.length > 0) {
      return {
        todayTotal:     all.length,
        highScoreCount: selected.length,
        newClusters:    0,
        pendingTopics:  0,
      }
    }
  }
  return mockStats
}
