import { ExternalLink } from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { StatCard } from "@/components/dashboard/stat-card"
import { InformationCard } from "@/components/feed/information-card"
import { ScoreBadge } from "@/components/feed/score-badge"
import { SourceTierBadge } from "@/components/feed/source-tier-badge"
import { mockStats, mockItems } from "@/config/mock-data"
import { LayoutDashboard, TrendingUp, GitBranch, BookOpen } from "lucide-react"
import { cn } from "@/lib/utils"

const mustReadItems  = mockItems.filter(i => i.finalScore >= 88)
const highScoreItems = mockItems.filter(i => i.finalScore >= 75 && i.finalScore < 88)
const trendingItems  = mockItems.filter(i => i.scoreBreakdown.momentum >= 82)
const contentItems   = mockItems.filter(i => i.scoreBreakdown.content_potential >= 82)
const topItem        = [...mockItems].sort((a, b) => b.finalScore - a.finalScore)[0]

const categoryColorMap: Record<string, string> = {
  'AI技术':   'text-blue-700 bg-blue-100 dark:text-blue-400 dark:bg-blue-400/10',
  '商业动态': 'text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-400/10',
  '产品发布': 'text-sky-700 bg-sky-100 dark:text-cyan-400 dark:bg-cyan-400/10',
  '监管政策': 'text-amber-700 bg-amber-100 dark:text-orange-400 dark:bg-orange-400/10',
  '融资并购': 'text-yellow-700 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-400/10',
  '行业趋势': 'text-violet-700 bg-violet-100 dark:text-violet-400 dark:bg-violet-400/10',
  '开源项目': 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-400/10',
  '研究报告': 'text-stone-600 bg-stone-100 dark:text-slate-400 dark:bg-slate-400/10',
  '人物动态': 'text-rose-700 bg-rose-100 dark:text-pink-400 dark:bg-pink-400/10',
}

/** Simple quick-item for the right 33% panel — avoids narrow-column InformationCard issues */
function QuickItem({ item }: { item: (typeof mockItems)[number] }) {
  return (
    <div className="flex items-start gap-2.5 py-2 px-3 rounded-md hover:bg-accent transition-colors">
      <ScoreBadge score={item.finalScore} size="sm" />
      <div className="flex-1 min-w-0">
        <a
          href={item.originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-foreground hover:text-primary leading-snug line-clamp-2 transition-colors block"
        >
          {item.title}
        </a>
        <div className="flex items-center gap-1.5 mt-0.5">
          <SourceTierBadge tier={item.sourceTier} />
          <span className="text-[10px] text-muted-foreground truncate">{item.source}</span>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const topCatColor = topItem
    ? (categoryColorMap[topItem.category] ?? 'text-stone-500 bg-stone-100 dark:text-muted-foreground dark:bg-muted')
    : ''

  return (
    <AppShell>
      <div className="p-6 md:p-8 max-w-[1280px]">

        {/* ── Editorial header ── */}
        <div className="mb-6">
          <p className="page-kicker mb-1">Today&apos;s Signals</p>
          <h1 className="editorial-title text-[2.25rem]">今日雷达</h1>
          <p className="page-subtitle mt-1.5">
            已抓取{' '}
            <span className="text-foreground font-medium tabular-nums">{mockStats.todayTotal}</span> 条
            {' · '}高分{' '}
            <span className="text-foreground font-medium tabular-nums">{mockStats.highScoreCount}</span> 条
            {' · '}待评估选题{' '}
            <span className="text-foreground font-medium tabular-nums">{mockStats.pendingTopics}</span> 个
          </p>
        </div>

        {/* ── Top Signal strip ── */}
        {topItem && (
          <div className="relative flex items-center gap-4 px-5 py-3 rounded-lg bg-primary/8 border border-primary/15 mb-5 overflow-hidden">
            <div className="absolute left-0 inset-y-0 w-1 bg-primary rounded-l-lg" />
            <div className="shrink-0 text-center">
              <p className="page-kicker text-primary/70 mb-1">今日最高</p>
              <ScoreBadge score={topItem.finalScore} size="md" />
            </div>
            <div className="flex-1 min-w-0">
              <a
                href={topItem.originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-foreground hover:text-primary transition-colors line-clamp-1 block"
              >
                {topItem.title}
              </a>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{topItem.summary}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <SourceTierBadge tier={topItem.sourceTier} />
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", topCatColor)}>
                {topItem.category}
              </span>
              <a
                href={topItem.originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground/40 hover:text-primary transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        )}

        {/* ── Stats row (lightweight) ── */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <StatCard label="今日抓取"    value={mockStats.todayTotal}   change="+12 较昨日"  icon={LayoutDashboard} trend="up" />
          <StatCard label="高分 ≥80"   value={mockStats.highScoreCount} change="占比 15.6%" icon={TrendingUp}       trend="up" accent />
          <StatCard label="活跃事件簇"  value={mockStats.newClusters}   change="持续追踪"   icon={GitBranch} />
          <StatCard label="待评估选题"  value={mockStats.pendingTopics} change="2 个值得写" icon={BookOpen}         trend="up" />
        </div>

        {/* ── Main section: Must-Read (66%) + Quick list (33%) ── */}
        <div className="grid grid-cols-3 gap-6 mb-6">

          {/* Left col-span-2: Must-Read — 66% width, InformationCard works fine here */}
          <div className="col-span-2 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
              <h2 className="section-title text-primary/80">今日必须看</h2>
              <span className="meta-text">≥ 88 分</span>
            </div>
            <div className="border border-primary/15 rounded-lg overflow-hidden bg-primary/3">
              {mustReadItems.length > 0
                ? mustReadItems.slice(0, 4).map(item => (
                    <InformationCard key={item.id} item={item} scoreSize="md" />
                  ))
                : <div className="py-6 text-center text-xs text-muted-foreground">暂无必读内容</div>
              }
            </div>
          </div>

          {/* Right col-span-1: High-score quick list — 33% width, uses QuickItem to avoid squeeze */}
          <div className="col-span-1 space-y-4">

            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" />
                <h2 className="section-title">高分精选</h2>
                <span className="meta-text">75–87</span>
              </div>
              <div>
                {highScoreItems.slice(0, 6).map(item => <QuickItem key={item.id} item={item} />)}
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
                <h2 className="section-title">趋势上升</h2>
              </div>
              <div>
                {trendingItems.slice(0, 3).map(item => <QuickItem key={item.id} item={item} />)}
              </div>
            </div>

          </div>
        </div>

        {/* ── Second row: Content potential (full width, lighter) ── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
            <h2 className="section-title">适合写成内容</h2>
            <span className="meta-text">内容潜力 ≥ 82</span>
          </div>
          <div className="grid grid-cols-2 gap-0 border border-border rounded-lg overflow-hidden bg-card">
            {contentItems.slice(0, 4).map(item => <InformationCard key={item.id} item={item} />)}
          </div>
        </div>

      </div>
    </AppShell>
  )
}
