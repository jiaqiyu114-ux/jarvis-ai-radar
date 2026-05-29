/**
 * Clusters Adapter — data-source-agnostic access to event clusters.
 *
 * Exposes:
 *   - Async functions for Server Components.
 *   - Sync constants for Client Components.
 *
 * Currently always returns mock data.
 * TODO (next sprint): in 'database' mode, call listClusters() from @/lib/db/clusters
 * and map DbCluster → MockCluster.
 */

import { mockClusters } from '@/config/mock-data'
import type { MockCluster } from '@/types'

// ── Sync constants — Client Components use these directly ─────────────────────

export const allClusters: MockCluster[] = mockClusters

// ── Async functions — Server Components and future DB integration ─────────────

export async function getClusters(): Promise<MockCluster[]> {
  // TODO: if getDataMode() === 'database', call db listClusters() and map results
  return allClusters
}
