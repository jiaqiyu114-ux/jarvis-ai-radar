-- ============================================================
-- J.A.R.V.I.S. source-maintenance-v2.sql
--
-- Purpose:
-- 1) clean polluted/duplicate rows in public.sources
-- 2) migrate source references before dedupe deletes
-- 3) seed a stable curated RSS set without ON CONFLICT(url)
--
-- Notes:
-- - Idempotent: safe to run multiple times.
-- - Does NOT require a UNIQUE constraint on sources.url.
-- - Avoids deleting uncertain user-added rows aggressively.
-- ============================================================

-- ------------------------------------------------------------
-- 0) Ensure curation columns exist (safe if already present)
-- ------------------------------------------------------------
ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS is_user_curated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS user_source_label text,
  ADD COLUMN IF NOT EXISTS user_source_note text,
  ADD COLUMN IF NOT EXISTS user_source_priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_badge_variant text;

-- ------------------------------------------------------------
-- 1) Block obvious test / demo / placeholder sources
-- ------------------------------------------------------------
UPDATE public.sources
SET
  is_blocked = true,
  data_origin = CASE WHEN data_origin = 'real' THEN 'demo' ELSE data_origin END,
  updated_at = now()
WHERE
  (url ILIKE '%example.com%' OR url ILIKE '%localhost%' OR url ILIKE '%test-rss%' OR url ILIKE '%dummy%' OR url ILIKE '%placeholder%')
  OR (name ILIKE '%test%' OR name ILIKE '%测试%');

-- ------------------------------------------------------------
-- 2) Block known non-feed duplicates from historical imports
--    (keep row for traceability; do not hard delete here)
-- ------------------------------------------------------------
UPDATE public.sources
SET
  is_blocked = true,
  data_origin = CASE WHEN data_origin = 'real' THEN 'demo' ELSE data_origin END,
  updated_at = now()
WHERE
  platform IS NULL
  AND (
    (name ILIKE '%GitHub%' AND url ILIKE '%github.com/microsoft/autogen%')
    OR name ILIKE '%OpenAI Platform Docs%'
    OR name ILIKE '%Anthropic Blog%'
  );

-- ------------------------------------------------------------
-- 3) Fill obvious missing platform values for feed-like URLs
-- ------------------------------------------------------------
UPDATE public.sources
SET
  platform = 'rss',
  updated_at = now()
WHERE
  platform IS NULL
  AND is_blocked = false
  AND (
    url ILIKE '%/feed%'
    OR url ILIKE '%rss.xml%'
    OR url ILIKE '%/rss%'
    OR url ILIKE '%.xml'
  );

-- ------------------------------------------------------------
-- 4) Build duplicate map by normalized URL
--    normalized_url: lowercase + no query/hash + no trailing slash
-- ------------------------------------------------------------
DROP TABLE IF EXISTS tmp_source_dedupe_map;

CREATE TEMP TABLE tmp_source_dedupe_map AS
WITH source_norm AS (
  SELECT
    s.id,
    s.platform,
    s.source_tier,
    s.is_user_curated,
    s.is_blocked,
    s.updated_at,
    s.created_at,
    lower(regexp_replace(trim(split_part(split_part(s.url, '#', 1), '?', 1)), '/+$', '')) AS normalized_url
  FROM public.sources s
  WHERE s.url IS NOT NULL AND trim(s.url) <> ''
),
ranked AS (
  SELECT
    n.*,
    ROW_NUMBER() OVER (
      PARTITION BY n.normalized_url
      ORDER BY
        CASE WHEN lower(coalesce(n.platform, '')) = 'rss' THEN 1 ELSE 0 END DESC,
        CASE WHEN coalesce(n.is_user_curated, false) THEN 1 ELSE 0 END DESC,
        CASE coalesce(n.source_tier, 'D')
          WHEN 'S' THEN 5
          WHEN 'A' THEN 4
          WHEN 'B' THEN 3
          WHEN 'C' THEN 2
          WHEN 'D' THEN 1
          ELSE 0
        END DESC,
        CASE WHEN coalesce(n.is_blocked, false) = false THEN 1 ELSE 0 END DESC,
        n.updated_at DESC NULLS LAST,
        n.created_at DESC NULLS LAST,
        n.id ASC
    ) AS rn,
    FIRST_VALUE(n.id) OVER (
      PARTITION BY n.normalized_url
      ORDER BY
        CASE WHEN lower(coalesce(n.platform, '')) = 'rss' THEN 1 ELSE 0 END DESC,
        CASE WHEN coalesce(n.is_user_curated, false) THEN 1 ELSE 0 END DESC,
        CASE coalesce(n.source_tier, 'D')
          WHEN 'S' THEN 5
          WHEN 'A' THEN 4
          WHEN 'B' THEN 3
          WHEN 'C' THEN 2
          WHEN 'D' THEN 1
          ELSE 0
        END DESC,
        CASE WHEN coalesce(n.is_blocked, false) = false THEN 1 ELSE 0 END DESC,
        n.updated_at DESC NULLS LAST,
        n.created_at DESC NULLS LAST,
        n.id ASC
    ) AS keep_id
  FROM source_norm n
)
SELECT
  r.id AS source_id_to_replace,
  r.keep_id
