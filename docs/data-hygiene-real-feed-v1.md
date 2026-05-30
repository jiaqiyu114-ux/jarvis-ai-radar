# Data Hygiene: Real Feed Boundary v1

## Why

After RSS Source Health v1 was shipped, the default `/feed` mixed real RSS items with
mock-provider demo items (e.g. "Claude Code 正式发布", "OpenAI 发布 GPT-5"). These are
fixture items written by `MockProviderAdapter` for pipeline testing — not real ingest
signals. Mixing them with real RSS data:

- Distorts final_score ranking (mock items have hand-crafted high scores).
- Makes `/feed` feel unreliable as a personal information radar.
- Would poison future feedback learning and scoring calibration.

## How it works

### `data_origin` column

Added to the `items` table (and `sources` table) with `DEFAULT 'real'`:

| Value     | Meaning                                                      |
|-----------|--------------------------------------------------------------|
| `real`    | Ingested from a real RSS source or legitimate provider       |
| `demo`    | Written by mock-provider-001 (testing / pipeline validation) |
| `seed`    | Seeded from a migration script (historical / reference data) |
| `mock`    | Alias for demo; reserved for other mock providers            |
| `unknown` | Origin unclear; passes through feed by default               |

### Provider declaration

Each `ProviderConfig` can declare `dataOrigin`. The mock provider sets:
```typescript
dataOrigin: 'demo'
```

When `ingestNormalizedItemsToDatabase` runs, items from a `dataOrigin='demo'` provider
are written with `data_origin = 'demo'` in the DB (only when non-default, to avoid
breaking installs that haven't run the migration).

### Default feed filtering

`getFeedItems()` (called by `/feed` server component) filters out items where
`data_origin` is `'demo'` or `'mock'` by default. Items without the column
(pre-migration rows, `data_origin = undefined`) are treated as real and pass through.

### Query parameter override

| URL                        | Behavior                                   |
|----------------------------|--------------------------------------------|
| `/feed`                    | Real items only (default)                  |
| `/feed?includeDemo=true`   | All items including demo/mock              |
| `/feed?mode=all`           | Same as includeDemo=true                   |
| `/feed?mode=real`          | Same as default (explicit)                 |

A small badge in the feed header shows "仅真实数据" or "含演示数据".

## Retroactive marking (SQL migration)

Running `supabase/data-hygiene-real-feed-v1.sql` in Supabase SQL Editor:

1. Adds `data_origin TEXT NOT NULL DEFAULT 'real'` to `items` and `sources`.
2. Retroactively marks items that **only** have mock-provider-001 mentions as `'demo'`.
   Items with both mock and RSS mentions are kept as `'real'`.
3. Marks the `Unknown Source` source as `'demo'`.

## Why we don't delete historical data

- Deleting items would break foreign keys and make it impossible to audit what happened.
- Mock items are useful for testing the pipeline end-to-end.
- After migration, they are simply invisible in the default feed.
- Operators can inspect them via `/feed?includeDemo=true`.

## Source deduplication strategy

`findOrCreateSource` in `src/lib/db/sources.ts` deduplicates on:
1. Normalised URL (lowercase hostname, no trailing slash, **UTM params stripped**)
2. Exact name match (fallback)
3. INSERT if not found; on 23505 race condition, retry lookup

The `normalizeSourceUrl` function now strips common tracking params:
`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `utm_id`,
`ref`, `fbclid`, `gclid`, `msclkid`.

This prevents the same source from being created twice when one call has
`?utm_source=newsletter` and another doesn't.

## Sources page

`/sources` now shows:
- Stats bar: Total · RSS · healthy · degraded · demo/mock
- Platform column (rss / rest_api / etc.)
- Health columns: only meaningful for RSS sources; non-RSS shows "—"
- Demo sources shown at reduced opacity with a "DEMO" label

## Why not merge historical duplicate sources

- Merging sources means rewriting `items.source_id` on historical rows.
- This could corrupt foreign key relationships.
- The correct approach: audit via the SQL queries in the migration file,
  then run a dry-run merge script, then apply after confirming.
- This work is deferred to a future `source-merge-v1` task.

## Verification

After running the SQL migration:

```sql
-- Items by data_origin
SELECT data_origin, COUNT(*) FROM public.items GROUP BY data_origin;

-- Sources by platform and data_origin
SELECT platform, data_origin, COUNT(*) FROM public.sources GROUP BY platform, data_origin;
```

In the browser:
- `/feed` — should show only real RSS items
- `/feed?includeDemo=true` — should show all items including demo
- `/sources` — stats bar shows RSS count and demo/mock count
