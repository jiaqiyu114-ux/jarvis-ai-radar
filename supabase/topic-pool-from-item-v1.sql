-- Topic Pool from Information Items v1
-- Adds score fields and a unique constraint on source_item_id to the topics table.
-- Safe to re-run (IF NOT EXISTS + partial unique index).

ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS source_name  TEXT;
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS source_url   TEXT;
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS final_score  INTEGER;
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS truth_score  INTEGER;
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS ev_score     INTEGER;

-- Unique constraint: one topic per source item.
-- Partial index (WHERE source_item_id IS NOT NULL) allows legacy rows with NULL source_item_id.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_topics_source_item_id
  ON public.topics(source_item_id)
  WHERE source_item_id IS NOT NULL;

-- Verify:
-- SELECT id, source_item_id, title, status, priority, source_name, final_score
-- FROM public.topics
-- ORDER BY created_at DESC
-- LIMIT 20;
