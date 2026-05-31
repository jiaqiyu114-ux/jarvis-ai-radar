-- ============================================================
--  recommendation-runs-v1.sql
--
--  Records each recommendation engine execution.
--  Idempotent: safe to run multiple times (CREATE TABLE IF NOT EXISTS).
--
--  Purpose: observability + diagnostics for the recommendation pipeline.
--  Does NOT affect items / sources / event_clusters / item_feedback.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.recommendation_runs (
  id                      uuid         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Outcome
  status                  text         NOT NULL DEFAULT 'success',
    -- 'running'  — in-flight (if server crashed, rows may stay here)
    -- 'success'  — completed normally
    -- 'partial_success' — completed but some data missing/degraded
    -- 'failed'   — unhandled error

  -- Input parameters
  window_hours            integer      NOT NULL,
  limit_count             integer,

  -- Result counts
  captured_total          integer      NOT NULL DEFAULT 0,
  recommended_candidates  integer      NOT NULL DEFAULT 0,
  must_read_count         integer      NOT NULL DEFAULT 0,
  high_value_count        integer      NOT NULL DEFAULT 0,
  observe_count           integer      NOT NULL DEFAULT 0,
  archive_count           integer      NOT NULL DEFAULT 0,

  -- Timing
  started_at              timestamptz  NOT NULL DEFAULT now(),
  finished_at             timestamptz,
  duration_ms             integer,

  -- Error detail (null when status = 'success')
  error_message           text,

  -- Extra diagnostic data
  metadata                jsonb        NOT NULL DEFAULT '{}'::jsonb
);

-- Most-recent-first index (used by listRecommendationRuns and getLatestRecommendationRun)
CREATE INDEX IF NOT EXISTS recommendation_runs_started_at_idx
  ON public.recommendation_runs (started_at DESC);

-- ── Verify ────────────────────────────────────────────────────────────────────
--
--   SELECT id, status, window_hours, captured_total, recommended_candidates,
--          must_read_count, high_value_count, observe_count, duration_ms, started_at
--   FROM   public.recommendation_runs
--   ORDER  BY started_at DESC
--   LIMIT  10;
