import { AppShell } from "@/components/layout/app-shell"
import { SourceTierBadge } from "@/components/feed/source-tier-badge"
import { getSourcesWithHealth } from "@/lib/data/sources-adapter"
import type { SourceHealthStatus } from "@/types/database"
import { cn } from "@/lib/utils"

// ── Health badge ──────────────────────────────────────────────────────────────

const HEALTH_STYLE: Record<SourceHealthStatus, string> = {
  healthy:  "bg-success/10 text-success border-success/25",
  degraded: "bg-warning/10 text-warning border-warning/25",
  failing:  "bg-danger/10 text-danger border-danger/25",
  blocked:  "bg-danger/10 text-danger border-danger/25",
  unknown:  "bg-muted text-muted-foreground border-border",
}

const HEALTH_LABEL: Record<SourceHealthStatus, string> = {
  healthy:  '正常',
  degraded: '不稳定',
  failing:  '连续失败',
  blocked:  '已屏蔽',
  unknown:  '未检测',
}

const FETCH_STATUS_LABEL: Record<string, string> = {
  success:     '成功',
  failed:      '失败',
  timeout:     '抓取超时',
  aborted:     '请求中断/超时',
  parse_error: '解析失败',
  db_error:    '数据库写入失败',
}

function fetchStatusLabel(status: string | null): string {
  if (!status) return '—'
  return FETCH_STATUS_LABEL[status] ?? status
}

const HEALTH_DOT: Record<SourceHealthStatus, string> = {
  healthy:  "bg-success",
  degraded: "bg-warning",
  failing:  "bg-danger",
  blocked:  "bg-danger",
  unknown:  "bg-muted-foreground",
}

function HealthBadge({ status, isRss }: { status: SourceHealthStatus; isRss: boolean }) {
  if (!isRss) {
    return <span className="text-[10px] text-muted-foreground/40">—</span>
  }
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full border font-medium",
      HEALTH_STYLE[status] ?? HEALTH_STYLE.unknown,
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full", HEALTH_DOT[status] ?? HEALTH_DOT.unknown)} />
      {HEALTH_LABEL[status] ?? status}
    </span>
  )
}

// ── Platform badge ────────────────────────────────────────────────────────────

function PlatformBadge({ platform }: { platform: string }) {
  const isRss  = platform === 'rss'
  const isMock = platform === 'rest_api' || platform === 'mock'
  return (
    <span className={cn(
      "text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase",
      isRss  && "text-primary/70 border-primary/20 bg-primary/5",
      isMock && "text-muted-foreground/50 border-border/40",
      !isRss && !isMock && "text-muted-foreground/50 border-border/40",
    )}>
      {platform}
    </span>
  )
}

// ── Relative time (no external dep) ──────────────────────────────────────────

// ── Stat pill ─────────────────────────────────────────────────────────────────

function StatPill({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("font-mono font-semibold tabular-nums", accent ?? "text-foreground")}>
        {value}
      </span>
      {label}
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SourcesPage() {
  const sources = await getSourcesWithHealth()

  const rssSources  = sources.filter(s => s.platform === 'rss')
  const healthy     = rssSources.filter(s => s.healthStatus === 'healthy').length
  const degraded    = rssSources.filter(s => s.healthStatus === 'degraded').length
  const failing     = rssSources.filter(s => s.healthStatus === 'failing').length
  const demoSources = sources.filter(s => s.dataOrigin === 'demo').length
  const active      = sources.filter(s => !s.isBlocked).length

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

        {/* ── Stats bar ── */}
        <div className="flex items-center gap-5 mb-4 px-1">
          <StatPill label="Total"   value={sources.length} />
          <span className="w-px h-3 bg-border" />
          <StatPill label="RSS"     value={rssSources.length} accent="text-primary/80" />
          <StatPill label="正常"   value={healthy}   accent="text-success" />
          <StatPill label="不稳定" value={degraded}  accent="text-warning" />
          {failing > 0 && <StatPill label="连续失败" value={failing} accent="text-danger" />}
          <span className="w-px h-3 bg-border" />
          <StatPill label="demo/mock" value={demoSources} accent="text-muted-foreground/50" />
        </div>

        <div className="border border-border rounded-lg overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="text-left px-5 py-3"><span className="muted-label">信源</span></th>
                <th className="text-left px-4 py-3"><span className="muted-label">类型</span></th>
                <th className="text-left px-4 py-3"><span className="muted-label">等级</span></th>
                <th className="text-center px-4 py-3"><span className="muted-label">健康状态</span></th>
                <th className="text-right px-4 py-3"><span className="muted-label">分数</span></th>
                <th className="text-right px-4 py-3"><span className="muted-label">成功/失败</span></th>
                <th className="text-left px-4 py-3"><span className="muted-label">上次状态</span></th>
                <th className="text-left px-4 py-3"><span className="muted-label">延迟</span></th>
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
              {sources.map(source => {
                const isRss  = source.platform === 'rss'
                const isDemo = source.dataOrigin === 'demo'
                return (
                  <tr
                    key={source.id}
                    className={cn(
                      "border-b border-border last:border-0 hover:bg-accent transition-colors",
                      isDemo && "opacity-60",
                    )}
                  >
                    <td className="px-5 py-3.5">
                      <p className={cn(
                        "text-sm font-medium",
                        isDemo ? "text-muted-foreground" : "text-foreground",
                      )}>
                        {source.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[220px] truncate">
                        {source.url}
                      </p>
                      {source.isBlocked && (
                        <span className="text-[9px] text-danger font-medium">BLOCKED</span>
                      )}
                      {isDemo && (
                        <span className="text-[9px] text-muted-foreground/50 font-medium">DEMO</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <PlatformBadge platform={source.platform} />
                    </td>
                    <td className="px-4 py-3.5">
                      <SourceTierBadge tier={source.tier} />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <HealthBadge status={source.healthStatus} isRss={isRss} />
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {isRss ? (
                        <span className={cn(
                          "text-xs font-mono tabular-nums",
                          source.healthScore >= 70 ? "text-success" :
                          source.healthScore >= 40 ? "text-warning" : "text-danger",
                        )}>
                          {source.healthScore}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {isRss ? (
                        <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                          <span className="text-success">{source.successfulFetchCount}</span>
                          <span className="text-muted-foreground/40">/</span>
                          <span className={source.failedFetchCount > 0 ? "text-warning" : "text-muted-foreground"}>{source.failedFetchCount}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {isRss ? (
                        <div className="space-y-0.5">
                          <span className={cn(
                            "text-[10px] block",
                            source.lastFetchStatus === 'success' ? "text-success" : source.lastFetchStatus ? "text-warning" : "text-muted-foreground/40",
                          )}>
                            {fetchStatusLabel(source.lastFetchStatus)}
                          </span>
                          {source.lastErrorMessage && source.lastFetchStatus !== 'success' && (
                            <span className="text-[9px] text-danger/70 truncate block max-w-[160px]" title={source.lastErrorMessage}>
                              {source.lastErrorMessage.slice(0, 40)}{source.lastErrorMessage.length > 40 ? '…' : ''}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {isRss && source.lastLatencyMs != null ? (
                        <span className={cn(
                          "text-[10px] font-mono tabular-nums",
                          source.lastLatencyMs > 8000 ? "text-warning" : "text-muted-foreground",
                        )}>
                          {source.lastLatencyMs > 1000
                            ? `${(source.lastLatencyMs / 1000).toFixed(1)}s`
                            : `${source.lastLatencyMs}ms`}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/40">—</span>
                      )}
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
