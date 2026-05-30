import { getTopics } from "@/lib/data/topics-adapter"
import TopicsClient from "./_topics-client"

export default async function TopicsPage({
  searchParams,
}: {
  searchParams: Promise<{ includeDemo?: string; mode?: string }>
}) {
  const sp          = await searchParams
  const includeDemo = sp.includeDemo === 'true' || sp.mode === 'all'
  const topics      = await getTopics({ includeDemo })
  return <TopicsClient topics={topics} topSignal={undefined} includeDemo={includeDemo} />
}
