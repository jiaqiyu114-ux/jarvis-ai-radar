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

export type RecommendationDeepDive = {
  status: RecommendationDeepDiveStatus
  generatedAt: string
  model: string
  summary: string
  deepSummary: string
  backgroundContext: string
  whyItMatters: string
  userInsight: string
  userValue: string
  riskAndUncertainty: string
  uncertainty: string
  followUpSuggestion: string
  followUp: string
  sourceReadingGuide: string
  deepDiveStatus: RecommendationDeepDiveStatus
  deepDiveGeneratedAt: string
  deepDiveModel: string
  inputQuality?: RecommendationDeepDiveInputQuality
  fallbackReason?: string | null
}

export type RecommendationDeepDiveInput = {
  title: string
  summary?: string | null
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
}

type DeepDiveBuildOptions = {
  now?: Date
  model?: string
  status?: RecommendationDeepDiveStatus
  fallbackReason?: string | null
  inputQuality?: RecommendationDeepDiveInputQuality
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
const FINAL_RECOMMENDATION_TIERS: RecommendationTier[] = ['must_read', 'high_value']
const MIN_REQUIRED_TEXT_LEN = 8

const REQUIRED_LLM_FIELDS = [
  'summary',
  'backgroundContext',
  'whyItMatters',
  'userInsight',
  'riskAndUncertainty',
  'followUpSuggestion',
  'sourceReadingGuide',
] as const

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
  maxLen = 320,
): string {
  const text = cleanText(value)
  if (!text) return fallback
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen).trimEnd()}...`
}

function safeArray(values: string[] | null | undefined, maxItems = 8): string[] {
  if (!Array.isArray(values) || values.length === 0) return []
  return values
    .map(v => safeText(v, '', 40))
    .filter(Boolean)
    .slice(0, maxItems)
}

function pickTime(input: RecommendationDeepDiveInput): string {
  return safeText(input.publishedAt, '') || safeText(input.fetchedAt, '') || '未知'
}

function joinParts(parts: Array<string | null | undefined>, sep = '；'): string {
  return parts
    .map(p => safeText(p, '', 320))
    .filter(Boolean)
    .join(sep)
}

function toSourceStatusLabel(status: string | null | undefined): string {
  switch ((status ?? '').toLowerCase()) {
    case 'official':
      return '官方来源'
    case 'user_curated':
      return '用户重点来源'
    case 'multi_source':
      return '多源验证'
    case 'weak_source':
      return '来源偏弱'
    default:
      return '单源线索'
  }
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

function inferInputQuality(input: RecommendationDeepDiveInput): RecommendationDeepDiveInputQuality {
  const summary = safeText(input.summary, '')
  const ev = clampScore(input.evScore)
  const truth = clampScore(input.truthScore)

  if (summary.length < 40 && ev < 50 && truth < 50) return 'rss_summary_only'
  if (summary.length >= 180 || ev >= 70 || truth >= 70) return 'full_text'
  return 'partial'
}

function fallbackReasonFromInput(input: RecommendationDeepDiveInput): string {
  const summary = safeText(input.summary, '')
  if (!summary) return '原始摘要为空，仅能基于标题和结构化分数字段给出规则解读。'
  if (summary.length < 30) return '摘要信息较短，仅能生成轻量规则解读。'
  return '为保证稳定性，当前使用规则解读输出。'
}

function buildDeepDive(
  fields: Omit<RecommendationDeepDive, 'deepDiveStatus' | 'deepDiveGeneratedAt' | 'deepDiveModel'>,
): RecommendationDeepDive {
  const userValue = fields.userValue || fields.userInsight
  const uncertainty = fields.uncertainty || fields.riskAndUncertainty
  const followUp = fields.followUp || fields.followUpSuggestion
  return {
    ...fields,
    userValue,
    uncertainty,
    followUp,
    deepDiveStatus: fields.status,
    deepDiveGeneratedAt: fields.generatedAt,
    deepDiveModel: fields.model,
  }
}

function normalizeLlmField(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback
  const text = safeText(raw, '', 1000)
  if (text.length < MIN_REQUIRED_TEXT_LEN) return fallback
  return text
}

function normalizeFallbackReason(reason: string | null | undefined): string | null {
  const value = safeText(reason, '', 220)
  return value || null
}

function llmOutputIsComplete(payload: Record<string, unknown>): boolean {
  return REQUIRED_LLM_FIELDS.every((key) => {
    const value = payload[key]
    return typeof value === 'string' && safeText(value, '').length >= MIN_REQUIRED_TEXT_LEN
  })
}

function buildDeterministicContent(input: RecommendationDeepDiveInput) {
  const title = safeText(input.title, '该条信息', 120)
  const summary = safeText(input.summary, '', 220)
  const source = safeText(input.sourceName || input.source, '未知来源', 80)
  const sourceTier = safeText(input.sourceTier, 'C', 2).toUpperCase()
  const category = safeText(input.category, '其他', 30)
  const tierLabel = toTierLabel(input.recommendationTier)
  const sourceStatusLabel = toSourceStatusLabel(input.sourceStatus)
  const finalScore = clampScore(input.finalScore)
  const signalScore = clampScore(input.signalScore)
  const recommendationScore = clampScore(input.recommendationScore)
  const evScore = clampScore(input.evScore)
  const truthScore = clampScore(input.truthScore)
  const traceScore = clampScore(input.sourceTraceScore)
  const qualityFlags = safeArray(input.qualityFlags, 5)
  const tags = safeArray(input.tags, 5)

  const summaryText = joinParts([
    `${title} 当前被归类为「${tierLabel}」`,
    `综合分 ${finalScore}，推荐分 ${recommendationScore}，信号分 ${signalScore}`,
    input.recommendationReason || '结构化评分达到推荐阈值，具备继续处理价值。',
  ])

  const backgroundContext = joinParts([
    `来源：${source}（Tier ${sourceTier}，${sourceStatusLabel}）`,
    `类别：${category}`,
    `时间：${pickTime(input)}`,
    summary || null,
    tags.length > 0 ? `标签：${tags.join(' / ')}` : null,
  ])

  const whyItMatters = (() => {
    if (input.shouldEnterDailyReport || finalScore >= 88) {
      return '综合分和证据分同时处于较高区间，适合作为今日重点阅读信息。'
    }
    if (input.shouldTrackEvent) {
      return '该信息具备后续发酵可能，持续跟踪价值高于一次性阅读。'
    }
    if ((input.analysisTier ?? '').toLowerCase() === 'deep') {
      return '已进入深度分析候选，建议补齐背景和争议点后形成可执行结论。'
    }
    if (evScore >= 65 && truthScore >= 60) {
      return '证据与真实性基础较完整，适合进入日报候选和选题判断。'
    }
    return '当前价值初步达标，但仍需要结合后续多源信息再做强判断。'
  })()

  const userInsight = (() => {
    if (input.shouldDeepAnalyze) {
      return '可优先提炼“可迁移判断”：这条信息对你的选题、内容生产和项目方向具体意味着什么。'
    }
    if ((input.analysisTier ?? '').toLowerCase() === 'cluster') {
      return '建议与同主题信息合并观察，单条价值一般，但在事件簇内可能形成更强结论。'
    }
    return '建议先核实事实边界，再形成观点，避免把单条信息直接放大成趋势结论。'
  })()

  const riskAndUncertainty = (() => {
    if (input.riskNote) return safeText(input.riskNote, '', 320)
    if (evScore < 55 || truthScore < 55) return '证据或真实性分数偏低，结论需保守，优先等待更多来源确认。'
    if (traceScore < 55) return '来源链路完整度一般，建议优先核查首发出处和关键引用。'
    if (qualityFlags.includes('single_source')) return '当前仍偏单源信息，建议至少补一到两家独立来源交叉验证。'
    return '核心风险可控，但仍需关注后续更正、补充披露与反向报道。'
  })()

  const followUpSuggestion = (() => {
    if (input.nextStep) return safeText(input.nextStep, '', 320)
    if (input.shouldTrackEvent) return '建议加入事件跟踪列表，按 6-12 小时节奏复查关键主体和增量证据。'
    if (input.shouldDeepAnalyze) return '建议进入深度分析队列，补充背景脉络、关键争议与可执行判断。'
    if (input.shouldEnterDailyReport) return '建议纳入今日日报，作为重点阅读条目并附带核查结论。'
    return '建议先做轻量核验，确认事实后再决定是否升级处理。'
  })()

  const sourceReadingGuide = (() => {
    const tagsHint = tags.length > 0 ? `重点关注关键词：${tags.join('、')}。` : ''
    return joinParts([
      '打开原文后先核对标题、发布时间、作者/机构与首发出处。',
      '优先阅读包含具体数据、时间、主体动作和可验证引用的段落。',
      tagsHint || null,
    ], ' ')
  })()

  return {
    summaryText,
    backgroundContext,
    whyItMatters,
    userInsight,
    riskAndUncertainty,
    followUpSuggestion,
    sourceReadingGuide,
  }
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
  }
}

export function generateDeterministicDeepDive(
  input: RecommendationDeepDiveInput,
  options: DeepDiveBuildOptions = {},
): RecommendationDeepDive {
  const generatedAt = (options.now ?? new Date()).toISOString()
  const model = safeText(options.model, DEFAULT_MODEL, 80) || DEFAULT_MODEL
  const status = options.status ?? 'generated'
  const inputQuality = options.inputQuality ?? inferInputQuality(input)
  const fallbackReason = normalizeFallbackReason(options.fallbackReason)

  const content = buildDeterministicContent(input)

  return buildDeepDive({
    status,
    generatedAt,
    model,
    summary: content.summaryText,
    deepSummary: content.summaryText,
    backgroundContext: content.backgroundContext,
    whyItMatters: content.whyItMatters,
    userInsight: content.userInsight,
    userValue: content.userInsight,
    riskAndUncertainty: content.riskAndUncertainty,
    uncertainty: content.riskAndUncertainty,
    followUpSuggestion: content.followUpSuggestion,
    followUp: content.followUpSuggestion,
    sourceReadingGuide: content.sourceReadingGuide,
    inputQuality,
    fallbackReason,
  })
}

export function generateSkippedDeepDive(
  input: RecommendationDeepDiveInput,
  options: Pick<DeepDiveBuildOptions, 'now'> = {},
): RecommendationDeepDive {
  const generatedAt = (options.now ?? new Date()).toISOString()
  const summary = '该条目未进入最终推荐名单，本轮不生成站内深度解读。'

  return buildDeepDive({
    status: 'skipped',
    generatedAt,
    model: 'skipped',
    summary,
    deepSummary: summary,
    backgroundContext: '如需进一步判断，请直接查看原文并等待后续多源信号。',
    whyItMatters: '当前优先把深度解读资源用于 must_read 与 high_value 条目。',
    userInsight: '可先保留这条信息在线索池中，后续再根据证据强度升级处理。',
    userValue: '可先保留这条信息在线索池中，后续再根据证据强度升级处理。',
    riskAndUncertainty: '单条观察信息不宜过早形成强结论。',
    uncertainty: '单条观察信息不宜过早形成强结论。',
    followUpSuggestion: '建议继续观察是否出现权威来源补充、二次传播和反向证据。',
    followUp: '建议继续观察是否出现权威来源补充、二次传播和反向证据。',
    sourceReadingGuide: '仅在你需要人工核查时打开原文，不占用本轮深度解读预算。',
    inputQuality: inferInputQuality(input),
    fallbackReason: null,
  })
}

function buildLlmSystemPrompt(): string {
  return [
    '你是 AI 信息雷达系统的深度解读助手。',
    '只允许输出 JSON 对象，不要输出 Markdown、代码块、解释性前后缀。',
    '输出语言必须是中文，语气客观、克制、可核验。',
    '不要营销腔，不要重复标题，不要虚构公司、数字、发布时间、融资金额或人物。',
    '如果输入只有 RSS 摘要，必须明确“基于当前摘要判断”。',
    '不要把“用户爱不爱看”当成推荐理由，重点围绕真实性、证据、行业价值与判断价值。',
    '当证据不足时必须降低语气强度，并明确不确定性。',
  ].join('\n')
}

function buildLlmUserPrompt(input: RecommendationDeepDiveInput): string {
  const payload: Record<string, unknown> = {
    title: safeText(input.title, '', 180) || null,
    summary: safeText(input.summary, '', 600) || null,
    sourceName: safeText(input.sourceName || input.source, '', 80) || null,
    sourceTier: safeText(input.sourceTier, '', 8) || null,
    category: safeText(input.category, '', 40) || null,
    publishedAt: safeText(input.publishedAt, '', 40) || null,
    url: safeText(input.originalUrl, '', 500) || null,
    finalScore: input.finalScore ?? null,
    signalScore: input.signalScore ?? null,
    evidenceScore: input.evScore ?? null,
    truthScore: input.truthScore ?? null,
    sourceTraceScore: input.sourceTraceScore ?? null,
    recommendationScore: input.recommendationScore ?? null,
    recommendationTier: safeText(input.recommendationTier, '', 20) || null,
    recommendationReason: safeText(input.recommendationReason, '', 240) || null,
    riskNote: safeText(input.riskNote, '', 240) || null,
    nextStep: safeText(input.nextStep, '', 240) || null,
    sourceStatus: safeText(input.sourceStatus, '', 40) || null,
    qualityFlags: safeArray(input.qualityFlags, 8),
    tags: safeArray(input.tags, 8),
  }

  return [
    '请基于以下输入生成深度解读。',
    '严格返回 JSON 对象，字段必须完整：',
    '{',
    '  "summary": "...",',
    '  "backgroundContext": "...",',
    '  "whyItMatters": "...",',
    '  "userInsight": "...",',
    '  "riskAndUncertainty": "...",',
    '  "followUpSuggestion": "...",',
    '  "sourceReadingGuide": "..."',
    '}',
    '输入数据：',
    JSON.stringify(payload, null, 2),
  ].join('\n')
}

function parseLlmDeepDivePayload(
  payload: Record<string, unknown>,
  input: RecommendationDeepDiveInput,
  model: string,
  now: Date,
): RecommendationDeepDive {
  const generatedAt = now.toISOString()
  const fallbackContent = buildDeterministicContent(input)

  const summary = normalizeLlmField(payload.summary, fallbackContent.summaryText)
  const backgroundContext = normalizeLlmField(payload.backgroundContext, fallbackContent.backgroundContext)
  const whyItMatters = normalizeLlmField(payload.whyItMatters, fallbackContent.whyItMatters)
  const userInsight = normalizeLlmField(payload.userInsight, fallbackContent.userInsight)
  const riskAndUncertainty = normalizeLlmField(payload.riskAndUncertainty, fallbackContent.riskAndUncertainty)
  const followUpSuggestion = normalizeLlmField(payload.followUpSuggestion, fallbackContent.followUpSuggestion)
  const sourceReadingGuide = normalizeLlmField(payload.sourceReadingGuide, fallbackContent.sourceReadingGuide)

  return buildDeepDive({
    status: 'generated',
    generatedAt,
    model: safeText(model, 'llm', 80) || 'llm',
    summary,
    deepSummary: summary,
    backgroundContext,
    whyItMatters,
    userInsight,
    userValue: userInsight,
    riskAndUncertainty,
    uncertainty: riskAndUncertainty,
    followUpSuggestion,
    followUp: followUpSuggestion,
    sourceReadingGuide,
    inputQuality: inferInputQuality(input),
    fallbackReason: null,
  })
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
      status: 'generated',
    })
  }

  const llmConfig = getLlmConfig()
  const deepDiveModel = getDeepDiveModel(llmConfig)
  if (!canUseDeepDiveLlm(llmConfig)) {
    return generateDeterministicDeepDive(input, {
      now,
      model: DEFAULT_MODEL,
      status: 'fallback',
      fallbackReason: 'LLM disabled or missing API key',
      inputQuality: inferInputQuality(input),
    })
  }

  const response = await requestDeepDiveLlmJson({
    messages: [
      { role: 'system', content: buildLlmSystemPrompt() },
      { role: 'user', content: buildLlmUserPrompt(input) },
    ],
    temperature: 0.2,
    model: deepDiveModel,
    modelKind: 'deepdive',
  }, llmConfig)

  if (!response.ok || !response.json) {
    return generateDeterministicDeepDive(input, {
      now,
      model: DEFAULT_MODEL,
      status: 'fallback',
      fallbackReason: response.error || 'LLM request failed',
      inputQuality: inferInputQuality(input),
    })
  }

  if (!llmOutputIsComplete(response.json)) {
    return generateDeterministicDeepDive(input, {
      now,
      model: DEFAULT_MODEL,
      status: 'fallback',
      fallbackReason: 'Model output JSON fields are incomplete',
      inputQuality: inferInputQuality(input),
    })
  }

  try {
    return parseLlmDeepDivePayload(response.json, input, response.model, now)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Model output parse error'
    return generateDeterministicDeepDive(input, {
      now,
      model: DEFAULT_MODEL,
      status: 'fallback',
      fallbackReason: message,
      inputQuality: inferInputQuality(input),
    })
  }
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
      provider: mode === 'llm' ? llmConfig.provider : 'deterministic',
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
    status: 'generated',
    fallbackReason: fallbackReasonFromInput(input),
  })
}
