import { getSourcesWithHealth } from "@/lib/data/sources-adapter"
import SourcesClient from "./_sources-client"

export const dynamic = "force-dynamic"

// Sort priority: healthy → degraded → unknown → failing → blocked
const HEALTH_ORDER: Record<string, number> = {
  healthy:  0,
  degraded: 1,
  unknown:  2,
  failing:  3,
  blocked:  4,
}

const TIER_ORDER: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4 }

export default async function SourcesPage() {
  const rawSources = await getSourcesWithHealth()
  // Sort: healthy sources first, failing/blocked last; within tier: higher tier first
  const sources = [...rawSources].sort((a, b) => {
    const ao = HEALTH_ORDER[a.healthStatus ?? 'unknown'] ?? 2
    const bo = HEALTH_ORDER[b.healthStatus ?? 'unknown'] ?? 2
    if (ao !== bo) return ao - bo
    const at = TIER_ORDER[a.tier ?? 'C'] ?? 3
    const bt = TIER_ORDER[b.tier ?? 'C'] ?? 3
    return at - bt
  })
  return <SourcesClient sources={sources} />
}
