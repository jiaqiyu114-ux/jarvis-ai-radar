# Evidence & Truth Scoring v1

## Why

J.A.R.V.I.S. is a personal information judgment system. The most important question
is not "do I like this?" but "is this real? how strong is the evidence? should I
include this in my judgment pipeline?"

`final_score` is a relevance-weighted composite score. It does not tell you:
- Whether the information is from a credible original source.
- Whether the article has verifiable content (author, publication time, text body).
- Whether multiple independent sources have corroborated the claim.
- Whether the source has a marketing or promotional bias.

This sprint adds a separate evidence/truth audit layer.

## What this does NOT do

- Does NOT call any AI / LLM API.
- Does NOT use user behavior (clicks, saves, read-time) to adjust scores.
- Does NOT modify final_score or dimension weights.
- Does NOT produce "confirmed" status in v1 (no multi-source system yet).
- Does NOT claim certainty beyond what the rule-based signals support.

## The three scores

### `truth_score` (真实程度, 0-100)

A conservative estimate of how likely this information reflects real events.

- Always ≤ 75 in v1 because multi-source cross-verification is not yet available.
- Discounts for: single-source content, missing text body, rumor origins, marketing bias.
- NOT the same as evidence_score.

### `ev_score` → `evidenceScore` (证据强度, 0-100)

How much supporting material can be audited for this item.

- Higher when: full article body was fetched, author identified, publication time confirmed,
  media attachments exist, credible domain.
- Does NOT mean the claim is true — only that there is material to audit.

### `source_trace_score` (来源可追溯, 0-100)

How traceable is this item back to its origin.

- Scores the presence of: original URL, successful content fetch, article publication time,
  identified author, media evidence.

## `claim_status` values

| Status         | Meaning |
|----------------|---------|
| `unverified`   | Not enough information to assess |
| `reported`     | Reputable media or institution reports it |
| `source_claimed` | Official source or subject directly states it |
| `confirmed`    | Multi-source cross-verified (not used in v1) |
| `disputed`     | Conflicting reports (not auto-generated in v1) |
| `rumor`        | Low-credibility origin (social media, speculation) |
| `unclear`      | Contradictory or ambiguous |

**Important:** `source_claimed` ≠ `confirmed`. An official announcement means the
organization says it themselves, but that doesn't make it objectively true.

## `evidence_level` values

| Level      | ev_score range |
|------------|---------------|
| `very_high`| 75-100        |
| `high`     | 55-74         |
| `medium`   | 35-54         |
| `low`      | 0-34          |

## `source_nature` values

| Nature            | Classification |
|-------------------|----------------|
| `official`        | Company or institution publishing their own content |
| `primary_report`  | Established journalism covering directly |
| `secondary_report`| Re-reporting from primary sources |
| `research`        | Academic preprint or peer-reviewed paper |
| `analysis`        | Opinion, commentary, editorial |
| `marketing`       | Promotional or company announcement |
| `rumor`           | Unverified, social media, speculation |
| `unknown`         | Cannot determine |

**Research note:** `arxiv.org` and similar preprints are `research`, NOT `confirmed`.
Preprints have not been peer-reviewed. The model notes this in `evidenceNotes`.

**Marketing note:** Even official company blogs can have marketing bias.
The model labels them `official` but adds a note about potential promotional framing.

## Single-source conservatism

All v1 items are considered single-source. The model:
- Caps `truth_score` at 75.
- Always includes the note: "当前主要来自单一来源，尚未完成多源交叉验证。"
- Never assigns `confirmed` status.

When event clusters are available (future sprint), multi-source bonuses will be unlocked.

## Why user behavior is not used

User clicks, saves, favorites, and read-time are NOT interpreted as evidence signals.

Reasoning:
- Clicking ≠ believing.
- Not clicking ≠ disbelieving.
- Saving ≠ endorsing.

These signals are valid for:
- Editorial workflow management ("I want to follow up on this").
- Adding to topic pool ("this could be a writing angle").
- Deeper read queue ("I'll read the full article later").

They are NOT valid for adjusting `truth_score` or `evidence_score`. Information that is
true doesn't become truer because more people clicked on it.

## API

```
POST /api/score/evidence
Body: { "itemId": "<uuid>", "force": false }

GET /api/score/evidence?itemId=<uuid>
```

POST computes and persists the profile. GET is read-only.

## Scoring rules (transparent, no black box)

### ev_score computation
- Source nature: official=+20, primary_report=+15, secondary_report=+10, research=+10, analysis=+8, marketing=+3, rumor=0, unknown=+3
- Source tier: S=+5, A=+3, B=0, C=-3
- Has article content (clean_text >= 500 chars): +20
- Has author: +12
- Has article published_at: +10
- Has media evidence: +10
- Content was fetched: +10

### truth_score computation
- Start: ev_score - 8 (base conservatism)
- rumor: -20 additional
- marketing: -8 additional
- unknown source: -5 additional
- analysis: -3 additional
- No article content: -8 additional
- No published time: -5 additional
- Single-source cap: max 75

### source_trace_score computation
- Has original URL: +25
- Content was fetched: +20
- Has article published_at: +20
- Has author: +20
- Has media evidence: +15

## What comes next

- Multi-source cross-verification (when event clusters are available).
- Official source stance tracking (did the subject of the news respond?).
- Human editorial annotation calibration.
- AI-assisted deep explanation of specific claims.
- Disputed claim detection from conflicting sources.

## Verification

After running migration and scoring:

```sql
SELECT claim_status, evidence_level, COUNT(*)
FROM public.items
GROUP BY claim_status, evidence_level;

SELECT id, title, truth_score, ev_score, source_trace_score, claim_status
FROM public.items
WHERE content_fetch_status = 'fetched'
LIMIT 5;
```
