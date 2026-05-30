-- Data Hygiene: Real Feed Boundary v1
-- Adds data_origin to items and sources.
-- Retroactively marks mock-provider items as 'demo'.
-- Safe to re-run (IF NOT EXISTS + WHERE guards).

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS data_origin TEXT NOT NULL DEFAULT 'real';

ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS data_origin TEXT NOT NULL DEFAULT 'real';

-- Mark items written exclusively by the mock provider as 'demo'.
-- Items that also have a real RSS mention are left as 'real'.
UPDATE public.items AS i
SET data_origin = 'demo'
WHERE i.data_origin = 'real'
  AND EXISTS (
    SELECT 1
    FROM   public.item_mentions im
    JOIN   public.providers     p  ON p.id = im.provider_id
    WHERE  im.item_id          = i.id
      AND  p.provider_key      = 'mock-provider-001'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM   public.item_mentions im2
    JOIN   public.providers     p2 ON p2.id = im2.provider_id
    WHERE  im2.item_id         = i.id
      AND  p2.provider_key    != 'mock-provider-001'
  );

-- Mark clearly mock-only source names as demo.
-- Conservative: only marks names that cannot be real sources.
UPDATE public.sources
SET data_origin = 'demo'
WHERE data_origin = 'real'
  AND platform   != 'rss'
  AND name IN ('Unknown Source');

-- ============================================================
-- Duplicate Source Audit (run these in SQL Editor separately)
-- ============================================================
--
-- Sources sharing the same URL:
-- SELECT url, COUNT(*) AS cnt, array_agg(name) AS names
-- FROM   public.sources
-- GROUP  BY url
-- HAVING COUNT(*) > 1
-- ORDER  BY cnt DESC;
--
-- Sources sharing the same name (case-insensitive):
-- SELECT LOWER(name) AS lname, COUNT(*) AS cnt, array_agg(url) AS urls
-- FROM   public.sources
-- GROUP  BY LOWER(name)
-- HAVING COUNT(*) > 1
-- ORDER  BY cnt DESC;
--
-- Breakdown by platform and data_origin:
-- SELECT platform, data_origin, COUNT(*) AS cnt
-- FROM   public.sources
-- GROUP  BY platform, data_origin
-- ORDER  BY platform, data_origin;
--
-- Items by data_origin:
-- SELECT data_origin, COUNT(*) AS cnt
-- FROM   public.items
-- GROUP  BY data_origin
-- ORDER  BY data_origin;
