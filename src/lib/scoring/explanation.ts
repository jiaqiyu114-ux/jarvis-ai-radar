/**
 * Scoring Explanation v1 — pure display/interpretation layer.
 *
 * Generates human-readable explanations of item scores.
 * Does NOT modify final_score, dimension weights, or any DB values.
 * Does NOT call any AI/LLM API.
 * Does NOT incorporate click, save, or read-time feedback signals.
 *
 * Weights in DIMENSION_WEIGHTS must stay in sync with DEFAULT_WEIGHTS
 * in src/lib/scoring/final-score.ts. Any change there must be reflected here.
 */

import type { ScoreBreakdown } from '@/types'

// ── Score bands ───────────────────────────────────────────────────────────────

export type ScoreBand =
  | 'must_read'
  | 'high_priority'
  | 'selected'
  | 'digest'
  | 'archive'
  | 'low_priority'

export type ScoreBandInfo = {
  band:     ScoreBand
  label:    string
  minScore: number
  maxScore: number
  color:    string   // Tailwind class string for badge styling
}

export const SCORE_BANDS: ScoreBandInfo[] = [
  { band: 'must_read',     label: '必看',     minScore: 90, maxScore: 100, color: 'text-success border-success/30 bg-success/10' },
  { band: 'high_priority', label: '高优先级', minScore: 80, maxScore: 89,  color: 'text-orange-500 border-orange-400/30 bg-orange-400/10 dark:text-orange-400' },
  { band: 'selected',      label: '精选候选', minScore: 70, maxScore: 79,  color: 'text-primary border-primary/30 bg-primary/10' },
  { band: 'digest',        label: '可进日报', minScore: 60, maxScore: 69,  color: 'text-sky-600 border-sky-400/30 bg-sky-400/10 dark:text-sky-400' },
  { band: 'archive',       label: '归档观察', minScore: 45, maxScore: 59,  color: 'text-muted-foreground border-border bg-muted' },
  { band: 'low_priority',  label: '低优先级', minScore: 0,  maxScore: 44,  color: 'text-muted-foreground/60 border-border/50 bg-muted/50' },
]

export function getScoreBand(score: number): ScoreBandInfo {
  return (
    SCORE_BANDS.find(b => score >= b.minScore && score <= b.maxScore)
    ?? SCORE_BANDS[SCORE_BANDS.length - 1]
  )
}

// ── Dimension weights (mirrors DEFAULT_WEIGHTS in final-score.ts) ─────────────

const DIMENSION_WEIGHTS: Record<keyof ScoreBreakdown, number> = {
  importance:        0.18,
  source_score:      0.13,
  ai_relevance:      0.12,
  novelty:           0.12,
  momentum:          0.10,
  credibility:       0.10,
  actionability:     0.10,
  content_potential: 0.08,
  personal_fit:      0.07,
}

// ── Dimension metadata ────────────────────────────────────────────────────────

type DimensionMeta = {
  label:        string
  positiveDesc: string
  negativeDesc: string
}

