/**
 * Sources Adapter — data-source-agnostic access to source list.
 *
 * Currently always returns mock data.
 * TODO (next sprint): in 'database' mode, call listSources() from @/lib/db/sources
 * and map DbSource → MockSource.
 *
 * Pages should NOT import this yet.
 */

import { mockSources } from '@/config/mock-data'
import type { MockSource } from '@/types'

export async function getSources(): Promise<MockSource[]> {
  // TODO: if getDataMode() === 'database', call db listSources() and map results
  return mockSources
}
