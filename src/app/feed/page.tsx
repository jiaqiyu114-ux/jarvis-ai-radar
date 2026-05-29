import { getFeedItems } from "@/lib/data/feed-adapter"
import FeedClient from "./_feed-client"

export default async function FeedPage() {
  const items = await getFeedItems()
  return <FeedClient items={items} />
}