FROM ranked r
WHERE r.rn > 1
  AND r.keep_id IS NOT NULL
  AND r.id <> r.keep_id;

-- ------------------------------------------------------------
-- 5) Migrate known references (items + rss_source_fetch_logs)
-- ------------------------------------------------------------
UPDATE public.items i
SET source_id = m.keep_id
FROM tmp_source_dedupe_map m
WHERE i.source_id = m.source_id_to_replace;

DO $$
BEGIN
  IF to_regclass('public.rss_source_fetch_logs') IS NOT NULL THEN
    EXECUTE '
      UPDATE public.rss_source_fetch_logs l
      SET source_id = m.keep_id
      FROM tmp_source_dedupe_map m
      WHERE l.source_id = m.source_id_to_replace
    ';
  END IF;
END
$$;

-- ------------------------------------------------------------
-- 6) Remove dedupe rows safely.
--    If unknown FK blocks delete, keep row but block it.
-- ------------------------------------------------------------
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT source_id_to_replace
    FROM tmp_source_dedupe_map
  LOOP
    BEGIN
      DELETE FROM public.sources WHERE id = rec.source_id_to_replace;
    EXCEPTION
      WHEN foreign_key_violation THEN
        UPDATE public.sources
        SET
          is_blocked = true,
          data_origin = CASE WHEN data_origin = 'real' THEN 'demo' ELSE data_origin END,
          user_source_note = CASE
            WHEN coalesce(user_source_note, '') ILIKE '%blocked duplicate kept for fk compatibility%'
              THEN user_source_note
            ELSE concat_ws(' ', nullif(user_source_note, ''), 'blocked duplicate kept for FK compatibility')
          END,
          updated_at = now()
        WHERE id = rec.source_id_to_replace;
    END;
  END LOOP;
END
$$;

-- ------------------------------------------------------------
-- 7) Seed clean RSS sources (18 rows)
--    No ON CONFLICT(url). Uses update-then-insert.
-- ------------------------------------------------------------
DROP TABLE IF EXISTS tmp_seed_sources;

CREATE TEMP TABLE tmp_seed_sources (
  name text NOT NULL,
  url text NOT NULL,
  source_tier text NOT NULL,
  base_score numeric(5,2) NOT NULL,
  reliability_score numeric(5,2) NOT NULL,
  category text NOT NULL,
  is_official boolean NOT NULL,
  is_user_curated boolean NOT NULL,
  user_source_label text,
  user_source_note text,
  user_source_priority integer NOT NULL,
  source_badge_variant text
) ON COMMIT DROP;

