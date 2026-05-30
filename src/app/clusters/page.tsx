export const dynamic = "force-dynamic"

import { listEventClusters, type EventClusterListItem } from "@/lib/db/event-clusters"
import ClustersClient from "./_clusters-client"

export default async function ClustersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; limit?: string }>
}) {
  const sp = await searchParams
  const status = sp.status ?? "all"
  const limit = Number(sp.limit) > 0 ? Math.min(Number(sp.limit), 100) : 20

  let clusters: EventClusterListItem[] = []
  let loadError: string | null = null
  try {
    const result = await listEventClusters({
      status,
      limit,
      includeItems: true,
    })
    clusters = result.clusters
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error)
  }

  const topSignal = clusters[0]
    ? {
        score: clusters[0].confidence,
        title: clusters[0].title,
        category: "事件簇",
      }
    : undefined

  return (
    <ClustersClient
      clusters={clusters}
      initialStatus={status}
      initialLimit={limit}
      loadError={loadError}
      topSignal={topSignal}
    />
  )
}
