import { mockClusters } from '@/config/mock-data'
import { listClusters } from '@/lib/db/clusters'
import { shouldUseDatabase } from './runtime'
import type { MockCluster, Category } from '@/types'
import type { DbCluster } from '@/types/database'

// ── Type-safe category validator ──────────────────────────────────────────────

const validCategories: readonly Category[] = [
  'AI技术', '商业动态', '产品发布', '监管政策', '融资并购',
  '行业趋势', '开源项目', '研究报告', '人物动态', '其他',
]

function toCategory(s: string): Category {
  return validCategories.find(c => c === s) ?? '其他'
}

// ── DbCluster → MockCluster mapper ────────────────────────────────────────────
// relatedItemIds requires fetching items by cluster_id — not done here yet.

function mapDbCluster(cluster: DbCluster): MockCluster {
  return {
    id:             cluster.id,
    title:          cluster.title,
    primaryItemId:  cluster.main_item_id ?? '',
    relatedItemIds: [],
    sourceCount:    cluster.source_count,
    firstSeenAt:    cluster.first_seen_at,
    latestAt:       cluster.last_seen_at,
    momentum:       cluster.momentum_score,
    category:       toCategory(cluster.category),
  }
}

// ── Sync constant (Client Components) ────────────────────────────────────────

export const allClusters: MockCluster[] = mockClusters

// ── Async functions ───────────────────────────────────────────────────────────

/**
 * Returns event clusters for display.
 *
 * In DB mode: returns real clusters from the database (empty array if none yet).
 * mockClusters are demo data and are NOT shown by default in DB mode.
 * Pass { includeDemo: true } to append mock clusters as demo preview.
 *
 * In non-DB mode (no Supabase): always returns mockClusters for dev/demo.
 */
export async function getClusters(opts?: { includeDemo?: boolean }): Promise<MockCluster[]> {
  const includeDemo = opts?.includeDemo ?? false
  if (shouldUseDatabase()) {
    const rows = await listClusters()
    const realClusters = rows.map(mapDbCluster)
    if (includeDemo) {
      // Append mock clusters as demo overlay when explicitly requested
      return [...realClusters, ...mockClusters]
    }
    return realClusters   // May be empty — that is the correct real-data state
  }
  return mockClusters   // Non-DB mode only: always use mock
}
