-- Event Cluster Timeline v1
-- Run this manually in the Supabase SQL Editor before using:
-- POST /api/clusters/generate with dryRun=false
--
-- Idempotent: safe to execute more than once.

CREATE TABLE IF NOT EXISTS public.event_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_key text NOT NULL UNIQUE,
  title text NOT NULL,
  summary text,
  status text NOT NULL DEFAULT 'watching',
  primary_item_id uuid REFERENCES public.items(id) ON DELETE SET NULL,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  item_count integer NOT NULL DEFAULT 0,
  source_count integer NOT NULL DEFAULT 0,
  confidence integer NOT NULL DEFAULT 0,
  match_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_clusters_status_check
    CHECK (status IN ('active', 'watching', 'cooling', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_event_clusters_status
  ON public.event_clusters(status);

CREATE INDEX IF NOT EXISTS idx_event_clusters_last_seen_at
  ON public.event_clusters(last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.event_cluster_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL REFERENCES public.event_clusters(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'supporting',
  similarity_reason text,
  score integer,
  added_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_cluster_items_role_check
    CHECK (role IN ('primary', 'supporting', 'update', 'duplicate')),
  CONSTRAINT event_cluster_items_cluster_item_key UNIQUE (cluster_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_event_cluster_items_cluster_id
  ON public.event_cluster_items(cluster_id);

CREATE INDEX IF NOT EXISTS idx_event_cluster_items_item_id
  ON public.event_cluster_items(item_id);
