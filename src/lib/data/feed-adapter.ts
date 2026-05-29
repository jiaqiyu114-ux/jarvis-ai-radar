/**
 * Feed Adapter — data-source-agnostic access to feed items and dashboard stats.
 *
 * Exposes:
 *   - Async functions for Server Components (await-able).
 *   - Sync constants for Client Components that cannot await during render.
 *
 * Currently always returns mock data.
 * TODO (next sprint): in 'database' mode, call listItems() / listSelectedItems()
 * from @/lib/db/items and map DbItem → InformationItem.
 */

import { mockItems, mockStats } from '@/config/mock-data'
import type { InformationItem, DashboardStats } from '@/types'

// ── Sync constants — Client Components use these directly ─────────────────────
// Future migration: replace with SWR / server-props pattern for live data.

export const allItems: InformationItem[] = mockItems
export const dashboardStats: DashboardStats = mockStats

// ── Async functions — Server Components and future DB integration ─────────────

export async function getFeedItems(): Promise<InformationItem[]> {
  // TODO: if getDataMode() === 'database', call db listItems() and map results
  return allItems
}

export async function getSelectedItems(): Promise<InformationItem[]> {
  // TODO: if getDataMode() === 'database', call db listSelectedItems() and map results
  return allItems.filter((item) => item.finalScore >= 75)
}

export async function getDashboardStats(): Promise<DashboardStats> {
  // TODO: if getDataMode() === 'database', aggregate from db
  return dashboardStats
}
