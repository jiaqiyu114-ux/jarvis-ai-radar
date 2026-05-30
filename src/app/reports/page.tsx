import { getDailyReport } from "@/lib/data/reports-adapter"
import { getFeedItems } from "@/lib/data/feed-adapter"
import { getTopics } from "@/lib/data/topics-adapter"
import { AppShell } from "@/components/layout/app-shell"
import ReportsClient from "./_reports-client"

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ includeDemo?: string; mode?: string }>
}) {
  const sp          = await searchParams
  const includeDemo = sp.includeDemo === 'true' || sp.mode === 'all'

  const [report, items, topics] = await Promise.all([
    getDailyReport({ includeDemo }),
    getFeedItems({ includeDemo }),
    getTopics({ includeDemo }),
  ])

  const topSignal = items[0]
    ? { score: items[0].finalScore, title: items[0].title, category: items[0].category }
    : undefined

  // No real report yet (pipeline not wired up) — show empty state
  if (!report) {
    return (
      <AppShell topSignal={topSignal}>
        <div className="p-8 max-w-[900px]">
          <p className="page-kicker mb-1">Daily Brief</p>
          <h1 className="editorial-title text-[2.25rem]">今日日报</h1>
          <div className="mt-8 rounded-lg border border-border py-16 text-center bg-card">
            <p className="text-sm text-muted-foreground">真实日报尚未生成</p>
            <p className="text-xs text-muted-foreground/60 mt-2">
              日报需要完整管道（评分 → 聚类 → AI 摘要），当前尚未接入
            </p>
            <p className="text-[10px] text-muted-foreground/40 mt-3">
              添加 ?includeDemo=true 可查看演示日报
            </p>
          </div>
        </div>
      </AppShell>
    )
  }

  const highItems = items
    .filter(i => i.finalScore >= 80)
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, 5)

  const worthWritingCount = topics.filter(t => t.status === 'worth_writing').length

  return (
    <ReportsClient
      report={report}
      highItems={highItems}
      worthWritingCount={worthWritingCount}
      topSignal={topSignal}
      includeDemo={includeDemo}
    />
  )
}
