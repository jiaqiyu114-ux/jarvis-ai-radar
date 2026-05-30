import { getClusters } from "@/lib/data/clusters-adapter"
import { getFeedItems } from "@/lib/data/feed-adapter"
import ClustersClient from "./_clusters-client"

export default async function ClustersPage({
  searchParams,
}: {
  searchParams: Promise<{ includeDemo?: string; mode?: string }>
}) {
  const sp          = await searchParams
  const includeDemo = sp.includeDemo === 'true' || sp.mode === 'all'

  const [clusters, items] = await Promise.all([
    getClusters({ includeDemo }),
    getFeedItems({ includeDemo }),
  ])

  const topSignal = items[0]
    ? { score: items[0].finalScore, title: items[0].title, category: items[0].category }
    : undefined

  return (
    <ClustersClient
      clusters={clusters}
      items={items}
      includeDemo={includeDemo}
      topSignal={topSignal}
    />
  )
}
