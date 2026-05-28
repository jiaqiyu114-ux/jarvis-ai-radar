import { AppShell } from "@/components/layout/app-shell"
import { SourceTierBadge } from "@/components/feed/source-tier-badge"
import { mockSources } from "@/config/mock-data"
import { formatDistanceToNow } from "date-fns"
import { zhCN } from "date-fns/locale"
import { cn } from "@/lib/utils"

export default function SourcesPage() {
  const enabled = mockSources.filter(s => s.enabled).length

  return (
    <AppShell>
      <div className="p-8">

        {/* ── Editorial header ── */}
        <div className="mb-6">
          <p className="page-kicker mb-1">Source Library</p>
          <div className="flex items-end justify-between">
            <h1 className="editorial-title text-3xl">信源管理</h1>
            <p className="text-xs text-muted-foreground pb-1">
              {mockSources.length} 个信源 · {enabled} 个运行中
            </p>
          </div>
        </div>

        <div className="border border-border rounded-lg overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="text-left px-5 py-3">
                  <span className="muted-label">信源</span>
                </th>
                <th className="text-left px-4 py-3">
                  <span className="muted-label">等级</span>
                </th>
                <th className="text-left px-4 py-3">
                  <span className="muted-label">分类</span>
                </th>
                <th className="text-right px-4 py-3">
                  <span className="muted-label">今日</span>
                </th>
                <th className="text-right px-4 py-3">
                  <span className="muted-label">均分</span>
                </th>
                <th className="text-left px-4 py-3">
                  <span className="muted-label">上次抓取</span>
                </th>
                <th className="text-center px-4 py-3">
                  <span className="muted-label">状态</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {mockSources.map(source => {
                const lastFetch = formatDistanceToNow(new Date(source.lastFetchedAt), {
                  addSuffix: true,
                  locale: zhCN,
                })
                return (
                  <tr
                    key={source.id}
                    className="border-b border-border last:border-0 hover:bg-accent transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-medium text-foreground">{source.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{source.description}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <SourceTierBadge tier={source.tier} />
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs text-muted-foreground">{source.category}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-xs font-mono text-foreground tabular-nums">{source.itemsToday}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className={cn(
                        "text-xs font-mono tabular-nums",
                        source.avgScore >= 70 ? "text-success" :
                        source.avgScore >= 50 ? "text-warning" : "text-danger"
                      )}>
                        {source.avgScore}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs text-muted-foreground">{lastFetch}</span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={cn(
                        "inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full border font-medium",
                        source.enabled
                          ? "bg-success/10 text-success border-success/25"
                          : "bg-muted text-muted-foreground border-border"
                      )}>
                        <span className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          source.enabled ? "bg-success" : "bg-muted-foreground"
                        )} />
                        {source.enabled ? '运行中' : '已暂停'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  )
}
