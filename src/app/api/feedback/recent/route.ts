import { type NextRequest, NextResponse } from 'next/server'
import {
  ITEM_FEEDBACK_TYPES,
  listRecentItemFeedbackWithItems,
} from '@/lib/db/item-feedback'
import type { DbItemFeedbackType } from '@/types/database'

function parseLimit(value: string | null): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 20
  return Math.min(Math.max(Math.floor(parsed), 1), 100)
}

function parseFeedbackType(value: string | null): DbItemFeedbackType | 'all' | undefined {
  if (!value || value === 'all') return value === 'all' ? 'all' : undefined
  if (ITEM_FEEDBACK_TYPES.includes(value as DbItemFeedbackType)) return value as DbItemFeedbackType
  throw new Error(`feedbackType must be all or one of: ${ITEM_FEEDBACK_TYPES.join(', ')}`)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  try {
    const feedbacks = await listRecentItemFeedbackWithItems({
      limit: parseLimit(searchParams.get('limit')),
      feedbackType: parseFeedbackType(searchParams.get('feedbackType')),
      contextPage: searchParams.get('contextPage') || undefined,
    })

    return NextResponse.json({
      ok: true,
      feedbacks,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = message.startsWith('feedbackType must be') ? 400 : 500
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}
