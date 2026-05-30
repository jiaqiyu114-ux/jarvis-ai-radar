# Analysis Queue / Token Budget Gate v1

## Why

The ingest pipeline should maximize coverage: fetch as many credible sources as
possible, preserve original text, metadata, and evidence. Cost optimization must
NOT happen at the collection stage.

However, LLM calls are expensive. Without a gate, every ingested item would get
the same deep analysis — wasting tokens on low-quality, low-relevance, already-seen,
or evidence-poor content.

The budget gate decouples two concerns:
1. **Ingest/extraction**: run at full coverage, zero token cost (rule-based code).
2. **Post-processing**: spend tokens selectively, only on high-value content.

## The four tiers

### `none` — Skip
- final_score < 25, or non-real data, or low-credibility origin
- No LLM resources spent.
- Token budget: zero.

### `light` — Cheap model pass
- final_score 25-44
- Quick filter: "Is this worth fetching the full article? Could this enter observation?"
- Token budget: ~1,100 tokens (300 output).
- Model: cheapest available.

### `standard` — Normal explanation
- final_score 45-64, OR moderate evidence + article fetched
- Generates structured interpretation card without deep cross-referencing.
- Token budget: ~2,100 tokens (1,000 output).
- Model: mid-tier.

### `deep` — Deep analysis
- final_score ≥ 70, OR (score ≥ 55 AND strong evidence AND full article content)
- Generates: cause-and-effect, industry impact, writing angles, risks, insights.
- Token budget: ~5,300 tokens (2,500 output).
- Model: strongest available.

### `cluster` — Event tracking
- High importance AND high momentum (multi-topic convergence signal)
- Activates: event timeline, multi-source comparison, stance tracking.
- Token budget: ~4,000 tokens (3,200 output).
- Model: strongest available.

## Token estimation

The system estimates — not measures — token consumption:

```
input = 800 (base overhead)
      + 300 (title + summary)
      + clean_text_chars / 4   (capped at 6,000)
output = tier-specific constant (300 / 1000 / 2500 / 3200)
total = input + output
```

These are planning numbers, NOT charges. They help compare relative cost across items.

## Priority levels

| Level  | When |
|--------|------|
| `low`  | tier = none or light |
| `normal` | tier = standard |
| `high` | tier = deep |
| `urgent` | tier = cluster, OR deep + official source + very high importance |

## `token_budget_tier`

| Tier      | Model class (future) |
|-----------|---------------------|
| `none`    | No LLM call         |
| `cheap`   | Small/fast model    |
| `normal`  | Mid-tier model      |
| `premium` | Strongest model     |

## Boolean flags

| Flag                    | Condition |
|-------------------------|-----------|
| `shouldDeepAnalyze`     | tier = deep or cluster |
| `shouldTrackEvent`      | tier = cluster, OR deep + high importance + momentum |
| `shouldEnterDailyReport`| tier ≥ standard AND final_score ≥ 55 |
| `shouldEnterTopicPool`  | tier = deep or cluster AND content_potential ≥ 60 |

## Why user behavior is NOT used

Clicks, saves, favorites, and read-time tell you about the reader's attention, not
about the information's truth or importance.

- Clicking does not make an article more evidence-rich.
- Not clicking does not make an article less important.
- Saving does not tell you the information is correct.

These signals are valid for:
- Editorial workflow: "I want to follow up on this later."
- Topic pool entry: "I explicitly want to write about this."
- Annotation: "This source was wrong; recalibrate its tier."

They are NOT used to adjust `analysis_tier`, `token_budget_tier`, `truth_score`,
`ev_score`, or `final_score`.

## API

```
POST /api/analysis/gate
Body: { "itemId": "<uuid>", "force": false }

GET /api/analysis/gate?itemId=<uuid>
```

## How evidence/truth feeds into the gate

From `docs/evidence-truth-scoring-v1.md`:
- `ev_score` contributes to tier decision (higher evidence → higher tier possible).
- `truth_score` is informational but source_nature contributes to tier.
- `claim_status = 'rumor'` with low final_score → automatically tier = none.
- `source_nature = 'official'` contributes to priority.

## Future roadmap

- **Cheap model integration**: light tier calls small model for article-fetch decision.
- **Normal model integration**: standard tier generates structured explanation card.
- **Premium model integration**: deep tier calls strongest model for full analysis.
- **Multi-source cluster**: cluster tier activates event timeline engine.
- **Batch processing**: nightly queue processes all `light_ready` / `standard_ready`.
- **Priority queue**: urgent items processed within minutes of ingest.
