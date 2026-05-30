-- Daily Recommendation Snapshot v1
-- Run this manually in the Supabase SQL Editor before using
-- POST /api/today/recommendations/generate with dryRun=false.
--
-- Idempotent: safe to execute more than once.

CREATE TABLE IF NOT EXISTS public.daily_recommendation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date date NOT NULL,
  status text NOT NULL DEFAULT 'generated',
  generated_at timestamptz NOT NULL DEFAULT now(),
  window_start timestamptz,
  window_end timestamptz,
  total_candidates integer DEFAULT 0,
  selected_count integer DEFAULT 0,
  must_read_count integer DEFAULT 0,
  high_value_count integer DEFAULT 0,
  observe_count integer DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_recommendation_runs_status_check
    CHECK (status IN ('generated', 'dry_run', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS daily_recommendation_runs_run_date_key
  ON public.daily_recommendation_runs(run_date);

CREATE INDEX IF NOT EXISTS idx_daily_recommendation_runs_generated_at
  ON public.daily_recommendation_runs(generated_at DESC);

CREATE TABLE IF NOT EXISTS public.daily_recommendation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.daily_recommendation_runs(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  rank integer NOT NULL,
  section text NOT NULL,
  recommendation_reason text,
  reason_tags text[] DEFAULT '{}',
  score_snapshot jsonb DEFAULT '{}'::jsonb,
  source_snapshot jsonb DEFAULT '{}'::jsonb,
  item_snapshot jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_recommendation_items_section_check
    CHECK (section IN ('must_read', 'high_value', 'observe'))
);

CREATE UNIQUE INDEX IF NOT EXISTS daily_recommendation_items_run_item_key
  ON public.daily_recommendation_items(run_id, item_id);

CREATE UNIQUE INDEX IF NOT EXISTS daily_recommendation_items_run_rank_key
  ON public.daily_recommendation_items(run_id, rank);

CREATE INDEX IF NOT EXISTS idx_daily_recommendation_items_run_section_rank
  ON public.daily_recommendation_items(run_id, section, rank);

CREATE INDEX IF NOT EXISTS idx_daily_recommendation_items_item_id
  ON public.daily_recommendation_items(item_id);
