import { getFeedItems } from "@/lib/data/feed-adapter"
import FeedClient from "./_feed-client"

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ includeDemo?: string; mode?: string; q?: string }>
}) {
  const sp          = await searchParams
  const includeDemo = sp.includeDemo === 'true' || sp.mode === 'all'
  const query       = (sp.q ?? '').trim()
  const items       = await getFeedItems({ includeDemo, sortBy: 'time', limit: query ? 120 : 50 })
  const topSignal   = items[0]
    ? { score: items[0].finalScore, title: items[0].title, category: items[0].category }
    : undefined
  return <FeedClient key={query} items={items} mode={includeDemo ? 'all' : 'real'} topSignal={topSignal} initialSearch={query} />
}
