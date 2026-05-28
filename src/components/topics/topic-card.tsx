"use client"

import { ChevronDown } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import type { TopicItem, TopicStatus } from "@/types"

interface TopicCardProps {
  topic: TopicItem
  onStatusChange?: (id: string, status: TopicStatus) => void
}

const statusConfig: Record<TopicStatus, { label: string; className: string }> = {
  pending:       { label: '待评估', className: 'text-stone-600 bg-stone-100 border-stone-300 dark:text-stone-400 dark:bg-stone-500/15 dark:border-stone-500/30' },
  worth_writing: { label: '值得写', className: 'text-sky-700 bg-sky-100 border-sky-200 dark:text-sky-400 dark:bg-sky-500/15 dark:border-sky-500/30' },
  writing:       { label: '写作中', className: 'text-amber-700 bg-amber-100 border-amber-200 dark:text-amber-400 dark:bg-amber-500/15 dark:border-amber-500/30' },
  published:     { label: '已发布', className: 'text-emerald-700 bg-emerald-100 border-emerald-200 dark:text-green-400 dark:bg-green-500/15 dark:border-green-500/30' },
  abandoned:     { label: '已放弃', className: 'text-rose-600 bg-rose-50 border-rose-200 dark:text-red-400 dark:bg-red-500/15 dark:border-red-500/30' },
  archived:      { label: '已归档', className: 'text-zinc-400 bg-zinc-100 border-zinc-200 dark:text-zinc-500 dark:bg-zinc-500/15 dark:border-zinc-600/30' },
}

const priorityBorder: Record<string, string> = {
  high:   'border-l-orange-500',
  medium: 'border-l-amber-400',
  low:    'border-l-stone-200 dark:border-l-stone-700',
}

const priorityLabel: Record<string, string> = {
  high:   'H',
  medium: 'M',
  low:    'L',
}

const priorityColor: Record<string, string> = {
  high:   'text-orange-600 dark:text-orange-400',
  medium: 'text-amber-600 dark:text-amber-400',
  low:    'text-stone-400',
}

const platformColors: Record<string, string> = {
  '公众号':    'text-emerald-700 bg-emerald-100 dark:text-green-400 dark:bg-green-400/10',
  '小红书':    'text-rose-700 bg-rose-100 dark:text-red-400 dark:bg-red-400/10',
  '知乎':      'text-sky-700 bg-sky-100 dark:text-blue-400 dark:bg-blue-400/10',
  'Twitter/X': 'text-sky-600 bg-sky-50 dark:text-sky-400 dark:bg-sky-400/10',
  '即刻':      'text-amber-700 bg-amber-100 dark:text-orange-400 dark:bg-orange-400/10',
  '内部报告':  'text-violet-700 bg-violet-100 dark:text-violet-400 dark:bg-violet-400/10',
  '其他':      'text-stone-500 bg-stone-100 dark:text-muted-foreground dark:bg-muted',
}

export function TopicCard({ topic }: TopicCardProps) {
  const [expanded, setExpanded] = useState(false)
  const { label: statusLabel, className: statusClass } = statusConfig[topic.status]
  const platformClass = platformColors[topic.targetPlatform] ?? platformColors['其他']

  return (
    <div className={cn(
      "border-l-4 bg-card border border-border rounded-lg overflow-hidden transition-colors hover:bg-accent",
      priorityBorder[topic.priority]
    )}>
      <div
        className="px-4 py-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3">
          <span className={cn("text-[10px] font-bold font-mono mt-0.5 w-3 shrink-0", priorityColor[topic.priority])}>
            {priorityLabel[topic.priority]}
          </span>

          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-foreground line-clamp-2 leading-snug">
              {topic.topicTitle}
            </h3>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", platformClass)}>
                {topic.targetPlatform}
              </span>
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", statusClass)}>
                {statusLabel}
              </span>
              <span className="text-xs text-foreground/55 line-clamp-1 flex-1 min-w-0">
                {topic.coreInfo}
              </span>
            </div>
          </div>

          <ChevronDown className={cn(
            "h-4 w-4 text-muted-foreground/50 transition-transform shrink-0 mt-0.5",
            expanded && "rotate-180"
          )} />
        </div>
      </div>

      {/* Expanded: no extra background block, just a separator + content */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-border/60 pt-3 space-y-3">
          <div>
            <p className="muted-label mb-1.5">可能的角度</p>
            <ul className="space-y-1.5">
              {topic.possibleAngles.map((angle, i) => (
                <li key={i} className="text-xs text-foreground/80 flex gap-2">
                  <span className="text-primary/70 shrink-0 font-mono">{i + 1}.</span>
                  <span>{angle}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-0.5">
            <div>
              <p className="muted-label mb-1">目标读者</p>
              <p className="text-xs text-foreground/75 leading-relaxed">{topic.targetReader}</p>
            </div>
            <div>
              <p className="muted-label mb-1">读者痛点</p>
              <p className="text-xs text-foreground/75 leading-relaxed">{topic.readerPainPoint}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
