-- ============================================================
--  J.A.R.V.I.S.  cleanup-sources-v1.sql
--
--  PURPOSE: Clean up dirty data in public.sources before running
--  source-seeds-v1.sql. Safe to re-run (idempotent).
--
--  EXECUTION ORDER:
--    1. source-curation-v1.sql    (adds curation columns — must run first)
--    2. THIS FILE                 (cleanup)
--    3. source-seeds-v1.sql       (insert/update clean seeds)
--
--  This script does NOT delete items — only blocks or fixes sources.
--  Blocking a source stops it from participating in future ingest
--  and removes it from the recommendation candidate pool.
-- ============================================================

-- ============================================================
--  SECTION 1: Block obvious test / placeholder sources
--  Any source whose URL or name contains test patterns
--  is blocked and marked as demo data so it never enters
--  the recommendation pipeline.
-- ============================================================

UPDATE public.sources
SET
  is_blocked  = true,
  data_origin = 'demo',
  updated_at  = now()
WHERE
  url  ILIKE '%example.com%'
  OR url  ILIKE '%localhost%'
  OR url  ILIKE '%test-rss%'
  OR url  ILIKE '%dummy%'
  OR url  ILIKE '%placeholder%'
  OR name ILIKE '%test%rss%'
  OR name ILIKE '%demo%source%'
  OR name ILIKE '%测试%信源%'
  OR (url  = '' OR name = '');

-- ============================================================
--  SECTION 2: Fix AIHOT user-curated sources
--  Both "AIHOT 精选" and "AI HOT 全部AI动态" (and any other
--  AIHOT variants) are given clean, correct metadata.
--  Handles both Chinese name variants and garbled versions.
-- ============================================================

UPDATE public.sources
SET
  is_user_curated      = true,
  user_source_label    = '用户认可源',
  user_source_note     = '用户主动接入的外部 AI 信息聚合源，作为候选信号参考，仍需多源验证。',
  user_source_priority = 12,
  source_badge_variant = 'user_curated',
  source_tier          = 'A',
  category             = 'AI技术',
  data_origin          = 'real',
  is_official          = false,
  is_blocked           = false,
  updated_at           = now()
WHERE
  name ILIKE '%AIHOT%'
  OR name ILIKE '%AI HOT%'
  OR name ILIKE '%aihot%'
  OR url  ILIKE '%aihot%'
  OR url  ILIKE '%virxact%';

-- ============================================================
--  SECTION 3: Clear garbled / mojibake text in name and notes
--  Patterns like Ã©, â€™, å, æ are Windows-1252 misread of UTF-8.
--  We reset the affected text fields to safe fallback values.
--  The source is kept active; only the display text is fixed.
-- ============================================================

-- Reset garbled names (these sources will be re-seeded correctly below)
UPDATE public.sources
SET
  name       = 'Unknown Source (name garbled)',
  is_blocked = true,
  updated_at = now()
WHERE
  name LIKE '%Ã%'
  OR name LIKE '%â€%'
  OR name LIKE '%å%'
  OR name LIKE '%æ%'
  OR name LIKE U&'\FFFD%';

-- Reset garbled user_source_note fields
UPDATE public.sources
SET
  user_source_note = NULL,
  updated_at       = now()
WHERE
  user_source_note IS NOT NULL
  AND (
    user_source_note LIKE '%Ã%'
    OR user_source_note LIKE '%â€%'
    OR user_source_note LIKE '%å%'
    OR user_source_note LIKE '%æ%'
  );

-- Reset garbled user_source_label fields
UPDATE public.sources
SET
  user_source_label = NULL,
  updated_at        = now()
WHERE
  user_source_label IS NOT NULL
  AND (
    user_source_label LIKE '%Ã%'
    OR user_source_label LIKE '%â€%'
    OR user_source_label LIKE '%å%'
  );

-- ============================================================
--  SECTION 4: Remove duplicate sources (same URL, multiple rows)
--  Keep the row with the most recent updated_at.
--  Soft approach: block the older duplicates.
-- ============================================================

UPDATE public.sources s
SET
  is_blocked  = true,
  data_origin = 'demo',
  updated_at  = now()
WHERE s.id IN (
  SELECT id
  FROM (
    SELECT
      id,
      url,
      updated_at,
      ROW_NUMBER() OVER (
        PARTITION BY url
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
      ) AS rn
    FROM public.sources
  ) ranked
  WHERE rn > 1
);

-- ============================================================
--  SECTION 5: Reset stale health counters for fresh start
--  Sources that were failing due to transient errors get
--  a chance to recover on the next ingest run.
--  Does NOT affect sources deliberately blocked in sections 1-4.
-- ============================================================

UPDATE public.sources
SET
  failure_count  = 0,
  health_status  = 'unknown',
  last_error_message = NULL,
  updated_at     = now()
WHERE
  is_blocked      = false
  AND failure_count > 0
  AND data_origin = 'real'
  AND last_fetch_at < now() - interval '7 days';

-- ============================================================
--  SECTION 6: Verify results
--  Uncomment and run after the script to review:
-- ============================================================
--
--  SELECT name, url, source_tier, is_official, is_user_curated,
--         is_blocked, data_origin, user_source_label
--  FROM   public.sources
--  ORDER  BY is_blocked, source_tier, name;
--
--  -- Check for any remaining garbled names:
--  SELECT id, name FROM public.sources
--  WHERE name LIKE '%Ã%' OR name LIKE '%â€%' OR name LIKE '%å%';
--
--  -- Check AIHOT sources:
--  SELECT name, url, source_tier, is_user_curated, user_source_label, is_blocked
--  FROM   public.sources
--  WHERE  url ILIKE '%aihot%' OR url ILIKE '%virxact%';
