"use client"

import Link from "next/link"
import { useState } from "react"
import { ExternalLink, MessageSquareText } from "lucide-react"
import { format, formatDistanceToNow } from "date-fns"
import { zhCN } from "date-fns/locale"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { ItemDetailPanel } from "@/components/feed/item-detail-panel"
import { ScoreBadge } from "@/components/feed/score-badge"
import { SourceTierBadge } from "@/components/feed/source-tier-badge"
import {
  FEEDBACK_FILTER_OPTIONS,
  FEEDBACK_TYPE_DESCRIPTIONS,
  FEEDBACK_TYPE_LABELS,
} from "@/lib/feedback/feedback-labels"
import { cn } from "@/lib/utils"
import type { DbItemFeedbackType } from "@/types/database"
import type { RecentItemFeedback } from "@/lib/db/item-feedback"

export type FeedbackReviewStats = {
  total: number
  save_reference: number
  add_to_watch: number
  worth_writing: number
  project_related: number
  weak_evidence: number
  overestimated: number
  latestAt: string | null
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="font-mono text-2xl font-semibold leading-none tabular-nums text-foreground">
        {value}
      </p>
      <p className="mt-1 text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}

function formatTime(value: string): string {
  return format(new Date(value), 'MM/dd HH:mm', { locale: zhCN })
}

function filterHref(type: 'all' | DbItemFeedbackType): string {
  return type === 'all' ? '/feedback' : `/feedback?feedbackType=${type}`
}

function FeedbackRecordCard({
  feedback,
  onOpen,
}: {
  feedback: RecentItemFeedback
  onOpen: (feedback: RecentItemFeedback) => void
}) {
  const item = feedback.item
  const label = FEEDBACK_TYPE_LABELS[feedback.feedbackType]
  const description = FEEDBACK_TYPE_DESCRIPTIONS[feedback.feedbackType]
  const ago = formatDistanceToNow(new Date(feedback.createdAt), { addSuffix: true, locale: zhCN })

  return (
    <article
      className={cn(
        "group border-b border-border bg-card px-4 py-3 transition-colors last:border-b-0",
        item ? "cursor-pointer hover:bg-accent/65" : "opacity-70",
      )}
      onClick={() => item && onOpen(feedback)}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 pt-0.5">
          <span className="inline-flex items-center rounded border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">
            {label}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h2 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground group-hover:text-primary">
              {item?.title ?? '原信息已不可用'}
            </h2>
            {item && <ScoreBadge score={item.finalScore} size="sm" />}
          </div>

          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {item?.summary || description}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {item && (
              <>
                <SourceTierBadge tier={item.sourceTier} />
                <span className="max-w-44 truncate text-[10px] text-foreground/70">{item.source}</span>
                <span className="text-[10px] text-muted-foreground/40">·</span>
                <span className="text-[10px] text-muted-foreground">{formatTime(item.publishedAt)}</span>
              </>
            )}
            {feedback.contextPage && (
              <span className="rounded border border-border bg-muted/35 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {feedback.contextPage}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground/60">{ago}</span>
            <span className="ml-auto font-mono text-[9px] text-muted-foreground/40">
              {feedback.itemId}
            </span>
            {item?.originalUrl && (
              <a
                href={item.originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={event => event.stopPropagation()}
                className="inline-flex items-center gap-1 rounded border border-primary/25 bg-primary/8 px-2 py-1 text-[10px] font-medium text-primary transition-colors hover:bg-primary/15"
              >
                <ExternalLink className="h-3 w-3" />
                查看原文
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

export default function FeedbackReviewClient({
  feedbacks,
  stats,
  selectedFeedbackType,
}: {
  feedbacks: RecentItemFeedback[]
  stats: FeedbackReviewStats
  selectedFeedbackType: 'all' | DbItemFeedbackType
}) {
  const [selected, setSelected] = useState<RecentItemFeedback | null>(null)
  const selectedItem = selected?.item ?? null

  return (
    <>
      <div className="p-6 md:p-8">
        <header className="mb-6">
          <p className="page-kicker mb-1">Feedback Review</p>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="editorial-title text-3xl">反馈记录</h1>
              <p className="page-subtitle mt-1.5 max-w-3xl">
                这些标注用于校准信息质量、证据价值和后续处理意图，不作为兴趣偏好直接调权。
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2 text-right">
              <p className="text-[10px] text-muted-foreground">最近更新时间</p>
              <p className="mt-1 text-xs font-medium text-foreground">
                {stats.latestAt ? formatTime(stats.latestAt) : '暂无记录'}
              </p>
            </div>
          </div>
        </header>

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <StatCard label="总反馈数" value={stats.total} />
          <StatCard label="保存资料" value={stats.save_reference} />
          <StatCard label="加入观察" value={stats.add_to_watch} />
          <StatCard label="值得写" value={stats.worth_writing} />
          <StatCard label="项目相关" value={stats.project_related} />
          <StatCard label="证据弱" value={stats.weak_evidence} />
          <StatCard label="系统高估" value={stats.overestimated} />
        </div>

        <section className="mb-3 flex flex-wrap items-center gap-1.5 border-b border-border pb-3">
          {FEEDBACK_FILTER_OPTIONS.map(option => {
            const active = selectedFeedbackType === option.value
            return (
              <Link
                key={option.value}
                href={filterHref(option.value)}
                className={cn(
                  "rounded border px-2.5 py-1 text-[11px] transition-colors",
                  active
                    ? "border-primary/35 bg-primary/10 text-primary"
                    : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {option.label}
              </Link>
            )
          })}
        </section>

        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border bg-muted/20 px-4 py-2.5">
            <MessageSquareText className="h-3.5 w-3.5 text-muted-foreground" />
            <h2 className="section-title">最近反馈</h2>
            <span className="meta-text">{feedbacks.length} 条</span>
          </div>

          {feedbacks.length > 0 ? (
            feedbacks.map(feedback => (
              <FeedbackRecordCard
                key={feedback.id}
                feedback={feedback}
                onOpen={setSelected}
              />
            ))
          ) : (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                还没有反馈标注。你可以在信息详情卡片中标记保存资料、加入观察、证据强弱或系统高估。
              </p>
            </div>
          )}
        </section>
      </div>

      <Dialog open={Boolean(selectedItem)} onOpenChange={open => !open && setSelected(null)}>
        <DialogContent className="max-h-[88vh] w-full max-w-2xl overflow-y-auto p-0 gap-0">
          <DialogTitle className="sr-only">{selectedItem?.title ?? '信息详情'}</DialogTitle>
          <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-6 py-3 backdrop-blur-sm">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              信息详情
            </p>
          </div>
          {selectedItem && (
            <div className="px-6 py-5">
              <ItemDetailPanel item={selectedItem} contextPage="feedback" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
