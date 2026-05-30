import { getTopics } from "@/lib/data/topics-adapter"
import TopicsClient from "./_topics-client"

export default async function TopicsPage() {
  const topics = await getTopics()
  return <TopicsClient topics={topics} topSignal={undefined} />
}
