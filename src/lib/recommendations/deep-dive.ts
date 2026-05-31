import { cleanText as baseCleanText } from '@/lib/text/clean-text'
import {
  canUseDeepDiveLlm,
  getDeepDiveModel,
  getLlmConfig,
  requestDeepDiveLlmJson,
} from '@/lib/llm/deep-dive-client'
import type {
  RecommendedItem,
  RecommendationTier,
} from '@/lib/recommendations/recommendation-engine'

export type RecommendationDeepDiveStatus = 'generated' | 'fallback' | 'skipped' | 'error'
export type RecommendationDeepDiveInputQuality = 'rss_summary_only' | 'partial' | 'full_text'
export type FinalDeepDiveMode = 'llm' | 'deterministic'
export type DeepDiveContentStatus = 'full_article' | 'rss_summary' | 'title_only' | 'unknown'
export type DeepDiveQualityLevel = 'high' | 'medium' | 'low'

export type RecommendationDeepDive = {
  status: RecommendationDeepDiveStatus
  generatedAt: string
  model: string
  provider: string
  contentStatus: DeepDiveContentStatus
  oneSentence: string
  whatHappened: string
  context: string
  summary: string
  deepSummary: string
  backgroundContext: string
  whyItMatters: string
  userInsight: string
  userValue: string
  userTakeaway: string
  riskAndUncertainty: string
  uncertainty: string
  followUpSuggestion: string
  followUp: string[]
  sourceReadingGuide: string
  sourceNotes: string
  evidenceGaps: string[]
  quality: {
    specificity: DeepDiveQualityLevel
    evidenceSufficiency: DeepDiveQualityLevel
    needsHumanReview: boolean
  }
  deepDiveStatus: RecommendationDeepDiveStatus
  deepDiveGeneratedAt: string
  deepDiveModel: string
  inputQuality?: RecommendationDeepDiveInputQuality
  fallbackReason?: string | null
}

export type RecommendationDeepDiveInput = {
  title: string
  summary?: string | null
  fullContent?: string | null
  sourceName?: string | null
  source?: string | null
  sourceTier?: string | null
  category?: string | null
  tags?: string[] | null
  finalScore?: number | null
  signalScore?: number | null
  evScore?: number | null
  truthScore?: number | null
  sourceTraceScore?: number | null
  recommendationScore?: number | null
  recommendationTier?: string | null
  sourceStatus?: string | null
  recommendationReason?: string | null
  riskNote?: string | null
  nextStep?: string | null
  qualityFlags?: string[] | null
  shouldTrackEvent?: boolean | null
  shouldEnterDailyReport?: boolean | null
  shouldDeepAnalyze?: boolean | null
  analysisTier?: string | null
  analysisStage?: string | null
  publishedAt?: string | null
  fetchedAt?: string | null
  originalUrl?: string | null
  isSingleSource?: boolean | null
  hasFullContent?: boolean | null
  wordCount?: number | null
}

type DeepDiveBuildOptions = {
  now?: Date
  model?: string
  provider?: string
  status?: RecommendationDeepDiveStatus
  fallbackReason?: string | null
  inputQuality?: RecommendationDeepDiveInputQuality
  contentStatus?: DeepDiveContentStatus
}

export type DeepDiveStats = {
  total: number
  generated: number
  fallback: number
  failed: number
  model: string
  provider: string
  mode: FinalDeepDiveMode
}

export type AttachDeepDiveOptions = {
  mode?: FinalDeepDiveMode
  concurrency?: number
  targetTiers?: RecommendationTier[]
  includeSkipped?: boolean
}

const DEFAULT_MODEL = 'deterministic-v1'
const DEFAULT_PROVIDER = 'deterministic'
const FINAL_RECOMMENDATION_TIERS: RecommendationTier[] = ['must_read', 'high_value']
const MIN_TEXT_LEN = 8
const RETRYABLE_MIN_LEN = {
  oneSentence: 12,
  whatHappened: 80,
  whyItMatters: 80,
  userValue: 80,
}
const BANNED_VAGUE_PHRASES = [
  '综合评分较高',
  '证据信号充分',
  '适合今日重点阅读',
  '具有一定价值',
  '值得关注',
]
const GARBLED_SNIPPETS = ['锟', '�', '鈧', '鑺', '脙']
const RETRY_REASON_PREFIX = 'first_attempt_quality_issue'

type ParsedDeepDivePayload = {
  status: 'generated'
  model: string
  provider: string
  contentStatus: DeepDiveContentStatus
  oneSentence: string
  whatHappened: string
  context: string
  whyItMatters: string
  userValue: string
  uncertainty: string
  followUp: string[]
  sourceNotes: string
  evidenceGaps: string[]
  quality: {
    specificity: DeepDiveQualityLevel
    evidenceSufficiency: DeepDiveQualityLevel
    needsHumanReview: boolean
  }
}

