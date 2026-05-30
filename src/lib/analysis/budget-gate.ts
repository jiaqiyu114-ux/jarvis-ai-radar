/**
 * Analysis Queue / Token Budget Gate v1 — pure rules, no AI/LLM.
 *
 * Determines which post-processing tier each item deserves:
 *   none → skip (low quality, no resources spent)
 *   light → cheap model pass (quick filter)
 *   standard → normal model explanation
 *   deep → premium model deep analysis
 *   cluster → event tracking & multi-source comparison
 *
 * Does NOT:
 * - Call any AI / LLM API.
 * - Use user behavior (clicks, saves, read-time).
 * - Modify final_score or data_origin.
 * - Guarantee real token consumption (estimates only).
 *
 * The goal is to concentrate expensive AI resources on high-value content.
 * The ingest/extraction/rule-scoring pipeline runs at zero token cost.
 */

import type { DbItem } from '@/types/database'
import type { AnalysisTier, AnalysisPriority, AnalysisStage, TokenBudgetTier, AnalysisGate } from '@/types'

// ── Token estimation constants ────────────────────────────────────────────────

const BASE_OVERHEAD         = 800   // system prompt + item metadata boilerplate
const TITLE_SUMMARY_TOKENS  = 300   // title + summary text
const CHARS_PER_TOKEN       = 4     // rough estimate for mixed zh/en text
const MAX_CONTENT_TOKENS    = 6000  // cap long articles

const OUTPUT_TOKENS: Record<AnalysisTier, number> = {
  none:     0,
  light:    300,
  standard: 1000,
  deep:     2500,
  cluster:  3200,
}

// ── Tier decision ─────────────────────────────────────────────────────────────

function getNumericField<T>(item: DbItem, key: string): T | null {
  return (item as Record<string, unknown>)[key] as T | null
}

export function decideAnalysisTier(item: DbItem): AnalysisTier {
  const finalScore         = item.final_score ?? 0
  const dataOrigin         = (item as { data_origin?: string }).data_origin
  const evScore            = getNumericField<number>(item, 'ev_score')
  const claimStatus        = getNumericField<string>(item, 'claim_status')
  const sourceNature       = getNumericField<string>(item, 'source_nature')
  const contentFetched     = getNumericField<string>(item, 'content_fetch_status') === 'fetched'
  const wordCount          = getNumericField<number>(item, 'content_word_count')
  const hasArticleContent  = getNumericField<boolean>(item, 'has_article_content') === true
  const contentPotential   = item.content_potential_score ?? 0
  const importanceScore    = item.importance_score ?? 0

  // Hard skip: non-real data or very low quality
  if (dataOrigin !== 'real')           return 'none'
  if (finalScore < 25)                 return 'none'
  if (claimStatus === 'rumor' && finalScore < 55) return 'none'

  // Cluster tier: multi-source events, regardless of score
  // (relatedReportCount is not in DbItem — use importance + momentum as proxy)
  const momentum = item.momentum_score ?? 0
  if (finalScore >= 55 && importanceScore >= 70 && momentum >= 70) return 'cluster'

  // Deep tier: high score + strong evidence OR exceptional content potential
  if (finalScore >= 70) return 'deep'
  if (
    finalScore >= 55 &&
    (evScore ?? 0) >= 55 &&
    contentFetched &&
    (hasArticleContent || (wordCount ?? 0) >= 200)
  ) return 'deep'
  if (finalScore >= 55 && contentPotential >= 75) return 'deep'

  // Standard tier: moderate quality
  if (finalScore >= 45) {
    if (contentFetched || (evScore ?? 0) >= 35) return 'standard'
    if (sourceNature === 'official' || sourceNature === 'primary_report') return 'standard'
  }

  // Light tier: low-medium quality — worth a quick check
  if (finalScore >= 25) return 'light'

  return 'none'
}

export function decideAnalysisPriority(
  tier:         AnalysisTier,
  item:         DbItem,
): AnalysisPriority {
  if (tier === 'none' || tier === 'light') return 'low'
  if (tier === 'cluster')                  return 'urgent'

  const importanceScore  = item.importance_score ?? 0
  const sourceNature     = getNumericField<string>(item, 'source_nature')
  const finalScore       = item.final_score ?? 0

  if (
    tier === 'deep' &&
    (importanceScore >= 80 || sourceNature === 'official' || finalScore >= 80)
  ) return 'urgent'

  if (tier === 'deep') return 'high'

  return 'normal'
}

function decideAnalysisStage(tier: AnalysisTier): AnalysisStage {
  switch (tier) {
    case 'none':    return 'skipped'
    case 'light':   return 'light_ready'
    case 'standard':return 'standard_ready'
    case 'deep':    return 'deep_ready'
    case 'cluster': return 'cluster_ready'
  }
}

function decideTokenBudget(tier: AnalysisTier): TokenBudgetTier {
  switch (tier) {
    case 'none':    return 'none'
    case 'light':   return 'cheap'
    case 'standard':return 'normal'
    case 'deep':    return 'premium'
    case 'cluster': return 'premium'
  }
}

