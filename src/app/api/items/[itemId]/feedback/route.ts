import { type NextRequest, NextResponse } from 'next/server'
import {
  ITEM_FEEDBACK_TYPES,
  upsertItemFeedback,
  deleteItemFeedback,
  listItemFeedback,
} from '@/lib/db/item-feedback'
import type { DbItemFeedbackType } from '@/types/database'

// GET /api/items/:itemId/feedback — returns all feedback annotations for an item
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    const { itemId } = await params
    const feedbacks = await listItemFeedback(itemId)
    return NextResponse.json({ ok: true, feedbacks })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

// POST /api/items/:itemId/feedback
// body: { feedbackType: string; action?: 'add' | 'remove'; contextPage?: string }
// action defaults to 'add' (upsert); 'remove' deletes the annotation
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    const { itemId } = await params
    const body = await req.json() as {
      feedbackType?: string
      action?: 'add' | 'remove'
      contextPage?: string
    }

    const { feedbackType, action = 'add', contextPage } = body

    if (!feedbackType || !ITEM_FEEDBACK_TYPES.includes(feedbackType as DbItemFeedbackType)) {
      return NextResponse.json(
        { ok: false, error: `feedbackType must be one of: ${ITEM_FEEDBACK_TYPES.join(', ')}` },
        { status: 400 },
      )
    }

    const typedType = feedbackType as DbItemFeedbackType

    if (action === 'remove') {
      const removed = await deleteItemFeedback(itemId, typedType)
      return NextResponse.json({ ok: true, action: 'removed', feedbackType: typedType, removed })
    }

    const feedback = await upsertItemFeedback(itemId, typedType, contextPage)
    return NextResponse.json({ ok: true, action: 'saved', feedbackType: typedType, feedback })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
