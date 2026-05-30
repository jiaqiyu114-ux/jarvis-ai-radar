import { getFeedItems } from "@/lib/data/feed-adapter"
import FeedClient from "./_feed-client"

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ includeDemo?: string; mode?: string }>
}) {
  const sp          = await searchParams
  const includeDemo = sp.includeDemo === 'true' || sp.mode === 'all'
  const items       = await getFeedItems({ includeDemo })
  return <FeedClient items={items} mode={includeDemo ? 'all' : 'real'} />
}
