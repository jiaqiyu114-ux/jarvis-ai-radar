-- Article Content Extraction v1
-- Adds article content and fetch-status fields to items table.
-- Safe to re-run (IF NOT EXISTS guards). canonical_url already exists.

ALTER TABLE public.items ADD COLUMN IF NOT EXISTS content_fetch_status  TEXT DEFAULT 'not_fetched';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS content_fetched_at     TIMESTAMPTZ;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS content_error_message  TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS content_source_url     TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS article_title          TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS article_author         TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS article_site_name      TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS article_published_at   TIMESTAMPTZ;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS article_excerpt        TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS clean_text             TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS content_word_count     INTEGER;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS cover_image_url        TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS media_urls             JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS content_hash           TEXT;

-- Verify after running:
-- SELECT content_fetch_status, COUNT(*)
-- FROM public.items
-- GROUP BY content_fetch_status;
