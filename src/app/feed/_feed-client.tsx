"use client"

import { useState } from "react"
import { Search } from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import type { TopSignalData } from "@/components/layout/app-shell"
import { InformationCard } from "@/components/feed/information-card"
import { Input } from "@/components/ui/input"
import type { Category, InformationItem, SourceTier } from "@/types"
import { cn } from "@/lib/utils"

const categories: Category[] = ['AI技术', '商业动态', '产品发布', '监管政策', '融资并购', '行业趋势', '开源项目', '研究报告']
const tiers: SourceTier[] = ['S', 'A', 'B', 'C']

export default function FeedClient({
  items,
  mode = 'real',
  topSignal,
}: {
  items:       InformationItem[]
  mode?:       'real' | 'all'
  topSignal?:  TopSignalData
}) {
  const [search, setSearch]                   = useState('')
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [selectedTier, setSelectedTier]         = useState<SourceTier | null>(null)
  const [sortBy, setSortBy]                     = useState<'time' | 'score'>('time')

  const filtered = items
    .filter(item => {
      if (search && !item.title.includes(search) && !item.summary.includes(search)) return false
      if (selectedCategory && item.category !== selectedCategory) return false
      if (selectedTier && item.sourceTier !== selectedTier) return false
      return true
    })
    .sort((a, b) =>
      sortBy === 'score'
        ? b.finalScore - a.finalScore
        : new Date(b.fetchedAt ?? b.publishedAt).getTime() - new Date(a.fetchedAt ?? a.publishedAt).getTime()
    )

  return (
    <AppShell topSignal={topSignal}>
      <div className="p-6 md:p-8">

        {/* ── Header ── */}
        <div className="mb-5">
          <p className="page-kicker mb-1">Captured Timeline</p>
          <div className="flex items-end justify-between gap-4">
            <h1 className="editorial-title text-3xl">全量捕捉流</h1>
            <div className="flex items-center gap-3 pb-0.5">
              {mode === 'all' ? (
                <span className="text-[10px] text-warning border border-warning/30 bg-warning/10 rounded px-1.5 py-0.5">
                  含演示数据
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground/50 border border-border/30 rounded px-1.5 py-0.5">
                  仅真实数据
                </span>
              )}
              <p className="meta-text">{items.length} 条</p>
            </div>
          </div>
          <p className="page-subtitle mt-1.5">
            系统按时间捕捉到的原始信息，不代表全部都值得阅读。
          </p>
        </div>

        {/* ── Filter bar ── */}
        <div className="flex items-center gap-2 flex-wrap pb-3 mb-1 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="搜索..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-7 w-44 text-xs bg-background"
            />
          </div>

          {/* Sort */}
          <div className="flex items-center gap-px border border-border rounded-md overflow-hidden h-7">
            {(['score', 'time'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={cn(
                  "px-2.5 text-xs h-full transition-colors",
                  sortBy === s
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                {s === 'score' ? '分数' : '时间'}
              </button>
            ))}
          </div>

          {/* Category chips */}
          <div className="flex items-center gap-1 flex-wrap">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                className={cn(
                  "text-[10px] px-2 py-1 rounded border transition-colors",
                  selectedCategory === cat
                    ? "bg-primary/10 text-primary border-primary/20 font-medium"
                    : "text-muted-foreground border-border/50 hover:border-border hover:text-foreground"
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Tier chips */}
          <div className="flex items-center gap-1">
            {tiers.map(tier => (
              <button
                key={tier}
                onClick={() => setSelectedTier(selectedTier === tier ? null : tier)}
                className={cn(
                  "text-[10px] px-2 py-1 rounded border font-bold transition-colors",
                  selectedTier === tier
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "text-muted-foreground border-border/50 hover:border-border hover:text-foreground"
                )}
              >
                {tier}
              </button>
            ))}
          </div>

          {(selectedCategory || selectedTier || search) && (
            <button
              onClick={() => { setSelectedCategory(null); setSelectedTier(null); setSearch('') }}
              className="text-[10px] text-primary hover:text-primary/70 transition-colors ml-auto"
            >
              清除筛选
            </button>
          )}
        </div>

        {/* ── Feed list ── */}
        <div className="bg-card rounded-lg overflow-hidden border border-border/60">
          {filtered.length > 0
            ? filtered.map(item => <InformationCard key={item.id} item={item} contextPage="feed" />)
            : (
              <div className="py-10 text-center">
                <p className="text-sm text-muted-foreground">没有符合条件的内容</p>
              </div>
            )
          }
        </div>
      </div>
    </AppShell>
  )
}
