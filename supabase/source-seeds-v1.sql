-- ============================================================
-- DEPRECATED
-- ============================================================
-- This file is intentionally deprecated.
--
-- Use this file instead:
--   supabase/source-maintenance-v2.sql
--
-- Why:
-- - v1 relied on ON CONFLICT(url), which fails when sources.url
--   does not have a matching unique/exclusion constraint.
-- - v1 content is replaced to avoid repeated SQL editor failures.
--
-- Safe no-op:
DO $$
BEGIN
  RAISE NOTICE 'source-seeds-v1.sql is deprecated. Run supabase/source-maintenance-v2.sql instead.';
END
$$;
