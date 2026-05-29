-- ============================================================
--  J.A.R.V.I.S. — Provider Architecture v1
--  Run AFTER schema.sql (depends on items table).
-- ============================================================

-- ── Extend items table ────────────────────────────────────────────────────────

-- canonical_url: tracking-param-stripped URL for deduplication
ALTER TABLE items ADD COLUMN IF NOT EXISTS canonical_url   text;

-- provider_signal: computed from provider metadata (0-100)
-- NOT the final_score; feeds into the scoring pipeline later
ALTER TABLE items ADD COLUMN IF NOT EXISTS provider_signal numeric;

-- evidence_score: how well the item's source attribution is supported
-- Future use: low score if originalSourceName is null / unverified
ALTER TABLE items ADD COLUMN IF NOT EXISTS evidence_score  numeric;

-- raw_payload: the full original JSON from the provider for audit / replay
ALTER TABLE items ADD COLUMN IF NOT EXISTS raw_payload     jsonb;

CREATE INDEX IF NOT EXISTS items_canonical_url_idx ON items(canonical_url);
-- Note: no UNIQUE on canonical_url — historical mock/seed data may have collisions.
-- A partial unique index can be added later once data is normalised:
--   CREATE UNIQUE INDEX items_canonical_url_unique ON items(canonical_url)
--   WHERE canonical_url IS NOT NULL;

-- ── providers ─────────────────────────────────────────────────────────────────
-- A Provider is the external system that delivers candidate signals to J.A.R.V.I.S.
-- (e.g. AIHOT, AI Radar API, an RSS aggregator, a newsletter, manual import).
-- Distinct from Source (the original publisher of the content).

CREATE TABLE IF NOT EXISTS providers (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text        NOT NULL,
  type             text        NOT NULL
                               CHECK (type IN (
                                 'aihot', 'rest_api', 'rss',
                                 'manual', 'official_feed', 'newsletter', 'unknown'
                               )),
  base_url         text,
  trust_score      numeric     NOT NULL DEFAULT 60
                               CHECK (trust_score >= 0 AND trust_score <= 100),
  enabled          boolean     NOT NULL DEFAULT true,
  last_fetched_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER set_updated_at_providers
  BEFORE UPDATE ON providers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ── item_mentions ─────────────────────────────────────────────────────────────
-- One record per (provider, external_id) pair.
-- An item may have multiple mentions across providers — the count feeds
-- the multi_provider_bonus in provider_signal.

CREATE TABLE IF NOT EXISTS item_mentions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id           uuid        NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  provider_id       uuid        NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  external_id       text        NOT NULL,
  provider_score    numeric,
  provider_rank     integer,
  provider_category text,
  provider_tags     text[]      NOT NULL DEFAULT '{}',
  raw_payload       jsonb,
  seen_at           timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT item_mentions_provider_external_unique
    UNIQUE (provider_id, external_id)
);

CREATE INDEX IF NOT EXISTS item_mentions_item_id_idx    ON item_mentions(item_id);
CREATE INDEX IF NOT EXISTS item_mentions_provider_id_idx ON item_mentions(provider_id);
CREATE INDEX IF NOT EXISTS item_mentions_seen_at_idx    ON item_mentions(seen_at DESC);

-- ── Seed example provider ──────────────────────────────────────────────────────
-- (Mock AI Radar for local testing — not a real external service)
INSERT INTO providers (id, name, type, trust_score, enabled)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Mock AI Radar',
  'rest_api',
  78,
  true
)
ON CONFLICT (id) DO NOTHING;
