-- ============================================================
--  J.A.R.V.I.S. High-Quality Source Seeds V1 (Revised)
--
--  Execute in Supabase SQL Editor AFTER schema.sql.
--  Uses ON CONFLICT (url) DO UPDATE for idempotency.
--  Safe to run multiple times — will not delete existing data.
--
--  Confidence:
--    [HIGH]   URL confirmed valid and consistently returns RSS
--    [MED]    URL inferred from site structure; likely correct
--    [LOW]    Best guess — verify manually, may return 404
--
--  is_user_curated = FALSE by default.
--  Mark sources as "我的源" from the /sources management page.
--  AIHOT 精选 is the only exception (user-designated curated source).
-- ============================================================

-- ────────────────────────────────────────────────────────────
--  S TIER — Official model labs / primary sources
-- ────────────────────────────────────────────────────────────

-- OpenAI Blog [MED]
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
VALUES ('OpenAI Blog', 'https://openai.com/blog/rss.xml', 'rss', 'S', 95, 95, 'AI技术', true, false, 'real')
ON CONFLICT (url) DO UPDATE SET
  name = EXCLUDED.name, source_tier = EXCLUDED.source_tier,
  base_score = EXCLUDED.base_score, reliability_score = EXCLUDED.reliability_score,
  is_official = EXCLUDED.is_official, is_blocked = false;

-- Anthropic News [LOW — RSS not confirmed]
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
VALUES ('Anthropic News', 'https://www.anthropic.com/rss.xml', 'rss', 'S', 95, 95, 'AI技术', true, false, 'real')
ON CONFLICT (url) DO UPDATE SET
  name = EXCLUDED.name, source_tier = EXCLUDED.source_tier,
  base_score = EXCLUDED.base_score, is_official = EXCLUDED.is_official, is_blocked = false;

-- ────────────────────────────────────────────────────────────
--  A TIER — High-quality media and research
-- ────────────────────────────────────────────────────────────

-- Hugging Face Blog [HIGH]
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
VALUES ('Hugging Face Blog', 'https://huggingface.co/blog/feed.xml', 'rss', 'A', 82, 85, 'AI技术', false, false, 'real')
ON CONFLICT (url) DO UPDATE SET
  name = EXCLUDED.name, source_tier = EXCLUDED.source_tier,
  base_score = EXCLUDED.base_score, reliability_score = EXCLUDED.reliability_score, is_blocked = false;

-- MIT Technology Review [HIGH]
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
VALUES ('MIT Technology Review', 'https://www.technologyreview.com/feed/', 'rss', 'A', 82, 88, 'AI技术', false, false, 'real')
ON CONFLICT (url) DO UPDATE SET
  name = EXCLUDED.name, source_tier = EXCLUDED.source_tier,
  base_score = EXCLUDED.base_score, reliability_score = EXCLUDED.reliability_score, is_blocked = false;

-- Google Research Blog [MED]
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
VALUES ('Google Research Blog', 'https://blog.research.google/feeds/posts/default', 'rss', 'A', 85, 88, '研究报告', true, false, 'real')
ON CONFLICT (url) DO UPDATE SET
  name = EXCLUDED.name, source_tier = EXCLUDED.source_tier,
  base_score = EXCLUDED.base_score, is_official = EXCLUDED.is_official, is_blocked = false;

-- Microsoft Research Blog [MED]
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
VALUES ('Microsoft Research Blog', 'https://www.microsoft.com/en-us/research/feed/', 'rss', 'A', 82, 85, '研究报告', true, false, 'real')
ON CONFLICT (url) DO UPDATE SET
  name = EXCLUDED.name, source_tier = EXCLUDED.source_tier,
  base_score = EXCLUDED.base_score, is_official = EXCLUDED.is_official, is_blocked = false;

