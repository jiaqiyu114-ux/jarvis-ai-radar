/**
 * Rule-based scoring v0 — no AI calls.
 *
 * Computes source_score, evidence_score, and final_score from structured
 * metadata. Designed as a baseline that can later be supplemented or replaced
 * by AI dimension scoring without changing the pipeline shape.
 *
 * final_score formula:
 *   0.35 × provider_signal
 * + 0.25 × source_score
 * + 0.20 × freshness_score
 * + 0.20 × relevance_score
 * − penalties
 * clamped to [0, 100], rounded to integer
 */

// ── Keyword list for relevance ────────────────────────────────────────────────

const AI_KEYWORDS = [
  'ai', 'artificial intelligence',
  'agent', 'agents', 'agentic',
  'llm', 'large language model',
  'model', 'models',
  'openai', 'anthropic', 'google deepmind', 'deepmind',
  'claude', 'gpt', 'gemini', 'mistral', 'llama',
  'cursor', 'copilot',
  'developer', 'api',
  'inference', 'benchmark', 'evaluation',
  'robotics', 'multimodal', 'reasoning', 'rlhf',
  'fine-tuning', 'fine tuning', 'embedding',
  'transformer', 'neural', 'machine learning', 'deep learning',
  'open source', 'github',
  'automation', 'workflow',
]

// ── Component scores ──────────────────────────────────────────────────────────

/** Source credibility based on tier and official status. */
export function computeSourceScore(
  sourceTier?:      string | null,
  isOfficial?:      boolean | null,
  reliabilityScore?: number | null,
  baseScore?:        number | null,
): number {
  const tierBase: Record<string, number> = { S: 90, A: 80, B: 70, C: 60, D: 50 }
  let score = tierBase[sourceTier ?? 'C'] ?? 60
  if (isOfficial) score = Math.min(100, score + 5)
  // Blend with stored reliability_score if available
  const ref = reliabilityScore ?? baseScore
  if (ref && ref > 0) score = Math.round((score + ref) / 2)
  return score
}

/** How well-attributed the item's source is. */
export function computeEvidenceScore(
  hasSource:   boolean,   // source_id IS NOT NULL
  sourceTier?: string | null,
): number {
  if (!hasSource) return 30   // unknown origin = low evidence
  const tierBase: Record<string, number> = { S: 95, A: 85, B: 75, C: 65, D: 55 }
  return tierBase[sourceTier ?? 'C'] ?? 65
}

/** Time-decay freshness. */
export function computeFreshnessScore(
  publishedAt?: string | null,
  fetchedAt?:   string,
): number {
  const dateStr = publishedAt || fetchedAt || new Date().toISOString()
  const hoursOld = (Date.now() - new Date(dateStr).getTime()) / 3_600_000
  if (hoursOld < 24)  return 90
  if (hoursOld < 72)  return 80
  if (hoursOld < 168) return 70
  if (hoursOld < 720) return 50
  return 35
}

/** Keyword-based relevance to AI / developer topics. */
export function computeRelevanceScore(title: string, summary?: string | null): number {
  const text = (title + ' ' + (summary ?? '')).toLowerCase()
  const matches = AI_KEYWORDS.filter(kw => text.includes(kw)).length
  if (matches >= 5) return 90
  if (matches >= 3) return 80
  if (matches >= 2) return 70
  if (matches >= 1) return 60
  return 40
}

/** Simple structural penalties (no semantic analysis). */
export function computePenalties(title: string, summary?: string | null): number {
  let penalty = 0
  if (title.trim().length < 20) penalty += 5       // very short title
  if (!summary || summary.trim().length < 10) penalty += 5  // missing summary
  // Marketing / sponsored content indicators
  const marketingWords = ['sponsored', 'advertisement', 'promo', '广告', '推广', '赞助']
  if (marketingWords.some(w => title.toLowerCase().includes(w))) penalty += 15
  return penalty
}

// ── Input / output types ──────────────────────────────────────────────────────

export type RuleScoreInput = {
  id:               string
  title:            string
  summary?:         string | null
  published_at?:    string | null
  fetched_at?:      string
  provider_signal?: number | null    // already stored on the item
  source_id?:       string | null
  source_tier?:     string | null
  is_official?:     boolean | null
  reliability_score?: number | null
  base_score?:       number | null
  category?:        string | null
}

export type RuleScoreResult = {
  id:              string
  source_score:    number
  evidence_score:  number
  freshness_score: number   // informational, not stored separately
  relevance_score: number   // informational, not stored separately
  final_score:     number
  penalties:       number
  reasons:         string[]
}

// ── Main scoring function ─────────────────────────────────────────────────────

export function computeRuleScore(input: RuleScoreInput): RuleScoreResult {
  const providerSignal  = input.provider_signal ?? 50
  const sourceScore     = computeSourceScore(input.source_tier, input.is_official, input.reliability_score, input.base_score)
  const evidenceScore   = computeEvidenceScore(input.source_id != null, input.source_tier)
  const freshnessScore  = computeFreshnessScore(input.published_at, input.fetched_at)
  const relevanceScore  = computeRelevanceScore(input.title, input.summary)
  const penalties       = computePenalties(input.title, input.summary)

  const raw =
    0.35 * providerSignal +
    0.25 * sourceScore    +
    0.20 * freshnessScore +
    0.20 * relevanceScore -
    penalties

  const finalScore = Math.round(Math.min(Math.max(raw, 0), 100))

  const reasons = [
    `provider_signal: ${providerSignal}`,
    `source_score: ${sourceScore} (tier=${input.source_tier ?? 'unknown'}${input.is_official ? ', official' : ''})`,
    `freshness: ${freshnessScore}`,
    `relevance: ${relevanceScore}`,
    `penalties: ${penalties}`,
    `→ final_score: ${finalScore}`,
  ]

  return { id: input.id, source_score: sourceScore, evidence_score: evidenceScore, freshness_score: freshnessScore, relevance_score: relevanceScore, final_score: finalScore, penalties, reasons }
}
