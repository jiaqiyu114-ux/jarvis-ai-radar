-- ============================================================
--  J.A.R.V.I.S. High-Quality Source Seeds V1
--  Run AFTER schema.sql and rss-sources-seed.sql.
--
--  Adds ~25 high-quality AI/tech RSS sources.
--  Idempotent: UPDATE existing rows, INSERT missing ones.
--  Safe to run multiple times.
--
--  Confidence notes:
--    [HIGH]   URL confirmed valid from multiple sources
--    [MEDIUM] URL format inferred from site structure; may need adjustment
--    [LOW]    Best guess; verify manually before relying on
--
--  is_user_curated defaults to FALSE for all seeds.
--  Users can mark preferred sources from the /sources page.
-- ============================================================

-- ── MIT Technology Review [HIGH] ─────────────────────────────────────────────
UPDATE sources SET name='MIT Technology Review', platform='rss', source_tier='A',
  base_score=82, reliability_score=88, category='AI技术', is_official=false, is_blocked=false
WHERE url='https://www.technologyreview.com/feed/';
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
SELECT 'MIT Technology Review','https://www.technologyreview.com/feed/','rss','A',82,88,'AI技术',false,false,'real'
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE url='https://www.technologyreview.com/feed/');

-- ── VentureBeat AI [HIGH] ────────────────────────────────────────────────────
UPDATE sources SET name='VentureBeat AI', platform='rss', source_tier='B',
  base_score=74, reliability_score=76, category='行业趋势', is_official=false, is_blocked=false
WHERE url='https://venturebeat.com/ai/feed/';
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
SELECT 'VentureBeat AI','https://venturebeat.com/ai/feed/','rss','B',74,76,'行业趋势',false,false,'real'
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE url='https://venturebeat.com/ai/feed/');

-- ── The Decoder [HIGH] ───────────────────────────────────────────────────────
UPDATE sources SET name='The Decoder', platform='rss', source_tier='B',
  base_score=72, reliability_score=75, category='AI技术', is_official=false, is_blocked=false
WHERE url='https://the-decoder.com/feed/';
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
SELECT 'The Decoder','https://the-decoder.com/feed/','rss','B',72,75,'AI技术',false,false,'real'
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE url='https://the-decoder.com/feed/');

-- ── GitHub Blog [HIGH] ───────────────────────────────────────────────────────
UPDATE sources SET name='GitHub Blog', platform='rss', source_tier='A',
  base_score=80, reliability_score=85, category='开源项目', is_official=true, is_blocked=false
WHERE url='https://github.blog/feed/';
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
SELECT 'GitHub Blog','https://github.blog/feed/','rss','A',80,85,'开源项目',true,false,'real'
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE url='https://github.blog/feed/');

-- ── Ars Technica AI [HIGH] ───────────────────────────────────────────────────
UPDATE sources SET name='Ars Technica AI', platform='rss', source_tier='B',
  base_score=73, reliability_score=78, category='AI技术', is_official=false, is_blocked=false
WHERE url='https://feeds.arstechnica.com/arstechnica/technology-lab';
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
SELECT 'Ars Technica AI','https://feeds.arstechnica.com/arstechnica/technology-lab','rss','B',73,78,'AI技术',false,false,'real'
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE url='https://feeds.arstechnica.com/arstechnica/technology-lab');

-- ── Wired AI [MEDIUM] ────────────────────────────────────────────────────────
UPDATE sources SET name='Wired AI', platform='rss', source_tier='B',
  base_score=70, reliability_score=72, category='AI技术', is_official=false, is_blocked=false
WHERE url='https://www.wired.com/feed/tag/artificial-intelligence/latest/rss';
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
SELECT 'Wired AI','https://www.wired.com/feed/tag/artificial-intelligence/latest/rss','rss','B',70,72,'AI技术',false,false,'real'
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE url='https://www.wired.com/feed/tag/artificial-intelligence/latest/rss');

-- ── MarkTechPost [HIGH] ──────────────────────────────────────────────────────
UPDATE sources SET name='MarkTechPost', platform='rss', source_tier='B',
  base_score=65, reliability_score=68, category='AI技术', is_official=false, is_blocked=false
WHERE url='https://www.marktechpost.com/feed/';
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
SELECT 'MarkTechPost','https://www.marktechpost.com/feed/','rss','B',65,68,'AI技术',false,false,'real'
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE url='https://www.marktechpost.com/feed/');

-- ── Vercel Blog [HIGH] ───────────────────────────────────────────────────────
UPDATE sources SET name='Vercel Blog', platform='rss', source_tier='B',
  base_score=70, reliability_score=75, category='产品发布', is_official=true, is_blocked=false
WHERE url='https://vercel.com/blog/rss.xml';
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
SELECT 'Vercel Blog','https://vercel.com/blog/rss.xml','rss','B',70,75,'产品发布',true,false,'real'
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE url='https://vercel.com/blog/rss.xml');

-- ── Cloudflare Blog [HIGH] ───────────────────────────────────────────────────
UPDATE sources SET name='Cloudflare Blog', platform='rss', source_tier='B',
  base_score=70, reliability_score=75, category='行业趋势', is_official=true, is_blocked=false
WHERE url='https://blog.cloudflare.com/rss/';
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
SELECT 'Cloudflare Blog','https://blog.cloudflare.com/rss/','rss','B',70,75,'行业趋势',true,false,'real'
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE url='https://blog.cloudflare.com/rss/');

-- ── Supabase Blog [HIGH] ─────────────────────────────────────────────────────
UPDATE sources SET name='Supabase Blog', platform='rss', source_tier='B',
  base_score=68, reliability_score=72, category='产品发布', is_official=true, is_blocked=false
