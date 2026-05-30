-- ============================================================
--  J.A.R.V.I.S.  —  Database Schema  v1
--  MVP personal workspace, no RLS.
--  Run this against a fresh Supabase / Postgres instance.
-- ============================================================

-- Enable useful extensions
-- Uncomment when pgvector is available:
-- CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
--  1. SOURCES
-- ============================================================
CREATE TABLE IF NOT EXISTS sources (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text        NOT NULL,
  url              text        NOT NULL UNIQUE,
  platform         text        NOT NULL DEFAULT 'rss',
  source_tier      text        NOT NULL DEFAULT 'B'
                               CHECK (source_tier IN ('S','A','B','C','D')),
  base_score       numeric(5,2) NOT NULL DEFAULT 60,
  reliability_score numeric(5,2) NOT NULL DEFAULT 60,
  category         text        NOT NULL DEFAULT '其他',
  is_official      boolean     NOT NULL DEFAULT false,
  is_blocked       boolean     NOT NULL DEFAULT false,
  last_fetched_at  timestamptz,
  items_today      integer     NOT NULL DEFAULT 0,
  description      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- Data origin (real / demo / seed / mock / unknown)
  data_origin      text        NOT NULL DEFAULT 'real',

  -- RSS Source Health v1
  health_status    text        DEFAULT 'unknown',
  last_fetch_at    timestamptz,
  last_success_at  timestamptz,
  last_error_at    timestamptz,
  last_error_message text,
  failure_count    integer     NOT NULL DEFAULT 0,
  avg_latency_ms   integer,
  last_latency_ms  integer,
  last_http_status integer,
  disabled_reason  text
);

