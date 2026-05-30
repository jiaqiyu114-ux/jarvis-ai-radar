-- Evidence & Truth Scoring v1
-- Adds evidence/truth audit fields to items table.
-- Note: evidence_score column already exists (used by rule scorer).
--       ev_score is the new evidence quality column for this system.
-- Safe to re-run (IF NOT EXISTS guards).

ALTER TABLE public.items ADD COLUMN IF NOT EXISTS truth_score         INTEGER;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS ev_score            INTEGER;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS source_trace_score  INTEGER;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS claim_status        TEXT DEFAULT 'unverified';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS evidence_level      TEXT DEFAULT 'low';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS source_nature       TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS has_original_source BOOLEAN DEFAULT false;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS has_author          BOOLEAN DEFAULT false;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS has_published_time  BOOLEAN DEFAULT false;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS has_article_content BOOLEAN DEFAULT false;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS has_media_evidence  BOOLEAN DEFAULT false;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS evidence_notes      TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS truth_notes         TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS evidence_checked_at TIMESTAMPTZ;

-- Verify:
-- SELECT claim_status, evidence_level, COUNT(*)
-- FROM public.items
-- GROUP BY claim_status, evidence_level;
