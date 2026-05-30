export const dynamic = 'force-dynamic'

import { AppShell } from "@/components/layout/app-shell"
import {
  ITEM_FEEDBACK_TYPES,
  listRecentItemFeedbackWithItems,
} from "@/lib/db/item-feedback"
import FeedbackReviewClient, { type FeedbackReviewStats } from "./_feedback-review-client"
import type { DbItemFeedbackType } from "@/types/database"
import type { TopSignalData } from "@/components/layout/app-shell"

type FeedbackPageSearchParams = {
  feedbackType?: string
}

function normalizeFeedbackType(value: string | undefined): 'all' | DbItemFeedbackType {
  if (!value || value === 'all') return 'all'
  if (ITEM_FEEDBACK_TYPES.includes(value as DbItemFeedbackType)) return value as DbItemFeedbackType
  return 'all'
}

function buildStats(feedbacks: Awaited<ReturnType<typeof listRecentItemFeedbackWithItems>>): FeedbackReviewStats {
  return {
    total: feedbacks.length,
    save_reference: feedbacks.filter(feedback => feedback.feedbackType === 'save_reference').length,
    add_to_watch: feedbacks.filter(feedback => feedback.feedbackType === 'add_to_watch').length,
    worth_writing: feedbacks.filter(feedback => feedback.feedbackType === 'worth_writing').length,
    project_related: feedbacks.filter(feedback => feedback.feedbackType === 'project_related').length,
    weak_evidence: feedbacks.filter(feedback => feedback.feedbackType === 'weak_evidence').length,
    overestimated: feedbacks.filter(feedback => feedback.feedbackType === 'overestimated').length,
    latestAt: feedbacks[0]?.updatedAt ?? feedbacks[0]?.createdAt ?? null,
  }
}

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<FeedbackPageSearchParams>
}) {
  const sp = await searchParams
  const selectedFeedbackType = normalizeFeedbackType(sp.feedbackType)

  const [feedbacks, recentForStats] = await Promise.all([
    listRecentItemFeedbackWithItems({
      limit: 50,
      feedbackType: selectedFeedbackType,
    }),
    listRecentItemFeedbackWithItems({ limit: 100 }),
  ])

  const topItem = feedbacks.find(feedback => feedback.item)?.item
  const topSignal: TopSignalData | undefined = topItem
    ? { score: topItem.finalScore, title: topItem.title, category: topItem.category }
    : undefined

  return (
    <AppShell topSignal={topSignal}>
      <FeedbackReviewClient
        feedbacks={feedbacks}
        stats={buildStats(recentForStats)}
        selectedFeedbackType={selectedFeedbackType}
      />
    </AppShell>
  )
}
