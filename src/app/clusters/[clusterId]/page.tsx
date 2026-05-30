export const dynamic = "force-dynamic"

import Link from "next/link"
import { ArrowLeft, ExternalLink } from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { getEventClusterDetail } from "@/lib/db/event-clusters"
import { cn } from "@/lib/utils"

function formatTime(value: string | null | undefined): string {
  if (!value) return "未记录"
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function statusClass(status: string): string {
  if (status === "active") return "text-success border-success/30 bg-success/10"
  if (status === "watching") return "text-primary border-primary/30 bg-primary/10"
  if (status === "cooling") return "text-warning border-warning/30 bg-warning/10"
  return "text-muted-foreground border-border bg-muted/40"
}

function roleClass(role: string | null | undefined): string {
  if (role === "primary") return "text-primary border-primary/25 bg-primary/8"
  if (role === "update") return "text-success border-success/25 bg-success/8"
  if (role === "duplicate") return "text-muted-foreground border-border bg-muted/40"
  return "text-muted-foreground border-border/60 bg-background/60"
}

function systemNotes(
  itemCount: number,
  sourceCount: number,
  lastSeenAt: string | null,
): string[] {
  const notes = [
    `该事件目前由 ${itemCount} 条信息构成，来自 ${sourceCount} 个来源。`,
    `最近更新时间为 ${formatTime(lastSeenAt)}。`,
  ]
  if (sourceCount <= 1) {
    notes.push("当前仍主要来自单一来源，需要更多来源交叉验证。")
  } else {
    notes.push("多来源已经出现，适合继续追踪。")
  }
  return notes
}

export default async function ClusterDetailPage({
  params,
}: {
  params: Promise<{ clusterId: string }>
}) {
  const { clusterId } = await params

  let detailError: string | null = null
  let detail = null as Awaited<ReturnType<typeof getEventClusterDetail>>

  try {
    detail = await getEventClusterDetail(clusterId)
  } catch (error) {
    detailError = error instanceof Error ? error.message : String(error)
  }

  if (detailError) {
    return (
      <AppShell topSignal={undefined}>
        <div className="mx-auto max-w-[1080px] p-6 md:p-8">
          <div className="rounded border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            {detailError.includes("event cluster tables not found")
              ? "事件簇表尚未创建。请先在 Supabase SQL Editor 执行 supabase/event-clusters-v1.sql。"
              : `加载事件详情失败：${detailError}`}
          </div>
        </div>
      </AppShell>
    )
  }

  if (!detail) {
    return (
      <AppShell topSignal={undefined}>
        <div className="mx-auto max-w-[1080px] p-6 md:p-8">
          <div className="rounded border border-border bg-card px-5 py-10 text-center">
            <p className="text-sm text-muted-foreground">未找到该事件簇</p>
            <Link href="/clusters" className="mt-3 inline-flex items-center gap-1 text-xs text-primary">
              <ArrowLeft className="h-3 w-3" />
              返回事件簇列表
            </Link>
          </div>
        </div>
      </AppShell>
    )
  }

  const topSignal = {
    score: detail.cluster.confidence,
    title: detail.cluster.title,
    category: "事件簇",
  }

  return (
    <AppShell topSignal={topSignal}>
      <div className="mx-auto max-w-[1080px] p-6 md:p-8">
        <div className="mb-4">
          <Link href="/clusters" className="inline-flex items-center gap-1 text-xs text-primary">
            <ArrowLeft className="h-3 w-3" />
            返回事件簇
          </Link>
        </div>

        <header className="mb-5 rounded-lg border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="page-kicker mb-1">Event Cluster</p>
              <h1 className="text-xl font-semibold leading-snug text-foreground">{detail.cluster.title}</h1>
              <p className="mt-1 text-xs text-muted-foreground">{detail.cluster.summary || "暂无摘要"}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-mono font-semibold tabular-nums">{detail.cluster.confidence}</p>
              <p className="text-[10px] text-muted-foreground">confidence</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-medium", statusClass(detail.cluster.status))}>
              {detail.cluster.status}
            </span>
            <span className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              items {detail.cluster.itemCount}
            </span>
            <span className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              sources {detail.cluster.sourceCount}
            </span>
            <span className="rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              first {formatTime(detail.cluster.firstSeenAt)}
            </span>
            <span className="rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              last {formatTime(detail.cluster.lastSeenAt)}
            </span>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-5">
          <main className="col-span-2 space-y-4">
            <section className="rounded-lg border border-border bg-card">
              <div className="border-b border-border px-4 py-2.5">
                <h2 className="section-title">时间线</h2>
              </div>
              {detail.timeline.length > 0 ? (
                <div className="divide-y divide-border/60">
                  {detail.timeline.map(item => (
                    <article key={item.itemId} className="px-4 py-3">
                      <div className="flex items-start gap-2.5">
                        <div className={cn("rounded border px-1.5 py-0.5 text-[10px] shrink-0", roleClass(item.role))}>
                          {item.role ?? "supporting"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-muted-foreground">{formatTime(item.fetchedAt ?? item.publishedAt)}</p>
                          <p className="mt-0.5 text-sm font-medium leading-snug text-foreground">{item.title}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {(item.sourceName ?? "Unknown Source")}
                            {item.sourceTier ? ` · ${item.sourceTier}` : ""}
                            {typeof item.finalScore === "number" ? ` · score ${item.finalScore}` : ""}
                          </p>
                          {item.similarityReason && (
                            <p className="mt-1 text-[11px] text-muted-foreground/80">{item.similarityReason}</p>
                          )}
                        </div>
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex shrink-0 items-center gap-1 rounded border border-primary/25 bg-primary/8 px-2 py-1 text-[10px] text-primary hover:bg-primary/15"
                          >
                            <ExternalLink className="h-3 w-3" />
                            原文
                          </a>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">暂无时间线内容</div>
              )}
            </section>
          </main>

          <aside className="col-span-1 space-y-4">
            <section className="rounded-lg border border-border bg-card px-4 py-3">
              <h2 className="section-title mb-2">主条信息</h2>
              {detail.primaryItem ? (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium leading-snug text-foreground">{detail.primaryItem.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {(detail.primaryItem.sourceName ?? "Unknown Source")}
                    {detail.primaryItem.sourceTier ? ` · ${detail.primaryItem.sourceTier}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatTime(detail.primaryItem.fetchedAt ?? detail.primaryItem.publishedAt)}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">暂无主条信息</p>
              )}
            </section>

            <section className="rounded-lg border border-border bg-card px-4 py-3">
              <h2 className="section-title mb-2">来源列表</h2>
              {detail.sources.length > 0 ? (
                <div className="space-y-1.5">
                  {detail.sources.map(source => (
                    <p key={`${source.sourceName}-${source.sourceTier ?? ""}`} className="text-xs text-muted-foreground">
                      {source.sourceName}
                      {source.sourceTier ? ` · ${source.sourceTier}` : ""}
                      {` · ${source.count} 条`}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">暂无来源统计</p>
              )}
            </section>

            <section className="rounded-lg border border-border bg-card px-4 py-3">
              <h2 className="section-title mb-2">系统判断说明</h2>
              <div className="space-y-1.5">
                {systemNotes(detail.cluster.itemCount, detail.cluster.sourceCount, detail.cluster.lastSeenAt).map(note => (
                  <p key={note} className="text-xs leading-relaxed text-muted-foreground">{note}</p>
                ))}
                {detail.matchReasons.map(reason => (
                  <p key={reason} className="text-xs leading-relaxed text-muted-foreground/80">{reason}</p>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  )
}
