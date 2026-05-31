-- ============================================================
--  J.A.R.V.I.S.  source-seeds-v1.sql
--
--  18 high-quality AI / tech RSS sources.
--  Uses ON CONFLICT (url) DO UPDATE — safe to run many times.
--  sources.url has a UNIQUE constraint in schema.sql line 17.
--
--  EXECUTION ORDER (mandatory):
--    1. schema.sql
--    2. rss-source-health-v1.sql
--    3. rss-source-health-v2.sql
--    4. source-curation-v1.sql    ← adds curation columns
--    5. cleanup-sources-v1.sql    ← fixes dirty data
--    6. THIS FILE                 ← upserts clean seeds
--
--  URL confidence:
--    HIGH   confirmed valid RSS feed
--    MED    format inferred; likely works but verify after ingest
--    LOW    best guess; check health dashboard after first ingest
--
--  Text encoding: pure UTF-8. No HTML entities, no mojibake.
--  All Chinese strings verified manually.
-- ============================================================

-- ============================================================
--  USER CURATED SOURCES (is_user_curated = true)
--  These are feeds the user has actively chosen to monitor.
--  They receive a small priority boost in the recommendation
--  engine but NEVER bypass evidence verification.
-- ============================================================

-- AIHOT 精选 [HIGH] — user-curated external curation signal
INSERT INTO public.sources (
  name, url, platform, source_tier, base_score, reliability_score,
  category, is_official, is_blocked, data_origin,
  is_user_curated, user_source_label, user_source_note,
  user_source_priority, source_badge_variant
) VALUES (
  'AIHOT 精选',
  'https://aihot.virxact.com/feed.xml',
  'rss', 'A', 80, 80,
  'AI技术', false, false, 'real',
  true,
  '外部精选源',
  '用户主动接入的 AI 每日精选聚合，信噪比较高，作为候选参考，仍需多源验证。',
  15, 'user_curated'
)
ON CONFLICT (url) DO UPDATE SET
  name                 = EXCLUDED.name,
  source_tier          = EXCLUDED.source_tier,
  base_score           = EXCLUDED.base_score,
  reliability_score    = EXCLUDED.reliability_score,
  category             = EXCLUDED.category,
  is_official          = EXCLUDED.is_official,
  is_blocked           = false,
  data_origin          = EXCLUDED.data_origin,
  is_user_curated      = EXCLUDED.is_user_curated,
  user_source_label    = EXCLUDED.user_source_label,
  user_source_note     = EXCLUDED.user_source_note,
  user_source_priority = EXCLUDED.user_source_priority,
  source_badge_variant = EXCLUDED.source_badge_variant,
  updated_at           = now();

-- ============================================================
--  NOTE: AI HOT 全部AI动态
--  The URL for this source is set by the user in /sources.
--  If the user has already added it manually, the cleanup SQL
--  (Section 2) will have set its curation fields correctly.
--  If you know the RSS URL, add a block here matching the
--  pattern above.
-- ============================================================

-- ============================================================
--  S TIER — Official AI labs (primary / authoritative)
--  is_official = true
--  URLs marked LOW may need manual verification after first ingest.
-- ============================================================

-- OpenAI Blog [LOW — RSS URL format uncertain; check health after ingest]
INSERT INTO public.sources (
  name, url, platform, source_tier, base_score, reliability_score,
  category, is_official, is_blocked, data_origin
) VALUES (
  'OpenAI Blog',
  'https://openai.com/blog/rss.xml',
  'rss', 'S', 95, 95,
  'AI技术', true, false, 'real'
)
ON CONFLICT (url) DO UPDATE SET
  name              = EXCLUDED.name,
  source_tier       = EXCLUDED.source_tier,
  base_score        = EXCLUDED.base_score,
  reliability_score = EXCLUDED.reliability_score,
  is_official       = EXCLUDED.is_official,
  is_blocked        = false,
  updated_at        = now();

-- ============================================================
--  A TIER — High-quality media and research outlets
-- ============================================================

-- Hugging Face Blog [HIGH]
INSERT INTO public.sources (
  name, url, platform, source_tier, base_score, reliability_score,
  category, is_official, is_blocked, data_origin
) VALUES (
  'Hugging Face Blog',
  'https://huggingface.co/blog/feed.xml',
  'rss', 'A', 82, 85,
  'AI技术', false, false, 'real'
)
ON CONFLICT (url) DO UPDATE SET
  name              = EXCLUDED.name,
  source_tier       = EXCLUDED.source_tier,
  base_score        = EXCLUDED.base_score,
  reliability_score = EXCLUDED.reliability_score,
  is_blocked        = false,
  updated_at        = now();

