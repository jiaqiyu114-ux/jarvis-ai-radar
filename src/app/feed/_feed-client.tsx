"use client"

import { useState } from "react"
import { Search } from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import type { TopSignalData } from "@/components/layout/app-shell"
import { InformationCard } from "@/components/feed/information-card"
import { Input } from "@/components/ui/input"
import type { Category, InformationItem, SourceTier } from "@/types"
import { cn } from "@/lib/utils"
import { normalizeDisplayText } from "@/lib/text/normalize-display-text"

// ── Smart filter definitions ──────────────────────────────────────────────────
// Replaced 8 category + 4 tier chips with 6 meaningful user-facing filters.
// Category/tier filters are accessible via "更多筛选" (collapsed).

type SmartFilterId = 'all' | 'high_value' | 'observe' | 'my_sources' | 'official' | 'low_priority'

const SMART_FILTERS: Array<{ id: SmartFilterId; label: string; desc: string }> = [
  { id: 'all',          label: '全部',      desc: '所有捕捉内容' },
  { id: 'high_value',   label: '高价值',    desc: '分数 ≥ 65' },
  { id: 'observe',      label: '观察',      desc: '分数 50–65' },
  { id: 'my_sources',   label: '我的源',    desc: '手动接入的信源' },
  { id: 'official',     label: '官方源',    desc: '官方博客/公告' },
  { id: 'low_priority', label: '低优先级',  desc: '分数低于 50' },
]

function matchSmartFilter(item: InformationItem, f: SmartFilterId): boolean {
  switch (f) {
    case 'all':          return true
    case 'high_value':   return item.finalScore >= 65
    case 'observe':      return item.finalScore >= 50 && item.finalScore < 65
    case 'my_sources':   return item.isUserCurated === true
    case 'official':     return item.isOfficial === true
    case 'low_priority': return item.finalScore < 50
    default:             return true
  }
}

function normalizeSearchTerm(value: unknown): string {
  return normalizeDisplayText(String(value ?? '')).toLowerCase()
}

function matchesFeedSearch(item: InformationItem, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true

  const article = item.articleContent
  const fields: unknown[] = [
    item.title,
    item.summary,
    item.source,
    item.sourceTier,
    item.category,
    item.originalUrl,
    item.userSourceLabel,
    item.userSourceNote,
    ...item.tags,
    article?.articleTitle,
    article?.excerpt,
    article?.cleanText,
    article?.authorName,
    article?.siteName,
    article?.canonicalUrl,
  ]

  return fields.some(field => normalizeSearchTerm(field).includes(normalizedQuery))
}

// ── Category filter kept for "更多筛选"; tier shown in primary bar ────────────
const ALL_CATEGORIES: Category[] = ['AI技术', '商业动态', '产品发布', '监管政策', '融资并购', '行业趋势', '开源项目', '研究报告']
const ALL_TIERS: SourceTier[] = ['S', 'A', 'B', 'C']

const TIER_TOOLTIP: Record<string, string> = {
  S: '信源等级 S：官方博客/文档/论文（不是内容评分）',
  A: '信源等级 A：官方社媒/创始人/顶级机构（不是内容评分）',
  B: '信源等级 B：高质量媒体/分析师/垂直 KOL（不是内容评分）',
  C: '信源等级 C：普通 KOL/综合资讯站（不是内容评分）',
}

