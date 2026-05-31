-- ============================================================
-- DEPRECATED
-- ============================================================
-- This file is intentionally deprecated.
--
-- Use this file instead:
--   supabase/source-maintenance-v2.sql
--
-- Reason:
-- - The old script used ON CONFLICT(url), which is not stable when
--   sources.url has no compatible unique/exclusion constraint.
-- - AIHOT curated sources are included in source-maintenance-v2.sql.
--
-- Safe no-op:
DO $$
BEGIN
  RAISE NOTICE 'aihot-rss-source-v1.sql is deprecated. Run supabase/source-maintenance-v2.sql instead.';
END
$$;
