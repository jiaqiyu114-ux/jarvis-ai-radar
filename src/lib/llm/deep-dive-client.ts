type ChatMessage = {
  role: 'system' | 'user'
  content: string
}

export type LlmModelKind = 'fast' | 'pro' | 'deepdive'

export type LlmConfig = {
  enabled: boolean
  provider: string
  apiKey: string | null
  baseUrl: string
  defaultModel: string
  fastModel: string
  proModel: string
  timeoutMs: number
  maxOutputTokens: number
}

export type DeepDiveLlmRequest = {
  messages: ChatMessage[]
  temperature?: number
  model?: string
  modelKind?: LlmModelKind
}

export type DeepDiveLlmResponse = {
  ok: boolean
  model: string
  provider: string
  durationMs: number
  rawText: string | null
  json: Record<string, unknown> | null
  error: string | null
}

const DEFAULT_MODEL = 'deepseek-reasoner'
const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_TIMEOUT = 45_000
const DEFAULT_MAX_OUTPUT = 1800

function parseBool(v: string | undefined): boolean {
  return (v ?? '').trim().toLowerCase() === 'true'
}

function parsePositiveInt(v: string | undefined, fallback: number): number {
  const n = Number(v ?? '')
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.round(n)
}

function trimTrailingSlash(v: string): string {
  return v.replace(/\/+$/, '')
}

function buildCompletionsUrl(baseUrl: string): string {
  const trimmed = trimTrailingSlash(baseUrl)
  if (trimmed.endsWith('/chat/completions')) return trimmed
  if (trimmed.endsWith('/v1')) return `${trimmed}/chat/completions`
  return `${trimmed}/chat/completions`
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text.trim()
  if (!cleaned) return null

  // Strip <think>...</think> blocks (DeepSeek reasoner CoT leaking into content)
  const withoutThink = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const base = withoutThink || cleaned

  const direct = tryParseJson(base)
  if (direct) return direct

  // Remove markdown fences
  const fenced = base
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const fencedParsed = tryParseJson(fenced)
  if (fencedParsed) return fencedParsed

  // Extract first complete {...} object — handles explanatory text before/after JSON
  const start = base.indexOf('{')
  const end = base.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return tryParseJson(base.slice(start, end + 1))
  }
  return null
}

function tryParseJson(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

function extractContentFromPayload(payload: Record<string, unknown> | null): string {
  if (!payload) return ''
  const choices = payload.choices
  if (!Array.isArray(choices) || choices.length === 0) return ''
  const first = choices[0]
  if (!first || typeof first !== 'object') return ''
  const message = (first as Record<string, unknown>).message
  if (!message || typeof message !== 'object') return ''
  const content = (message as Record<string, unknown>).content
  return typeof content === 'string' ? content : ''
}

function resolveDefaultModel(): string {
  return (process.env.LLM_MODEL ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL
}

export function getFastModel(cfg?: LlmConfig): string {
  if (cfg) return cfg.fastModel
  const defaultModel = resolveDefaultModel()
  return (process.env.LLM_FAST_MODEL ?? defaultModel).trim() || defaultModel
}

export function getProModel(cfg?: LlmConfig): string {
  if (cfg) return cfg.proModel
  const defaultModel = resolveDefaultModel()
  return (process.env.LLM_PRO_MODEL ?? defaultModel).trim() || defaultModel
}

export function getDeepDiveModel(cfg?: LlmConfig): string {
  return getProModel(cfg)
}

export function getLlmConfig(): LlmConfig {
  const defaultModel = resolveDefaultModel()
  return {
    enabled: parseBool(process.env.LLM_DEEPDIVE_ENABLED),
    provider: (process.env.LLM_PROVIDER ?? 'deepseek').trim() || 'deepseek',
    apiKey: (process.env.LLM_API_KEY ?? '').trim() || null,
    baseUrl: (process.env.LLM_BASE_URL ?? DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL,
    defaultModel,
    fastModel: (process.env.LLM_FAST_MODEL ?? defaultModel).trim() || defaultModel,
    proModel: (process.env.LLM_PRO_MODEL ?? defaultModel).trim() || defaultModel,
    timeoutMs: parsePositiveInt(process.env.LLM_TIMEOUT_MS, DEFAULT_TIMEOUT),
    maxOutputTokens: parsePositiveInt(process.env.LLM_MAX_OUTPUT_TOKENS, DEFAULT_MAX_OUTPUT),
  }
}

// Backward-compatible alias
export const getDeepDiveLlmConfig = getLlmConfig

export function canUseDeepDiveLlm(cfg = getLlmConfig()): boolean {
  return cfg.enabled && Boolean(cfg.apiKey)
}

function resolveModel(req: DeepDiveLlmRequest, cfg: LlmConfig): string {
  if (req.model && req.model.trim()) return req.model.trim()
  if (req.modelKind === 'fast') return getFastModel(cfg)
  if (req.modelKind === 'pro') return getProModel(cfg)
  if (req.modelKind === 'deepdive') return getDeepDiveModel(cfg)
  return getDeepDiveModel(cfg)
}

export async function requestDeepDiveLlmJson(
  req: DeepDiveLlmRequest,
  cfg = getLlmConfig(),
): Promise<DeepDiveLlmResponse> {
  const startedAt = Date.now()
  const duration = () => Date.now() - startedAt
  const model = resolveModel(req, cfg)

  if (!cfg.enabled) {
    return {
      ok: false,
      model,
      provider: cfg.provider,
      durationMs: duration(),
      rawText: null,
      json: null,
      error: 'LLM_DEEPDIVE_ENABLED is not true',
    }
  }
  if (!cfg.apiKey) {
    return {
      ok: false,
      model,
      provider: cfg.provider,
      durationMs: duration(),
      rawText: null,
      json: null,
      error: 'LLM_API_KEY is missing',
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs)
  const url = buildCompletionsUrl(cfg.baseUrl)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: req.messages,
        temperature: req.temperature ?? 0.2,
        max_tokens: cfg.maxOutputTokens,
      }),
      signal: controller.signal,
    })

    const raw = await res.text()
    if (!res.ok) {
      console.warn(
        `[llm/deep-dive] provider=${cfg.provider} model=${model} status=http_${res.status} duration=${duration()}ms`,
      )
      return {
        ok: false,
        model,
        provider: cfg.provider,
        durationMs: duration(),
        rawText: raw.slice(0, 1200),
        json: null,
        error: `HTTP ${res.status}`,
      }
    }

    const payload = tryParseJson(raw)
    const text = extractContentFromPayload(payload)
    const json = extractJsonObject(text)

    if (!json) {
      console.warn(
        `[llm/deep-dive] provider=${cfg.provider} model=${model} status=invalid_json duration=${duration()}ms`,
      )
      return {
        ok: false,
        model,
        provider: cfg.provider,
        durationMs: duration(),
        rawText: text.slice(0, 1200),
        json: null,
        error: 'Model output is not valid JSON',
      }
    }

    console.info(
      `[llm/deep-dive] provider=${cfg.provider} model=${model} status=ok duration=${duration()}ms`,
    )
    return {
      ok: true,
      model,
      provider: cfg.provider,
      durationMs: duration(),
      rawText: text,
      json,
      error: null,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = msg.toLowerCase().includes('aborted') ? 'timeout' : 'error'
    console.warn(
      `[llm/deep-dive] provider=${cfg.provider} model=${model} status=${status} duration=${duration()}ms`,
    )
    return {
      ok: false,
      model,
      provider: cfg.provider,
      durationMs: duration(),
      rawText: null,
      json: null,
      error: msg,
    }
  } finally {
    clearTimeout(timeout)
  }
}