-- ============================================================
--  2. ITEMS  (cluster_id FK added later to break circular dep)
-- ============================================================
CREATE TABLE IF NOT EXISTS items (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id               uuid        REFERENCES sources(id) ON DELETE SET NULL,

  -- Cached source tier — denormalized for fast queries without a join
  source_tier             text        NOT NULL DEFAULT 'B'
                                      CHECK (source_tier IN ('S','A','B','C','D')),

  -- Content
  title                   text        NOT NULL,
  url                     text        NOT NULL UNIQUE,
  author                  text,
  raw_content             text,
  clean_content           text,
  summary                 text        NOT NULL DEFAULT '',
  language                text        NOT NULL DEFAULT 'zh'
                                      CHECK (language IN ('zh','en','mixed')),

  -- Timestamps
  published_at            timestamptz NOT NULL,
  fetched_at              timestamptz NOT NULL DEFAULT now(),

  -- Scoring dimensions (AI outputs, 0-100 each)
  ai_relevance_score      numeric(5,2) NOT NULL DEFAULT 0,
  source_score            numeric(5,2) NOT NULL DEFAULT 0,
  importance_score        numeric(5,2) NOT NULL DEFAULT 0,
  novelty_score           numeric(5,2) NOT NULL DEFAULT 0,
  momentum_score          numeric(5,2) NOT NULL DEFAULT 0,
  credibility_score       numeric(5,2) NOT NULL DEFAULT 0,
  actionability_score     numeric(5,2) NOT NULL DEFAULT 0,
  content_potential_score numeric(5,2) NOT NULL DEFAULT 0,
  personal_fit_score      numeric(5,2) NOT NULL DEFAULT 0,

  -- Penalties (computed by code, not AI)
  duplicate_penalty       numeric(5,2) NOT NULL DEFAULT 0,
  clickbait_penalty       numeric(5,2) NOT NULL DEFAULT 0,
  marketing_penalty       numeric(5,2) NOT NULL DEFAULT 0,
  cognitive_load_penalty  numeric(5,2) NOT NULL DEFAULT 0,

  -- Final score (computed by calculateFinalScore(), never output by AI)
  final_score             numeric(5,2) NOT NULL DEFAULT 0,

  -- Classification
  category                text        NOT NULL DEFAULT '其他',
  entities                jsonb       NOT NULL DEFAULT '[]',
  tags                    jsonb       NOT NULL DEFAULT '[]',

  -- Embedding placeholder — use jsonb for MVP, migrate to vector(1536) later:
  --   ALTER TABLE items ADD COLUMN embedding vector(1536);
  embedding               jsonb,

  -- Cluster relationship (FK added below via ALTER TABLE)
  cluster_id              uuid,

  -- Workflow status
  status                  text        NOT NULL DEFAULT 'new'
                                      CHECK (status IN ('new','scored','selected','archived','rejected')),

  -- Data origin: distinguishes real ingest from demo/mock/seed data
  data_origin             text        NOT NULL DEFAULT 'real',

  -- Article Content Extraction v1
  content_fetch_status    text        DEFAULT 'not_fetched',
  content_fetched_at      timestamptz,
  content_error_message   text,
  content_source_url      text,
  article_title           text,
  article_author          text,
  article_site_name       text,
  article_published_at    timestamptz,
  article_excerpt         text,
  clean_text              text,
  content_word_count      integer,
  cover_image_url         text,
  media_urls              jsonb       DEFAULT '[]'::jsonb,
  content_hash            text,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
--  3. CLUSTERS  (can now reference items since items table exists)
-- ============================================================
CREATE TABLE IF NOT EXISTS clusters (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- main_item_id nullable: assigned after creation
  main_item_id          uuid        REFERENCES items(id) ON DELETE SET NULL,

  title                 text        NOT NULL,
  summary               text        NOT NULL DEFAULT '',
  category              text        NOT NULL DEFAULT '其他',
  entities              jsonb       NOT NULL DEFAULT '[]',

  -- Aggregate stats
  source_count          integer     NOT NULL DEFAULT 1,
  official_source_count integer     NOT NULL DEFAULT 0,

  -- Scores (computed, not AI-direct)
  cluster_score         numeric(5,2) NOT NULL DEFAULT 0,
  momentum_score        numeric(5,2) NOT NULL DEFAULT 0,

  first_seen_at         timestamptz NOT NULL DEFAULT now(),
  last_seen_at          timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
--  4. Add items.cluster_id FK now that clusters table exists
-- ============================================================
ALTER TABLE items
  ADD CONSTRAINT fk_items_cluster
  FOREIGN KEY (cluster_id) REFERENCES clusters(id) ON DELETE SET NULL;

-- ============================================================
--  5. USER_FEEDBACK
-- ============================================================
CREATE TABLE IF NOT EXISTS user_feedback (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         uuid        NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  event_type      text        NOT NULL
                              CHECK (event_type IN (
                                'view','click','read_30s','read_2m',
                                'save','useful','not_useful',
                                'add_to_topic','share','dismiss','block_source'
                              )),
  feedback_value  integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
--  6. SCORING_CONFIG
-- ============================================================
CREATE TABLE IF NOT EXISTS scoring_config (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  config_name     text        NOT NULL UNIQUE,
  -- weights_json keys: relevance, source, importance, novelty, momentum,
  --                    credibility, actionability, content_potential, personal_fit
  weights_json    jsonb       NOT NULL DEFAULT '{
    "relevance": 0.12, "source": 0.13, "importance": 0.18,
    "novelty": 0.12, "momentum": 0.10, "credibility": 0.10,
    "actionability": 0.10, "content_potential": 0.08, "personal_fit": 0.07
  }',
  -- thresholds_json keys: selected_min, display_min, must_read_min, topic_worthy
  thresholds_json jsonb       NOT NULL DEFAULT '{
    "selected_min": 75, "display_min": 30,
    "must_read_min": 88, "topic_worthy": 80
  }',
  active          boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Seed default active config
INSERT INTO scoring_config (config_name, active)
VALUES ('default', true)
ON CONFLICT (config_name) DO NOTHING;

-- ============================================================
--  7. TOPICS
-- ============================================================
CREATE TABLE IF NOT EXISTS topics (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_item_id  uuid        REFERENCES items(id) ON DELETE SET NULL,

  title           text        NOT NULL,
  core_info       text        NOT NULL DEFAULT '',
  angles          jsonb       NOT NULL DEFAULT '[]',
  platform        text        NOT NULL DEFAULT '其他'
                              CHECK (platform IN (
                                '公众号','小红书','知乎','视频号','长文','其他'
                              )),
  target_reader   text        NOT NULL DEFAULT '',
  pain_point      text        NOT NULL DEFAULT '',
  controversy     text,
  stance          text,
  notes           text,
  material_urls   jsonb       NOT NULL DEFAULT '[]',

  priority        text        NOT NULL DEFAULT 'medium'
                              CHECK (priority IN ('high','medium','low')),
  status          text        NOT NULL DEFAULT '待判断'
                              CHECK (status IN (
                                '待判断','可写','正在写','已发布','放弃','归档'
                              )),

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
--  8. INDEXES
-- ============================================================

-- sources
CREATE INDEX IF NOT EXISTS idx_sources_tier       ON sources(source_tier);
CREATE INDEX IF NOT EXISTS idx_sources_is_blocked  ON sources(is_blocked);

-- items
CREATE INDEX IF NOT EXISTS idx_items_final_score   ON items(final_score DESC);
CREATE INDEX IF NOT EXISTS idx_items_category      ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_published_at  ON items(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_source_id     ON items(source_id);
CREATE INDEX IF NOT EXISTS idx_items_cluster_id    ON items(cluster_id);
CREATE INDEX IF NOT EXISTS idx_items_status        ON items(status);

-- clusters
CREATE INDEX IF NOT EXISTS idx_clusters_score      ON clusters(cluster_score DESC);
CREATE INDEX IF NOT EXISTS idx_clusters_last_seen  ON clusters(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_clusters_momentum   ON clusters(momentum_score DESC);

-- user_feedback
CREATE INDEX IF NOT EXISTS idx_feedback_item_id    ON user_feedback(item_id);
CREATE INDEX IF NOT EXISTS idx_feedback_event_type ON user_feedback(event_type);

-- topics
CREATE INDEX IF NOT EXISTS idx_topics_status       ON topics(status);
CREATE INDEX IF NOT EXISTS idx_topics_priority     ON topics(priority);

-- ============================================================
--  9. updated_at auto-update trigger helper
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER set_updated_at_sources
  BEFORE UPDATE ON sources
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_items
  BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_clusters
  BEFORE UPDATE ON clusters
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_scoring_config
  BEFORE UPDATE ON scoring_config
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_topics
  BEFORE UPDATE ON topics
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
