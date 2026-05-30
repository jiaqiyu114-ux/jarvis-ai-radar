import { AppShell } from "@/components/layout/app-shell"
import { SourceTierBadge } from "@/components/feed/source-tier-badge"
import { getSourcesWithHealth } from "@/lib/data/sources-adapter"
import type { SourceHealthStatus } from "@/types/database"
import { cn } from "@/lib/utils"

// ── Health badge ──────────────────────────────────────────────────────────────

const HEALTH_STYLE: Record<SourceHealthStatus, string> = {
  healthy:  "bg-success/10 text-success border-success/25",
  degraded: "bg-warning/10 text-warning border-warning/25",
  blocked:  "bg-danger/10 text-danger border-danger/25",
  unknown:  "bg-muted text-muted-foreground border-border",
}

const HEALTH_DOT: Record<SourceHealthStatus, string> = {
  healthy:  "bg-success",
  degraded: "bg-warning",
  blocked:  "bg-danger",
  unknown:  "bg-muted-foreground",
}

function HealthBadge({ status }: { status: SourceHealthStatus }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full border font-medium",
      HEALTH_STYLE[status],
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full", HEALTH_DOT[status])} />
      {status}
    </span>
  )
}

// ── Relative time (no external dep) ──────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return "—"
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0)              return "just now"
  const m = Math.floor(diff / 60_000)
  if (m < 1)                 return "just now"
  if (m < 60)                return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)                return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SourcesPage() {
  const sources = await getSourcesWithHealth()
  const active  = sources.filter(s => !s.isBlocked).length

  return (
    <AppShell>
      <div className="p-8">

        {/* ── Editorial header ── */}
        <div className="mb-6">
          <p className="page-kicker mb-1">Source Library</p>
          <div className="flex items-end justify-between">
            <h1 className="editorial-title text-3xl">信源管理</h1>
            <p className="text-xs text-muted-foreground pb-1">
              {sources.length} 个信源 · {active} 个运行中
            </p>
          </div>
        </div>

        <div className="border border-border rounded-lg overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="text-left px-5 py-3"><span className="muted-label">信源</span></th>
                <th className="text-left px-4 py-3"><span className="muted-label">等级</span></th>
                <th className="text-left px-4 py-3"><span className="muted-label">分类</span></th>
                <th className="text-center px-4 py-3"><span className="muted-label">健康</span></th>
                <th className="text-right px-4 py-3"><span className="muted-label">失败次数</span></th>
                <th className="text-left px-4 py-3"><span className="muted-label">上次成功</span></th>
                <th className="text-left px-4 py-3"><span className="muted-label">上次失败</span></th>
                <th className="text-left px-4 py-3"><span className="muted-label">错误信息</span></th>
              </tr>
            </thead>
            <tbody>
              {sources.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center">
                    <p className="text-sm text-muted-foreground">暂无信源</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      配置 Supabase 后在 sources 表中添加信源，或运行 seed 脚本导入示例数据
                    </p>
                  </td>
                </tr>
              )}
              {sources.map(source => (
                <tr
                  key={source.id}
                  className="border-b border-border last:border-0 hover:bg-accent transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium text-foreground">{source.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[220px] truncate">
                      {source.url}
                    </p>
                    {source.isBlocked && (
                      <span className="text-[9px] text-danger font-medium">BLOCKED</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <SourceTierBadge tier={source.tier} />
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs text-muted-foreground">{source.category}</span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <HealthBadge status={source.healthStatus} />
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className={cn(
                      "text-xs font-mono tabular-nums",
                      source.failureCount > 0 ? "text-warning" : "text-muted-foreground",
                    )}>
                      {source.failureCount}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs text-muted-foreground">
                      {relativeTime(source.lastSuccessAt)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={cn(
                      "text-xs",
                      source.lastErrorAt ? "text-warning" : "text-muted-foreground",
                    )}>
                      {relativeTime(source.lastErrorAt)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 max-w-[200px]">
                    {source.lastErrorMessage ? (
                      <span
                        className="text-[10px] text-danger/80 truncate block"
                        title={source.lastErrorMessage}
                      >
                        {source.lastErrorMessage.slice(0, 80)}
                        {source.lastErrorMessage.length > 80 ? '…' : ''}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/40">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  )
}
