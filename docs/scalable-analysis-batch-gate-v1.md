# Scalable Analysis Batch Gate v1

## Why not just use `limit=100` as the system ceiling

`limit=100` is a test parameter. J.A.R.V.I.S. is designed to ingest 500–1000+ items
per day from multiple RSS sources, article extractions, and future data streams.
Processing 100 items at a time is a batch size, not a system upper bound.

The batch gate supports incremental processing via `cursor` pagination:
- First call: process the 100 most recent unprocessed items.
- Subsequent calls: use `nextCursor` to continue from where we stopped.
- This can be called in a loop (manually or via cron) until `hasMore = false`.

## Why the ingest pipeline should maximize coverage

The cost of missing important information is higher than the cost of storing
extra items. Low-value items still contribute to:
- Source health statistics.
- Multi-source event verification (even if they don't get deep analysis).
- Trend detection (momentum scoring).
- Background evidence for cluster formation.

**Never reduce RSS coverage to save tokens.** Tokens are spent at analysis time,
not at ingest time. The ingest + extraction + rule-scoring pipeline is zero-token-cost.

## The three tiers of J.A.R.V.I.S. processing

```
1. Capture (zero cost)
   RSS fetch → article extraction → rule scoring → evidence scoring
   → All items stored

2. Analysis Gate (zero cost)
   Rule-based classification: none / light / standard / deep / cluster
   → Stored in analysis_tier / analysis_stage / token_budget_tier

3. Model Processing (future, tiered cost)
   light_ready  → cheap model
   standard_ready → normal model
   deep_ready   → premium model
   cluster_ready → premium model + multi-source
```

## `batchSize` vs `maxItems` vs `limit`

The current batch API uses `limit` (equivalent to `batchSize`):
- `limit`: number of items processed in one API call (default 100, max 200).
- A single call processes at most `limit` items.
- Use `nextCursor` + repeated calls to process more.

## Cursor (keyset pagination)

The batch API uses keyset pagination on `(created_at DESC, id DESC)`.

Keyset pagination is superior to OFFSET for large datasets because:
- OFFSET performance degrades linearly with offset size (O(n) scan).
- Keyset uses an index condition that stays O(1) regardless of position.

Cursor format: `base64(JSON({ createdAt, id }))` — opaque to the caller.

## `dryRun` parameter

`dryRun: true` (default):
- Computes the analysis gate for each item.
- Returns the full result set.
- Does NOT write to the database.
- Safe to call repeatedly without side effects.

`dryRun: false`:
- Writes `analysis_tier`, `analysis_stage`, `token_budget_tier`, etc. to each item.
- Required for the gate results to appear in `/analysis` page.

Always test with `dryRun: true` first, then run with `dryRun: false`.

## Why user behavior cannot modify the analysis gate

The analysis gate is computed from:
- `final_score` (rule-based)
- `evidence/truth scores` (rule-based)
- `source_nature` (domain classification)
- Article content availability
- Category, importance, momentum scores

User clicks, saves, favorites, and read-time are NOT used because:
- Click ≠ quality signal (clickbait gets clicks).
- No-click ≠ irrelevance (paywalled or not yet seen).
- Save ≠ truth (users save wrong information too).

These behavioral signals are reserved for future explicit annotation workflows,
not implicit score adjustment.

## The tier system explained

| Tier       | Budget  | Who processes it       | When              |
|------------|---------|------------------------|-------------------|
| `none`     | none    | Nobody                 | Skip permanently  |
| `light`    | cheap   | Small/fast model       | Quick filter pass |
| `standard` | normal  | Mid-tier model         | Standard card     |
| `deep`     | premium | Strongest model        | Full analysis     |
| `cluster`  | premium | Strongest + multi-src  | Event timeline    |

## `/analysis` is a prerequisite for `/today`

The `/today` daily recommendation page (future sprint) will use the analysis
gate results to select what to show users. Without the gate, the recommendation
page would need to compute tiers on-the-fly — inefficient for 1000 items.

The intended flow:
```
RSS ingest → rule scoring → evidence scoring → analysis gate → /today snapshot
```

## Future: Cron-based batch processing

The batch API is designed to be called by a scheduled task:
```
Every hour: POST /api/analysis/gate/batch { limit: 100, dryRun: false }
Until: hasMore = false OR maxItems reached
```

This keeps the queue current as new items arrive without user interaction.
