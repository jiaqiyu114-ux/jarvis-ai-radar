import { getClusters } from "@/lib/data/clusters-adapter"
import { getFeedItems } from "@/lib/data/feed-adapter"
import ClustersClient from "./_clusters-client"

export default async function ClustersPage() {
  const [clusters, items] = await Promise.all([getClusters(), getFeedItems()])
  return <ClustersClient clusters={clusters} items={items} />
}
