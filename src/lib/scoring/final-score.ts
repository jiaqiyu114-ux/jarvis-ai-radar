/**
 * J.A.R.V.I.S. Final Score Calculator
 *
 * ARCHITECTURE CONTRACT:
 *   - AI models ONLY output the 9 dimension scores (0-100 each).
 *   - This function — running in TypeScript code — is the ONLY place
 *     where final_score is calculated.
 *   - Never accept final_score as an AI model output.
 *   - Never skip this function when persisting a scored item.
 *
 * This module is a pure function:
 *   - No database calls.
 *   - No AI calls.
 *   - No environment variable reads.
 *   - Fully testable without any external dependencies.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** The 9 dimension scores output by an AI model (0-100 each). */
export interface ScoreDimensions {
  ai_relevance_score:      number
  source_score:            number
  importance_score:        number
  novelty_score:           number
  momentum_score:          number
  credibility_score:       number
  actionability_score:     number
  content_potential_score: number
  personal_fit_score:      number
}

/** Penalties applied by code-based rules (never AI). */
export interface ScorePenalties {
  duplicate_penalty?:      number   // near-duplicate content
  clickbait_penalty?:      number   // sensational headline detected
  marketing_penalty?:      number   // pure promotional content
  cognitive_load_penalty?: number   // overly complex / low clarity
}

/** Optional cluster context that unlocks a bonus. */
export interface ClusterContext {
  sourceCount:   number   // number of sources covering this cluster
  isPrimaryItem: boolean  // true if this item is the cluster's main item
}

/** Per-dimension output for transparency / UI display. */
export interface ScoreBreakdownResult {
  relevance:        number
  source:           number
  importance:       number
  novelty:          number
  momentum:         number
  credibility:      number
  actionability:    number
  contentPotential: number
  personalFit:      number
}

/** Full output of calculateFinalScore(). */
export interface FinalScoreResult {
  finalScore:          number   // clamped 0–100, rounded to integer
  rawScore:            number   // weighted sum before modifiers
  penalty:             number   // total penalty applied
  clusterBonus:        number   // bonus from cluster membership
  freshnessMultiplier: number   // time-decay factor applied
  breakdown:           ScoreBreakdownResult
}

/** Optional config to override default weights (must sum to 1.0). */
export interface ScoringWeights {
  relevance?:        number
  source?:           number
  importance?:       number
  novelty?:          number
  momentum?:         number
  credibility?:      number
  actionability?:    number
  contentPotential?: number
  personalFit?:      number
}

// ── Default Weights ───────────────────────────────────────────────────────────

const DEFAULT_WEIGHTS: Required<ScoringWeights> = {
  relevance:        0.12,
  source:           0.13,
  importance:       0.18,
  novelty:          0.12,
  momentum:         0.10,
  credibility:      0.10,
  actionability:    0.10,
  contentPotential: 0.08,
  personalFit:      0.07,
  // sum = 1.00 ✓
}

// ── Freshness Multiplier ──────────────────────────────────────────────────────

/**
 * Returns a time-decay multiplier based on how old the item is.
 * publishedAt must be an ISO 8601 string.
 */
export function getFreshnessMultiplier(publishedAt: string): number {
  const hoursOld = (Date.now() - new Date(publishedAt).getTime()) / 3_600_000
  if (hoursOld < 1)   return 1.00
  if (hoursOld < 6)   return 0.95
  if (hoursOld < 24)  return 0.85
  if (hoursOld < 72)  return 0.70
  return 0.50
}

// ── Cluster Bonus ─────────────────────────────────────────────────────────────

function getClusterBonus(ctx: ClusterContext | undefined): number {
  if (!ctx) return 0
  if (ctx.isPrimaryItem && ctx.sourceCount >= 3) return 10
  if (ctx.sourceCount >= 3) return 5
  return 0
}

// ── Main Function ─────────────────────────────────────────────────────────────

/**
 * Compute the final score from AI-output dimension scores + code-side modifiers.
 *
 * @param dimensions  - Nine dimension scores from the AI model (0-100 each).
 * @param publishedAt - ISO 8601 publication timestamp for freshness decay.
 * @param penalties   - Optional code-computed penalties.
 * @param cluster     - Optional cluster context for bonus.
 * @param weights     - Optional custom weight overrides.
 */
export function calculateFinalScore(
  dimensions:  ScoreDimensions,
  publishedAt: string,
  penalties?:  ScorePenalties,
  cluster?:    ClusterContext,
  weights?:    ScoringWeights,
): FinalScoreResult {
  const w = { ...DEFAULT_WEIGHTS, ...weights }

  // 1. Weighted sum of dimension scores
  const breakdown: ScoreBreakdownResult = {
    relevance:        dimensions.ai_relevance_score      * w.relevance,
    source:           dimensions.source_score            * w.source,
    importance:       dimensions.importance_score        * w.importance,
    novelty:          dimensions.novelty_score           * w.novelty,
    momentum:         dimensions.momentum_score          * w.momentum,
    credibility:      dimensions.credibility_score       * w.credibility,
    actionability:    dimensions.actionability_score     * w.actionability,
    contentPotential: dimensions.content_potential_score * w.contentPotential,
    personalFit:      dimensions.personal_fit_score      * w.personalFit,
  }

  const rawScore = Object.values(breakdown).reduce((sum, v) => sum + v, 0)

  // 2. Penalties (code-computed, never AI)
  const penalty =
    (penalties?.duplicate_penalty      ?? 0) +
    (penalties?.clickbait_penalty      ?? 0) +
    (penalties?.marketing_penalty      ?? 0) +
    (penalties?.cognitive_load_penalty ?? 0)

  // 3. Cluster bonus
  const clusterBonus = getClusterBonus(cluster)

  // 4. Freshness multiplier
  const freshnessMultiplier = getFreshnessMultiplier(publishedAt)

  // 5. Final formula: (rawScore + clusterBonus - penalty) × freshness, clamped 0–100
  const adjusted = (rawScore + clusterBonus - penalty) * freshnessMultiplier
  const finalScore = Math.round(Math.min(Math.max(adjusted, 0), 100))

  return { finalScore, rawScore, penalty, clusterBonus, freshnessMultiplier, breakdown }
}
