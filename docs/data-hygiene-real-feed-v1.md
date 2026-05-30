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

## Scope of Real/Demo Filtering

The data boundary applies to ALL default product pages, not just `/feed`:

| Page         | Filter applied                             | Demo override              |
|--------------|--------------------------------------------|----------------------------|
| `/feed`      | `getFeedItems()` filters data_origin='demo' | `?includeDemo=true`       |
| `/selected`  | `getSelectedItems()` filters demo items    | `?includeDemo=true`        |
| `/clusters`  | `getClusters()` returns only DB clusters   | `?includeDemo=true`        |
| `/dashboard` | `getFeedItems()` → real items only         | (no override exposed)      |
| `/reports`   | Empty state (pipeline not ready); no mock  | `?includeDemo=true`        |
| `/topics`    | `getTopics()` returns only DB topics       | `?includeDemo=true`        |
| Header ticker| `topSignal` from real items only           | (not exposed)              |

### Key behavioral changes

- **`/selected`**: No longer filters by `status='selected'`. Real RSS items ingested with
  `status='new'` or `status='scored'` are now eligible for the selected feed if `final_score >= 75`.
  The previous filter was always empty in practice, causing static mock fallback.

- **`/clusters`**: When Supabase is configured, `getClusters()` returns only DB clusters.
  `mockClusters` (demo event data) are suppressed by default. If no real clusters exist yet,
  the page shows an empty state: "暂无真实事件簇，等待更多真实信息进入后生成."

- **Global header**: `AppShell` no longer hardcodes topItem from `mockItems`. Each server
  page computes topSignal from real items and passes it as a prop. If no real items exist,
  the header shows no top signal.

### Why not fall back to demo data in empty state

If no real clusters exist, showing demo clusters would make the system appear to have
"analyzed" fictional events like "GPT-5 发布事件". This breaks:
- Trust in the system (user can't distinguish real from fake)
- Future feedback learning (marking fake events as important poisons the model)
- Scoring calibration (fake S-tier items distort score distribution)

Show empty state instead. It's honest.

### `/reports` — pipeline not yet wired up

`getDailyReport()` returns `null` in DB mode by default. The page renders an empty state:
"真实日报尚未生成。日报需要完整管道（评分 → 聚类 → AI 摘要）。"

With `?includeDemo=true`: returns `mockReports[0]` as a demo preview with a "演示日报" badge.

The real pipeline will replace this once AI summarization is connected.

### `/topics` — no real topics yet

`getTopics()` in DB mode returns only DB topics. If DB topics table is empty:
- Default: returns `[]` → page shows "暂无真实选题"
- `?includeDemo=true`: returns `mockTopics` as demo

Once users add topics from real items (via the "加入选题池" action), real entries appear here.

### Why demo data must not enter reports or topics

- **日报 (reports)**: A report claiming GPT-5 launched or Anthropic raised $4B would be taken
  as real editorial output. Future pipelines would learn from it, and users might share it.
- **选题池 (topics)**: Topics like "GPT-5 对内容创作的影响" are fictional. If they enter the
  topic pool, they compete with real topics for attention, editorial effort, and scheduling.

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
