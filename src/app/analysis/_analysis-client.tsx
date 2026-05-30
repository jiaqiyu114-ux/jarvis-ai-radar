"use client"

import { useState, useCallback } from "react"
import { Loader2, Play, Eye } from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { InformationCard } from "@/components/feed/information-card"
import { cn } from "@/lib/utils"
import type { TopSignalData } from "@/components/layout/app-shell"
import type { InformationItem } from "@/types"

// ── Types ─────────────────────────────────────────────────────────────────────

type QueueSummary = {
  totalReal:    number
  unprocessed:  number
  processed:    number
  none:         number
  light:        number
  standard:     number
  deep:         number
  cluster:      number
  deepReady:    number
  clusterReady: number
}

type QueueItem = {
  id:                    string
  title:                 string
  final_score:           number | null
  analysis_tier:         string | null
  analysis_stage:        string | null
  analysis_priority:     string | null
  token_budget_tier:     string | null
  estimated_total_tokens: number | null
  should_deep_analyze:    boolean | null
  should_track_event:     boolean | null
  should_enter_daily_report: boolean | null
  should_enter_topic_pool:   boolean | null
  analysis_reason:       string | null
  ev_score:              number | null
  truth_score:           number | null
  claim_status:          string | null
  source_tier:           string | null
  published_at:          string | null
  fetched_at:            string | null
  created_at:            string
  category:              string | null
  content_fetch_status:  string | null
}

