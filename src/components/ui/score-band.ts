/**
 * Score banding for the recommendation deck.
 *
 * Maps a 0–100 score to a band: label + the `.score-block` color modifier class
 * (defined in globals.css). Only the score block / number is colored — never the
 * whole card.
 */
export type ScoreBand = {
  /** `.score-block` color modifier class */
  cls: "sb-red" | "sb-orange" | "sb-gold" | "sb-blue" | "sb-dim"
  /** short Chinese band label shown under the number */
  label: string
  /** raw accent color (for rings / dots) */
  color: string
}

export function scoreBand(score: number): ScoreBand {
  if (score >= 90) return { cls: "sb-red",    label: "必看", color: "#B94A48" }
  if (score >= 80) return { cls: "sb-orange", label: "高价值", color: "#E8752A" }
  if (score >= 70) return { cls: "sb-gold",   label: "精选", color: "#A96F16" }
  if (score >= 60) return { cls: "sb-blue",   label: "观察", color: "#526F9B" }
  return { cls: "sb-dim", label: "归档", color: "#9A948A" }
}

/**
 * Multicolor card palette (reference event-card form). Real scores cluster in a
 * narrow band, so keying color to score makes the whole grid one hue. Instead we
 * spread cards across a curated palette by their position — a varied mosaic like
 * the reference — while the actual score stays visible in the number chip.
 */
export const MCARD_PALETTE = [
  "rf-mcard--indigo",
  "rf-mcard--sky",
  "rf-mcard--teal",
  "rf-mcard--violet",
] as const

/** Pick a palette class by card index (wraps; safe for negative). */
export function mcardClassByIndex(i: number): string {
  const n = MCARD_PALETTE.length
  return MCARD_PALETTE[((i % n) + n) % n]
}

/** Fallback when no index is supplied — cool spread off the score band. */
export function mcardVariantClass(score: number): string {
  if (score >= 90) return "rf-mcard--indigo"
  if (score >= 80) return "rf-mcard--sky"
  if (score >= 70) return "rf-mcard--teal"
  return "rf-mcard--violet"
}

export type EvidenceLevel = { label: string; color: string }

/** Coarse evidence strength derived from existing fields (no backend change). */
export function evidenceLevel(opts: {
  strongEvidence?: boolean
  evScore?: number | null
  signals?: number
  isOfficial?: boolean
}): EvidenceLevel {
  const { strongEvidence, evScore, signals = 0, isOfficial } = opts
  if (strongEvidence || (evScore != null && evScore >= 70) || signals >= 3) {
    return { label: "High", color: "#2F8A58" }
  }
  if ((evScore != null && evScore >= 45) || signals >= 1 || isOfficial) {
    return { label: "Medium", color: "#A96F16" }
  }
  return { label: "Low", color: "#9A948A" }
}
