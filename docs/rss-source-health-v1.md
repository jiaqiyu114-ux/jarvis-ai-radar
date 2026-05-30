# RSS Source Health v1

## Why

The RSS ingest pipeline was already functional, but bad sources caused 20-45 second
slow requests and silent failures. The system had no per-source health record, so:

- A single hanging feed could slow down the entire ingest run.
- There was no visibility into which sources were consistently failing.
- Repeated failures were invisible to the operator.

This feature adds per-source health tracking so bad sources are visible and
do not block good ones.

## New `sources` Table Fields

| Column             | Type        | Default    | Purpose                                      |
|--------------------|-------------|------------|----------------------------------------------|
| `health_status`    | TEXT        | `'unknown'`| Overall health: unknown / healthy / degraded / blocked |
| `last_fetch_at`    | TIMESTAMPTZ | null       | Last time a fetch was attempted (success or fail) |
| `last_success_at`  | TIMESTAMPTZ | null       | Last successful fetch                        |
| `last_error_at`    | TIMESTAMPTZ | null       | Last failed fetch                            |
| `last_error_message` | TEXT      | null       | Truncated error message (max 500 chars)      |
| `failure_count`    | INTEGER     | `0`        | Consecutive failures (reset to 0 on success) |
| `avg_latency_ms`   | INTEGER     | null       | Smoothed latency: `0.7 * old + 0.3 * new`   |
| `last_latency_ms`  | INTEGER     | null       | Latency of the most recent fetch attempt     |
| `last_http_status` | INTEGER     | null       | HTTP status code from the most recent fetch  |
| `disabled_reason`  | TEXT        | null       | Reserved for future manual-pause feature     |

Migration: `supabase/rss-source-health-v1.sql` (safe to re-run, uses IF NOT EXISTS).

## GET vs POST `/api/ingest/rss`

| Aspect           | GET (dry-run)                    | POST (ingest)                       |
|------------------|----------------------------------|-------------------------------------|
| Writes items     | No                               | Yes                                 |
| Writes health    | No                               | Yes (updateSourceFetchSuccess/Failure) |
| recordHealth     | false                            | true                                |
| Returns          | mode: "dry-run" + sample         | mode: "ingest" + insertedItems      |
| sourceHealthSummary | present (0 succeeded/failed) | present (counts from this run)      |

## `health_status` Values

| Value      | Meaning                                                           |
|------------|-------------------------------------------------------------------|
| `unknown`  | No fetch has been recorded yet (default after seed)              |
| `healthy`  | Most recent fetch succeeded; failure_count reset to 0            |
| `degraded` | Most recent fetch failed; failure_count >= 1                     |
| `blocked`  | Source has `is_blocked=true`; health system sets status to match |

## Failure Count Rules

- Incremented by 1 on every failed fetch (network error, timeout, parse error).
- Reset to 0 on any successful fetch.
- health_status is set to `degraded` after the first failure (not 3+).

## No Automatic Blocking

This version does NOT automatically set `is_blocked=true`. The `failure_count`
and `degraded` status are visible on the /sources page and in API responses,
but the operator must manually block a source. Automatic blocking will be a
separate feature.

## Per-Source Timeout

Each RSS feed fetch uses a 9-second timeout (FEED_TIMEOUT_MS). The old global
timeout was 15 seconds. A single feed timing out now does not delay other feeds —
each runs independently with `for...of` (sequential but isolated by try/catch).

## `sourceHealthSummary` in API Response

Both GET and POST now include `sourceHealthSummary`:

```json
{
  "sourceHealthSummary": {
    "total": 3,
    "succeededThisRun": 2,
    "failedThisRun": 1,
    "perSource": [
      { "id": "...", "name": "TechCrunch AI", "url": "...", "success": true, "latencyMs": 1234 },
      { "id": "...", "name": "Hugging Face Blog", "url": "...", "success": false, "errorMessage": "timeout" }
    ]
  }
}
```

## Verification

```sql
SELECT
  id, name, url, platform, source_tier,
  health_status, failure_count,
  last_fetch_at, last_success_at, last_error_at,
  last_error_message, avg_latency_ms, last_latency_ms, last_http_status,
  is_blocked
FROM public.sources
ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST;
```

After `POST /api/ingest/rss`:
- Successful sources: `health_status = 'healthy'`, `failure_count = 0`, `last_success_at` updated.
- Failed sources: `health_status = 'degraded'`, `failure_count` incremented, `last_error_message` set.
- `/sources` page reflects current health for all sources.
