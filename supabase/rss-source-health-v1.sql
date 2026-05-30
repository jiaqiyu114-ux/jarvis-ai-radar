-- RSS Source Health v1
-- Adds health tracking fields to the sources table.
-- Run in Supabase SQL Editor. Safe to re-run (IF NOT EXISTS guards).

ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS health_status TEXT DEFAULT 'unknown';

ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS last_fetch_at TIMESTAMPTZ;

ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ;

ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;

ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS last_error_message TEXT;

ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS failure_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS avg_latency_ms INTEGER;

ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS last_latency_ms INTEGER;

ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS last_http_status INTEGER;

ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS disabled_reason TEXT;
