/**
 * Topics Adapter — data-source-agnostic access to topic pool.
 *
 * Exposes:
 *   - Async functions for Server Components.
 *   - Sync constants for Client Components.
 *
 * Currently always returns mock data.
 * TODO (next sprint): in 'database' mode, call listTopics() from @/lib/db/topics
 * and map DbTopic → TopicItem.
 */

import { mockTopics } from '@/config/mock-data'
import type { TopicItem } from '@/types'

// ── Sync constants — Client Components use these directly ─────────────────────

export const allTopics: TopicItem[] = mockTopics

// ── Async functions — Server Components and future DB integration ─────────────

export async function getTopics(): Promise<TopicItem[]> {
  // TODO: if getDataMode() === 'database', call db listTopics() and map results
  return allTopics
}
