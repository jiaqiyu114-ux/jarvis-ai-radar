import { getFeedItems } from "@/lib/data/feed-adapter"
import FeedClient from "./_feed-client"

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ includeDemo?: string; mode?: string }>
}) {
  const sp          = await searchParams
  const includeDemo = sp.includeDemo === 'true' || sp.mode === 'all'
  const items       = await getFeedItems({ includeDemo, sortBy: 'time', limit: 50 })
  const topSignal   = items[0]
    ? { score: items[0].finalScore, title: items[0].title, category: items[0].category }
    : undefined
  return <FeedClient items={items} mode={includeDemo ? 'all' : 'real'} topSignal={topSignal} />
}
