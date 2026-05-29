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

export async function getClusters(): Promise<MockCluster[]> {
  if (shouldUseDatabase()) {
    const rows = await listClusters()
    if (rows.length > 0) return rows.map(mapDbCluster)
  }
  return mockClusters
}
