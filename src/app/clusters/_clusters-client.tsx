"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Clock3, ExternalLink, Loader2, Sparkles, Zap } from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import type { TopSignalData } from "@/components/layout/app-shell"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { EventClusterListItem } from "@/lib/db/event-clusters"

type GenerateResponse = {
  ok: boolean
  error?: string
  migrationHint?: string
  dryRun?: boolean
  force?: boolean
  windowHours?: number
  stats?: {
    itemsScanned: number
    clustersGenerated: number
    itemsLinked: number
  }
  candidateClusters?: EventClusterListItem[]
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "未记录"
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function statusLabel(status: string): string {
  if (status === "active") return "active"
  if (status === "watching") return "watching"
  if (status === "cooling") return "cooling"
  if (status === "archived") return "archived"
  return status
}

function statusClass(status: string): string {
  if (status === "active") return "text-success border-success/30 bg-success/10"
  if (status === "watching") return "text-primary border-primary/30 bg-primary/10"
  if (status === "cooling") return "text-warning border-warning/30 bg-warning/10"
  if (status === "archived") return "text-muted-foreground border-border bg-muted/40"
  return "text-muted-foreground border-border bg-muted/40"
}

function roleClass(role: string | null | undefined): string {
  if (role === "primary") return "text-primary border-primary/25 bg-primary/8"
  if (role === "update") return "text-success border-success/25 bg-success/8"
  if (role === "duplicate") return "text-muted-foreground border-border bg-muted/40"
  return "text-muted-foreground border-border/60 bg-background/60"
}

function ClusterCard({ cluster }: { cluster: EventClusterListItem }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground leading-snug">{cluster.title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {cluster.summary || "暂无摘要"}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-mono font-semibold tabular-nums">{cluster.confidence}</p>
          <p className="text-[10px] text-muted-foreground">confidence</p>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-medium", statusClass(cluster.status))}>
          {statusLabel(cluster.status)}
        </span>
        {cluster.itemCount <= 1 ? (
          <span className="rounded border border-muted-foreground/25 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            单条观察
          </span>
        ) : cluster.sourceCount >= 2 ? (
          <span className="rounded border border-success/25 bg-success/8 px-1.5 py-0.5 text-[10px] text-success">
            多来源跟进
          </span>
        ) : (
          <span className="rounded border border-sky-400/25 bg-sky-400/8 px-1.5 py-0.5 text-[10px] text-sky-500">
            多条信息
          </span>
        )}
        <span className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          items {cluster.itemCount}
        </span>
        <span className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          sources {cluster.sourceCount}
        </span>
        <span className="rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          first {formatTime(cluster.firstSeenAt)}
        </span>
        <span className="rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          last {formatTime(cluster.lastSeenAt)}
        </span>
      </div>

      <div className="mt-2 space-y-1">
        {cluster.primaryItemTitle && (
          <p className="text-xs text-foreground/85">
            主条：{cluster.primaryItemTitle}
          </p>
        )}
        {cluster.matchReason && (
          <p className="text-xs text-muted-foreground">
            规则说明：{cluster.matchReason}
          </p>
        )}
      </div>

      {cluster.items && cluster.items.length > 0 && (
        <div className="mt-3 rounded border border-border/60 bg-muted/20">
          <div className="border-b border-border px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Timeline Preview</p>
          </div>
          <div className="divide-y divide-border/60">
            {cluster.items.map(item => (
              <div key={`${cluster.id}-${item.itemId}`} className="flex items-start gap-2.5 px-3 py-2.5">
                <div className={cn("mt-0.5 rounded border px-1.5 py-0.5 text-[10px] shrink-0", roleClass(item.role))}>
                  {item.role ?? "supporting"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-xs font-medium leading-snug text-foreground">{item.title}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {(item.sourceName ?? "Unknown Source")} · {formatTime(item.fetchedAt ?? item.publishedAt)}
                    {typeof item.finalScore === "number" ? ` · score ${item.finalScore}` : ""}
                  </p>
                  {item.similarityReason && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground/80">{item.similarityReason}</p>
                  )}
                </div>
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded border border-primary/25 bg-primary/8 px-2 py-1 text-[10px] text-primary transition-colors hover:bg-primary/15"
                    onClick={event => event.stopPropagation()}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <Button asChild size="sm" variant="outline">
          <Link href={`/clusters/${cluster.id}`}>查看时间线</Link>
        </Button>
      </div>
    </article>
  )
}

export default function ClustersClient({
  clusters,
  initialStatus,
  initialLimit,
  loadError,
  topSignal,
}: {
  clusters: EventClusterListItem[]
  initialStatus: string
  initialLimit: number
  loadError: string | null
  topSignal?: TopSignalData
}) {
  const router = useRouter()
  const [windowHours, setWindowHours] = useState("168")
  const [statusFilter, setStatusFilter] = useState(initialStatus || "all")
  const [running, setRunning] = useState<"dry" | "write" | null>(null)
  const [lastResult, setLastResult] = useState<GenerateResponse | null>(null)

  const filteredClusters = useMemo(() => {
    if (statusFilter === "all") return clusters
    if (statusFilter === "multi_source") return clusters.filter(c => c.sourceCount >= 2 || c.itemCount >= 2)
    if (statusFilter === "single") return clusters.filter(c => c.itemCount <= 1)
    return clusters.filter(cluster => cluster.status === statusFilter)
  }, [clusters, statusFilter])

  const stats = useMemo(() => {
    // Always use full cluster list for stats (not filtered)
    const source = clusters
    return {
      total:       source.length,
      active:      source.filter(c => c.status === "active").length,
      watching:    source.filter(c => c.status === "watching").length,
      cooling:     source.filter(c => c.status === "cooling").length,
      relatedItems:source.reduce((sum, c) => sum + c.itemCount, 0),
      multiSource: source.filter(c => c.sourceCount >= 2 || c.itemCount >= 2).length,
      singleItem:  source.filter(c => c.itemCount <= 1).length,
    }
  }, [clusters])

  async function runGenerate(dryRun: boolean) {
    if (running) return
    setRunning(dryRun ? "dry" : "write")
    setLastResult(null)

    try {
      const res = await fetch("/api/clusters/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          windowHours: Number(windowHours),
          limit: 300,
          dryRun,
          force: !dryRun,
        }),
      })
      const data = await res.json() as GenerateResponse
      setLastResult(data)

      if (data.ok && !dryRun) {
        router.refresh()
      }
    } catch (error) {
      setLastResult({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setRunning(null)
    }
  }

  return (
    <AppShell topSignal={topSignal}>
      <div className="mx-auto max-w-[1180px] p-6 md:p-8">
        <header className="mb-5">
          <p className="page-kicker mb-1">Event Cluster Timeline</p>
          <h1 className="editorial-title text-[2.15rem]">事件簇</h1>
          <p className="page-subtitle mt-1.5">
            把相关信息聚合成事件，帮助判断事件从哪里开始、哪些来源跟进、是否仍在发酵。
          </p>
        </header>

        {loadError && (
          <div className="mb-4 rounded border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            {loadError.includes("event cluster tables not found")
              ? "事件簇表尚未创建。请先在 Supabase SQL Editor 执行 supabase/event-clusters-v1.sql。"
              : `加载事件簇失败：${loadError}`}
          </div>
        )}

        <div className="mb-5 grid grid-cols-7 gap-3">
          <div className="rounded border border-border bg-card px-3 py-2.5">
            <p className="muted-label mb-1">总计</p>
            <p className="text-2xl font-mono font-semibold tabular-nums">{stats.total}</p>
          </div>
          <div className="rounded border border-border bg-card px-3 py-2.5">
            <p className="muted-label mb-1">active</p>
            <p className="text-2xl font-mono font-semibold tabular-nums text-success">{stats.active}</p>
          </div>
          <div className="rounded border border-border bg-card px-3 py-2.5">
            <p className="muted-label mb-1">watching</p>
            <p className="text-2xl font-mono font-semibold tabular-nums text-primary">{stats.watching}</p>
          </div>
          <div className="rounded border border-border bg-card px-3 py-2.5">
            <p className="muted-label mb-1">cooling</p>
            <p className="text-2xl font-mono font-semibold tabular-nums text-warning">{stats.cooling}</p>
          </div>
          <div className="rounded border border-border bg-card px-3 py-2.5">
            <p className="muted-label mb-1">多来源/多条</p>
            <p className="text-2xl font-mono font-semibold tabular-nums">{stats.multiSource}</p>
          </div>
          <div className="rounded border border-border bg-card px-3 py-2.5">
            <p className="muted-label mb-1">单条观察</p>
            <p className="text-2xl font-mono font-semibold tabular-nums text-muted-foreground">{stats.singleItem}</p>
          </div>
          <div className="rounded border border-border bg-card px-3 py-2.5">
            <p className="muted-label mb-1">相关信息</p>
            <p className="text-2xl font-mono font-semibold tabular-nums">{stats.relatedItems}</p>
          </div>
        </div>

        <section className="mb-5 rounded-lg border border-border bg-card p-3.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">windowHours</span>
              <Select value={windowHours} onValueChange={setWindowHours}>
                <SelectTrigger className="h-8 w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="72">72h</SelectItem>
                  <SelectItem value="168">168h</SelectItem>
                  <SelectItem value="336">336h</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">状态筛选</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="multi_source">多来源/多条</SelectItem>
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="watching">watching</SelectItem>
                  <SelectItem value="cooling">cooling</SelectItem>
                  <SelectItem value="single">单条观察</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={running !== null}
                onClick={() => runGenerate(true)}
              >
                {running === "dry" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                dryRun 生成
              </Button>
              <Button
                size="sm"
                disabled={running !== null}
                onClick={() => runGenerate(false)}
              >
                {running === "write" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Zap className="mr-1.5 h-3.5 w-3.5" />}
                正式生成
              </Button>
            </div>
          </div>

          <p className="mt-2 text-[11px] text-muted-foreground">
            当前列表上限 {initialLimit} 条；正式生成会写入 event_clusters / event_cluster_items。
          </p>
        </section>

        {lastResult && (
          <section className={cn(
            "mb-5 rounded border px-3 py-2.5 text-xs",
            lastResult.ok
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger",
          )}>
            {lastResult.ok ? (
              <div className="space-y-1">
                <p>
                  {lastResult.dryRun ? "dryRun 完成" : "正式生成完成"} · windowHours {lastResult.windowHours}
                </p>
                <p>
                  扫描 {lastResult.stats?.itemsScanned ?? 0} 条 · 生成 {lastResult.stats?.clustersGenerated ?? 0} 个事件簇 · 关联 {lastResult.stats?.itemsLinked ?? 0} 条
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p>生成失败：{lastResult.error ?? "unknown error"}</p>
                {lastResult.migrationHint && <p>{lastResult.migrationHint}</p>}
              </div>
            )}
          </section>
        )}

        <main className="space-y-3">
          {filteredClusters.length > 0 ? (
            filteredClusters.map(cluster => (
              <ClusterCard key={cluster.id} cluster={cluster} />
            ))
          ) : (
            <section className="rounded-lg border border-border bg-card px-5 py-12 text-center">
              <Clock3 className="mx-auto h-5 w-5 text-muted-foreground/60" />
              <p className="mt-2 text-sm text-muted-foreground">暂无事件簇</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                可以先运行 dryRun / 正式生成，或等待更多真实信息进入系统。
              </p>
            </section>
          )}
        </main>
      </div>
    </AppShell>
  )
}
