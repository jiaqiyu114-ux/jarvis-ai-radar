-- ============================================================
--  recommendation-snapshots-v1.sql
--
--  Persists recommendation engine results as stable, reusable snapshots.
--  Two tables:
--    recommendation_snapshots       — one row per refresh run (metadata)
--    recommendation_snapshot_items  — denormalized item rows per snapshot
--
--  Idempotent: CREATE TABLE IF NOT EXISTS — safe to run multiple times.
--  Does NOT modify items / sources / event_clusters / item_feedback.
-- ============================================================

-- ── 1. Snapshot metadata ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.recommendation_snapshots (
  id                        uuid         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to recommendation_runs (stored as plain uuid; no hard FK to avoid migration order issues)
  run_id                    uuid,

  -- Outcome: success / partial_success / failed
  status                    text         NOT NULL DEFAULT 'success',

  -- Engine parameters used to generate this snapshot
  window_hours              integer      NOT NULL DEFAULT 72,
  limit_count               integer      NOT NULL DEFAULT 30,

  -- Counts (denormalised for fast summary queries)
  captured_total            integer      NOT NULL DEFAULT 0,
  recommendation_candidates integer      NOT NULL DEFAULT 0,
  must_read_count           integer      NOT NULL DEFAULT 0,
  high_value_count          integer      NOT NULL DEFAULT 0,
  observe_count             integer      NOT NULL DEFAULT 0,
  archive_count             integer      NOT NULL DEFAULT 0,

  generated_at              timestamptz  NOT NULL DEFAULT now(),
  created_at                timestamptz  NOT NULL DEFAULT now(),

  -- For future extensibility (e.g. filter params, feature flags used)
  metadata                  jsonb        NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS recommendation_snapshots_generated_at_idx
  ON public.recommendation_snapshots (generated_at DESC);

CREATE INDEX IF NOT EXISTS recommendation_snapshots_status_idx
  ON public.recommendation_snapshots (status);

CREATE INDEX IF NOT EXISTS recommendation_snapshots_run_id_idx
  ON public.recommendation_snapshots (run_id)
  WHERE run_id IS NOT NULL;

-- ── 2. Snapshot items (denormalized, point-in-time) ───────────────────────────
--
--  Stores all display fields so the snapshot can be rendered without
--  re-querying the items table. Even if the original item is later
--  modified, the snapshot remains stable.
--
--  recommendation_reason / risk_note / next_step must be clean UTF-8 text.
--  The application layer applies cleanText() before inserting here.

CREATE TABLE IF NOT EXISTS public.recommendation_snapshot_items (
  id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id           uuid         NOT NULL,
  item_id               uuid,                    -- original items.id (nullable for safety)

  rank                  integer      NOT NULL,    -- 1-based ordering within snapshot
  section               text         NOT NULL,    -- must_read / high_value / observe / archive

  -- Core display fields (copied from item at snapshot time)
  title                 text         NOT NULL,
  summary               text,
  url                   text,
  source_name           text,
  source_tier           text,
  category              text,
  published_at          timestamptz,
  fetched_at            timestamptz,

  -- Scores
  final_score           integer,
  signal_score          integer,
  evidence_score        integer,
  recommendation_score  integer,

  -- Engine output fields
  recommendation_tier   text,
  source_status         text,
  quality_flags         jsonb        NOT NULL DEFAULT '[]'::jsonb,

  -- Human-readable text (cleaned before storing)
  recommendation_reason text,
  risk_note             text,
  next_step             text,

  created_at            timestamptz  NOT NULL DEFAULT now(),

  -- Cascade delete: removing the snapshot removes its items
  CONSTRAINT fk_snapshot_id
    FOREIGN KEY (snapshot_id)
    REFERENCES public.recommendation_snapshots(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS recommendation_snapshot_items_snapshot_rank_idx
  ON public.recommendation_snapshot_items (snapshot_id, rank);

CREATE INDEX IF NOT EXISTS recommendation_snapshot_items_snapshot_section_idx
  ON public.recommendation_snapshot_items (snapshot_id, section);

CREATE INDEX IF NOT EXISTS recommendation_snapshot_items_item_id_idx
  ON public.recommendation_snapshot_items (item_id)
  WHERE item_id IS NOT NULL;

-- ── Verify ────────────────────────────────────────────────────────────────────
--
--   SELECT s.id, s.status, s.must_read_count, s.high_value_count,
--          s.generated_at, count(i.id) AS item_count
--   FROM   public.recommendation_snapshots s
--   LEFT JOIN public.recommendation_snapshot_items i ON i.snapshot_id = s.id
--   GROUP BY s.id
--   ORDER BY s.generated_at DESC
--   LIMIT 10;
