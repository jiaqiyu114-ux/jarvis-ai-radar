# Scoring Explanation v1

## Why

J.A.R.V.I.S. already computes `final_score` and 9 dimension scores for every item.
But users only saw a single number — no reason, no driver, no penalty visibility.

Without score transparency:
- The system is a black box. Users can't trust or calibrate it.
- Future feedback (annotation, calibration, editorial correction) has no anchor.
- Bad rules or missing AI scores are invisible.

Scoring Explanation v1 makes the scoring system legible.

## What this does NOT do

- Does NOT change `final_score` or dimension weights.
- Does NOT call any AI/LLM API.
- Does NOT incorporate click, save, read-time, or any behavioral signal.
- Does NOT re-rank or re-filter items.
- Does NOT implement feedback learning.

## Score Bands

| Band           | Range | Chinese Label | When to act |
|----------------|-------|---------------|-------------|
| `must_read`    | 90–100| 必看           | Read now    |
| `high_priority`| 80–89 | 高优先级        | Today       |
| `selected`     | 70–79 | 精选候选        | This week   |
| `digest`       | 60–69 | 可进日报        | Weekly digest |
| `archive`      | 45–59 | 归档观察        | Reference   |
| `low_priority` | 0–44  | 低优先级        | Skip        |

Thresholds: must_read=88, selected=75, display_min=30 (from settings defaults).
Score bands are display-only and do NOT change the underlying score.

## Dimension Explanations

Each of the 9 dimensions is explained:

| Key                | Label      | Weight | Description |
|--------------------|------------|--------|-------------|
| `importance`       | 重要性      | 18%    | Industry impact, significance to AI field or business landscape |
| `source_score`     | 信源质量    | 13%    | Source reliability — official, tier-S/A/B/C media, vs low-quality |
| `ai_relevance`     | AI 相关性   | 12%    | How closely the item relates to AI tech, products, tools, industry |
| `novelty`          | 新颖性      | 12%    | Whether this adds new information vs repeating existing coverage |
| `momentum`         | 趋势势头    | 10%    | Is this gaining coverage? Multi-source mentions or rising trend? |
| `credibility`      | 可信度      | 10%    | Is the content verifiable? Clear sourcing and context? |
| `actionability`    | 可操作性    | 10%    | Can this be acted on — learning, product decision, topic, follow-up? |
| `content_potential`| 内容潜力    | 8%     | Potential as WeChat, XHS, long-form, or project material |
| `personal_fit`     | 目标匹配    | 7%     | Relevance to current operator goals (AI learning, J.A.R.V.I.S., editorial) |

### Note on `personal_fit` / "目标匹配"

This field is deliberately named "目标匹配" (goal alignment), NOT "个人喜好" (personal taste).

It measures relevance to the operator's **current work context** — not a taste signal derived
from past behavior. The system does not track "you saved 3 articles about GPT-5 so you
probably like GPT-5 content." That is the information silo problem, not the solution.

Future calibration of this field will come from **explicit editorial annotation** (marking items
as relevant/irrelevant to current goals), not from implicit behavioral inference.

## Dimension Status

| Status    | Meaning |
|-----------|---------|
| `available` | Value was explicitly set by scorer (non-zero, non-default) |
| `fallback`  | Value is exactly 50 (default from persist pipeline, not AI-scored) |
| `missing`   | Value is 0 (field was not set; likely an ingestion or data issue) |

In the current rule-based pipeline (v0), most dimensions default to 50 because the AI scoring
layer is not yet connected. The `source_score` is set by the rule scorer. All others are 50.

When `isRuleBasedOnly` is true (≥6 dimensions at default 50), the card shows:
"当前为规则引擎基线评分，多数维度尚未经 AI 评分"

## `oneLineReason` Generation

The one-line reason is generated from:
1. Top 2 positive drivers (dimensions with rawValue ≥ 65)
2. Top 2 negative drivers (non-penalty, dimensions with rawValue < 50)
3. Penalty mentions (if any penalties > 0)
4. Rule-based suffix `（规则基线）` if `isRuleBasedOnly`

Examples:
- "AI 相关性强、信源质量较高（规则基线）"
- "信源质量较高，受重要性不足、可操作性偏低限制（规则基线）"
- "当前为规则引擎基线评分，AI 评分尚未接入"
- "来源可信、AI 相关性强"

Rules:
- Never writes "用户喜欢这类内容" or any behavioral inference.
- Never claims certainty about things that are just defaults.
- If many fields are missing, says "部分评分字段缺失，解释基于可用字段生成".

## `topPositiveDrivers` / `topNegativeDrivers`

Positive: dimensions with `rawValue >= 65`, sorted by contribution (rawValue × weight), top 3.
Negative: missing fields + dimensions with `rawValue < 50`, sorted by weight impact, top 3.
Penalties: shown separately as `PenaltyExplanation[]`, not mixed into positive.

## Penalties

| Column                   | Label     | When |
|--------------------------|-----------|------|
| `duplicate_penalty`      | 重复惩罚   | Near-duplicate content detected |
| `clickbait_penalty`      | 标题党惩罚 | Sensational headline detected |
| `marketing_penalty`      | 营销惩罚   | Promotional/sponsored content |
| `cognitive_load_penalty` | 复杂度惩罚 | Low clarity, high jargon |

Penalties are subtracted from the score before freshness multiplier is applied.
They are shown in the expanded card as red badges: `-5 标题党惩罚`.

## Why feedback is not used here

The current system does not use click, save, favorite, or read-time signals to explain or adjust scores.

This is intentional:
- Short-form feedback ("clicked" or "skipped") is not reliable editorial signal.
- Implicit inference of taste creates information silos, not better judgment.
- Future feedback will be **explicit annotation**: "this item was important", "this source is wrong tier", "this is not AI-relevant".

This system is a personal information radar, not a recommendation engine optimizing engagement.

## Code location

`src/lib/scoring/explanation.ts` — pure function, no I/O, no side effects.
`src/components/feed/information-card.tsx` — calls `buildScoreExplanation()` per card.
`src/app/dashboard/page.tsx` — uses `oneLineReason` in topItem strip.

## Verification

1. Open `/feed` → each card shows `scoreBand` label below score badge.
2. Each card shows `oneLineReason` in Row 4 (small gray text).
3. Click the `∨` chevron → expanded view shows dimension bars with status, driver chips, penalties.
4. Dimensions at default 50 show in lighter gray with "默认" label.
5. `/dashboard` "今日最高" strip shows `oneLineReason`.
6. `/selected` empty state remains (no demo fallback).
7. RSS ingest still works, health tracking still works.
