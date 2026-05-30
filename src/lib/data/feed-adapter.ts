import { mockItems, mockStats } from '@/config/mock-data'
import { listItemsWithSource, listItems } from '@/lib/db/items'
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

// ── Shared origin filter ──────────────────────────────────────────────────────

/**
 * Exclude items marked as demo or mock data.
 * Works with any object that may carry a data_origin field.
 * Items without the field (pre-migration) are treated as real and pass through.
 */
export function filterRealItems<T extends object>(rows: T[]): T[] {
  return rows.filter(r => {
    const origin = (r as Record<string, unknown>)['data_origin'] as string | undefined
    return origin !== 'demo' && origin !== 'mock'
  })
}

/** True if the item should be excluded from the real-only feed. */
export function isDemoItem(item: { data_origin?: string }): boolean {
  return item.data_origin === 'demo' || item.data_origin === 'mock'
}

// ── Sync constants (Client Components) — always mock ─────────────────────────
// Client Components cannot await at module load; they use these as initial data.

export const allItems:       InformationItem[] = mockItems
export const dashboardStats: DashboardStats    = mockStats

// ── Async functions (Server Components + DB integration) ──────────────────────
// Pattern: try DB first; fall back to mock if DB returns nothing or is unconfigured.

/**
 * Returns feed items for display.
 *
 * By default excludes items marked data_origin='demo' or 'mock' (from mock-provider,
 * seed scripts, etc.) so the main feed shows only real ingest data.
 *
 * Pass { includeDemo: true } to include all items (for debugging / preview).
 * Items without the data_origin column (pre-migration rows) pass through as-is.
 */
export async function getFeedItems(opts?: { includeDemo?: boolean }): Promise<InformationItem[]> {
  const includeDemo = opts?.includeDemo ?? false
  if (shouldUseDatabase()) {
    // Sort by final_score desc so highest-quality items appear first in the feed
    const rows = await listItemsWithSource({ sortByScore: true })
    const relevant = includeDemo
      ? rows
      : rows.filter(r => {
          // r.data_origin may be undefined if the column hasn't been migrated yet;
          // in that case let the item through (safe default).
          const origin = (r as { data_origin?: string }).data_origin
          return origin !== 'demo' && origin !== 'mock'
        })
    if (relevant.length > 0) return relevant.map(mapDbItem)
  }
  return mockItems
}

/**
 * Returns items with final_score >= 75 for the 精选流 page.
 *
 * Key change from previous version: does NOT filter by status='selected' because
 * real RSS items are ingested with status='new' or 'scored', never 'selected'.
 * Filtering by status would always return empty → mock fallback.
 *
 * In DB mode: returns real high-score items (empty array if none — no mock fallback).
 * Pass { includeDemo: true } to also include demo/mock items.
 */
export async function getSelectedItems(opts?: { includeDemo?: boolean }): Promise<InformationItem[]> {
  const includeDemo = opts?.includeDemo ?? false
  if (shouldUseDatabase()) {
    const rows = await listItemsWithSource({ sortByScore: true, minScore: 75 })
    const relevant = includeDemo ? rows : filterRealItems(rows)
    return relevant.map(mapDbItem)   // returns [] if empty — no static mock fallback in DB mode
  }
  return mockItems.filter(item => item.finalScore >= 75)
}

export async function getDashboardStats(): Promise<DashboardStats> {
  if (shouldUseDatabase()) {
    const all = await listItems({ limit: 500 })
    const realAll       = filterRealItems(all)
    const realHighScore = realAll.filter(i => i.final_score >= 75)
    if (realAll.length > 0) {
      return {
        todayTotal:     realAll.length,
        highScoreCount: realHighScore.length,
        newClusters:    0,
        pendingTopics:  0,
      }
    }
  }
  return mockStats
}