INSERT INTO tmp_seed_sources (
  name, url, source_tier, base_score, reliability_score, category, is_official,
  is_user_curated, user_source_label, user_source_note, user_source_priority, source_badge_variant
) VALUES
  ('AIHOT 精选', 'https://aihot.virxact.com/feed.xml', 'A', 82, 82, 'AI技术', false, true,  '用户认可源', 'Curated external AI signal feed selected by user.', 15, 'user_curated'),
  ('AI HOT 全部AI动态', 'https://aihot.virxact.com/feed/all.xml', 'A', 80, 80, 'AI技术', false, true, '用户认可源', 'Curated broad AI feed selected by user for coverage expansion.', 14, 'user_curated'),
  ('Hugging Face Blog', 'https://huggingface.co/blog/feed.xml', 'A', 82, 85, 'AI技术', false, false, null, null, 0, null),
  ('MIT Technology Review AI', 'https://www.technologyreview.com/topic/artificial-intelligence/feed', 'A', 82, 88, 'AI技术', false, false, null, null, 0, null),
  ('Google Research Blog', 'https://blog.research.google/feeds/posts/default', 'A', 85, 88, 'AI技术', true, false, null, null, 0, null),
  ('GitHub Blog', 'https://github.blog/feed/', 'A', 80, 85, 'AI技术', true, false, null, null, 0, null),
  ('Mistral AI Blog', 'https://mistral.ai/news/rss.xml', 'A', 85, 87, 'AI技术', true, false, null, null, 0, null),
  ('The Decoder', 'https://the-decoder.com/feed/', 'A', 78, 80, 'AI技术', false, false, null, null, 0, null),
  ('The Verge AI', 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', 'B', 72, 75, 'AI技术', false, false, null, null, 0, null),
  ('TechCrunch AI', 'https://techcrunch.com/category/artificial-intelligence/feed/', 'B', 70, 72, 'AI技术', false, false, null, null, 0, null),
  ('VentureBeat AI', 'https://venturebeat.com/category/ai/feed/', 'B', 74, 76, 'AI技术', false, false, null, null, 0, null),
  ('Ars Technica AI', 'https://feeds.arstechnica.com/arstechnica/technology-lab', 'B', 73, 78, 'AI技术', false, false, null, null, 0, null),
  ('MarkTechPost', 'https://www.marktechpost.com/feed/', 'B', 65, 68, 'AI技术', false, false, null, null, 0, null),
  ('Vercel Blog', 'https://vercel.com/blog/rss.xml', 'B', 70, 75, 'AI技术', true, false, null, null, 0, null),
  ('Cursor Blog', 'https://cursor.sh/blog/rss.xml', 'B', 72, 75, 'AI技术', true, false, null, null, 0, null),
  ('Cloudflare Blog', 'https://blog.cloudflare.com/rss/', 'B', 72, 80, 'AI技术', true, false, null, null, 0, null),
  ('AWS Machine Learning Blog', 'https://aws.amazon.com/blogs/machine-learning/feed/', 'B', 74, 82, 'AI技术', true, false, null, null, 0, null),
  ('NVIDIA Blog', 'https://blogs.nvidia.com/feed/', 'B', 74, 82, 'AI技术', true, false, null, null, 0, null);

ALTER TABLE tmp_seed_sources ADD COLUMN normalized_url text;

UPDATE tmp_seed_sources
SET normalized_url = lower(regexp_replace(trim(split_part(split_part(url, '#', 1), '?', 1)), '/+$', ''));

DROP TABLE IF EXISTS tmp_seed_matches;

CREATE TEMP TABLE tmp_seed_matches AS
SELECT
  ss.*,
  (
    SELECT s.id
    FROM public.sources s
    WHERE
      lower(regexp_replace(trim(split_part(split_part(s.url, '#', 1), '?', 1)), '/+$', '')) = ss.normalized_url
      OR lower(trim(s.name)) = lower(trim(ss.name))
    ORDER BY
      CASE
        WHEN lower(regexp_replace(trim(split_part(split_part(s.url, '#', 1), '?', 1)), '/+$', '')) = ss.normalized_url THEN 0
        ELSE 1
      END ASC,
      CASE WHEN lower(coalesce(s.platform, '')) = 'rss' THEN 1 ELSE 0 END DESC,
      CASE WHEN coalesce(s.is_user_curated, false) THEN 1 ELSE 0 END DESC,
      CASE coalesce(s.source_tier, 'D')
        WHEN 'S' THEN 5
        WHEN 'A' THEN 4
        WHEN 'B' THEN 3
        WHEN 'C' THEN 2
        WHEN 'D' THEN 1
        ELSE 0
      END DESC,
      s.updated_at DESC NULLS LAST
    LIMIT 1
  ) AS matched_source_id
FROM tmp_seed_sources ss;

UPDATE public.sources s
SET
  name = m.name,
  url = m.url,
  platform = 'rss',
  source_tier = m.source_tier,
  base_score = m.base_score,
  reliability_score = m.reliability_score,
  category = m.category,
  is_official = m.is_official,
  is_user_curated = m.is_user_curated,
  user_source_label = m.user_source_label,
  user_source_note = m.user_source_note,
  user_source_priority = m.user_source_priority,
  source_badge_variant = m.source_badge_variant,
  is_blocked = false,
  data_origin = 'real',
  updated_at = now()
FROM tmp_seed_matches m
WHERE s.id = m.matched_source_id;

INSERT INTO public.sources (
  name, url, platform, source_tier, base_score, reliability_score, category,
  is_official, is_blocked, data_origin, is_user_curated, user_source_label,
  user_source_note, user_source_priority, source_badge_variant, updated_at
)
SELECT
  m.name,
  m.url,
  'rss',
  m.source_tier,
  m.base_score,
  m.reliability_score,
  m.category,
  m.is_official,
  false,
  'real',
  m.is_user_curated,
  m.user_source_label,
  m.user_source_note,
  m.user_source_priority,
  m.source_badge_variant,
  now()
FROM tmp_seed_matches m
WHERE m.matched_source_id IS NULL;

-- ------------------------------------------------------------
-- 8) Final pass: dedupe any new collisions introduced by manual data
-- ------------------------------------------------------------
DROP TABLE IF EXISTS tmp_source_dedupe_map_final;

