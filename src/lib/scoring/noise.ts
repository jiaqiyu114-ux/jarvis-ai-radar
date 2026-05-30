/**
 * detectLowValueNoise — pure rule-based noise classifier.
 *
 * Identifies low-value content patterns in RSS feeds:
 * event marketing, job listings, generic product marketing, thin content.
 *
 * Does NOT call any AI / LLM API.
 * Does NOT modify stored data — this is a display / ranking layer filter.
 * The /feed capture stream is NEVER filtered by this; only the recommendation
 * output layer (daily snapshot, today's picks) applies these penalties.
 */

export type NoiseType =
  | 'event_marketing'
  | 'job_hiring'
  | 'generic_product_marketing'
  | 'duplicate_or_thin'

export type NoiseResult = {
  isNoise:   boolean
  noiseType?: NoiseType
  penalty:   number
  reason?:   string
}

const CLEAN: NoiseResult = { isNoise: false, penalty: 0 }

// ── Keyword sets ──────────────────────────────────────────────────────────────

const EVENT_MARKETING_KW = [
  'tickets', 'ticket', 'apply to speak', 'call for speakers', 'call for papers',
  'early bird', 'register now', 'registration', 'registrations',
  'conference pass', 'event pass', 'summit pass',
  'promo code', 'discount code', 'coupon code',
  'save up to', 'save 20', 'save 30', 'save 40', 'save 50',
  'use code', 'limited seats',
]

const JOB_HIRING_KW = [
  'we are hiring', "we're hiring", 'is hiring',
  'job opening', 'job opportunity', 'job listing',
  'open role', 'open position', 'now hiring',
  'apply for role', 'join our team', 'careers page',
]

const PRODUCT_MARKETING_KW = [
  'limited time offer', 'launch offer', 'introductory price',
  'join the waitlist', 'join waitlist', 'get early access', 'request access',
  'sign up free', 'try for free', 'free trial',
  'book a demo', 'schedule a demo', 'request a demo',
  'now available in', 'generally available',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/['']/g, "'").replace(/[""]/g, '"')
}

function containsAny(text: string, keywords: string[]): string | null {
  const t = normalize(text)
  return keywords.find(kw => t.includes(kw)) ?? null
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Detect low-value noise in an item.
 *
 * @param title       RSS item title (already display-normalised)
 * @param summary     RSS item summary / excerpt
 * @param wordCount   Extracted clean_text word count (null = not fetched)
 */
export function detectLowValueNoise(
  title:     string,
  summary:   string,
  wordCount: number | null | undefined,
): NoiseResult {
  const combined = `${title} ${summary}`

  // 1. Event / conference marketing
  const eventKw = containsAny(combined, EVENT_MARKETING_KW)
  if (eventKw) {
    return {
      isNoise:   true,
      noiseType: 'event_marketing',
      penalty:   18,
      reason:    `疑似活动/票务营销（含关键词"${eventKw}"），已降低推荐权重`,
    }
  }

  // 2. Job / hiring posts
  const jobKw = containsAny(combined, JOB_HIRING_KW)
  if (jobKw) {
    return {
      isNoise:   true,
      noiseType: 'job_hiring',
      penalty:   12,
      reason:    `疑似招聘信息（含关键词"${jobKw}"），已降低推荐权重`,
    }
  }

  // 3. Generic product / waitlist marketing
  const mktKw = containsAny(combined, PRODUCT_MARKETING_KW)
  if (mktKw) {
    return {
      isNoise:   true,
      noiseType: 'generic_product_marketing',
      penalty:   10,
      reason:    `疑似产品营销/促销（含关键词"${mktKw}"），已降低推荐权重`,
    }
  }

  // 4. Thin / duplicate content (only penalise when word count is very low)
  if (wordCount !== null && wordCount !== undefined && wordCount < 80) {
    const summaryLen = summary.trim().length
    if (summaryLen < 60) {
      return {
        isNoise:   true,
        noiseType: 'duplicate_or_thin',
        penalty:   10,
        reason:    '内容过短（摘要和正文均较少），判断依据不足，已降低推荐权重',
      }
    }
  }

  return CLEAN
}

/** Compute the deduction penalty for a noise result (0 when not noise). */
export function noisePenalty(result: NoiseResult): number {
  return result.penalty
}
