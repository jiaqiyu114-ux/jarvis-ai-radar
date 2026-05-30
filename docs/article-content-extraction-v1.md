# Article Content Extraction v1

## Why

The Information Detail Card (v1) relied entirely on RSS summary and metadata.
Many RSS summaries are short (< 100 chars), making it impossible to explain
"what actually happened" or provide useful context.

This sprint adds:
1. Structured fields for extracted article content.
2. A safe single-URL fetch utility (`fetchArticleContent`).
3. A POST API for manual per-item fetch.
4. Detail card integration with fetch status + "抓取原文" button.

## What this does NOT do

- Does NOT call any AI / LLM API.
- Does NOT make AI summaries.
- Does NOT auto-batch fetch all items.
- Does NOT bypass paywalls, login walls, or robots.txt.
- Does NOT download images or media.
- Does NOT modify final_score, data_origin, or source health.
- Does NOT create event clusters or timelines.

## New `items` table fields

| Column                  | Type        | Default          | Purpose |
|-------------------------|-------------|------------------|---------|
| `content_fetch_status`  | TEXT        | `'not_fetched'`  | Status: not_fetched / fetched / failed / skipped |
| `content_fetched_at`    | TIMESTAMPTZ | null             | When the last fetch was attempted |
| `content_error_message` | TEXT        | null             | Error message from failed fetch (max 500 chars) |
| `content_source_url`    | TEXT        | null             | Final URL after redirects |
| `article_title`         | TEXT        | null             | Extracted page title (og:title or `<title>`) |
| `article_author`        | TEXT        | null             | Author (JSON-LD or meta) |
| `article_site_name`     | TEXT        | null             | og:site_name or JSON-LD publisher |
| `article_published_at`  | TIMESTAMPTZ | null             | article:published_time or JSON-LD datePublished |
| `article_excerpt`       | TEXT        | null             | og:description or meta description |
| `clean_text`            | TEXT        | null             | Extracted body text (max 30,000 chars) |
| `content_word_count`    | INTEGER     | null             | Approximate word count |
| `cover_image_url`       | TEXT        | null             | Cover image (JSON-LD → og:image → twitter:image) |
| `media_urls`            | JSONB       | `[]`             | Up to 10 img src URLs from article body |
| `content_hash`          | TEXT        | null             | SHA-256 hex prefix of clean_text (dedup/change detection) |

Migration: `supabase/article-content-extraction-v1.sql` — safe to re-run (IF NOT EXISTS).

## `fetchArticleContent(url)` — the extractor

Located at `src/lib/content/article-extractor.ts`.

### URL safety (SSRF prevention)
- Rejects non-http/https protocols.
- Blocks localhost, 127.0.0.1, 0.0.0.0, ::1.
- Blocks private IP ranges: 10.*, 192.168.*, 172.16-31.*, 169.254.*, fc00:, fe80:.

### Fetch limits
- Timeout: 8 seconds (AbortController).
- Max HTML body: 2 MB.
- Only processes `content-type: text/html` responses.
- Follows redirects, records `finalUrl` (response.url).
- User-Agent: `JARVIS/1.0 (personal research bot; not for commercial use)`.

### Metadata extraction (regex, no DOM)
Priority order per field:
- **title**: JSON-LD `headline` → `og:title` → `<title>` tag
- **author**: JSON-LD `author.name` → `<meta name="author">`
- **siteName**: JSON-LD `publisher.name` → `og:site_name`
- **publishedAt**: JSON-LD `datePublished` → `article:published_time`
- **excerpt**: `og:description` → `<meta name="description">`
- **coverImageUrl**: JSON-LD `image` → `og:image` → `twitter:image`

### Clean text extraction
1. Remove `<script>`, `<style>`, `<noscript>`, `<svg>`, `<nav>`, `<footer>`, `<header>`, `<aside>`.
2. Try `<article>` → `<main>` → `<body>` for main content.
3. Strip remaining HTML tags.
4. Decode common HTML entities.
5. Normalize whitespace.
6. Limit to 30,000 characters (appends `[截断]` if cut).

### Media extraction
- `cover_image_url`: first valid http/https image from meta tags.
- `media_urls`: up to 10 `img[src]` URLs from the page body (http/https only, deduped).
- No image downloading; only URLs stored.

## API: POST /api/fetch/content

```
POST /api/fetch/content
Content-Type: application/json

{ "itemId": "<uuid>", "force": false }
```

- `itemId`: required, must be a valid UUID.
- `force`: if `true`, re-fetches even if already fetched.

**Success response:**
```json
{
  "ok": true,
  "itemId": "...",
  "status": "fetched",
  "cached": false,
  "canonicalUrl": "...",
  "title": "...",
  "excerpt": "...",
  "wordCount": 1234,
  "coverImageUrl": "...",
  "mediaUrls": [...],
  "mediaCount": 3
}
```

**Failure response:**
```json
{ "ok": false, "itemId": "...", "status": "failed", "error": "HTTP 403 Forbidden" }
```

**GET /api/fetch/content?itemId=<uuid>** — read-only status check, no fetch side effects.

## Detail card integration

In `ItemDetailPanel` (`src/components/feed/item-detail-panel.tsx`):

1. **"这条信息在说什么"**: uses `article_excerpt` or first 600 chars of `clean_text` if fetched.
   Falls back to RSS `summary` with note "当前解释基于 RSS 摘要，尚未抓取全文。"
2. **"来源与原文"**: shows `content_fetch_status` badge + "抓取原文" button.
3. **"媒体信息"**: shows `cover_image_url` as `<img>` if available.
4. **Fetch button**: calls `POST /api/fetch/content`, updates local state on success —
   no page reload needed for basic metadata. Full `clean_text` requires page refresh.

## Why not auto-batch fetch all items

- Slow: each fetch takes 1–8 seconds.
- Risk of being rate-limited or blocked by sites.
- RSS ingest must remain fast and stable.
- Manual fetch per item keeps the pipeline transparent and controllable.

Future options:
- Background queue (e.g., Vercel Queues or a cron job).
- Fetch-on-open: trigger fetch when user opens the detail card.
- Selective fetch: only fetch items above a score threshold.

## Verification

```sql
-- After running migration, all existing items should show 'not_fetched'
SELECT content_fetch_status, COUNT(*)
FROM public.items
GROUP BY content_fetch_status;

-- After fetching one item via API
SELECT id, title, content_fetch_status, content_word_count, cover_image_url
FROM public.items
WHERE content_fetch_status = 'fetched'
LIMIT 5;
```
