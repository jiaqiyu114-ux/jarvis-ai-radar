# jarvis-scoring-system

Design, implement, review, or debug the J.A.R.V.I.S. scoring system.

## Trigger

Use when:
- Implementing or modifying the scoring formula
- Adding or changing score dimensions
- Debugging unexpected scores
- Designing feedback learning loops
- Working on /settings scoring config UI

## Core Invariant

**AI models output dimension scores ONLY.**
**final_score is ALWAYS calculated by TypeScript code.**

Never let an AI model directly output a final_score.
Never store AI-output scores without passing through `calculateFinalScore()`.

## Canonical Formula

```typescript
function calculateFinalScore(
  dims: ScoreDimensions,
  modifiers: ScoreModifiers
): number {
  const weighted =
    0.12 * dims.ai_relevance_score +
    0.13 * dims.source_score +
    0.18 * dims.importance_score +
    0.12 * dims.novelty_score +
    0.10 * dims.momentum_score +
    0.10 * dims.credibility_score +
    0.10 * dims.actionability_score +
    0.08 * dims.content_potential_score +
    0.07 * dims.personal_fit_score

  const adjusted =
    (weighted + modifiers.cluster_bonus - modifiers.noise_penalty) *
    modifiers.freshness_multiplier

  return Math.round(Math.min(Math.max(adjusted, 0), 100))
}
```

**Weight sum must equal 1.0:** 0.12+0.13+0.18+0.12+0.10+0.10+0.10+0.08+0.07 = 1.00 ✓

## Dimension Weights

| Dimension | Weight | Description |
|-----------|--------|-------------|
| ai_relevance_score | 0.12 | Relevance to user's focus/projects |
| source_score | 0.13 | Source credibility (derived from tier) |
| importance_score | 0.18 | Significance in domain (**highest weight**) |
| novelty_score | 0.12 | Non-obvious, non-duplicate information |
| momentum_score | 0.10 | Topic gaining rapid attention |
| credibility_score | 0.10 | Verifiable and well-sourced |
| actionability_score | 0.10 | User can act on this information |
| content_potential_score | 0.08 | Can become original content |
| personal_fit_score | 0.07 | Matches user's stated preferences |

## Source Score by Tier

```typescript
const SOURCE_TIER_SCORES = {
  S: 95,
  A: 80,
  B: 60,
  C: 35,
} as const
```

## Freshness Multiplier

```typescript
function getFreshnessMultiplier(publishedAt: Date): number {
  const hoursOld = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60)
  if (hoursOld < 1) return 1.0
  if (hoursOld < 6) return 0.95
  if (hoursOld < 24) return 0.85
  if (hoursOld < 72) return 0.70
  return 0.50
}
```

## Modifiers

```typescript
interface ScoreModifiers {
  cluster_bonus: 0 | 5 | 10
  noise_penalty: 0 | 5 | 10 | 15
  freshness_multiplier: number
}
```

- cluster_bonus: +5 (in cluster ≥3 sources), +10 (primary source)
- noise_penalty: +5 (blacklisted keyword), +10 (noisy source), +15 (near-duplicate)

## Feedback Adjustments

```typescript
const FEEDBACK_ADJUSTMENTS = {
  useful: +5,
  useless: -5,
  favorite: +8,
  block_source: 'zero_source_score',  // special case
}
```

Adjustments apply to **future items** in the same category/source, not retroactively.

## Debugging Checklist

When a score seems wrong:
1. Log all dimension scores before weighting
2. Verify freshness_multiplier is correct
3. Check if noise_penalty was applied unexpectedly
4. Verify source_tier → source_score mapping
5. Check if personal_fit_score reflects recent feedback
6. Verify weight sum still equals 1.0 after any changes

## Settings UI Requirements

The /settings page must expose:
- Weight sliders (with real-time sum validation)
- Threshold inputs: selected_min (75), must_read_min (88), topic_worthy (80)
- Reset to defaults button
- Preview: "with these weights, X items would appear in /selected today"
