-- item-feedback-v1.sql
-- Semantic annotation table for deliberate user judgments on information items.
-- Separate from user_feedback (behavioural events like view/click/read_time).
-- Records: quality judgements, evidence assessments, processing intent.

CREATE TABLE IF NOT EXISTS item_feedback (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         uuid        NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  feedback_type   text        NOT NULL,
  feedback_value  integer     NOT NULL DEFAULT 1,
  feedback_note   text        NULL,
  context_page    text        NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Unique: one annotation per type per item (enables upsert / toggle).
CREATE UNIQUE INDEX IF NOT EXISTS idx_item_feedback_item_type
  ON item_feedback(item_id, feedback_type);

CREATE INDEX IF NOT EXISTS idx_item_feedback_item_id
  ON item_feedback(item_id);

CREATE INDEX IF NOT EXISTS idx_item_feedback_type
  ON item_feedback(feedback_type);

COMMENT ON TABLE item_feedback IS
  'Semantic annotation feedback: content quality, evidence quality, processing intent. '
  'Not behavioural events — does not drive automatic score adjustment.';

-- ── Verify ──────────────────────────────────────────────────────────────────

-- Run this to confirm the table was created:
-- SELECT id, item_id, feedback_type, feedback_value, context_page, created_at
-- FROM public.item_feedback
-- ORDER BY created_at DESC
-- LIMIT 20;
