# J.A.R.V.I.S. Scoring System

## Design Principles

1. AI models output dimension scores only (0-100 each).
2. final_score is always calculated by TypeScript code, never directly output by AI.
3. Scoring is transparent — every score has a breakdown stored.
4. User feedback adjusts future scoring via personal_fit_score.
5. Freshness decays score over time.

## Final Score Formula

```typescript
function calculateFinalScore(dims: ScoreDimensions, modifiers: ScoreModifiers): number {
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

## Dimension Definitions

### ai_relevance_score (weight: 0.12)
How relevant the item is to the user's current focus topics and project keywords.
- AI evaluates against user's interest profile
- Range: 0–100

### source_score (weight: 0.13)
Credibility and quality of the source.
- Derived from source tier: S=95, A=80, B=60, C=35
- Adjusted by recent feedback patterns for this source

### importance_score (weight: 0.18)
How significant is this information in its domain?
- S-tier signal: industry shifts, major product launches, regulatory changes
- AI evaluates based on entity significance and event type

### novelty_score (weight: 0.12)
How new and non-obvious is this information?
- Penalizes duplicate/near-duplicate content
- Penalizes information already widely covered

### momentum_score (weight: 0.10)
Is this topic gaining attention rapidly?
- Calculated from cluster growth rate
- Number of sources covering the same event

### credibility_score (weight: 0.10)
How verifiable and well-sourced is the content?
- Cross-reference with other sources in cluster
- Author credibility signals

### actionability_score (weight: 0.10)
Can the user do something with this information?
- Investment ideas, content angles, competitive intelligence
- Pure trivia = 0, direct business signal = 100

### content_potential_score (weight: 0.08)
Can this become original content (article, analysis, post)?
- Does it have a unique angle?
- Is there controversy, novelty, or unexplored perspective?

### personal_fit_score (weight: 0.07)
How well does this match the user's stated preferences and feedback history?
- Initialized from interest profile
- Updated via useful/useless feedback

## Modifiers

### cluster_bonus
- +5 if item belongs to a cluster with ≥3 sources
- +10 if item is the primary source in a major cluster

### noise_penalty
- -10 if source has triggered noise filter ≥3 times recently
- -5 if keywords match blacklist
- -15 if near-duplicate detected

### freshness_multiplier
```
published < 1h:   1.0
published 1-6h:   0.95
published 6-24h:  0.85
published 1-3d:   0.70
published > 3d:   0.50
```

## TypeScript Types

```typescript
interface ScoreDimensions {
  ai_relevance_score: number      // 0-100
  source_score: number            // 0-100
  importance_score: number        // 0-100
  novelty_score: number           // 0-100
  momentum_score: number          // 0-100
  credibility_score: number       // 0-100
  actionability_score: number     // 0-100
  content_potential_score: number // 0-100
  personal_fit_score: number      // 0-100
}

interface ScoreModifiers {
  cluster_bonus: number       // 0, 5, or 10
  noise_penalty: number       // 0, 5, 10, or 15
  freshness_multiplier: number // 0.5 - 1.0
}

interface ScoredItem {
  dimensions: ScoreDimensions
  modifiers: ScoreModifiers
  final_score: number
  scored_at: string
}
```

## Feedback Learning

When user marks an item as:
- **useful**: +5 to personal_fit_score for similar items (same source, category, tags)
- **useless**: -5 to personal_fit_score for similar items
- **favorite**: +8 and flags for report inclusion
- **block_source**: source_score → 0 for all future items from that source

These adjustments are applied at scoring time, not retroactively.

## Thresholds (configurable in /settings)

| Threshold | Default | Purpose |
|-----------|---------|---------|
| selected_min_score | 75 | Minimum score to appear in /selected |
| display_min_score | 30 | Minimum score to appear in /feed |
| must_read_min_score | 88 | Minimum score for "必须看" dashboard panel |
| topic_worthy_score | 80 | Minimum score to suggest topic creation |
