import { cleanText as baseCleanText } from '@/lib/text/clean-text'

export type RecommendationDeepDive = {
  status: 'generated' | 'fallback' | 'skipped' | 'error'
  generatedAt: string
  model: string
  summary: string
  deepSummary: string
  backgroundContext: string
  whyItMatters: string
  userInsight: string
  riskAndUncertainty: string
  followUpSuggestion: string
  sourceReadingGuide: string
  deepDiveStatus: 'generated' | 'fallback' | 'skipped' | 'error'
  deepDiveGeneratedAt: string
  deepDiveModel: string
}

export type RecommendationDeepDiveInput = {
  title: string
  summary?: string | null
  sourceName?: string | null
  source?: string | null
  sourceTier?: string | null
  category?: string | null
  finalScore?: number | null
  evScore?: number | null
  truthScore?: number | null
  sourceTraceScore?: number | null
  recommendationTier?: string | null
  sourceStatus?: string | null
  recommendationReason?: string | null
  riskNote?: string | null
  nextStep?: string | null
  shouldTrackEvent?: boolean | null
  shouldEnterDailyReport?: boolean | null
  shouldDeepAnalyze?: boolean | null
  analysisTier?: string | null
  publishedAt?: string | null
  fetchedAt?: string | null
  originalUrl?: string | null
}

type DeepDiveBuildOptions = {
  now?: Date
  model?: string
}

const GARBLED_PATTERNS = ['芒鈧', '脙', '锟', '鈥', '聙']

