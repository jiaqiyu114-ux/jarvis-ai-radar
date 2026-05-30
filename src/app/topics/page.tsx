export const dynamic = 'force-dynamic'

import { getTopics } from "@/lib/data/topics-adapter"
import TopicsClient from "./_topics-client"

export default async function TopicsPage() {
  // No includeDemo — topics page always shows real data only.
  // The API itself prevents demo items from entering the pool.
  const topics = await getTopics()
  return <TopicsClient topics={topics} topSignal={undefined} />
}
