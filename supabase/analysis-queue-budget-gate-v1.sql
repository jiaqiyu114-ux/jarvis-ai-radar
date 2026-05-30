-- Analysis Queue / Token Budget Gate v1
-- Adds post-processing scheduling fields to items table.
-- Safe to re-run (IF NOT EXISTS guards).

ALTER TABLE public.items ADD COLUMN IF NOT EXISTS analysis_priority         TEXT DEFAULT 'normal';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS analysis_stage            TEXT DEFAULT 'unprocessed';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS analysis_tier             TEXT DEFAULT 'none';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS analysis_reason           TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS token_budget_tier         TEXT DEFAULT 'none';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS estimated_input_tokens    INTEGER;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS estimated_output_tokens   INTEGER;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS estimated_total_tokens    INTEGER;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS should_deep_analyze       BOOLEAN DEFAULT false;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS should_track_event        BOOLEAN DEFAULT false;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS should_enter_daily_report BOOLEAN DEFAULT false;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS should_enter_topic_pool   BOOLEAN DEFAULT false;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS analysis_queued_at        TIMESTAMPTZ;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS analysis_updated_at       TIMESTAMPTZ;

-- Verify after running:
-- SELECT analysis_tier, token_budget_tier, COUNT(*)
-- FROM public.items
-- GROUP BY analysis_tier, token_budget_tier;
