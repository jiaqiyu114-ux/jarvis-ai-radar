-- ============================================================
--  J.A.R.V.I.S. RSS Sources Seed
--  Run AFTER schema.sql and provider-architecture.sql.
--  Idempotent: safe to run multiple times.
--  Uses INSERT ... WHERE NOT EXISTS to skip already-present URLs.
-- ============================================================

-- ── Tier A: High-quality AI technical sources ─────────────────────────────────

-- Hugging Face Blog (official AI tooling, research announcements)
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked)
SELECT 'Hugging Face Blog', 'https://huggingface.co/blog/feed.xml',
       'rss', 'A', 82, 85, 'AI技术', false, false
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE url = 'https://huggingface.co/blog/feed.xml');

-- ── Tier B: Reliable tech media / curated AI coverage ────────────────────────

-- The Verge AI section
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked)
SELECT 'The Verge AI', 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
       'rss', 'B', 72, 75, 'AI技术', false, false
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE url = 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml');

-- TechCrunch AI section
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked)
SELECT 'TechCrunch AI', 'https://techcrunch.com/category/artificial-intelligence/feed/',
       'rss', 'B', 70, 72, 'AI技术', false, false
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE url = 'https://techcrunch.com/category/artificial-intelligence/feed/');

-- ── Verify seed result ────────────────────────────────────────────────────────
-- Run after executing the above to confirm:
--
--   SELECT name, url, source_tier, is_official, is_blocked
--   FROM sources
--   WHERE platform = 'rss'
--   ORDER BY source_tier, name;
