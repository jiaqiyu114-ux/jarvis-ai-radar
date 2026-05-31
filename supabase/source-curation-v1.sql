-- ────────────────────────────────────────────────────────────
-- source-curation-v1.sql
-- Adds user curation fields to public.sources.
-- Idempotent: safe to run multiple times.
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS is_user_curated       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS user_source_label      text,
  ADD COLUMN IF NOT EXISTS user_source_note       text,
  ADD COLUMN IF NOT EXISTS user_source_priority   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_badge_variant   text;

-- Mark AIHOT 精选 as a user-curated external curation source.
-- AIHOT is NOT an official source; it is a third-party curation feed
-- the user has actively chosen to monitor.
UPDATE public.sources
SET
  is_user_curated     = true,
  user_source_label   = '外部精选源',
  user_source_note    = '用户主动接入的外部策展信息源，仅作为候选参考，仍需多源验证。',
  user_source_priority = 10,
  source_badge_variant = 'user_curated',
  is_official          = false,
  updated_at           = now()
WHERE
  name ILIKE '%AIHOT%'
  OR url  ILIKE '%aihot%';
