"use client"

import { useState } from "react"
import { ExternalLink } from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import type { TopSignalData } from "@/components/layout/app-shell"
import type { TopicItem, TopicStatus } from "@/types"
import { cn } from "@/lib/utils"

// ── Constants ─────────────────────────────────────────────────────────────────

const statusTabs: Array<{ value: TopicStatus | 'all'; label: string }> = [
  { value: 'all',           label: '全部'   },
  { value: 'pending',       label: '待评估' },
  { value: 'worth_writing', label: '值得写' },
  { value: 'writing',       label: '写作中' },
  { value: 'published',     label: '已发布' },
  { value: 'abandoned',     label: '已放弃' },
]

const PRIORITY_STYLE: Record<string, string> = {
  high:   'text-danger border-danger/30 bg-danger/8',
  medium: 'text-warning border-warning/30 bg-warning/8',
  low:    'text-muted-foreground border-border bg-muted/50',
}

const PRIORITY_LABEL: Record<string, string> = {
  high: '高', medium: '中', low: '低',
}

const STATUS_LABEL: Record<string, string> = {
  pending:       '待评估',
  worth_writing: '值得写',
  writing:       '写作中',
  published:     '已发布',
  abandoned:     '已放弃',
  archived:      '归档',
}

// ── Topic card ────────────────────────────────────────────────────────────────

function TopicRow({ topic }: { topic: TopicItem }) {
  const priority = topic.priority as string
  return (
    <div className="border-b border-border last:border-0 py-3.5 px-5 hover:bg-accent transition-colors">
      <div className="flex items-start gap-3">
        {/* Priority badge */}
        <span className={cn(
          "text-[9px] px-1.5 py-px rounded border font-bold shrink-0 mt-0.5",
          PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.low,
        )}>
          {PRIORITY_LABEL[priority] ?? priority}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-foreground leading-snug">{topic.topicTitle}</p>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-px">
                {STATUS_LABEL[topic.status] ?? topic.status}
              </span>
            </div>
          </div>

          {topic.coreInfo && (
            <p className="text-xs text-muted-foreground line-clamp-2">{topic.coreInfo}</p>
          )}

          {topic.possibleAngles?.[0] && (
            <p className="text-[10px] text-foreground/60 italic line-clamp-1">
              角度：{topic.possibleAngles[0]}
            </p>
          )}

          <div className="flex items-center gap-3 flex-wrap mt-1">
            {topic.sourceName && (
              <span className="text-[10px] text-muted-foreground">{topic.sourceName}</span>
            )}
            {topic.targetPlatform && topic.targetPlatform !== '其他' && (
              <span className="text-[10px] text-muted-foreground border border-border/60 rounded px-1 py-px">
                {topic.targetPlatform}
              </span>
            )}
            {topic.finalScore != null && (
              <span className="text-[10px] font-mono text-muted-foreground">
                综合 {topic.finalScore}
                {topic.truthScore != null && ` · 真实 ${topic.truthScore}`}
                {topic.evScore != null && ` · 证据 ${topic.evScore}`}
              </span>
            )}
            {topic.sourceUrl && (
              <a
                href={topic.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-primary/70 hover:text-primary flex items-center gap-0.5 transition-colors"
                onClick={e => e.stopPropagation()}
              >
                <ExternalLink className="h-2.5 w-2.5" />
                原文
              </a>
            )}
            <span className="text-[10px] text-muted-foreground/50 ml-auto">
              {new Date(topic.createdAt).toLocaleDateString('zh-CN')}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TopicsClient({
  topics,
  topSignal,
}: {
  topics:     TopicItem[]
  topSignal?: TopSignalData
}) {
  const [activeTab, setActiveTab] = useState<TopicStatus | 'all'>('all')

  const filtered = activeTab === 'all'
    ? topics
    : topics.filter(t => t.status === activeTab)

  const sorted = [...filtered].sort((a, b) => {
    const prio = { high: 3, medium: 2, low: 1 }
    const pa = prio[a.priority as keyof typeof prio] ?? 1
    const pb = prio[b.priority as keyof typeof prio] ?? 1
    if (pb !== pa) return pb - pa
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return (
    <AppShell topSignal={topSignal}>
      <div className="p-8 max-w-[960px]">

        {/* ── Header ── */}
        <div className="mb-6">
          <p className="page-kicker mb-1">Topic Pool</p>
          <h1 className="editorial-title text-[2.25rem]">选题池</h1>
          <p className="text-muted-foreground text-sm mt-2">
            {topics.length} 个选题资产
            {' · '}{topics.filter(t => t.status === 'worth_writing').length} 个值得写
            {' · '}{topics.filter(t => t.status === 'writing').length} 个写作中
          </p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            来源：点击信息详情卡片中的【加入选题池】自动创建。
          </p>
        </div>

        {/* ── Stats pills ── */}
        {topics.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap mb-5">
            {([
              { label: '待评估', status: 'pending'       as TopicStatus },
              { label: '值得写', status: 'worth_writing' as TopicStatus },
              { label: '写作中', status: 'writing'       as TopicStatus },
              { label: '已发布', status: 'published'     as TopicStatus },
            ] as Array<{ label: string; status: TopicStatus }>).map(({ label, status }) => {
              const count = topics.filter(t => t.status === status).length
              if (count === 0) return null
              return (
                <span key={status} className="text-[10px] text-muted-foreground border border-border rounded-full px-2 py-px">
                  {label} {count}
                </span>
              )
            })}
          </div>
        )}

        {/* ── Tab bar ── */}
        <div className="border-b border-border mb-5">
          <div className="flex items-center gap-0">
            {statusTabs.map(tab => {
              const count = tab.value === 'all'
                ? topics.length
                : topics.filter(t => t.status === tab.value).length
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
                    <span className={cn("ml-1.5 text-[10px] font-mono", active ? "text-primary" : "text-muted-foreground")}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── List ── */}
        {sorted.length > 0 ? (
          <div className="border border-border rounded-lg overflow-hidden bg-card">
            {sorted.map(topic => <TopicRow key={topic.id} topic={topic} />)}
          </div>
        ) : (
          <div className="border border-border rounded-lg p-12 text-center bg-card">
            {activeTab === 'all' ? (
              <>
                <p className="text-sm text-muted-foreground">暂无选题</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  你可以在今日推荐或信息详情卡中把信息加入选题池。
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">此状态下暂无选题</p>
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}