function clampScore(v: number | null | undefined): number {
  const n = Number(v ?? 0)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

export function cleanText(value: string | null | undefined): string {
  return baseCleanText(value ?? '')
}

export function safeText(
  value: string | null | undefined,
  fallback = '',
  maxLen = 800,
): string {
  const text = cleanText(value)
  if (!text) return fallback
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen).trimEnd()}...`
}

function safeArray(values: string[] | null | undefined, maxItems = 8, maxLen = 120): string[] {
  if (!Array.isArray(values) || values.length === 0) return []
  return values
    .map(v => safeText(v, '', maxLen))
    .filter(Boolean)
    .slice(0, maxItems)
}

function asBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return fallback
}

function looksGarbled(text: string): boolean {
  if (!text || text.length < 2) return false
  return GARBLED_SNIPPETS.some(marker => text.includes(marker))
}

function normalizeFallbackReason(reason: string | null | undefined): string | null {
  const value = safeText(reason, '', 220)
  return value || null
}

function splitFollowUp(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map(item => safeText(String(item), '', 160))
      .filter(Boolean)
      .slice(0, 4)
  }
  if (typeof value === 'string') {
    return value
      .split(/\r?\n|[;；]/g)
      .map(item => safeText(item, '', 160))
      .filter(Boolean)
      .slice(0, 4)
  }
  return []
}

function joinFollowUp(list: string[]): string {
  if (list.length === 0) return ''
  return list.join('；')
}

function pickTime(input: RecommendationDeepDiveInput): string {
  return safeText(input.publishedAt, '') || safeText(input.fetchedAt, '') || '未知时间'
}

function inferInputQuality(input: RecommendationDeepDiveInput): RecommendationDeepDiveInputQuality {
  const summary = safeText(input.summary, '')
  const hasFullContent = Boolean(input.hasFullContent)
  const wordCount = Number(input.wordCount ?? 0)
  const ev = clampScore(input.evScore)
  const truth = clampScore(input.truthScore)

  if (hasFullContent || wordCount >= 500 || summary.length >= 260) return 'full_text'
  if (summary.length < 40 && ev < 50 && truth < 50) return 'rss_summary_only'
  return 'partial'
}

function inferContentStatus(input: RecommendationDeepDiveInput): DeepDiveContentStatus {
  const summary = safeText(input.summary, '')
  const fullContent = safeText(input.fullContent, '')
  const hasFullContent = Boolean(input.hasFullContent)
  const wordCount = Number(input.wordCount ?? 0)

  if (hasFullContent || fullContent.length >= 400 || wordCount >= 500) return 'full_article'
  if (summary.length >= 20) return 'rss_summary'
  if (safeText(input.title, '').length > 0) return 'title_only'
  return 'unknown'
}

function tierLabel(tier: string | null | undefined): string {
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

function sourceStatusLabel(status: string | null | undefined): string {
  switch ((status ?? '').toLowerCase()) {
    case 'official':
      return '官方来源'
    case 'user_curated':
      return '用户重点来源'
    case 'multi_source':
      return '多源交叉'
    case 'single_source':
      return '单一来源'
    case 'weak_source':
      return '弱来源'
    default:
      return '来源状态未知'
  }
}

function fallbackReasonFromInput(input: RecommendationDeepDiveInput): string {
  const summary = safeText(input.summary, '')
  if (!summary) return '原始摘要为空，仅能基于标题和结构化字段生成规则解读。'
  if (summary.length < 30) return '摘要较短，仅能生成轻量规则解读。'
  return '模型结果不稳定，已切换规则解读保障可读性。'
}

function buildDeterministicFollowUp(input: RecommendationDeepDiveInput): string[] {
  if (input.nextStep) {
    return splitFollowUp(input.nextStep)
  }
  if (input.shouldTrackEvent) {
    return [
      '6-12 小时内复查是否出现第二来源复述同一关键事实。',
      '优先确认当事主体是否发布正式说明或技术文档。',
      '观察是否出现可量化影响信号（用户规模、价格、API 变更、生态响应）。',
    ]
  }
  if (input.shouldDeepAnalyze) {
    return [
      '补齐事件时间线，区分“已发生事实”与“媒体解读”。',
      '至少补一条独立来源，避免单源叙事偏差。',
      '如果影响你当前选题，整理成 3 条可执行判断再进入后续写作。',
    ]
  }
  return [
    '先核对原文中的主体、动作、时间和证据出处。',
    '若 24 小时内无新增证据，暂不升级为长期趋势判断。',
  ]
}

function buildDeterministicContent(input: RecommendationDeepDiveInput) {
  const title = safeText(input.title, '该条信息', 140)
  const summary = safeText(input.summary, '', 600)
  const sourceName = safeText(input.sourceName || input.source, '未知来源', 80)
  const sourceTier = safeText(input.sourceTier, 'C', 4).toUpperCase()
  const category = safeText(input.category, '其他', 40)
  const recTier = tierLabel(input.recommendationTier)
  const sourceStatus = sourceStatusLabel(input.sourceStatus)
  const signal = clampScore(input.signalScore)
  const finalScore = clampScore(input.finalScore)
  const evidence = clampScore(input.evScore)
  const recommendation = clampScore(input.recommendationScore)
  const truth = clampScore(input.truthScore)
  const isSingleSource = Boolean(input.isSingleSource) || (input.sourceStatus ?? '') === 'single_source'
  const contentStatus = inferContentStatus(input)
  const followUpList = buildDeterministicFollowUp(input)

  const oneSentence = safeText(
    input.recommendationReason,
    `${title} 属于${recTier}信号，但关键结论仍需持续核验。`,
    60,
  )

  const whatHappened = summary || `${title} 当前可见信息有限，系统仅能确认其进入推荐候选。`

  const context = [
    `来源为 ${sourceName}（Tier ${sourceTier}，${sourceStatus}），分类 ${category}，时间 ${pickTime(input)}。`,
    '这条信息被纳入最终推荐，意味着它在当前窗口内具有一定的行业判断价值，但不代表结论已经闭环。',
    contentStatus === 'full_article'
      ? '当前有较完整正文支持，可做更细化分析。'
      : '当前主要基于标题/摘要，细节证据仍然不足。',
  ].join(' ')

  const whyItMatters = (() => {
    if (input.shouldEnterDailyReport || finalScore >= 88) {
      return '它可能影响你今天的信息优先级：不仅是“发生了什么”，更重要的是它是否代表供给侧、产品策略或生态竞争的真实变化。'
    }
    if (input.shouldTrackEvent) {
      return '它的价值在于后续演进。若后续主体动作和外部反馈连续出现，这条线索可能从“单点消息”升级为“事件链”。'
    }
    if (signal >= 70 || recommendation >= 75) {
      return '它可能成为你判断 AI 行业节奏的样本：看似单条新闻，但背后可能映射技术路线、商业化路径或平台策略变化。'
    }
    return '它暂时更像“需要复核的候选信号”，价值来自后续验证，而不是当前文本本身。'
  })()

  const userValue = (() => {
    if (input.shouldDeepAnalyze) {
      return '可把它作为选题素材：围绕“事实-推断-不确定性”整理成短评框架，再和同主题信息比对，输出更稳定的判断。'
    }
    return '对你的信息雷达价值在于：它提供了一个可追踪的观察点，你可以据此判断行业叙事是否继续强化，还是很快回落为短期噪音。'
  })()

  const uncertainty = [
    isSingleSource ? '当前偏单一来源，存在叙事偏差风险。' : null,
    contentStatus !== 'full_article' ? '当前缺少完整正文，细节判断受限。' : null,
    evidence < 55 || truth < 55 ? '证据/真实性基础偏弱，结论应保守。' : null,
    input.riskNote ? safeText(input.riskNote, '', 240) : null,
  ].filter(Boolean).join(' ')

  const sourceNotes = `当前依据来自 ${sourceName}（Tier ${sourceTier}）及其摘要字段。`
  const evidenceGaps = [
    contentStatus !== 'full_article' ? '缺少全文关键段落与引用上下文。' : '',
    isSingleSource ? '缺少至少一条独立来源交叉验证。' : '',
    '缺少后续主体公告或可量化结果信号。',
  ].filter(Boolean)

  const specificity: DeepDiveQualityLevel = summary.length > 240 ? 'medium' : 'low'
  const evidenceSufficiency: DeepDiveQualityLevel = contentStatus === 'full_article' ? 'medium' : 'low'

  return {
    contentStatus,
    oneSentence,
    whatHappened,
    context,
    whyItMatters,
    userValue,
    uncertainty: uncertainty || '当前信息仍有不确定性，建议保持保守判断。',
    followUp: followUpList,
    sourceNotes,
    evidenceGaps,
    quality: {
      specificity,
      evidenceSufficiency,
      needsHumanReview: true,
    },
  }
}

function buildDeepDive(
  fields: Omit<RecommendationDeepDive, 'deepDiveStatus' | 'deepDiveGeneratedAt' | 'deepDiveModel'>,
): RecommendationDeepDive {
  const followUp = fields.followUp.length > 0 ? fields.followUp : splitFollowUp(fields.followUpSuggestion)
  const followUpSuggestion = fields.followUpSuggestion || joinFollowUp(followUp)
  const oneSentence = safeText(fields.oneSentence || fields.summary, '', 120)
  const whatHappened = safeText(fields.whatHappened || fields.backgroundContext, '')
  const context = safeText(fields.context || fields.backgroundContext, '')
  const userValue = safeText(fields.userValue || fields.userInsight, '')
  const uncertainty = safeText(fields.uncertainty || fields.riskAndUncertainty, '')
  const sourceNotes = safeText(fields.sourceNotes || fields.sourceReadingGuide, '')
  const evidenceGaps = safeArray(fields.evidenceGaps, 8, 160)

  return {
    ...fields,
    oneSentence,
    whatHappened,
    context,
    summary: oneSentence || fields.summary,
    deepSummary: oneSentence || fields.deepSummary,
    backgroundContext: context || fields.backgroundContext,
    userInsight: userValue || fields.userInsight,
    userValue,
    userTakeaway: userValue,
    riskAndUncertainty: uncertainty || fields.riskAndUncertainty,
    uncertainty,
    followUp,
    followUpSuggestion,
    sourceNotes: sourceNotes || fields.sourceNotes,
    sourceReadingGuide: sourceNotes || fields.sourceReadingGuide,
    evidenceGaps,
    deepDiveStatus: fields.status,
    deepDiveGeneratedAt: fields.generatedAt,
    deepDiveModel: fields.model,
    quality: {
      specificity: fields.quality.specificity,
      evidenceSufficiency: fields.quality.evidenceSufficiency,
      needsHumanReview: fields.quality.needsHumanReview,
    },
  }
}

function normalizeLlmField(raw: unknown, fallback: string, maxLen = 1800): string {
  if (typeof raw !== 'string') return fallback
  const text = safeText(raw, '', maxLen)
  if (text.length < MIN_TEXT_LEN) return fallback
  return text
}

function normalizeLlmLevel(raw: unknown, fallback: DeepDiveQualityLevel): DeepDiveQualityLevel {
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw
  return fallback
}

function normalizeContentStatus(raw: unknown, fallback: DeepDiveContentStatus): DeepDiveContentStatus {
  if (raw === 'full_article' || raw === 'rss_summary' || raw === 'title_only' || raw === 'unknown') {
    return raw
  }
  return fallback
}

function hasVaguePhrase(text: string): boolean {
  return BANNED_VAGUE_PHRASES.some(phrase => text.includes(phrase))
}

function hasConcreteSignals(text: string): boolean {
  return /[A-Za-z0-9\u4e00-\u9fa5]{2,}/.test(text) && (
    text.includes('发布') ||
    text.includes('推出') ||
    text.includes('上线') ||
    text.includes('收购') ||
    text.includes('融资') ||
    text.includes('模型') ||
    text.includes('产品') ||
    text.includes('公司') ||
    text.includes('平台')
  )
}

function validateLlmPayload(payload: Record<string, unknown>): {
  ok: boolean
  retryable: boolean
  reason: string | null
} {
  const requiredStrings: Array<keyof ParsedDeepDivePayload> = [
    'oneSentence',
    'whatHappened',
    'context',
    'whyItMatters',
    'userValue',
    'uncertainty',
    'sourceNotes',
  ]

  for (const key of requiredStrings) {
    const value = payload[key]
    if (typeof value !== 'string' || safeText(value, '').length < MIN_TEXT_LEN) {
      return { ok: false, retryable: true, reason: `missing_or_short_${String(key)}` }
    }
  }

  const followUp = splitFollowUp(payload.followUp)
  if (followUp.length < 2) {
    return { ok: false, retryable: true, reason: 'followup_too_short' }
  }

  const evidenceGaps = Array.isArray(payload.evidenceGaps)
    ? (payload.evidenceGaps as unknown[]).map(v => safeText(String(v), '', 160)).filter(Boolean)
    : []
  if (evidenceGaps.length < 1) {
    return { ok: false, retryable: true, reason: 'evidence_gaps_missing' }
  }

  const oneSentence = safeText(payload.oneSentence as string, '', 120)
  const whatHappened = safeText(payload.whatHappened as string, '')
  const whyItMatters = safeText(payload.whyItMatters as string, '')
  const userValue = safeText(payload.userValue as string, '')
  const uncertainty = safeText(payload.uncertainty as string, '')

  if (
    oneSentence.length < RETRYABLE_MIN_LEN.oneSentence ||
    whatHappened.length < RETRYABLE_MIN_LEN.whatHappened ||
    whyItMatters.length < RETRYABLE_MIN_LEN.whyItMatters ||
    userValue.length < RETRYABLE_MIN_LEN.userValue
  ) {
    return { ok: false, retryable: true, reason: 'content_too_short' }
  }

  const critical = [oneSentence, whatHappened, whyItMatters, userValue, uncertainty].join('\n')
  if (looksGarbled(critical)) {
    return { ok: false, retryable: true, reason: 'garbled_content' }
  }

  const vagueCount = [oneSentence, whatHappened, whyItMatters, userValue].filter(hasVaguePhrase).length
  if (vagueCount >= 2 && !hasConcreteSignals(whatHappened)) {
    return { ok: false, retryable: true, reason: 'vague_content' }
  }

  return { ok: true, retryable: false, reason: null }
}

function buildLlmSystemPrompt(): string {
  return [
    '你是一个给个人 AI 信息雷达写“站内深度解读卡片”的信息分析员。你的任务不是复述新闻，而是帮助用户判断：这条信息到底是什么，为什么重要，是否值得今天花时间读，后面应该追踪什么。',
    '写作要求：',
    '- 使用简体中文。',
    '- 语气像冷静的信息分析师，不要营销腔，不要 AI 模板腔。',
    '- 只基于输入材料分析，不要编造事实、数据、人物观点、公司行动或市场反应。',
    '- 如果材料不足，必须明确说材料不足。',
    '- 区分“已发生事实”和“基于材料的推断”。',
    '- 避免空话：综合评分较高、证据信号充分、适合重点阅读、具有一定价值、值得关注。',
    '- 不要写成新闻稿、投资建议或学术论文。',
    '- 输出必须是合法 JSON。不要 Markdown、不要代码块、不要额外解释。',
    'JSON Schema:',
    '{',
    '  "status": "generated",',
    '  "model": string,',
    '  "provider": string,',
    '  "contentStatus": "full_article" | "rss_summary" | "title_only" | "unknown",',
    '  "oneSentence": string,',
    '  "whatHappened": string,',
    '  "context": string,',
    '  "whyItMatters": string,',
    '  "userValue": string,',
    '  "uncertainty": string,',
    '  "followUp": string[],',
    '  "sourceNotes": string,',
    '  "evidenceGaps": string[],',
    '  "quality": {',
    '    "specificity": "high" | "medium" | "low",',
    '    "evidenceSufficiency": "high" | "medium" | "low",',
    '    "needsHumanReview": boolean',
    '  }',
    '}',
  ].join('\n')
}

function buildLlmUserPrompt(input: RecommendationDeepDiveInput, retryHint?: string): string {
  const sourceStatus = safeText(input.sourceStatus, '')
  const contentStatus = inferContentStatus(input)
  const payload: Record<string, unknown> = {
    title: safeText(input.title, '', 180) || null,
    url: safeText(input.originalUrl, '', 600) || null,
    sourceName: safeText(input.sourceName || input.source, '', 80) || null,
    sourceTier: safeText(input.sourceTier, '', 8) || null,
    category: safeText(input.category, '', 40) || null,
    publishedAt: safeText(input.publishedAt, '', 40) || null,
    fetchedAt: safeText(input.fetchedAt, '', 40) || null,
    summary: safeText(input.summary, '', 1200) || null,
    fullContent: safeText(input.fullContent, '', 4000) || null,
    recommendationTier: safeText(input.recommendationTier, '', 20) || null,
    recommendationReason: safeText(input.recommendationReason, '', 400) || null,
    riskNote: safeText(input.riskNote, '', 320) || null,
    nextStep: safeText(input.nextStep, '', 320) || null,
    finalScore: input.finalScore ?? null,
    signalScore: input.signalScore ?? null,
    evidenceScore: input.evScore ?? null,
    recommendationScore: input.recommendationScore ?? null,
    qualityFlags: safeArray(input.qualityFlags, 12, 80),
    sourceStatus: sourceStatus || null,
    isSingleSource: Boolean(input.isSingleSource) || sourceStatus === 'single_source',
    hasFullContent: Boolean(input.hasFullContent),
    inferredContentStatus: contentStatus,
  }

  const instruction = [
    '请基于以下结构化输入，输出一份“站内深度解读卡片” JSON。',
    '要求：',
    '- oneSentence 不超过 60 个中文字符。',
    '- whatHappened/whyItMatters/userValue 要具体，不要空话。',
    '- followUp 给 2-4 条可执行追踪信号。',
    '- evidenceGaps 至少 1 条。',
    '- 若无全文，请明确“目前只能基于标题/摘要判断”。',
    '- 目标篇幅建议 700-1200 中文字。',
  ]

  if (retryHint) {
    instruction.push(`补充要求：上一次输出问题是 ${retryHint}，这次请提高具体性并确保字段完整。`)
  }

  return `${instruction.join('\n')}\n输入数据:\n${JSON.stringify(payload, null, 2)}`
}

function parseLlmDeepDivePayload(
  payload: Record<string, unknown>,
  input: RecommendationDeepDiveInput,
  model: string,
  provider: string,
  now: Date,
): RecommendationDeepDive {
  const fallback = buildDeterministicContent(input)
  const generatedAt = now.toISOString()
  const followUp = splitFollowUp(payload.followUp)
  const evidenceGaps = Array.isArray(payload.evidenceGaps)
    ? (payload.evidenceGaps as unknown[]).map(v => safeText(String(v), '', 180)).filter(Boolean).slice(0, 8)
    : fallback.evidenceGaps
  const rawQuality = payload.quality && typeof payload.quality === 'object'
    ? payload.quality as Record<string, unknown>
    : {}

  const parsed: ParsedDeepDivePayload = {
    status: 'generated',
    model: safeText(model, 'llm', 80) || 'llm',
    provider: safeText(provider, 'unknown', 40) || 'unknown',
    contentStatus: normalizeContentStatus(payload.contentStatus, fallback.contentStatus),
    oneSentence: normalizeLlmField(payload.oneSentence, fallback.oneSentence, 180),
    whatHappened: normalizeLlmField(payload.whatHappened, fallback.whatHappened, 2600),
    context: normalizeLlmField(payload.context, fallback.context, 2200),
    whyItMatters: normalizeLlmField(payload.whyItMatters, fallback.whyItMatters, 2000),
    userValue: normalizeLlmField(payload.userValue, fallback.userValue, 2000),
    uncertainty: normalizeLlmField(payload.uncertainty, fallback.uncertainty, 1800),
    followUp: followUp.length > 0 ? followUp : fallback.followUp,
    sourceNotes: normalizeLlmField(payload.sourceNotes, fallback.sourceNotes, 1200),
    evidenceGaps: evidenceGaps.length > 0 ? evidenceGaps : fallback.evidenceGaps,
    quality: {
      specificity: normalizeLlmLevel(rawQuality.specificity, 'medium'),
      evidenceSufficiency: normalizeLlmLevel(rawQuality.evidenceSufficiency, 'medium'),
      needsHumanReview: asBool(rawQuality.needsHumanReview, false),
    },
  }

  return buildDeepDive({
    status: 'generated',
    generatedAt,
    model: safeText(model, 'llm', 80) || 'llm',
    provider: safeText(provider, 'unknown', 40) || 'unknown',
    contentStatus: parsed.contentStatus,
    oneSentence: parsed.oneSentence,
    whatHappened: parsed.whatHappened,
    context: parsed.context,
    summary: parsed.oneSentence,
    deepSummary: parsed.oneSentence,
    backgroundContext: parsed.context,
    whyItMatters: parsed.whyItMatters,
    userInsight: parsed.userValue,
    userValue: parsed.userValue,
    userTakeaway: parsed.userValue,
    riskAndUncertainty: parsed.uncertainty,
    uncertainty: parsed.uncertainty,
    followUpSuggestion: joinFollowUp(parsed.followUp),
    followUp: parsed.followUp,
    sourceReadingGuide: parsed.sourceNotes,
    sourceNotes: parsed.sourceNotes,
    evidenceGaps: parsed.evidenceGaps,
    quality: parsed.quality,
    inputQuality: inferInputQuality(input),
    fallbackReason: null,
  })
}

function validateFinalDeepDiveContent(deepDive: RecommendationDeepDive): {
  ok: boolean
  retryable: boolean
  reason: string | null
} {
  const payload: Record<string, unknown> = {
    oneSentence: deepDive.oneSentence,
    whatHappened: deepDive.whatHappened,
    context: deepDive.context,
    whyItMatters: deepDive.whyItMatters,
    userValue: deepDive.userValue,
    uncertainty: deepDive.uncertainty,
    sourceNotes: deepDive.sourceNotes,
    followUp: deepDive.followUp,
    evidenceGaps: deepDive.evidenceGaps,
  }
  return validateLlmPayload(payload)
}

export function shouldGenerateDeepDiveForTier(
  tier: string | null | undefined,
  targetTiers: RecommendationTier[] = FINAL_RECOMMENDATION_TIERS,
): boolean {
  if (!tier) return false
  return targetTiers.includes(tier as RecommendationTier)
}

export function buildDeepDiveInputFromRecommendedItem(item: RecommendedItem): RecommendationDeepDiveInput {
  return {
    title: item.title,
    summary: item.summary,
    source: item.source,
    sourceTier: item.sourceTier,
    category: item.category,
    tags: item.tags,
    finalScore: item.finalScore,
    signalScore: item.signalScore,
    evScore: item.evScore,
    truthScore: item.truthScore,
    recommendationScore: item.recommendationScore,
    recommendationTier: item.recommendationTier,
    sourceStatus: item.sourceStatus,
    recommendationReason: item.recommendationReason,
    riskNote: item.riskNote,
    nextStep: item.nextStep,
    qualityFlags: item.qualityFlags,
    shouldTrackEvent: item.shouldTrackEvent,
    shouldEnterDailyReport: item.shouldEnterDailyReport,
    shouldDeepAnalyze: item.shouldDeepAnalyze,
    analysisTier: item.analysisTier,
    publishedAt: item.publishedAt,
    fetchedAt: item.fetchedAt,
    originalUrl: item.originalUrl,
    isSingleSource: item.sourceStatus === 'single_source',
    hasFullContent: (item.wordCount ?? 0) >= 500,
    wordCount: item.wordCount,
  }
}

export function generateDeterministicDeepDive(
  input: RecommendationDeepDiveInput,
  options: DeepDiveBuildOptions = {},
): RecommendationDeepDive {
  const generatedAt = (options.now ?? new Date()).toISOString()
  const model = safeText(options.model, DEFAULT_MODEL, 80) || DEFAULT_MODEL
  const provider = safeText(options.provider, DEFAULT_PROVIDER, 40) || DEFAULT_PROVIDER
  const status = options.status ?? 'generated'
  const inputQuality = options.inputQuality ?? inferInputQuality(input)
  const fallbackReason = normalizeFallbackReason(options.fallbackReason)
  const content = buildDeterministicContent(input)

  return buildDeepDive({
    status,
    generatedAt,
    model,
    provider,
    contentStatus: options.contentStatus ?? content.contentStatus,
    oneSentence: content.oneSentence,
    whatHappened: content.whatHappened,
    context: content.context,
    summary: content.oneSentence,
    deepSummary: content.oneSentence,
    backgroundContext: content.context,
    whyItMatters: content.whyItMatters,
    userInsight: content.userValue,
    userValue: content.userValue,
    userTakeaway: content.userValue,
    riskAndUncertainty: content.uncertainty,
    uncertainty: content.uncertainty,
    followUpSuggestion: joinFollowUp(content.followUp),
    followUp: content.followUp,
    sourceReadingGuide: content.sourceNotes,
    sourceNotes: content.sourceNotes,
    evidenceGaps: content.evidenceGaps,
    quality: content.quality,
    inputQuality,
    fallbackReason,
  })
}

export function generateSkippedDeepDive(
  input: RecommendationDeepDiveInput,
  options: Pick<DeepDiveBuildOptions, 'now'> = {},
): RecommendationDeepDive {
  const generatedAt = (options.now ?? new Date()).toISOString()
  const oneSentence = '该条目未进入最终推荐名单，本轮不生成站内深度解读。'

  return buildDeepDive({
    status: 'skipped',
    generatedAt,
    model: 'skipped',
    provider: 'none',
    contentStatus: inferContentStatus(input),
    oneSentence,
    whatHappened: oneSentence,
    context: '仅保留原文跳转，不占用深度解读预算。',
    summary: oneSentence,
    deepSummary: oneSentence,
    backgroundContext: '仅保留原文跳转，不占用深度解读预算。',
    whyItMatters: '深度解读仅面向 must_read / high_value 条目。',
    userInsight: '可先放入观察池，等待更多证据再升级。',
    userValue: '可先放入观察池，等待更多证据再升级。',
    userTakeaway: '可先放入观察池，等待更多证据再升级。',
    riskAndUncertainty: '单条观察信息不宜提前给出强结论。',
    uncertainty: '单条观察信息不宜提前给出强结论。',
    followUpSuggestion: '继续观察后续增量信号。',
    followUp: ['继续观察是否出现增量证据或多源确认。'],
    sourceReadingGuide: '仅在需要人工核查时查看原文。',
    sourceNotes: '当前未生成深度解读。',
    evidenceGaps: ['缺少最终推荐等级，不触发深度解读。'],
    quality: {
      specificity: 'low',
      evidenceSufficiency: 'low',
      needsHumanReview: false,
    },
    inputQuality: inferInputQuality(input),
    fallbackReason: null,
  })
}

async function mapWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  const limit = Math.max(1, Math.min(concurrency, 8))
  const results: T[] = new Array(tasks.length)
  let cursor = 0

  async function worker(): Promise<void> {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= tasks.length) return
      results[index] = await tasks[index]()
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker())
  await Promise.all(workers)
  return results
}

export async function generateFinalDeepDive(
  input: RecommendationDeepDiveInput,
  options: {
    mode?: FinalDeepDiveMode
    now?: Date
  } = {},
): Promise<RecommendationDeepDive> {
  const mode = options.mode ?? 'llm'
  const now = options.now ?? new Date()

  if (mode === 'deterministic') {
    return generateDeterministicDeepDive(input, {
      now,
      model: DEFAULT_MODEL,
      provider: DEFAULT_PROVIDER,
      status: 'generated',
    })
  }

  const llmConfig = getLlmConfig()
  const deepDiveModel = getDeepDiveModel(llmConfig)
  if (!canUseDeepDiveLlm(llmConfig)) {
    return generateDeterministicDeepDive(input, {
      now,
      model: DEFAULT_MODEL,
      provider: DEFAULT_PROVIDER,
      status: 'fallback',
      fallbackReason: 'LLM disabled or missing API key',
      inputQuality: inferInputQuality(input),
    })
  }

  const attempt = async (retryHint?: string) => {
    const response = await requestDeepDiveLlmJson({
      messages: [
        { role: 'system', content: buildLlmSystemPrompt() },
        { role: 'user', content: buildLlmUserPrompt(input, retryHint) },
      ],
      temperature: 0.2,
      model: deepDiveModel,
      modelKind: 'deepdive',
    }, llmConfig)

    if (!response.ok || !response.json) {
      return { response, deepDive: null as RecommendationDeepDive | null, reason: response.error ?? 'llm_request_failed', retryable: false }
    }

    const structural = validateLlmPayload(response.json)
    if (!structural.ok) {
      return { response, deepDive: null as RecommendationDeepDive | null, reason: structural.reason ?? 'invalid_payload', retryable: structural.retryable }
    }

    const parsed = parseLlmDeepDivePayload(response.json, input, response.model, response.provider, now)
    const quality = validateFinalDeepDiveContent(parsed)
    if (!quality.ok) {
      return { response, deepDive: null as RecommendationDeepDive | null, reason: quality.reason ?? 'quality_failed', retryable: quality.retryable }
    }

    return { response, deepDive: parsed, reason: null, retryable: false }
  }

  const first = await attempt()
  if (first.deepDive) return first.deepDive
  if (first.reason?.startsWith('missing_or_short_')) {
    return generateDeterministicDeepDive(input, {
      now,
      model: DEFAULT_MODEL,
      provider: DEFAULT_PROVIDER,
      status: 'fallback',
      fallbackReason: `parse_or_required_field_failed:${first.reason}`,
      inputQuality: inferInputQuality(input),
    })
  }

  if (first.retryable) {
    const second = await attempt(`${RETRY_REASON_PREFIX}:${first.reason}`)
    if (second.deepDive) return second.deepDive
    return generateDeterministicDeepDive(input, {
      now,
      model: DEFAULT_MODEL,
      provider: DEFAULT_PROVIDER,
      status: 'fallback',
      fallbackReason: `retry_failed:${second.reason ?? first.reason ?? 'unknown'}`,
      inputQuality: inferInputQuality(input),
    })
  }

  return generateDeterministicDeepDive(input, {
    now,
    model: DEFAULT_MODEL,
    provider: DEFAULT_PROVIDER,
    status: 'fallback',
    fallbackReason: first.reason ?? 'llm_parse_failed',
    inputQuality: inferInputQuality(input),
  })
}

export async function attachDeepDivesToRecommendations(
  items: RecommendedItem[],
  options: AttachDeepDiveOptions = {},
): Promise<{
  items: RecommendedItem[]
  deepDiveStats: DeepDiveStats
}> {
  const mode = options.mode ?? 'llm'
  const targetTiers = options.targetTiers ?? FINAL_RECOMMENDATION_TIERS
  const includeSkipped = options.includeSkipped ?? true
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 2, 4))
  const llmConfig = getLlmConfig()
  const preferredModel = mode === 'llm' ? getDeepDiveModel(llmConfig) : DEFAULT_MODEL

  const output: RecommendedItem[] = items.map(item => ({ ...item }))
  const targetIndexes: number[] = []
  for (let i = 0; i < output.length; i += 1) {
    if (shouldGenerateDeepDiveForTier(output[i].recommendationTier, targetTiers)) {
      targetIndexes.push(i)
    }
  }

  let generated = 0
  let fallback = 0
  let failed = 0

  const tasks = targetIndexes.map((idx) => async () => {
    const input = buildDeepDiveInputFromRecommendedItem(output[idx])
    let deepDive: RecommendationDeepDive

    try {
      deepDive = await generateFinalDeepDive(input, { mode })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown deep dive error'
      deepDive = generateDeterministicDeepDive(input, {
        model: DEFAULT_MODEL,
        provider: DEFAULT_PROVIDER,
        status: 'fallback',
        fallbackReason: message,
        inputQuality: inferInputQuality(input),
      })
    }

    output[idx] = { ...output[idx], deepDive }
    if (deepDive.status === 'generated' && mode === 'llm') generated += 1
    else if (deepDive.status === 'error') failed += 1
    else fallback += 1
  })

  if (tasks.length > 0) {
    await mapWithConcurrency(tasks, concurrency)
  }

  if (mode === 'deterministic') {
    generated = targetIndexes.length
    fallback = 0
    failed = 0
  }

  if (includeSkipped) {
    const targetSet = new Set(targetIndexes)
    for (let i = 0; i < output.length; i += 1) {
      if (targetSet.has(i)) continue
      if (output[i].deepDive) continue
      output[i] = {
        ...output[i],
        deepDive: generateSkippedDeepDive(buildDeepDiveInputFromRecommendedItem(output[i])),
      }
    }
  }

  return {
    items: output,
    deepDiveStats: {
      total: targetIndexes.length,
      generated,
      fallback,
      failed,
      model: preferredModel,
      provider: mode === 'llm' ? llmConfig.provider : DEFAULT_PROVIDER,
      mode,
    },
  }
}

export function ensureDeterministicDeepDive(
  item: RecommendedItem,
): RecommendationDeepDive {
  if (item.deepDive) return item.deepDive
  const input = buildDeepDiveInputFromRecommendedItem(item)

  if (!shouldGenerateDeepDiveForTier(item.recommendationTier)) {
    return generateSkippedDeepDive(input)
  }

  return generateDeterministicDeepDive(input, {
    model: DEFAULT_MODEL,
    provider: DEFAULT_PROVIDER,
    status: 'generated',
    fallbackReason: fallbackReasonFromInput(input),
  })
}
