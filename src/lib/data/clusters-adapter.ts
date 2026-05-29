/**
 * Clusters Adapter — data-source-agnostic access to event clusters.
 *
 * Currently always returns mock data.
 * TODO (next sprint): in 'database' mode, call listClusters() from @/lib/db/clusters
 * and map DbCluster → MockCluster.
 *
 * Pages should NOT import this yet.
 */

import { mockClusters } from '@/config/mock-data'
import type { MockCluster } from '@/types'

export async function getClusters(): Promise<MockCluster[]> {
  // TODO: if getDataMode() === 'database', call db listClusters() and map results
  return mockClusters
}
