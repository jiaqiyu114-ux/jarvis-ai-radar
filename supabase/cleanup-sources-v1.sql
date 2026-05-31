-- ============================================================
-- DEPRECATED
-- ============================================================
-- This file is intentionally deprecated.
--
-- Use this file instead:
--   supabase/source-maintenance-v2.sql
--
-- Why:
-- - v1 cleanup had historical encoding/quote instability and can
--   fail in SQL Editor depending on file history.
-- - v2 combines cleanup + dedupe + stable seed in one idempotent pass.
--
-- Safe no-op:
DO $$
BEGIN
  RAISE NOTICE 'cleanup-sources-v1.sql is deprecated. Run supabase/source-maintenance-v2.sql instead.';
END
$$;