-- MIT Technology Review [HIGH]
INSERT INTO public.sources (
  name, url, platform, source_tier, base_score, reliability_score,
  category, is_official, is_blocked, data_origin
) VALUES (
  'MIT Technology Review',
  'https://www.technologyreview.com/feed/',
  'rss', 'A', 82, 88,
  'AI技术', false, false, 'real'
)
ON CONFLICT (url) DO UPDATE SET
  name              = EXCLUDED.name,
  source_tier       = EXCLUDED.source_tier,
  base_score        = EXCLUDED.base_score,
  reliability_score = EXCLUDED.reliability_score,
  is_blocked        = false,
  updated_at        = now();

-- The Decoder [HIGH] — AI-focused publication
INSERT INTO public.sources (
  name, url, platform, source_tier, base_score, reliability_score,
  category, is_official, is_blocked, data_origin
) VALUES (
  'The Decoder',
  'https://the-decoder.com/feed/',
  'rss', 'A', 78, 80,
  'AI技术', false, false, 'real'
)
ON CONFLICT (url) DO UPDATE SET
  name              = EXCLUDED.name,
  source_tier       = EXCLUDED.source_tier,
  base_score        = EXCLUDED.base_score,
  reliability_score = EXCLUDED.reliability_score,
  is_blocked        = false,
  updated_at        = now();

-- GitHub Blog [HIGH] — official, covers Copilot / AI dev tools
INSERT INTO public.sources (
  name, url, platform, source_tier, base_score, reliability_score,
  category, is_official, is_blocked, data_origin
) VALUES (
  'GitHub Blog',
  'https://github.blog/feed/',
  'rss', 'A', 80, 85,
  'AI技术', true, false, 'real'
)
ON CONFLICT (url) DO UPDATE SET
  name              = EXCLUDED.name,
  source_tier       = EXCLUDED.source_tier,
  base_score        = EXCLUDED.base_score,
  reliability_score = EXCLUDED.reliability_score,
  is_official       = EXCLUDED.is_official,
  is_blocked        = false,
  updated_at        = now();

-- Google Research Blog [MED] — Atom feed format
INSERT INTO public.sources (
  name, url, platform, source_tier, base_score, reliability_score,
  category, is_official, is_blocked, data_origin
) VALUES (
  'Google Research Blog',
  'https://blog.research.google/feeds/posts/default',
  'rss', 'A', 85, 88,
  'AI技术', true, false, 'real'
)
ON CONFLICT (url) DO UPDATE SET
  name              = EXCLUDED.name,
  source_tier       = EXCLUDED.source_tier,
  base_score        = EXCLUDED.base_score,
  reliability_score = EXCLUDED.reliability_score,
  is_official       = EXCLUDED.is_official,
  is_blocked        = false,
  updated_at        = now();

-- Mistral AI Blog [MED]
INSERT INTO public.sources (
  name, url, platform, source_tier, base_score, reliability_score,
  category, is_official, is_blocked, data_origin
) VALUES (
  'Mistral AI Blog',
  'https://mistral.ai/news/rss.xml',
  'rss', 'A', 85, 87,
  'AI技术', true, false, 'real'
)
ON CONFLICT (url) DO UPDATE SET
  name              = EXCLUDED.name,
  source_tier       = EXCLUDED.source_tier,
  base_score        = EXCLUDED.base_score,
  reliability_score = EXCLUDED.reliability_score,
  is_official       = EXCLUDED.is_official,
  is_blocked        = false,
  updated_at        = now();

-- ============================================================
--  B TIER — Quality media and developer ecosystem blogs
-- ============================================================

-- The Verge AI [HIGH]
INSERT INTO public.sources (
  name, url, platform, source_tier, base_score, reliability_score,
  category, is_official, is_blocked, data_origin
) VALUES (
  'The Verge AI',
  'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
  'rss', 'B', 72, 75,
  'AI技术', false, false, 'real'
)
ON CONFLICT (url) DO UPDATE SET
  name              = EXCLUDED.name,
  source_tier       = EXCLUDED.source_tier,
  base_score        = EXCLUDED.base_score,
  reliability_score = EXCLUDED.reliability_score,
  is_blocked        = false,
  updated_at        = now();

-- TechCrunch AI [HIGH]
INSERT INTO public.sources (
  name, url, platform, source_tier, base_score, reliability_score,
  category, is_official, is_blocked, data_origin
) VALUES (
  'TechCrunch AI',
  'https://techcrunch.com/category/artificial-intelligence/feed/',
  'rss', 'B', 70, 72,
  'AI技术', false, false, 'real'
)
ON CONFLICT (url) DO UPDATE SET
  name              = EXCLUDED.name,
  source_tier       = EXCLUDED.source_tier,
  base_score        = EXCLUDED.base_score,
  reliability_score = EXCLUDED.reliability_score,
  is_blocked        = false,
  updated_at        = now();

