/**
 * Topics Adapter — data-source-agnostic access to topic pool.
 *
 * Currently always returns mock data.
 * TODO (next sprint): in 'database' mode, call listTopics() from @/lib/db/topics
 * and map DbTopic → TopicItem.
 *
 * Pages should NOT import this yet.
 */

import { mockTopics } from '@/config/mock-data'
import type { TopicItem } from '@/types'

export async function getTopics(): Promise<TopicItem[]> {
  // TODO: if getDataMode() === 'database', call db listTopics() and map results
  return mockTopics
}
