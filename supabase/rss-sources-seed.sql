-- ============================================================
--  J.A.R.V.I.S. RSS Sources Seed
--  Run AFTER schema.sql and provider-architecture.sql.
--
--  Idempotent upsert pattern (no UNIQUE constraint required):
--    1. UPDATE rows that already exist (by URL)
--    2. INSERT rows that do not exist yet
--  Safe to run multiple times. Does not delete any data.
-- ============================================================

-- ── Hugging Face Blog (A tier) ────────────────────────────────────────────────

UPDATE sources
SET name              = 'Hugging Face Blog',
    platform          = 'rss',
    source_tier       = 'A',
    base_score        = 82,
    reliability_score = 85,
    category          = 'AI技术',
    is_official       = false,
    is_blocked        = false
WHERE url = 'https://huggingface.co/blog/feed.xml';

INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked)
SELECT 'Hugging Face Blog',
       'https://huggingface.co/blog/feed.xml',
       'rss', 'A', 82, 85, 'AI技术', false, false
WHERE NOT EXISTS (
  SELECT 1 FROM sources WHERE url = 'https://huggingface.co/blog/feed.xml'
);

-- ── The Verge AI (B tier) ─────────────────────────────────────────────────────

UPDATE sources
SET name              = 'The Verge AI',
    platform          = 'rss',
    source_tier       = 'B',
    base_score        = 72,
    reliability_score = 75,
    category          = 'AI技术',
    is_official       = false,
    is_blocked        = false
WHERE url = 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml';

INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked)
SELECT 'The Verge AI',
       'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
       'rss', 'B', 72, 75, 'AI技术', false, false
WHERE NOT EXISTS (
  SELECT 1 FROM sources WHERE url = 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml'
);

-- ── TechCrunch AI (B tier) ───────────────────────────────────────────────────

UPDATE sources
SET name              = 'TechCrunch AI',
    platform          = 'rss',
    source_tier       = 'B',
    base_score        = 70,
    reliability_score = 72,
    category          = 'AI技术',
    is_official       = false,
    is_blocked        = false
WHERE url = 'https://techcrunch.com/category/artificial-intelligence/feed/';

INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked)
SELECT 'TechCrunch AI',
       'https://techcrunch.com/category/artificial-intelligence/feed/',
       'rss', 'B', 70, 72, 'AI技术', false, false
WHERE NOT EXISTS (
  SELECT 1 FROM sources WHERE url = 'https://techcrunch.com/category/artificial-intelligence/feed/'
);

-- ── Verify result ─────────────────────────────────────────────────────────────
-- Run this after executing the above:
--
--   SELECT id, name, url, platform, source_tier, is_blocked
--   FROM sources
--   WHERE platform = 'rss'
--   ORDER BY source_tier, name;
