/**
 * Recommendation Quality Classification — pure display/interpretation layer.
 *
 * DESIGN CONSTRAINTS (non-negotiable):
 * 1. Does NOT modify any score, weight, or DB value.
 * 2. Does NOT call any AI/LLM API.
 * 3. User feedback (save, like, dismiss) is NEVER used as interest/preference signal.
 *    Feedback signals only appear as quality calibrations:
 *    - strong_evidence / weak_evidence → evidence quality note
 *    - project_related / worth_writing → recommend topic_pool role
 *    - clickbait_or_marketing / duplicate_info → risk flag
 *    But NOT "user liked this type → recommend more of same type".
 * 4. Text must not say "根据你的喜好" or "猜你喜欢". Only "根据你的标注" if feedback context.
 */

// ── Input type ────────────────────────────────────────────────────────────────

export type RecommendationQualityInput = {
  finalScore:              number
  sourceTier:              string          // 'S' | 'A' | 'B' | 'C'
  analysisTier?:           string | null   // 'cluster' | 'deep' | 'standard' | 'light' | 'none'
  shouldTrackEvent?:       boolean | null
  shouldEnterDailyReport?: boolean | null
  shouldDeepAnalyze?:      boolean | null
  shouldEnterTopicPool?:   boolean | null
  isUserCurated?:          boolean | null
  evidenceScore?:          number | null   // ev_score
  truthScore?:             number | null
  sourceTraceScore?:       number | null
  wordCount?:              number | null
  contentFetchStatus?:     string | null
  penalties?: {
    clickbait?:    number
    marketing?:    number
    duplicate?:    number
    cognitiveLoad?: number
  } | null
  hasOriginalSource?: boolean | null
  section?: string | null                 // 'must_read' | 'high_value' | 'observe' if from snapshot
}

// ── Output types ──────────────────────────────────────────────────────────────

export type QualityBand       = 'must_read' | 'high_value' | 'watch' | 'weak_signal' | 'low_value'
export type RecommendationRole = 'daily_brief' | 'topic_pool' | 'event_tracking' | 'deep_analysis' | 'observe'
export type ConfidenceLabel   = '高置信' | '中置信' | '低置信' | '待验证'
export type SourceStatus      = '多源验证' | '用户认可源' | '单源观察' | '来源较弱'
export type EvidenceStatus    = '证据强' | '证据一般' | '证据弱' | '证据不足'