export default function FeedClient({
  items,
  mode = 'real',
  topSignal,
  initialSearch = '',
}: {
  items:       InformationItem[]
  mode?:       'real' | 'all'
  topSignal?:  TopSignalData
  initialSearch?: string
}) {
  const [search, setSearch]             = useState(initialSearch)
  const [smartFilter, setSmartFilter]   = useState<SmartFilterId>('all')
  const [sortBy, setSortBy]             = useState<'time' | 'score'>('time')
  // Advanced filters — collapsed by default
  const [showAdvanced, setShowAdvanced]       = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [selectedTier, setSelectedTier]         = useState<SourceTier | null>(null)
  const normalizedSearch = normalizeSearchTerm(search)

  const filtered = items
    .filter(item => {
      if (normalizedSearch && !matchesFeedSearch(item, normalizedSearch)) return false
      if (!matchSmartFilter(item, smartFilter)) return false
      if (selectedCategory && item.category !== selectedCategory) return false
      if (selectedTier && item.sourceTier !== selectedTier) return false
      return true
    })
    .sort((a, b) =>
      sortBy === 'score'
        ? b.finalScore - a.finalScore
        : new Date(b.fetchedAt ?? b.publishedAt).getTime() - new Date(a.fetchedAt ?? a.publishedAt).getTime()
    )

  const hasAdvancedFilter = selectedCategory !== null || selectedTier !== null
  const hasAnyFilter = smartFilter !== 'all' || search || hasAdvancedFilter

  return (
    <AppShell topSignal={topSignal}>
      <div className="p-6 md:p-8">

        {/* ── Header ── */}
        <div className="mb-5">
          <p className="page-kicker mb-1">Captured Timeline</p>
          <div className="flex items-end justify-between gap-4">
            <h1 className="editorial-title text-3xl">全量流</h1>
            <div className="flex items-center gap-2 pb-0.5">
              {mode === 'all' && (
                <span className="text-[10px] text-warning border border-warning/30 bg-warning/10 rounded px-1.5 py-0.5">
                  含演示数据
                </span>
              )}
              <span className="meta-text">{filtered.length}/{items.length} 条</span>
            </div>
          </div>
          <p className="page-subtitle mt-1">
            全量流是系统原始捕捉，不代表推荐价值。真正建议阅读的内容请看{' '}
            <a href="/dashboard" className="underline hover:text-foreground">今日雷达</a>。
          </p>
        </div>

        {/* ── Filter bar — sticky so it stays visible when scrolling ── */}
        <div
          className="sticky top-0 z-10 -mx-6 md:-mx-8 px-6 md:px-8 pb-3 pt-2 mb-3 space-y-2"
          style={{ background: "var(--bg-deep)", borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search — wider, clearer placeholder */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="搜索标题或摘要…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-7 w-52 text-xs bg-background"
              />
            </div>

            {/* Sort */}
            <div className="flex items-center gap-px border border-border rounded-lg overflow-hidden h-7">
              {(['time', 'score'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={cn(
                    "px-2.5 text-xs h-full transition-colors",
                    sortBy === s
                      ? "bg-primary/15 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  {s === 'score' ? '分数' : '时间'}
                </button>
              ))}
            </div>

            {/* Smart filter chips */}
            <div className="flex items-center gap-1 flex-wrap">
              {SMART_FILTERS.map(f => (
                <button
                  key={f.id}
                  title={f.desc}
                  onClick={() => setSmartFilter(smartFilter === f.id ? 'all' : f.id)}
                  className={cn(
                    "text-[10px] px-2.5 py-1 rounded-lg border transition-colors",
                    smartFilter === f.id
                      ? "bg-primary/15 text-primary border-primary/25 font-medium"
                      : "text-muted-foreground border-border hover:border-border/80 hover:text-foreground"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Active filter summary + clear */}
            {hasAnyFilter && (
              <button
                onClick={() => { setSmartFilter('all'); setSelectedCategory(null); setSelectedTier(null); setSearch('') }}
                className="ml-auto text-[10px] text-primary/80 hover:text-primary border border-primary/20 bg-primary/5 px-2 py-1 rounded-lg transition-colors"
              >
                清除筛选
              </button>
            )}

            {/* More filters toggle */}
            {!hasAnyFilter && (
              <button
                onClick={() => setShowAdvanced(v => !v)}
                className="ml-auto text-[10px] text-muted-foreground border border-border rounded-lg px-2 py-1 transition-colors hover:text-foreground"
              >
                {showAdvanced ? '收起' : '更多'}
              </button>
            )}
          </div>

          {/* Tier + category filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] text-muted-foreground font-mono tracking-widest uppercase shrink-0">信源</span>
            {ALL_TIERS.map(tier => (
              <button
                key={tier}
                title={TIER_TOOLTIP[tier]}
                onClick={() => setSelectedTier(selectedTier === tier ? null : tier)}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded border font-mono font-medium transition-colors",
                  selectedTier === tier
                    ? "bg-primary/15 text-primary border-primary/25"
                    : "text-muted-foreground border-border hover:border-border/80 hover:text-foreground"
                )}
              >
                {tier}
              </button>
            ))}

            {showAdvanced && (
              <>
                <span className="text-border mx-1">|</span>
                <span className="text-[9px] text-muted-foreground font-mono tracking-widest uppercase shrink-0">分类</span>
                {ALL_CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                    className={cn(
                      "text-[10px] px-2 py-0.5 rounded border transition-colors",
                      selectedCategory === cat
                        ? "bg-primary/10 text-primary border-primary/20 font-medium"
                        : "text-muted-foreground border-border hover:border-border/80"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        {/* ── Feed list — lightweight rows, minimal glass ── */}
        <div className="rounded-2xl overflow-hidden"
             style={{
               background: "var(--bg-card)",
               border: "1px solid var(--border-subtle)",
               boxShadow: "var(--shadow-soft)",
             }}>
          {filtered.length > 0
            ? filtered.map(item => <InformationCard key={item.id} item={item} contextPage="feed" />)
            : (
              <div className="py-14 text-center space-y-3">
                <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                  {hasAnyFilter ? "当前筛选条件下没有内容" : "暂无内容"}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {hasAnyFilter
                    ? "尝试放宽筛选条件，或清除全部筛选"
                    : "信源尚未抓取到内容，请在信源管理中检查信源状态"}
                </p>
                {hasAnyFilter && (
                  <button
                    onClick={() => { setSmartFilter('all'); setSelectedCategory(null); setSelectedTier(null); setSearch('') }}
                    className="text-xs text-primary/80 hover:text-primary underline"
                  >
                    清除全部筛选
                  </button>
                )}
              </div>
            )
          }
        </div>
      </div>
    </AppShell>
  )
}