const DIMENSION_META: Record<keyof ScoreBreakdown, DimensionMeta> = {
  importance:        { label: '重要性',     positiveDesc: '行业影响力较大', negativeDesc: '重要性不足'   },
  source_score:      { label: '信源质量',   positiveDesc: '信源质量较高',   negativeDesc: '信源质量偏低' },
  ai_relevance:      { label: 'AI 相关性',  positiveDesc: 'AI 相关性强',    negativeDesc: 'AI 相关性不足'},
  novelty:           { label: '新颖性',     positiveDesc: '新颖性较高',     negativeDesc: '缺乏新增量'   },
  momentum:          { label: '趋势势头',   positiveDesc: '正在上升',       negativeDesc: '缺少趋势势头' },
  credibility:       { label: '可信度',     positiveDesc: '来源可信',       negativeDesc: '可信度偏低'   },
  actionability:     { label: '可操作性',   positiveDesc: '可操作性强',     negativeDesc: '可操作性偏低' },
  content_potential: { label: '内容潜力',   positiveDesc: '内容潜力较高',   negativeDesc: '内容潜力一般' },
  // "当前目标匹配" intentionally avoids "个人喜好" framing.
  // This field measures relevance to the operator's current work context,
  // not a taste signal derived from past behavior.
  personal_fit:      { label: '目标匹配',   positiveDesc: '与当前目标相关', negativeDesc: '与当前目标关联性一般' },
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type DimensionStatus = 'available' | 'fallback' | 'missing'

export type DimensionExplanation = {
  key:          keyof ScoreBreakdown
  label:        string
  rawValue:     number         // 0-100 from DB (or computed by rule scorer)
  weight:       number         // scoring weight (e.g. 0.18)
  contribution: number         // rawValue × weight, 1 decimal place
  status:       DimensionStatus
}

export type PenaltyExplanation = {
  key:    string
  label:  string
  amount: number
}

export type ItemPenaltiesInput = {
  duplicate?:     number
  clickbait?:     number
  marketing?:     number
  cognitiveLoad?: number
}

export type ScoreExplanation = {
  finalScore:         number
  scoreBand:          ScoreBandInfo
  oneLineReason:      string
  topPositiveDrivers: string[]
  topNegativeDrivers: string[]
  dimensions:         DimensionExplanation[]   // sorted by contribution desc
  penalties:          PenaltyExplanation[]
  totalPenalty:       number
  missingFields:      string[]
  hasMissingFields:   boolean
  isRuleBasedOnly:    boolean   // true when most dimensions are at default 50
}

// ── Internals ─────────────────────────────────────────────────────────────────

// Dimensions default to 50 when not AI-scored (from persist.ts defaultDimensions).
// A value of exactly 50 is treated as 'fallback' (default, not meaningfully scored).
// A value of 0 means something went wrong: 'missing'.
const DEFAULT_DIM_VALUE = 50

function getDimensionStatus(rawValue: number): DimensionStatus {
  if (rawValue === 0)                return 'missing'
  if (rawValue === DEFAULT_DIM_VALUE) return 'fallback'
  return 'available'
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a complete score explanation from an item's scoreBreakdown and penalties.
 * Pure function — no I/O, no side effects.
 */
export function buildScoreExplanation(
  breakdown:  ScoreBreakdown,
  finalScore: number,
  penalties?: ItemPenaltiesInput,
): ScoreExplanation {
  const scoreBand = getScoreBand(clamp(Math.round(finalScore), 0, 100))

  // 1. Dimension explanations (sorted by contribution desc)
  const dimensions: DimensionExplanation[] = (
    Object.keys(DIMENSION_WEIGHTS) as (keyof ScoreBreakdown)[]
  )
    .map(key => {
      const rawValue = breakdown[key] ?? 0
      const weight   = DIMENSION_WEIGHTS[key]
      return {
        key,
        label:        DIMENSION_META[key].label,
        rawValue:     Math.round(rawValue),
        weight,
        contribution: Math.round(rawValue * weight * 10) / 10,
        status:       getDimensionStatus(Math.round(rawValue)),
      }
    })
    .sort((a, b) => b.contribution - a.contribution)

  // 2. Positive drivers: dimensions with rawValue >= 65, sorted by contribution
  const topPositiveDrivers = dimensions
    .filter(d => d.rawValue >= 65)
    .slice(0, 3)
    .map(d => DIMENSION_META[d.key].positiveDesc)

  // 3. Negative drivers: first collect missing, then low-value non-missing
  const rawNegative: string[] = [
    ...dimensions.filter(d => d.status === 'missing').map(d => `${d.label}未评分`),
    ...dimensions
      .filter(d => d.rawValue < 50 && d.status !== 'missing')
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 2)
      .map(d => DIMENSION_META[d.key].negativeDesc),
  ]

  // 4. Penalties
  const penaltyList: PenaltyExplanation[] = []
  if (penalties?.duplicate    && penalties.duplicate    > 0) penaltyList.push({ key: 'duplicate',    label: '重复惩罚',   amount: penalties.duplicate })
  if (penalties?.clickbait    && penalties.clickbait    > 0) penaltyList.push({ key: 'clickbait',    label: '标题党惩罚', amount: penalties.clickbait })
  if (penalties?.marketing    && penalties.marketing    > 0) penaltyList.push({ key: 'marketing',    label: '营销惩罚',   amount: penalties.marketing })
  if (penalties?.cognitiveLoad && penalties.cognitiveLoad > 0) penaltyList.push({ key: 'cognitiveLoad', label: '复杂度惩罚', amount: penalties.cognitiveLoad })
  const totalPenalty = penaltyList.reduce((s, p) => s + p.amount, 0)
  if (totalPenalty > 0) rawNegative.push(`${totalPenalty} 分惩罚`)

  const topNegativeDrivers = rawNegative.slice(0, 3)

  // 5. Missing fields
  const missingFields = dimensions.filter(d => d.status === 'missing').map(d => d.label)

  // 6. Rule-based detection: if ≥6 dimensions are at default value, it's rule-only
  const fallbackCount  = dimensions.filter(d => d.status === 'fallback').length
  const isRuleBasedOnly = fallbackCount >= 6

  // 7. One-line reason
  const oneLineReason = buildOneLineReason(
    topPositiveDrivers,
    topNegativeDrivers,
    isRuleBasedOnly,
    missingFields.length,
  )

  return {
    finalScore:         Math.round(finalScore),
    scoreBand,
    oneLineReason,
    topPositiveDrivers,
    topNegativeDrivers,
    dimensions,
    penalties:          penaltyList,
    totalPenalty,
    missingFields,
    hasMissingFields:   missingFields.length > 0,
    isRuleBasedOnly,
  }
}

function buildOneLineReason(
  positive:    string[],
  negative:    string[],
  isRuleBased: boolean,
  missingCount: number,
): string {
  if (missingCount > 4) {
    return '部分评分字段缺失，解释基于可用字段生成'
  }

  const parts: string[] = []

  if (positive.length > 0) {
    parts.push(positive.slice(0, 2).join('、'))
  }

  // Filter penalty mentions out of the one-liner (they're shown separately)
  const nonPenaltyNeg = negative.filter(n => !n.includes('分惩罚')).slice(0, 2)
  if (nonPenaltyNeg.length > 0) {
    parts.push(`受 ${nonPenaltyNeg.join('、')} 限制`)
  }

  const baseSuffix = isRuleBased ? '（规则基线）' : ''

  if (parts.length === 0) {
    return isRuleBased
      ? '当前为规则引擎基线评分，AI 评分尚未接入'
      : '评分来自规则引擎'
  }

  return parts.join('，') + baseSuffix
}

/** Convenience: just the scoreBand label for a given score. */
export function getScoreBandLabel(score: number): string {
  return getScoreBand(score).label
}