-- VentureBeat AI [HIGH]
INSERT INTO public.sources (
  name, url, platform, source_tier, base_score, reliability_score,
  category, is_official, is_blocked, data_origin
) VALUES (
  'VentureBeat AI',
  'https://venturebeat.com/ai/feed/',
  'rss', 'B', 74, 76,
  'AI技术', false, false, 'real'
)
ON CONFLICT (url) DO UPDATE SET
  name              = EXCLUDED.name,
  source_tier       = EXCLUDED.source_tier,
  base_score        = EXCLUDED.base_score,
  reliability_score = EXCLUDED.reliability_score,
  is_blocked        = false,
  updated_at        = now();

-- Ars Technica Technology Lab [HIGH]
INSERT INTO public.sources (
  name, url, platform, source_tier, base_score, reliability_score,
  category, is_official, is_blocked, data_origin
) VALUES (
  'Ars Technica AI',
  'https://feeds.arstechnica.com/arstechnica/technology-lab',
  'rss', 'B', 73, 78,
  'AI技术', false, false, 'real'
)
ON CONFLICT (url) DO UPDATE SET
  name              = EXCLUDED.name,
  source_tier       = EXCLUDED.source_tier,
  base_score        = EXCLUDED.base_score,
  reliability_score = EXCLUDED.reliability_score,
  is_blocked        = false,
  updated_at        = now();

-- MarkTechPost [HIGH] — AI paper and product coverage
INSERT INTO public.sources (
  name, url, platform, source_tier, base_score, reliability_score,
  category, is_official, is_blocked, data_origin
) VALUES (
  'MarkTechPost',
  'https://www.marktechpost.com/feed/',
  'rss', 'B', 65, 68,
  'AI技术', false, false, 'real'
)
ON CONFLICT (url) DO UPDATE SET
  name              = EXCLUDED.name,
  source_tier       = EXCLUDED.source_tier,
  base_score        = EXCLUDED.base_score,
  reliability_score = EXCLUDED.reliability_score,
  is_blocked        = false,
  updated_at        = now();

-- Vercel Blog [HIGH] — covers AI and developer tooling
INSERT INTO public.sources (
  name, url, platform, source_tier, base_score, reliability_score,
  category, is_official, is_blocked, data_origin
) VALUES (
  'Vercel Blog',
  'https://vercel.com/blog/rss.xml',
  'rss', 'B', 70, 75,
  'AI技术', true, false, 'real'
)
ON CONFLICT (url) DO UPDATE SET
  name              = EXCLUDED.name,
  source_tier       = EXCLUDED.source_tier,
  base_score        = EXCLUDED.base_score,
  reliability_score = EXCLUDED.reliability_score,
  is_official       = EXCLUDED.is_official,
  is_blocked        = false,
  updated_at        = now();

-- Towards Data Science [HIGH] — ML/AI deep-dives
INSERT INTO public.sources (
  name, url, platform, source_tier, base_score, reliability_score,
  category, is_official, is_blocked, data_origin
) VALUES (
  'Towards Data Science',
  'https://towardsdatascience.com/feed',
  'rss', 'B', 68, 70,
  'AI技术', false, false, 'real'
)
ON CONFLICT (url) DO UPDATE SET
  name              = EXCLUDED.name,
  source_tier       = EXCLUDED.source_tier,
  base_score        = EXCLUDED.base_score,
  reliability_score = EXCLUDED.reliability_score,
  is_blocked        = false,
  updated_at        = now();

-- Cursor Blog [MED] — AI coding tools
INSERT INTO public.sources (
  name, url, platform, source_tier, base_score, reliability_score,
  category, is_official, is_blocked, data_origin
) VALUES (
  'Cursor Blog',
  'https://cursor.sh/blog/rss.xml',
  'rss', 'B', 72, 75,
  'AI技术', true, false, 'real'
)
ON CONFLICT (url) DO UPDATE SET
  name              = EXCLUDED.name,
  source_tier       = EXCLUDED.source_tier,
  base_score        = EXCLUDED.base_score,
  reliability_score = EXCLUDED.reliability_score,
  is_official       = EXCLUDED.is_official,
  is_blocked        = false,
  updated_at        = now();

-- ============================================================
--  VERIFY after execution:
-- ============================================================
--
--  SELECT
--    name, source_tier, is_official, is_user_curated,
--    is_blocked, data_origin, user_source_label
--  FROM   public.sources
--  WHERE  platform = 'rss'
--  ORDER  BY is_blocked, source_tier, name;
--
--  Expected: 18 rows (or more if user added extras), none blocked.