export type RecommendationQualityResult = {
  qualityBand:         QualityBand
  qualityLabel:        string
  qualityColor:        string   // tailwind class string
  recommendationRole:  RecommendationRole
  roleLabel:           string
  roleColor:           string
  confidenceLabel:     ConfidenceLabel
  confidenceColor:     string
  sourceStatus:        SourceStatus
  sourceStatusColor:   string
  evidenceStatus:      EvidenceStatus
  /** Max 3 human-readable reasons this item was recommended (or not). */
  reasons:             string[]
  /** Max 3 risk flags. */
  risks:               string[]
  /** Max 3 missing signals needed to upgrade this item's quality. */
  missingSignals:      string[]
  /** One-sentence next action. */
  nextAction:          string
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function n(v: number | null | undefined): number { return v ?? 0 }
function b(v: boolean | null | undefined): boolean { return v === true }

function qualityBandFromSection(section: string | null | undefined): QualityBand | null {
  if (section === 'must_read')  return 'must_read'
  if (section === 'high_value') return 'high_value'
  if (section === 'observe')    return 'watch'
  return null
}

function qualityBandFromScore(
  score: number,
  ev: number,
  trackEvent: boolean,
): QualityBand {
  if (score >= 78 && (ev >= 65 || trackEvent)) return 'must_read'
  if (score >= 65) return 'high_value'
  if (score >= 50) return 'watch'
  if (score >= 35) return 'weak_signal'
  return 'low_value'
}

const QUALITY_LABELS: Record<QualityBand, string> = {
  must_read:   '重点推荐',
  high_value:  '高价值',
  watch:       '观察',
  weak_signal: '弱信号',
  low_value:   '低优先',
}

const QUALITY_COLORS: Record<QualityBand, string> = {
  must_read:   'text-success border-success/30 bg-success/10',
  high_value:  'text-primary border-primary/30 bg-primary/10',
  watch:       'text-sky-600 border-sky-400/30 bg-sky-400/10 dark:text-sky-400',
  weak_signal: 'text-muted-foreground border-border bg-muted/50',
  low_value:   'text-muted-foreground/60 border-border/50 bg-muted/30',
}

function classifyRole(input: RecommendationQualityInput): RecommendationRole {
  // Priority: event tracking > deep analysis > daily brief > topic pool > observe
  if (b(input.shouldTrackEvent) || input.analysisTier === 'cluster') return 'event_tracking'
  if (b(input.shouldDeepAnalyze) || input.analysisTier === 'deep')   return 'deep_analysis'
  if (b(input.shouldEnterDailyReport))                               return 'daily_brief'
  if (b(input.shouldEnterTopicPool) || input.finalScore >= 70)       return 'topic_pool'
  return 'observe'
}

const ROLE_LABELS: Record<RecommendationRole, string> = {
  daily_brief:    '日报',
  topic_pool:     '选题池',
  event_tracking: '事件追踪',
  deep_analysis:  '深度分析',
  observe:        '观察',
}

const ROLE_COLORS: Record<RecommendationRole, string> = {
  daily_brief:    'text-primary border-primary/25 bg-primary/8',
  topic_pool:     'text-violet-600 border-violet-400/30 bg-violet-400/8 dark:text-violet-400',
  event_tracking: 'text-success border-success/25 bg-success/8',
  deep_analysis:  'text-orange-500 border-orange-400/30 bg-orange-400/8 dark:text-orange-400',
  observe:        'text-muted-foreground border-border bg-muted/40',
}

function classifySourceStatus(input: RecommendationQualityInput): SourceStatus {
  // Multi-source: actual cluster
  if (input.analysisTier === 'cluster') return '多源验证'
  // User curated
  if (b(input.isUserCurated)) return '用户认可源'
  // Weak source
  const tier = (input.sourceTier ?? '').toUpperCase()
  if ((tier === 'C' || tier === 'D') && input.finalScore < 60) return '来源较弱'
  // Default: single source
  return '单源观察'
}

const SOURCE_STATUS_COLORS: Record<SourceStatus, string> = {
  '多源验证':   'text-success border-success/25 bg-success/8',
  '用户认可源': 'text-teal-600 border-teal-400/30 bg-teal-400/8 dark:text-teal-400',
  '单源观察':   'text-muted-foreground border-border bg-muted/40',
  '来源较弱':   'text-warning border-warning/25 bg-warning/8',
}

function classifyEvidence(ev: number, truth: number): EvidenceStatus {
  if (ev >= 70 && truth >= 65) return '证据强'
  if (ev >= 55 || truth >= 55) return '证据一般'
  if (ev >= 35 || truth >= 35) return '证据弱'
  return '证据不足'
}

function classifyConfidence(
  score: number,
  ev: number,
  truth: number,
  isRuleBased: boolean,
): { label: ConfidenceLabel; color: string } {
  if (ev === 0 && truth === 0) {
    return { label: '待验证', color: 'text-muted-foreground border-border bg-muted/40' }
  }
  if (!isRuleBased && score >= 80 && (ev >= 65 || truth >= 65)) {
    return { label: '高置信', color: 'text-success border-success/25 bg-success/8' }
  }
  if (score >= 65 && (ev >= 50 || truth >= 50)) {
    return { label: '中置信', color: 'text-sky-600 border-sky-400/30 bg-sky-400/10 dark:text-sky-400' }
  }
  return { label: '低置信', color: 'text-warning border-warning/25 bg-warning/8' }
}

function buildReasons(input: RecommendationQualityInput, sourceStatus: SourceStatus, band: QualityBand): string[] {
  const reasons: string[] = []
  const tier  = (input.sourceTier ?? '').toUpperCase()
  const ev    = n(input.evidenceScore)
  const truth = n(input.truthScore)
  const wc    = input.wordCount ?? 0

  // Source reason
  if (sourceStatus === '用户认可源') {
    reasons.push('来自你主动接入的信息源，系统提高观察优先级')
  } else if (sourceStatus === '多源验证') {
    reasons.push('已有多个来源报道，形成事件簇，信号较强')
  } else if (tier === 'S' || tier === 'A') {
    reasons.push(`来源级别为 ${tier} 级，可信度权重较高`)
  } else if (tier === 'B') {
    reasons.push('来源为 B 级标准媒体')
  }

  // Score / section reason
  if (band === 'must_read') {
    reasons.push('综合评分达到重点推荐标准，适合今日优先处理')
  } else if (band === 'high_value') {
    reasons.push(`综合评分 ${input.finalScore} 分，符合高价值候选标准`)
  }

  // Content / evidence reason
  if (ev >= 65 && truth >= 65) {
    reasons.push('证据链较完整，真实性信号较强')
  } else if (wc >= 800 && input.contentFetchStatus === 'fetched') {
    reasons.push(`已抓取完整正文（约 ${wc} 字），适合深读`)
  } else if (b(input.hasOriginalSource)) {
    reasons.push('可追溯到原始信息来源')
  } else if (b(input.shouldEnterDailyReport)) {
    reasons.push('已通过日报入选条件，适合纳入今日摘要')
  }

  return reasons.slice(0, 3)
}

function buildRisks(input: RecommendationQualityInput, sourceStatus: SourceStatus): string[] {
  const risks: string[] = []
  const penalties = input.penalties ?? {}
  const clickbait = n(penalties.clickbait)
  const marketing = n(penalties.marketing)
  const duplicate = n(penalties.duplicate)
  const ev        = n(input.evidenceScore)
  const truth     = n(input.truthScore)
  const wc        = input.wordCount

  if (clickbait >= 10) {
    risks.push(`标题疑似夸大或标题党（已扣 ${clickbait} 分惩罚）`)
  }
  if (marketing >= 10) {
    risks.push(`疑似产品营销或推广内容（已扣 ${marketing} 分惩罚）`)
  }
  if (duplicate >= 5) {
    risks.push(`内容可能与库中已有信息重复（已扣 ${duplicate} 分惩罚）`)
  }

  if (sourceStatus === '单源观察' || sourceStatus === '用户认可源') {
    risks.push('当前仍为单源信息，缺少多家媒体交叉验证')
  }

  if (ev < 40 && truth < 40 && ev + truth > 0) {
    risks.push('证据信号偏弱，不宜作为直接判断依据')
  }

  if (wc !== null && wc !== undefined && wc < 100 && input.contentFetchStatus !== 'fetched') {
    risks.push('正文内容过短或尚未抓取，信息完整度有限')
  }

  return risks.slice(0, 3)
}

function buildMissingSignals(input: RecommendationQualityInput, sourceStatus: SourceStatus): string[] {
  const missing: string[] = []
  const ev    = n(input.evidenceScore)
  const truth = n(input.truthScore)

  if (sourceStatus !== '多源验证' && !b(input.shouldTrackEvent)) {
    missing.push('尚未形成多源事件簇，单一信源无法构成事实闭环')
  }

  if (!input.contentFetchStatus || input.contentFetchStatus === 'not_fetched') {
    missing.push('正文尚未抓取，内容完整度未知')
  }

  if (ev === 0 && truth === 0) {
    missing.push('暂无 AI 证据评分，当前为规则基线评估')
  } else if (ev < 55 && truth < 55) {
    missing.push('需要更强的证据信号（ev >= 55 或 truth >= 55）才能提升等级')
  }

  return missing.slice(0, 3)
}

function buildNextAction(role: RecommendationRole, band: QualityBand, sourceStatus: SourceStatus): string {
  if (role === 'event_tracking') {
    return '建议加入事件追踪队列，持续关注多源跟进动态。'
  }
  if (role === 'deep_analysis') {
    return '建议进入深度分析流程，提取核心论点和证据链。'
  }
  if (role === 'daily_brief' && band === 'must_read') {
    return '建议今日优先阅读，适合进入日报或作为选题核心素材。'
  }
  if (role === 'topic_pool') {
    return '适合纳入选题池，可作为内容创作的背景参考或角度来源。'
  }
  if (sourceStatus === '用户认可源') {
    return '先加入观察，仍需等待其他来源确认，再决定是否进入日报或选题池。'
  }
  if (band === 'must_read' || band === 'high_value') {
    return '先加入高价值观察，等待更多来源确认后再深度处理。'
  }
  if (band === 'watch') {
    return '轻量浏览即可，持续观察是否有后续多源跟进。'
  }
  return '信号较弱，建议先归档；如后续有多源确认再重新评估。'
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Classify a recommendation item's quality for UI display.
 * Pure function — no I/O, no side effects.
 */
export function classifyRecommendationItem(
  input: RecommendationQualityInput,
): RecommendationQualityResult {
  const ev    = n(input.evidenceScore)
  const truth = n(input.truthScore)
  const score = input.finalScore

  // Whether AI dimensions are likely all-default (rule-based scoring)
  const isRuleBased = ev === 0 && truth === 0

  const band: QualityBand =
    qualityBandFromSection(input.section) ??
    qualityBandFromScore(score, ev, b(input.shouldTrackEvent))

  const role          = classifyRole(input)
  const sourceStatus  = classifySourceStatus(input)
  const evidenceStatus = classifyEvidence(ev, truth)
  const confidence    = classifyConfidence(score, ev, truth, isRuleBased)

  return {
    qualityBand:        band,
    qualityLabel:       QUALITY_LABELS[band],
    qualityColor:       QUALITY_COLORS[band],
    recommendationRole: role,
    roleLabel:          ROLE_LABELS[role],
    roleColor:          ROLE_COLORS[role],
    confidenceLabel:    confidence.label,
    confidenceColor:    confidence.color,
    sourceStatus,
    sourceStatusColor:  SOURCE_STATUS_COLORS[sourceStatus],
    evidenceStatus,
    reasons:            buildReasons(input, sourceStatus, band),
    risks:              buildRisks(input, sourceStatus),
    missingSignals:     buildMissingSignals(input, sourceStatus),
    nextAction:         buildNextAction(role, band, sourceStatus),
  }
}

/**
 * Generate a one-sentence reason why an item was NOT selected into recommendations.
 * Used for "暂未推荐的候选信号" display.
 */
export function explainNonSelectionReason(input: RecommendationQualityInput): string {
  const penalties = input.penalties ?? {}
  const clickbait = n(penalties.clickbait)
  const marketing = n(penalties.marketing)
  const duplicate = n(penalties.duplicate)
  const score     = input.finalScore
  const ev        = n(input.evidenceScore)
  const truth     = n(input.truthScore)
  const wc        = input.wordCount

  if (clickbait >= 15) return '标题有较强营销或夸大特征，已被降权排除推荐池'
  if (marketing >= 10) return '疑似产品营销或活动推广内容，已降低推荐权重'
  if (duplicate >= 10) return '内容与已入库信息疑似重复，暂不重复推荐'
  if (wc !== null && wc !== undefined && wc < 80) return '正文过短，内容依据不足，暂入观察'
  if (score < 50 && ev < 35 && truth < 35) return `综合评分偏低（${score}分），证据信号也较弱，暂不入选`
  if (score < 65) return `综合评分 ${score}分，暂未达到高价值入选门槛（需 ≥65）`
  return `当前处于候选池但未入本次快照窗口（评分 ${score}分）`
}