type BatchResult = {
  ok:        boolean
  dryRun:    boolean
  processed: number
  updated:   number
  failed:    number
  hasMore:   boolean
  nextCursor: string | null
  summary:   { none: number; light: number; standard: number; deep: number; cluster: number; estimatedTotalTokens: number }
  errors?:   Array<{ id: string; title: string; error: string }>
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

const TIER_STYLE: Record<string, string> = {
  none:     'text-muted-foreground/50 border-border/40 bg-muted/30',
  light:    'text-muted-foreground border-border bg-muted/50',
  standard: 'text-sky-600 border-sky-400/30 bg-sky-400/10 dark:text-sky-400',
  deep:     'text-primary border-primary/30 bg-primary/10',
  cluster:  'text-success border-success/30 bg-success/10',
}

const BUDGET_STYLE: Record<string, string> = {
  none:    'text-muted-foreground/50 border-border/40',
  cheap:   'text-muted-foreground border-border',
  normal:  'text-sky-600 border-sky-400/30 dark:text-sky-400',
  premium: 'text-primary border-primary/30',
}

const TIER_LABELS: Record<string, string> = {
  none: '跳过', light: '轻处理', standard: '标准', deep: '深度', cluster: '事件簇',
}

const BUDGET_LABELS: Record<string, string> = {
  none: '零消耗', cheap: '轻量', normal: '标准', premium: '高级',
}

function TierBadge({ tier }: { tier: string | null }) {
  const t = tier ?? 'none'
  return (
    <span className={cn("text-[9px] px-1.5 py-px rounded border font-medium whitespace-nowrap", TIER_STYLE[t] ?? TIER_STYLE.none)}>
      {TIER_LABELS[t] ?? t}
    </span>
  )
}

function BudgetBadge({ budget }: { budget: string | null }) {
  const b = budget ?? 'none'
  return (
    <span className={cn("text-[9px] px-1.5 py-px rounded border whitespace-nowrap", BUDGET_STYLE[b] ?? BUDGET_STYLE.none)}>
      {BUDGET_LABELS[b] ?? b}
    </span>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="border border-border rounded-lg px-4 py-2.5 bg-card text-center">
      <p className="text-xl font-bold font-mono text-foreground tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-[9px] text-muted-foreground/50 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Queue item row ────────────────────────────────────────────────────────────

function QueueItemRow({ qi, infoItem }: { qi: QueueItem; infoItem?: InformationItem }) {
  if (infoItem) {
    return <InformationCard item={infoItem} variant="compact" />
  }
  return (
    <div className="border-b border-border py-2.5 px-4 hover:bg-accent transition-colors">
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm font-bold text-muted-foreground w-8 shrink-0 tabular-nums">
          {qi.final_score ?? '—'}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{qi.title}</p>
          {qi.analysis_reason && (
            <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{qi.analysis_reason}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <TierBadge tier={qi.analysis_tier} />
          <BudgetBadge budget={qi.token_budget_tier} />
          {qi.estimated_total_tokens != null && qi.estimated_total_tokens > 0 && (
            <span className="text-[9px] text-muted-foreground/50 font-mono">
              ~{(qi.estimated_total_tokens / 1000).toFixed(1)}k
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  initialSummary:  QueueSummary | null
  initialItems:    QueueItem[]
  topSignal?:      TopSignalData
}

const TIER_FILTERS = [
  { label: '全部',   value: '' },
  { label: '跳过',   value: 'none' },
  { label: '轻处理', value: 'light' },
  { label: '标准',   value: 'standard' },
  { label: '深度',   value: 'deep' },
  { label: '事件簇', value: 'cluster' },
]

export default function AnalysisClient({ initialSummary, initialItems, topSignal }: Props) {
  const [summary, setSummary]   = useState<QueueSummary | null>(initialSummary)
  const [items, setItems]       = useState<QueueItem[]>(initialItems)
  const [tierFilter, setTierFilter] = useState('')
  const [loading, setLoading]   = useState(false)
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null)
  const [batchError, setBatchError]   = useState<string | null>(null)
  const [nextCursor, setNextCursor]   = useState<string | null>(null)
  const [hasMore, setHasMore]   = useState(false)

  // Refresh queue data
  const refreshQueue = useCallback(async (tier = tierFilter) => {
    setLoading(true)
    try {
      const url = `/api/analysis/queue?limit=50&onlyReal=true${tier ? `&tier=${tier}` : ''}`
      const res = await fetch(url)
      const data = await res.json() as { ok: boolean; summary?: QueueSummary; items?: QueueItem[]; hasMore?: boolean; nextCursor?: string | null }
      if (data.ok) {
        if (data.summary) setSummary(data.summary)
        setItems(data.items ?? [])
        setHasMore(data.hasMore ?? false)
        setNextCursor(data.nextCursor ?? null)
      }
    } finally {
      setLoading(false)
    }
  }, [tierFilter])

  // Run batch
  const runBatch = useCallback(async (dryRun: boolean, cursor?: string | null) => {
    setLoading(true)
    setBatchError(null)
    try {
      const res = await fetch('/api/analysis/gate/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 100, dryRun, force: false, onlyReal: true, cursor: cursor ?? null }),
      })
      const data = await res.json() as BatchResult
      setBatchResult(data)
      if (!dryRun && data.ok) {
        await refreshQueue()
      }
    } catch (e) {
      setBatchError(e instanceof Error ? e.message : '请求失败')
    } finally {
      setLoading(false)
    }
  }, [refreshQueue])

  const handleTierFilter = (tier: string) => {
    setTierFilter(tier)
    refreshQueue(tier)
  }

  return (
    <AppShell topSignal={topSignal}>
      <div className="p-6 md:p-8 max-w-[1280px]">

        {/* ── Header ── */}
        <div className="mb-6">
          <p className="page-kicker mb-1">Analysis Queue</p>
          <h1 className="editorial-title text-3xl">处理队列</h1>
          <p className="page-subtitle mt-1.5">
            系统用规则判断哪些信息值得进入后续处理，避免把所有抓取内容送进深度模型。
          </p>
        </div>

        {/* ── Stats ── */}
        {summary && (
          <div className="grid grid-cols-5 gap-3 mb-6">
            <StatCard label="真实信息总数" value={summary.totalReal} />
            <StatCard label="待分流" value={summary.unprocessed} />
            <StatCard label="轻处理" value={summary.light} />
            <StatCard label="深度分析" value={summary.deep} />
            <StatCard label="事件簇候选" value={summary.cluster} />
          </div>
        )}

        {/* ── Actions ── */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <button
            onClick={() => runBatch(true)}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm border border-border rounded-md px-4 py-1.5 hover:bg-accent transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
            预览处理 100 条
          </button>
          <button
            onClick={() => runBatch(false)}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm bg-primary text-primary-foreground rounded-md px-4 py-1.5 hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            写入处理 100 条
          </button>
          {batchResult?.hasMore && (
            <button
              onClick={() => runBatch(false, batchResult.nextCursor)}
              disabled={loading}
              className="text-sm border border-primary/30 text-primary rounded-md px-4 py-1.5 hover:bg-primary/10 transition-colors disabled:opacity-50"
            >
              继续处理下一批
            </button>
          )}
        </div>

        {/* ── Batch result ── */}
        {batchError && (
          <div className="mb-4 text-sm text-danger border border-danger/20 bg-danger/5 rounded-md px-4 py-2">
            {batchError}
          </div>
        )}
        {batchResult && (
          <div className="mb-4 border border-border rounded-md p-4 bg-card text-sm space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("text-[10px] px-2 py-0.5 rounded border font-medium", batchResult.dryRun ? 'text-warning border-warning/30 bg-warning/10' : 'text-success border-success/30 bg-success/10')}>
                {batchResult.dryRun ? '预览模式' : '已写入'}
              </span>
              <span className="text-muted-foreground">处理 {batchResult.processed} 条</span>
              {!batchResult.dryRun && <span className="text-muted-foreground">· 更新 {batchResult.updated} 条</span>}
              {batchResult.failed > 0 && <span className="text-danger">· 失败 {batchResult.failed} 条</span>}
              {batchResult.hasMore && <span className="text-primary">· 还有更多待处理</span>}
            </div>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
              <span>none:{batchResult.summary.none}</span>
              <span>light:{batchResult.summary.light}</span>
              <span>standard:{batchResult.summary.standard}</span>
              <span>deep:{batchResult.summary.deep}</span>
              <span>cluster:{batchResult.summary.cluster}</span>
              <span>· 估算 {Math.round(batchResult.summary.estimatedTotalTokens / 1000)}k tokens</span>
            </div>
          </div>
        )}

        {/* ── Tier filter ── */}
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          {TIER_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => handleTierFilter(f.value)}
              className={cn(
                "text-[10px] px-2.5 py-1 rounded border transition-colors",
                tierFilter === f.value
                  ? "bg-primary/10 text-primary border-primary/20 font-medium"
                  : "text-muted-foreground border-border/50 hover:border-border hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
          <button
            onClick={() => refreshQueue()}
            disabled={loading}
            className="text-[10px] px-2 py-1 text-muted-foreground hover:text-foreground transition-colors ml-auto"
          >
            {loading ? '加载中…' : '刷新'}
          </button>
        </div>

        {/* ── Item list ── */}
        <div className="border border-border rounded-lg overflow-hidden bg-card">
          {items.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">暂无处理队列数据</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                请先抓取真实信息，或点击【写入处理 100 条】生成规则队列。
              </p>
            </div>
          ) : (
            items.map(qi => <QueueItemRow key={qi.id} qi={qi} />)
          )}
        </div>

        {/* Load more */}
        {hasMore && (
          <div className="mt-4 text-center">
            <button
              onClick={() => {
                const cursor = nextCursor
                setLoading(true)
                fetch(`/api/analysis/queue?limit=50&onlyReal=true${tierFilter ? `&tier=${tierFilter}` : ''}&cursor=${cursor}`)
                  .then(r => r.json())
                  .then((data: { ok: boolean; items?: QueueItem[]; hasMore?: boolean; nextCursor?: string | null }) => {
                    if (data.ok) {
                      setItems(prev => [...prev, ...(data.items ?? [])])
                      setHasMore(data.hasMore ?? false)
                      setNextCursor(data.nextCursor ?? null)
                    }
                  })
                  .finally(() => setLoading(false))
              }}
              disabled={loading}
              className="text-sm text-muted-foreground hover:text-foreground border border-border rounded-md px-4 py-1.5 transition-colors disabled:opacity-50"
            >
              加载更多
            </button>
          </div>
        )}

      </div>
    </AppShell>
  )
}