WHERE url='https://supabase.com/blog/rss.xml';
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
SELECT 'Supabase Blog','https://supabase.com/blog/rss.xml','rss','B',68,72,'产品发布',true,false,'real'
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE url='https://supabase.com/blog/rss.xml');

-- ── Towards Data Science [HIGH] ──────────────────────────────────────────────
UPDATE sources SET name='Towards Data Science', platform='rss', source_tier='B',
  base_score=68, reliability_score=70, category='研究报告', is_official=false, is_blocked=false
WHERE url='https://towardsdatascience.com/feed';
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
SELECT 'Towards Data Science','https://towardsdatascience.com/feed','rss','B',68,70,'研究报告',false,false,'real'
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE url='https://towardsdatascience.com/feed');

-- ── Google Research Blog [MEDIUM] ────────────────────────────────────────────
UPDATE sources SET name='Google Research Blog', platform='rss', source_tier='A',
  base_score=85, reliability_score=88, category='研究报告', is_official=true, is_blocked=false
WHERE url='https://blog.research.google/feeds/posts/default';
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
SELECT 'Google Research Blog','https://blog.research.google/feeds/posts/default','rss','A',85,88,'研究报告',true,false,'real'
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE url='https://blog.research.google/feeds/posts/default');

-- ── Microsoft Research Blog [MEDIUM] ─────────────────────────────────────────
UPDATE sources SET name='Microsoft Research Blog', platform='rss', source_tier='A',
  base_score=82, reliability_score=85, category='研究报告', is_official=true, is_blocked=false
WHERE url='https://www.microsoft.com/en-us/research/feed/';
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
SELECT 'Microsoft Research Blog','https://www.microsoft.com/en-us/research/feed/','rss','A',82,85,'研究报告',true,false,'real'
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE url='https://www.microsoft.com/en-us/research/feed/');

-- ── OpenAI Blog [MEDIUM — URL may need verification] ─────────────────────────
UPDATE sources SET name='OpenAI Blog', platform='rss', source_tier='S',
  base_score=95, reliability_score=95, category='AI技术', is_official=true, is_blocked=false
WHERE url='https://openai.com/blog/rss.xml';
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
SELECT 'OpenAI Blog','https://openai.com/blog/rss.xml','rss','S',95,95,'AI技术',true,false,'real'
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE url='https://openai.com/blog/rss.xml');

-- ── Anthropic News [LOW — RSS format unconfirmed] ────────────────────────────
UPDATE sources SET name='Anthropic News', platform='rss', source_tier='S',
  base_score=95, reliability_score=95, category='AI技术', is_official=true, is_blocked=false
WHERE url='https://www.anthropic.com/rss.xml';
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
SELECT 'Anthropic News','https://www.anthropic.com/rss.xml','rss','S',95,95,'AI技术',true,false,'real'
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE url='https://www.anthropic.com/rss.xml');

-- ── LangChain Blog [MEDIUM] ──────────────────────────────────────────────────
UPDATE sources SET name='LangChain Blog', platform='rss', source_tier='B',
  base_score=72, reliability_score=74, category='AI技术', is_official=true, is_blocked=false
WHERE url='https://blog.langchain.dev/rss/';
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
SELECT 'LangChain Blog','https://blog.langchain.dev/rss/','rss','B',72,74,'AI技术',true,false,'real'
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE url='https://blog.langchain.dev/rss/');

-- ── Mistral AI Blog [MEDIUM] ─────────────────────────────────────────────────
UPDATE sources SET name='Mistral AI Blog', platform='rss', source_tier='A',
  base_score=85, reliability_score=87, category='AI技术', is_official=true, is_blocked=false
WHERE url='https://mistral.ai/news/rss.xml';
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
SELECT 'Mistral AI Blog','https://mistral.ai/news/rss.xml','rss','A',85,87,'AI技术',true,false,'real'
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE url='https://mistral.ai/news/rss.xml');

-- ── Cursor Blog [MEDIUM] ─────────────────────────────────────────────────────
UPDATE sources SET name='Cursor Blog', platform='rss', source_tier='B',
  base_score=72, reliability_score=75, category='产品发布', is_official=true, is_blocked=false
WHERE url='https://cursor.sh/blog/rss.xml';
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
SELECT 'Cursor Blog','https://cursor.sh/blog/rss.xml','rss','B',72,75,'产品发布',true,false,'real'
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE url='https://cursor.sh/blog/rss.xml');

-- ── InfoQ AI [HIGH] ──────────────────────────────────────────────────────────
UPDATE sources SET name='InfoQ AI', platform='rss', source_tier='B',
  base_score=70, reliability_score=72, category='AI技术', is_official=false, is_blocked=false
WHERE url='https://feed.infoq.com/';
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
SELECT 'InfoQ AI','https://feed.infoq.com/','rss','B',70,72,'AI技术',false,false,'real'
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE url='https://feed.infoq.com/');

-- ── AI Business [HIGH] ───────────────────────────────────────────────────────
UPDATE sources SET name='AI Business', platform='rss', source_tier='B',
  base_score=67, reliability_score=70, category='商业动态', is_official=false, is_blocked=false
WHERE url='https://aibusiness.com/rss.xml';
INSERT INTO sources (name, url, platform, source_tier, base_score, reliability_score, category, is_official, is_blocked, data_origin)
SELECT 'AI Business','https://aibusiness.com/rss.xml','rss','B',67,70,'商业动态',false,false,'real'
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE url='https://aibusiness.com/rss.xml');

-- ── Verify result ─────────────────────────────────────────────────────────────
-- Run this to check inserted sources:
--
--   SELECT id, name, url, source_tier, is_official, is_blocked, data_origin
--   FROM sources
--   WHERE platform = 'rss'
--   ORDER BY source_tier, name;