-- GitHub Blog [HIGH]
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
VALUES ('GitHub Blog', 'https://github.blog/feed/', 'rss', 'A', 80, 85, '开源项目', true, false, 'real')
ON CONFLICT (url) DO UPDATE SET
  name = EXCLUDED.name, source_tier = EXCLUDED.source_tier,
  base_score = EXCLUDED.base_score, is_official = EXCLUDED.is_official, is_blocked = false;

-- Mistral AI Blog [MED]
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
VALUES ('Mistral AI Blog', 'https://mistral.ai/news/rss.xml', 'rss', 'A', 85, 87, 'AI技术', true, false, 'real')
ON CONFLICT (url) DO UPDATE SET
  name = EXCLUDED.name, source_tier = EXCLUDED.source_tier,
  base_score = EXCLUDED.base_score, is_official = EXCLUDED.is_official, is_blocked = false;

-- ────────────────────────────────────────────────────────────
--  B TIER — Quality media and developer blogs
-- ────────────────────────────────────────────────────────────

-- The Verge AI [HIGH]
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
VALUES ('The Verge AI', 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', 'rss', 'B', 72, 75, 'AI技术', false, false, 'real')
ON CONFLICT (url) DO UPDATE SET
  name = EXCLUDED.name, source_tier = EXCLUDED.source_tier,
  base_score = EXCLUDED.base_score, is_blocked = false;

-- TechCrunch AI [HIGH]
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
VALUES ('TechCrunch AI', 'https://techcrunch.com/category/artificial-intelligence/feed/', 'rss', 'B', 70, 72, 'AI技术', false, false, 'real')
ON CONFLICT (url) DO UPDATE SET
  name = EXCLUDED.name, source_tier = EXCLUDED.source_tier,
  base_score = EXCLUDED.base_score, is_blocked = false;

-- VentureBeat AI [HIGH]
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
VALUES ('VentureBeat AI', 'https://venturebeat.com/ai/feed/', 'rss', 'B', 74, 76, '行业趋势', false, false, 'real')
ON CONFLICT (url) DO UPDATE SET
  name = EXCLUDED.name, source_tier = EXCLUDED.source_tier,
  base_score = EXCLUDED.base_score, is_blocked = false;

-- The Decoder [HIGH]
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
VALUES ('The Decoder', 'https://the-decoder.com/feed/', 'rss', 'B', 72, 75, 'AI技术', false, false, 'real')
ON CONFLICT (url) DO UPDATE SET
  name = EXCLUDED.name, source_tier = EXCLUDED.source_tier,
  base_score = EXCLUDED.base_score, is_blocked = false;

-- Ars Technica AI [HIGH]
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
VALUES ('Ars Technica AI', 'https://feeds.arstechnica.com/arstechnica/technology-lab', 'rss', 'B', 73, 78, 'AI技术', false, false, 'real')
ON CONFLICT (url) DO UPDATE SET
  name = EXCLUDED.name, source_tier = EXCLUDED.source_tier,
  base_score = EXCLUDED.base_score, is_blocked = false;

-- MarkTechPost [HIGH]
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
VALUES ('MarkTechPost', 'https://www.marktechpost.com/feed/', 'rss', 'B', 65, 68, 'AI技术', false, false, 'real')
ON CONFLICT (url) DO UPDATE SET
  name = EXCLUDED.name, source_tier = EXCLUDED.source_tier,
  base_score = EXCLUDED.base_score, is_blocked = false;

-- Towards Data Science [HIGH]
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
VALUES ('Towards Data Science', 'https://towardsdatascience.com/feed', 'rss', 'B', 68, 70, '研究报告', false, false, 'real')
ON CONFLICT (url) DO UPDATE SET
  name = EXCLUDED.name, source_tier = EXCLUDED.source_tier,
  base_score = EXCLUDED.base_score, is_blocked = false;

-- Vercel Blog [HIGH]
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
VALUES ('Vercel Blog', 'https://vercel.com/blog/rss.xml', 'rss', 'B', 70, 75, '产品发布', true, false, 'real')
ON CONFLICT (url) DO UPDATE SET
  name = EXCLUDED.name, source_tier = EXCLUDED.source_tier,
  base_score = EXCLUDED.base_score, is_official = EXCLUDED.is_official, is_blocked = false;

-- Cloudflare Blog [HIGH]
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
VALUES ('Cloudflare Blog', 'https://blog.cloudflare.com/rss/', 'rss', 'B', 70, 75, '行业趋势', true, false, 'real')
ON CONFLICT (url) DO UPDATE SET
  name = EXCLUDED.name, source_tier = EXCLUDED.source_tier,
  base_score = EXCLUDED.base_score, is_official = EXCLUDED.is_official, is_blocked = false;

-- Supabase Blog [HIGH]
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
VALUES ('Supabase Blog', 'https://supabase.com/blog/rss.xml', 'rss', 'B', 68, 72, '产品发布', true, false, 'real')
ON CONFLICT (url) DO UPDATE SET
  name = EXCLUDED.name, source_tier = EXCLUDED.source_tier,
  base_score = EXCLUDED.base_score, is_official = EXCLUDED.is_official, is_blocked = false;

-- LangChain Blog [MED]
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
VALUES ('LangChain Blog', 'https://blog.langchain.dev/rss/', 'rss', 'B', 72, 74, 'AI技术', true, false, 'real')
ON CONFLICT (url) DO UPDATE SET
  name = EXCLUDED.name, source_tier = EXCLUDED.source_tier,
  base_score = EXCLUDED.base_score, is_official = EXCLUDED.is_official, is_blocked = false;

-- InfoQ [HIGH]
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
VALUES ('InfoQ', 'https://feed.infoq.com/', 'rss', 'B', 70, 72, 'AI技术', false, false, 'real')
ON CONFLICT (url) DO UPDATE SET
  name = EXCLUDED.name, source_tier = EXCLUDED.source_tier,
  base_score = EXCLUDED.base_score, is_blocked = false;

-- Cursor Blog [MED]
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
VALUES ('Cursor Blog', 'https://cursor.sh/blog/rss.xml', 'rss', 'B', 72, 75, '产品发布', true, false, 'real')
ON CONFLICT (url) DO UPDATE SET
  name = EXCLUDED.name, source_tier = EXCLUDED.source_tier,
  base_score = EXCLUDED.base_score, is_official = EXCLUDED.is_official, is_blocked = false;

-- ────────────────────────────────────────────────────────────
--  USER CURATED — manually designated by user
--  is_user_curated = TRUE, source_badge_variant = 'user_curated'
-- ────────────────────────────────────────────────────────────

-- AIHOT 精选 [HIGH — user-designated curated source]
INSERT INTO sources (
  name, url, platform, source_tier, base_score, reliability_score, category,
  is_official, is_blocked, data_origin,
  is_user_curated, user_source_label, user_source_note, user_source_priority, source_badge_variant
)
VALUES (
  'AIHOT 精选', 'https://aihot.virxact.com/feed.xml', 'rss', 'B', 72, 75, 'AI技术',
  false, false, 'real',
  true, '外部精选源', '高质量 AI 信息精选聚合，信噪比较高', 15, 'user_curated'
)
ON CONFLICT (url) DO UPDATE SET
  name = EXCLUDED.name, source_tier = EXCLUDED.source_tier,
  base_score = EXCLUDED.base_score, is_blocked = false,
  is_user_curated = EXCLUDED.is_user_curated,
  user_source_label = EXCLUDED.user_source_label,
  user_source_note = EXCLUDED.user_source_note,
  user_source_priority = EXCLUDED.user_source_priority,
  source_badge_variant = EXCLUDED.source_badge_variant;

-- ────────────────────────────────────────────────────────────
--  VERIFY: Run this SELECT after execution to check results
-- ────────────────────────────────────────────────────────────
--
--   SELECT id, name, source_tier, is_official, is_user_curated, is_blocked, data_origin
--   FROM sources
--   WHERE platform = 'rss'
--   ORDER BY source_tier, name;
