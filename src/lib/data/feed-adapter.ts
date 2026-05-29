/**
 * Feed Adapter — data-source-agnostic access to feed items.
 *
 * Currently always returns mock data regardless of DataMode.
 * TODO (next sprint): in 'database' mode, call listItems() / listSelectedItems()
 * from @/lib/db/items and map DbItem → InformationItem.
 *
 * Pages should NOT import this yet — switch pages to use adapters after
 * the DbItem → InformationItem mapper is built and validated.
 */

import { mockItems } from '@/config/mock-data'
import type { InformationItem } from '@/types'

export async function getFeedItems(): Promise<InformationItem[]> {
  // TODO: if getDataMode() === 'database', call db listItems() and map results
  return mockItems
}

export async function getSelectedItems(): Promise<InformationItem[]> {
  // TODO: if getDataMode() === 'database', call db listSelectedItems() and map results
  return mockItems.filter((item) => item.finalScore >= 75)
}
