-- ============================================================
--  J.A.R.V.I.S. Source Deduplication Check Queries
--
--  Run these in Supabase SQL Editor to identify duplicate sources.
--  These are READ-ONLY queries — they do NOT modify any data.
--
--  If duplicates are found, manually delete the unwanted rows
--  in Supabase Studio, keeping the row with the most item references.
-- ============================================================

-- 1. Find sources with duplicate names
SELECT
  name,
  count(*)   AS cnt,
  array_agg(id ORDER BY created_at) AS ids,
  array_agg(url ORDER BY created_at) AS urls
FROM sources
GROUP BY name
HAVING count(*) > 1
ORDER BY cnt DESC;

-- 2. Find sources with duplicate URLs (after normalisation they should be unique)
SELECT
  url,
  count(*)   AS cnt,
  array_agg(id ORDER BY created_at)   AS ids,
  array_agg(name ORDER BY created_at) AS names
FROM sources
GROUP BY url
HAVING count(*) > 1
ORDER BY cnt DESC;

-- 3. How many items each source has (to decide which duplicate to keep)
SELECT
  s.id,
  s.name,
  s.url,
  s.source_tier,
  s.platform,
  s.created_at,
  count(i.id) AS item_count
FROM sources s
LEFT JOIN items i ON i.source_id = s.id
GROUP BY s.id, s.name, s.url, s.source_tier, s.platform, s.created_at
ORDER BY item_count DESC, s.created_at ASC;

-- 4. Full summary: total counts
SELECT
  count(*)                                       AS total_sources,
  count(*) FILTER (WHERE is_blocked = false)     AS active_sources,
  count(*) FILTER (WHERE platform = 'rss')       AS rss_sources,
  count(*) FILTER (WHERE platform = 'web')       AS web_sources
FROM sources;

-- 5. items without a valid source_id (orphaned items)
SELECT count(*) AS orphaned_items
FROM items
WHERE source_id IS NULL;