export function estimateTokenCost(
  item:  DbItem,
  tier:  AnalysisTier,
): { input: number; output: number; total: number } {
  const output = OUTPUT_TOKENS[tier]
  if (output === 0) return { input: 0, output: 0, total: 0 }

  const cleanText  = getNumericField<string>(item, 'clean_text')
  const wordCount  = getNumericField<number>(item, 'content_word_count')

  let contentTokens = 0
  if (cleanText) {
    contentTokens = Math.min(
      Math.round(cleanText.length / CHARS_PER_TOKEN),
      MAX_CONTENT_TOKENS,
    )
  } else if (wordCount) {
    // Rough: English word ~1.3 tokens, Chinese character ~0.5 tokens → average ~1 token/word
    contentTokens = Math.min(wordCount, MAX_CONTENT_TOKENS)
  }

  const input = BASE_OVERHEAD + TITLE_SUMMARY_TOKENS + contentTokens
  return { input, output, total: input + output }
}

export function buildAnalysisReason(
  tier:     AnalysisTier,
  item:     DbItem,
): string {
  const finalScore   = item.final_score ?? 0
  const evScore      = getNumericField<number>(item, 'ev_score') ?? 0
  const sourceNature = getNumericField<string>(item, 'source_nature') ?? 'unknown'
  const contentFetched = getNumericField<string>(item, 'content_fetch_status') === 'fetched'
  const contentPotential = item.content_potential_score ?? 0
  const importance = item.importance_score ?? 0
  const momentum   = item.momentum_score ?? 0

  switch (tier) {
    case 'none':
      if ((item as { data_origin?: string }).data_origin !== 'real') return '非真实数据，跳过后处理。'
      if (finalScore < 25) return `综合评分 ${finalScore} 偏低，资源优先分配给高质量内容。`
      return `来源性质为 ${sourceNature}，当前置信度不足，跳过深度后处理。`

    case 'light':
      return `评分 ${finalScore}，具备基础处理条件，建议轻量模型初判：是否值得进一步分析。`

    case 'standard': {
      const reasons = [`评分 ${finalScore}`]
      if (contentFetched) reasons.push('原文已抓取')
      if (evScore >= 35)  reasons.push(`证据强度 ${evScore}`)
      return reasons.join('，') + '，适合标准深度解释。'
    }

    case 'deep': {
      const reasons = [`评分 ${finalScore}`]
      if (evScore >= 55)         reasons.push(`证据较强(${evScore})`)
      if (contentPotential >= 75) reasons.push('内容潜力高')
      if (sourceNature === 'official') reasons.push('官方来源')
      if (contentFetched)        reasons.push('正文完整')
      return reasons.join('，') + '，值得进入深度解释与选题判断。'
    }

    case 'cluster': {
      const reasons: string[] = ['重要性与势头同时偏高']
      if (importance >= 70) reasons.push(`重要性 ${importance}`)
      if (momentum >= 70)   reasons.push(`势头 ${momentum}`)
      return reasons.join('，') + '，可能属于持续事件，建议进入事件簇追踪。'
    }
  }
}

// ── Boolean flags ─────────────────────────────────────────────────────────────

function decideShouldDeepAnalyze(tier: AnalysisTier): boolean {
  return tier === 'deep' || tier === 'cluster'
}

function decideShouldTrackEvent(tier: AnalysisTier, item: DbItem): boolean {
  const importance = item.importance_score ?? 0
  const momentum   = item.momentum_score ?? 0
  return tier === 'cluster' || (tier === 'deep' && importance >= 65 && momentum >= 60)
}

function decideShouldEnterDailyReport(tier: AnalysisTier, item: DbItem): boolean {
  return (
    (tier === 'standard' || tier === 'deep' || tier === 'cluster') &&
    (item.final_score ?? 0) >= 55
  )
}

function decideShouldEnterTopicPool(tier: AnalysisTier, item: DbItem): boolean {
  return (
    (tier === 'deep' || tier === 'cluster') &&
    (item.content_potential_score ?? 0) >= 60
  )
}

// ── Main builder ──────────────────────────────────────────────────────────────

export function buildAnalysisGate(item: DbItem): AnalysisGate {
  const tier     = decideAnalysisTier(item)
  const priority = decideAnalysisPriority(tier, item)
  const stage    = decideAnalysisStage(tier)
  const budget   = decideTokenBudget(tier)
  const tokens   = estimateTokenCost(item, tier)
  const reason   = buildAnalysisReason(tier, item)

  return {
    analysisTier:           tier,
    analysisPriority:       priority,
    analysisStage:          stage,
    tokenBudgetTier:        budget,
    estimatedInputTokens:   tokens.input,
    estimatedOutputTokens:  tokens.output,
    estimatedTotalTokens:   tokens.total,
    shouldDeepAnalyze:      decideShouldDeepAnalyze(tier),
    shouldTrackEvent:       decideShouldTrackEvent(tier, item),
    shouldEnterDailyReport: decideShouldEnterDailyReport(tier, item),
    shouldEnterTopicPool:   decideShouldEnterTopicPool(tier, item),
    analysisReason:         reason,
    queuedAt:               new Date().toISOString(),
  }
}
