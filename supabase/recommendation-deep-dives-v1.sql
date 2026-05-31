-- ============================================================
--  recommendation-deep-dives-v1.sql
--
--  Daily recommendation snapshot deep-dive columns (v1).
--  Idempotent and safe to run multiple times.
--
--  IMPORTANT:
--  1) Run supabase/recommendation-snapshots-v1.sql first.
--  2) Then run this file in Supabase SQL Editor manually.
-- ============================================================

ALTER TABLE IF EXISTS public.recommendation_snapshot_items
  ADD COLUMN IF NOT EXISTS deep_dive_status        text        DEFAULT 'generated',
  ADD COLUMN IF NOT EXISTS deep_dive_generated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS deep_dive_model         text        DEFAULT 'deterministic-v1',
  ADD COLUMN IF NOT EXISTS deep_summary            text,
  ADD COLUMN IF NOT EXISTS background_context      text,
  ADD COLUMN IF NOT EXISTS why_it_matters          text,
  ADD COLUMN IF NOT EXISTS user_insight            text,
  ADD COLUMN IF NOT EXISTS risk_and_uncertainty    text,
  ADD COLUMN IF NOT EXISTS follow_up_suggestion    text,
  ADD COLUMN IF NOT EXISTS source_reading_guide    text;

-- Optional verification:
-- SELECT
--   column_name,
--   data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'recommendation_snapshot_items'
--   AND column_name LIKE 'deep_%'
-- ORDER BY ordinal_position;
