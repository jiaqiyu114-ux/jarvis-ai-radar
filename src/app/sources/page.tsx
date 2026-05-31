import { getSourcesWithHealth } from "@/lib/data/sources-adapter"
import SourcesClient from "./_sources-client"

export const dynamic = "force-dynamic"

export default async function SourcesPage() {
  const sources = await getSourcesWithHealth()
  return <SourcesClient sources={sources} />
}