function clampScore(v: number | null | undefined): number {
  const n = Number(v ?? 0)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

function toTierLabel(tier: string | null | undefined): string {
  switch ((tier ?? '').toLowerCase()) {
    case 'must_read':
      return '重点推荐'
    case 'high_value':
      return '高价值'
    case 'observe':
      return '观察'
    case 'archive':
      return '归档'
    default:
      return '候选'
  }
}

function toSourceStatusLabel(status: string | null | undefined): string {
  switch ((status ?? '').toLowerCase()) {
    case 'official':
      return '官方来源'
    case 'user_curated':
      return '用户关注来源'
    case 'multi_source':
      return '多源验证态'
    case 'weak_source':
      return '弱来源态'
    default:
      return '单源态'
  }
}

export function cleanText(value: string | null | undefined): string {
  return baseCleanText(value ?? '')
}

export function looksGarbled(value: string | null | undefined): boolean {
  const text = cleanText(value)
  if (!text || text.length < 2) return false
  if (/[�]/.test(text)) return true
  return GARBLED_PATTERNS.some((p) => text.includes(p))
}

export function safeText(
  value: string | null | undefined,
  fallback = '',
  maxLen = 260,
): string {
  const t = cleanText(value)
  if (!t || looksGarbled(t)) return fallback
  if (t.length <= maxLen) return t
  return `${t.slice(0, maxLen).trimEnd()}...`
}

export function joinNonEmpty(parts: Array<string | null | undefined>, sep = '；'): string {
  const normalized = parts
    .map((p) => safeText(p, '', 240))
    .filter((p) => p.length > 0)
  return normalized.join(sep)
}

function chooseRisk(input: RecommendationDeepDiveInput): string {
  const given = safeText(input.riskNote, '')
  if (given) return given

  const ev = clampScore(input.evScore)
  const truth = clampScore(input.truthScore)
  const trace = clampScore(input.sourceTraceScore)
  const sourceStatus = (input.sourceStatus ?? '').toLowerCase()

  if (sourceStatus === 'single_source' || sourceStatus === 'weak_source') {
    return '当前主要来自单一信源，建议等待更多来源交叉确认。'
  }
  if (ev < 55 || truth < 55) {
    return '证据或真实性分数仍偏弱，暂不宜直接下强结论。'
  }
  if (trace < 55) {
    return '来源链路完整度一般，复核时应优先核查首发与时间线。'
  }
  return '主要风险可控，但仍需关注后续修正、补充声明和反向报道。'
}

function chooseFollowUp(input: RecommendationDeepDiveInput): string {
  const given = safeText(input.nextStep, '')
  if (given) return given
  if (input.shouldTrackEvent) return '建议加入事件追踪队列，按 6-12 小时节奏复查进展。'
  if (input.shouldDeepAnalyze || (input.analysisTier ?? '').toLowerCase() === 'deep') {
    return '建议进入深度分析队列，补齐背景脉络、关键争议点和可执行判断。'
  }
  if (input.shouldEnterDailyReport) return '建议纳入今日日报，作为核心阅读条目。'
  return '建议先做轻量核查，再决定是否升级到深度处理。'
}

export function generateDeterministicDeepDive(
  input: RecommendationDeepDiveInput,
  options: DeepDiveBuildOptions = {},
): RecommendationDeepDive {
  const generatedAt = (options.now ?? new Date()).toISOString()
  const model = safeText(options.model, 'deterministic-v1', 40) || 'deterministic-v1'

  const title = safeText(input.title, '该条信息', 120)
  const summary = safeText(input.summary, '', 220)
  const source = safeText(input.sourceName || input.source, '未知来源', 80)
  const sourceTier = safeText(input.sourceTier, 'C', 2).toUpperCase()
  const category = safeText(input.category, '其他', 24)
  const tierLabel = toTierLabel(input.recommendationTier)
  const sourceStatusLabel = toSourceStatusLabel(input.sourceStatus)
  const finalScore = clampScore(input.finalScore)
  const evScore = clampScore(input.evScore)
  const truthScore = clampScore(input.truthScore)
  const traceScore = clampScore(input.sourceTraceScore)
  const reason = safeText(input.recommendationReason, '')
  const hasWeakInput =
    looksGarbled(input.title) ||
    (!summary && !reason && !safeText(input.nextStep, '') && !safeText(input.riskNote, ''))

  const deepSummary = joinNonEmpty([
    `${title} 被系统归类为「${tierLabel}」`,
    `综合分 ${finalScore} / 证据 ${evScore} / 真实性 ${truthScore}`,
    reason || '当前具备进入推荐层的基础价值',
  ])

  const backgroundContext = joinNonEmpty([
    `信息类别：${category}`,
    `来源：${source}（Tier ${sourceTier}）`,
    `信源状态：${sourceStatusLabel}`,
    summary || null,
  ])

  const whyItMatters = (() => {
    if (input.shouldEnterDailyReport || finalScore >= 88) {
      return '该条在价值与证据维度同时达标，适合作为今天的重点阅读和判断输入。'
    }
    if (input.shouldTrackEvent) {
      return '这条信息具备持续发酵信号，跟踪价值高于一次性阅读价值。'
    }
    if (evScore >= 65 && traceScore >= 65) {
      return '证据结构和来源链路较完整，便于快速做事实复核与观点沉淀。'
    }
    if (finalScore >= 75) {
      return '综合分达到高价值区间，适合进入今日候选列表并做二次筛查。'
    }
    return '当前更适合轻量观察，等待更多外部信号后再提升处理强度。'
  })()

  const userInsight = (() => {
    if (input.shouldDeepAnalyze) {
      return '建议优先提炼“可迁移结论”：它对你的选题、判断框架或项目策略意味着什么。'
    }
    if ((input.analysisTier ?? '').toLowerCase() === 'cluster') {
      return '这条更适合作为事件簇样本，价值在于和同类信号合并后形成趋势判断。'
    }
    if (input.shouldTrackEvent) {
      return '建议记录关键主体、时间点与后续触发条件，便于下一次更新时快速决策。'
    }
    return '建议先确认事实边界，再提炼可执行结论，避免过早放大单条信息权重。'
  })()

  const riskAndUncertainty = chooseRisk(input)
  const followUpSuggestion = chooseFollowUp(input)

  const sourceReadingGuide = (() => {
    const hasUrl = Boolean(safeText(input.originalUrl, '', 500))
    const timeHint = safeText(input.publishedAt || input.fetchedAt, '', 40)
    const openWith = hasUrl ? '先读原文标题和发布时间，再看正文证据段落。' : '先核对来源名称、发布时间与同类报道。'
    const traceHint = traceScore >= 65
      ? '来源链路较完整，可顺着首发与引用关系向上追溯。'
      : '来源链路一般，建议优先确认首发出处和关键引用。'
    return joinNonEmpty([openWith, traceHint, timeHint ? `时间线参考：${timeHint}` : null])
  })()

  const status: RecommendationDeepDive['status'] = hasWeakInput ? 'fallback' : 'generated'
  const fallbackSummary = '这条信息的原始文本质量不足，系统暂时只能根据标题、来源和已有评分做初步判断。建议先查看原文确认关键事实。'
  const fallbackBackground = '当前缺少足够干净的上下文，暂不展开完整背景判断。'
  const fallbackWhy = '它能进入推荐列表，说明在现有规则评分中具备一定信号价值，但仍需要人工复核。'
  const fallbackInsight = '建议先把它当作待核验线索，而不是直接结论。'
  const fallbackRisk = '主要风险是文本不完整、来源链路不清晰或缺少多源交叉验证。'
  const fallbackFollow = '先查看原文，再决定是否继续跟进或纳入选题池。'
  const fallbackGuide = '阅读原文时优先确认主体、发布时间、官方信息和后续跟进来源。'

  const outputSummary = status === 'fallback' ? fallbackSummary : deepSummary
  const outputBackground = status === 'fallback' ? fallbackBackground : backgroundContext
  const outputWhy = status === 'fallback' ? fallbackWhy : whyItMatters
  const outputInsight = status === 'fallback' ? fallbackInsight : userInsight
  const outputRisk = status === 'fallback' ? fallbackRisk : riskAndUncertainty
  const outputFollow = status === 'fallback' ? fallbackFollow : followUpSuggestion
  const outputGuide = status === 'fallback' ? fallbackGuide : sourceReadingGuide

  return {
    status,
    generatedAt,
    model,
    summary: outputSummary,
    deepSummary: outputSummary,
    backgroundContext: outputBackground,
    whyItMatters: outputWhy,
    userInsight: outputInsight,
    riskAndUncertainty: outputRisk,
    followUpSuggestion: outputFollow,
    sourceReadingGuide: outputGuide,
    deepDiveStatus: status,
    deepDiveGeneratedAt: generatedAt,
    deepDiveModel: model,
  }
}
