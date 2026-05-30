-- RSS Source Health v2
-- Adds structured status, error classification, counters, and health score.
-- Safe to re-run (IF NOT EXISTS).
-- Builds on rss-source-health-v1.sql fields — do not drop v1 columns.

ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS last_fetch_status      TEXT;
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS last_fetch_error_stage  TEXT;
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS total_fetch_count       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS successful_fetch_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS failed_fetch_count      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS health_score            INTEGER NOT NULL DEFAULT 50;

-- Lightweight per-run fetch log (optional, avoids hammering the sources table).
-- Creates once; safe to run again (IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS public.rss_source_fetch_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       UUID        REFERENCES public.sources(id) ON DELETE SET NULL,
  source_name     TEXT,
  feed_url        TEXT,
  success         BOOLEAN     NOT NULL DEFAULT false,
  http_status     INTEGER,
  latency_ms      INTEGER,
  error_stage     TEXT,
  error_message   TEXT,
  items_found     INTEGER     NOT NULL DEFAULT 0,
  items_inserted  INTEGER     NOT NULL DEFAULT 0,
  items_skipped   INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rss_fetch_logs_source_id ON public.rss_source_fetch_logs(source_id);
CREATE INDEX IF NOT EXISTS idx_rss_fetch_logs_created   ON public.rss_source_fetch_logs(created_at DESC);

-- Verify:
-- SELECT id, name, last_fetch_status, health_score, total_fetch_count,
--        successful_fetch_count, failed_fetch_count
-- FROM public.sources WHERE platform = 'rss';
