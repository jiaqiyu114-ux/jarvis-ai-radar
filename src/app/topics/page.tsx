"use client"

import { useState } from "react"
import { AppShell } from "@/components/layout/app-shell"
import { TopicCard } from "@/components/topics/topic-card"
import { mockTopics } from "@/config/mock-data"
import type { TopicStatus } from "@/types"
import { cn } from "@/lib/utils"

const statusTabs: Array<{ value: TopicStatus | 'all'; label: string }> = [
  { value: 'all',           label: '全部'    },
  { value: 'pending',       label: '待评估'  },
  { value: 'worth_writing', label: '值得写'  },
  { value: 'writing',       label: '写作中'  },
  { value: 'published',     label: '已发布'  },
  { value: 'abandoned',     label: '已放弃'  },
]

export default function TopicsPage() {
  const [activeTab, setActiveTab] = useState<TopicStatus | 'all'>('all')

  const filtered = activeTab === 'all'
    ? mockTopics
    : mockTopics.filter(t => t.status === activeTab)

  const sorted = [...filtered].sort((a, b) => {
    const prio = { high: 3, medium: 2, low: 1 }
    return (prio[b.priority] ?? 0) - (prio[a.priority] ?? 0)
  })

  return (
    <AppShell>
      <div className="p-8 max-w-[960px]">

        {/* ── Editorial header ── */}
        <div className="mb-6">
          <p className="page-kicker mb-1">My Collection</p>
          <h1 className="editorial-title text-[2.25rem]">选题池</h1>
          <p className="text-muted-foreground text-sm mt-2">
            {mockTopics.length} 个选题资产
            {' · '}{mockTopics.filter(t => t.status === 'worth_writing').length} 个值得写
            {' · '}{mockTopics.filter(t => t.status === 'writing').length} 个写作中
          </p>
        </div>

        {/* ── Tab bar (editorial underline style) ── */}
        <div className="border-b border-border mb-6">
          <div className="flex items-center gap-0">
            {statusTabs.map(tab => {
              const count = tab.value === 'all'
                ? mockTopics.length
                : mockTopics.filter(t => t.status === tab.value).length
              const active = activeTab === tab.value
              return (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={cn(
                    "px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px",
                    active
                      ? "border-primary text-foreground font-semibold"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  )}
                >
                  {tab.label}
                  {count > 0 && (
                    <span className={cn(
                      "ml-1.5 text-[10px] font-mono",
                      active ? "text-primary" : "text-muted-foreground"
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Topic cards ── */}
        {sorted.length > 0 ? (
          <div className="space-y-2.5">
            {sorted.map(topic => <TopicCard key={topic.id} topic={topic} />)}
          </div>
        ) : (
          <div className="border border-border rounded-lg p-10 text-center bg-card">
            <p className="text-sm text-muted-foreground">此状态下暂无选题</p>
          </div>
        )}
      </div>
    </AppShell>
  )
}
