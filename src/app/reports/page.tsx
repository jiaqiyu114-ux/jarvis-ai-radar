import { getDailyReport } from "@/lib/data/reports-adapter"
import { getFeedItems } from "@/lib/data/feed-adapter"
import { getTopics } from "@/lib/data/topics-adapter"
import ReportsClient from "./_reports-client"

export default async function ReportsPage() {
  const [report, items, topics] = await Promise.all([
    getDailyReport(),
    getFeedItems(),
    getTopics(),
  ])

  const highItems = items
    .filter(i => i.finalScore >= 80)
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, 5)

  const worthWritingCount = topics.filter(t => t.status === 'worth_writing').length
  const topSignal = items[0]
    ? { score: items[0].finalScore, title: items[0].title, category: items[0].category }
    : undefined

  return (
    <ReportsClient
      report={report}
      highItems={highItems}
      worthWritingCount={worthWritingCount}
      topSignal={topSignal}
    />
  )
}
