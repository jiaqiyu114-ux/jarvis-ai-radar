"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

type ItemCluster = {
  id: string
  title: string
  status: string
  itemCount: number
  confidence: number
}

type ItemClusterResponse = {
  ok: boolean
  hasCluster?: boolean
  clusters?: Array<{
    id: string
    title: string
    status: string
    itemCount: number
    confidence: number
  }>
  error?: string
}

function statusClass(status: string): string {
  if (status === "active") return "text-success border-success/25 bg-success/8"
  if (status === "watching") return "text-primary border-primary/25 bg-primary/8"
  if (status === "cooling") return "text-warning border-warning/25 bg-warning/8"
  return "text-muted-foreground border-border bg-muted/30"
}

export function ItemClusterLink({ itemId }: { itemId: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clusters, setClusters] = useState<ItemCluster[]>([])

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/items/${itemId}/clusters`, { cache: "no-store" })
        const data = await res.json() as ItemClusterResponse
        if (cancelled) return
        if (!data.ok) {
          setError(data.error ?? "加载事件簇失败")
          setClusters([])
          return
        }
        const mapped = (data.clusters ?? []).map(cluster => ({
          id: cluster.id,
          title: cluster.title,
          status: cluster.status,
          itemCount: cluster.itemCount,
          confidence: cluster.confidence,
        }))
        setClusters(mapped)
      } catch (fetchError) {
        if (cancelled) return
        setError(fetchError instanceof Error ? fetchError.message : String(fetchError))
        setClusters([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [itemId])

  if (loading) {
    return (
      <p className="text-xs text-muted-foreground/70">正在检查事件关联...</p>
    )
  }

  if (error) {
    return (
      <p className="text-xs text-muted-foreground/70">事件关联读取失败：{error}</p>
    )
  }

  if (clusters.length === 0) {
    return (
      <span className="shrink-0 text-[10px] text-muted-foreground/40 border border-border/40 rounded px-2 py-1 whitespace-nowrap cursor-not-allowed">
        暂未形成事件簇
      </span>
    )
  }

  const primary = clusters[0]
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs text-foreground/85 line-clamp-2">
          所属事件簇：{primary.title}
        </p>
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", statusClass(primary.status))}>
            {primary.status}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded border text-muted-foreground border-border bg-muted/40">
            相关信息 {primary.itemCount} 条
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded border text-muted-foreground border-border bg-muted/30">
            confidence {primary.confidence}
          </span>
          {clusters.length > 1 && (
            <span className="text-[10px] text-muted-foreground">另有 {clusters.length - 1} 个关联事件簇</span>
          )}
        </div>
      </div>

      <Link
        href={`/clusters/${primary.id}`}
        className="shrink-0 text-[10px] text-primary border border-primary/20 bg-primary/5 hover:bg-primary/12 rounded px-2 py-1 transition-colors font-medium whitespace-nowrap"
      >
        查看事件时间线 →
      </Link>
    </div>
  )
}