CREATE TEMP TABLE tmp_source_dedupe_map_final AS
WITH source_norm AS (
  SELECT
    s.id,
    s.platform,
    s.source_tier,
    s.is_user_curated,
    s.is_blocked,
    s.updated_at,
    s.created_at,
    lower(regexp_replace(trim(split_part(split_part(s.url, '#', 1), '?', 1)), '/+$', '')) AS normalized_url
  FROM public.sources s
  WHERE s.url IS NOT NULL AND trim(s.url) <> ''
),
ranked AS (
  SELECT
    n.*,
    ROW_NUMBER() OVER (
      PARTITION BY n.normalized_url
      ORDER BY
        CASE WHEN lower(coalesce(n.platform, '')) = 'rss' THEN 1 ELSE 0 END DESC,
        CASE WHEN coalesce(n.is_user_curated, false) THEN 1 ELSE 0 END DESC,
        CASE coalesce(n.source_tier, 'D')
          WHEN 'S' THEN 5
          WHEN 'A' THEN 4
          WHEN 'B' THEN 3
          WHEN 'C' THEN 2
          WHEN 'D' THEN 1
          ELSE 0
        END DESC,
        CASE WHEN coalesce(n.is_blocked, false) = false THEN 1 ELSE 0 END DESC,
        n.updated_at DESC NULLS LAST,
        n.created_at DESC NULLS LAST,
        n.id ASC
    ) AS rn,
    FIRST_VALUE(n.id) OVER (
      PARTITION BY n.normalized_url
      ORDER BY
        CASE WHEN lower(coalesce(n.platform, '')) = 'rss' THEN 1 ELSE 0 END DESC,
        CASE WHEN coalesce(n.is_user_curated, false) THEN 1 ELSE 0 END DESC,
        CASE coalesce(n.source_tier, 'D')
          WHEN 'S' THEN 5
          WHEN 'A' THEN 4
          WHEN 'B' THEN 3
          WHEN 'C' THEN 2
          WHEN 'D' THEN 1
          ELSE 0
        END DESC,
        CASE WHEN coalesce(n.is_blocked, false) = false THEN 1 ELSE 0 END DESC,
        n.updated_at DESC NULLS LAST,
        n.created_at DESC NULLS LAST,
        n.id ASC
    ) AS keep_id
  FROM source_norm n
)
SELECT
  r.id AS source_id_to_replace,
  r.keep_id
FROM ranked r
WHERE r.rn > 1
  AND r.keep_id IS NOT NULL
  AND r.id <> r.keep_id;

UPDATE public.items i
SET source_id = m.keep_id
FROM tmp_source_dedupe_map_final m
WHERE i.source_id = m.source_id_to_replace;

DO $$
BEGIN
  IF to_regclass('public.rss_source_fetch_logs') IS NOT NULL THEN
    EXECUTE '
      UPDATE public.rss_source_fetch_logs l
      SET source_id = m.keep_id
      FROM tmp_source_dedupe_map_final m
      WHERE l.source_id = m.source_id_to_replace
    ';
  END IF;
END
$$;

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT source_id_to_replace
    FROM tmp_source_dedupe_map_final
  LOOP
    BEGIN
      DELETE FROM public.sources WHERE id = rec.source_id_to_replace;
    EXCEPTION
      WHEN foreign_key_violation THEN
        UPDATE public.sources
        SET
          is_blocked = true,
          data_origin = CASE WHEN data_origin = 'real' THEN 'demo' ELSE data_origin END,
          user_source_note = CASE
            WHEN coalesce(user_source_note, '') ILIKE '%blocked duplicate kept for fk compatibility%'
              THEN user_source_note
            ELSE concat_ws(' ', nullif(user_source_note, ''), 'blocked duplicate kept for FK compatibility')
          END,
          updated_at = now()
        WHERE id = rec.source_id_to_replace;
    END;
  END LOOP;
END
$$;

-- ------------------------------------------------------------
-- 9) Optional verification snippets
-- ------------------------------------------------------------
-- SELECT name, url, platform, source_tier, is_blocked, data_origin
-- FROM public.sources
-- ORDER BY is_blocked, source_tier, name;
