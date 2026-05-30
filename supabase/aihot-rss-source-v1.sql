-- aihot-rss-source-v1.sql
-- Adds AIHOT 精选 as a curated-signal RSS source.
-- AIHOT is treated as a quality-signal feed, not an authoritative publisher.
-- Items from AIHOT still go through J.A.R.V.I.S. scoring, dedup, and clustering.

INSERT INTO sources (
  name,
  url,
  platform,
  source_tier,
  category,
  is_official,
  is_blocked,
  data_origin,
  description
)
VALUES (
  'AIHOT 精选',
  'https://aihot.virxact.com/feed.xml',
  'rss',
  'A',
  'AI技术',
  false,
  false,
  'real',
  'AIHOT 每日精选候选池 — 外部策展信号，仅作候选参考，不代表 J.A.R.V.I.S. 的最终判断。'
)
ON CONFLICT (url) DO UPDATE SET
  name        = EXCLUDED.name,
  source_tier = EXCLUDED.source_tier,
  description = EXCLUDED.description,
  updated_at  = now();

-- Verify:
-- SELECT id, name, url, platform, source_tier, is_blocked, data_origin
-- FROM public.sources
-- WHERE url = 'https://aihot.virxact.com/feed.xml';
