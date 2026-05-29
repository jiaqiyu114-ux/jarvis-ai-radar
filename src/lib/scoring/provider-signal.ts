/**
 * Provider Signal Calculator
 *
 * Computes provider_signal (0-100) from provider metadata.
 * This is NOT the final_score — it feeds into the broader scoring pipeline
 * as one input dimension once AI scoring is wired up.
 *
 * Formula:
 *   provider_signal =
 *     0.45 × provider_trust_score
 *   + 0.25 × provider_score
 *   + 0.15 × rank_score
 *   + 0.10 × featured_bonus
 *   + 0.05 × multi_provider_bonus
 *
 * All component scores are 0-100; result is clamped to 0-100.
 *
 * This is a pure function — no I/O, no side effects.
 */

// ── Rank → score mapping ──────────────────────────────────────────────────────

function getRankScore(rank: number | null | undefined): number {
  if (rank == null)  return 50   // no rank info → neutral
  if (rank === 1)    return 100
  if (rank <= 3)     return 90
  if (rank <= 10)    return 75
  if (rank <= 30)    return 60
  return 45
}

// ── Mention count → multi-provider bonus ─────────────────────────────────────

function getMultiProviderBonus(count: number): number {
  if (count >= 4) return 100
  if (count === 3) return 80
  if (count === 2) return 60
  return 0   // single provider → no bonus
}

// ── Public ────────────────────────────────────────────────────────────────────

export type ProviderSignalInput = {
  /** How trustworthy this provider is (0-100). Default 60. */
  providerTrustScore?: number
  /** Provider's own relevance/quality score for this item (0-100). Default 50. */
  providerScore?:      number | null
  /** Rank position in provider's feed (1 = best). Default: no rank. */
  providerRank?:       number | null
  /** Whether the provider explicitly featured/highlighted this item. Default false. */
  featured?:           boolean
  /** How many distinct providers have reported this item. Default 1. */
  mentionCount?:       number
}

/**
 * Calculate provider_signal from provider metadata.
 * Returns an integer in [0, 100].
 */
export function calculateProviderSignal(input: ProviderSignalInput): number {
  const trust    = input.providerTrustScore ?? 60
  const score    = input.providerScore      ?? 50
  const rank     = getRankScore(input.providerRank)
  const featured = input.featured ? 100 : 0
  const multi    = getMultiProviderBonus(input.mentionCount ?? 1)

  const raw = (
    0.45 * trust  +
    0.25 * score  +
    0.15 * rank   +
    0.10 * featured +
    0.05 * multi
  )

  return Math.round(Math.min(Math.max(raw, 0), 100))
}
