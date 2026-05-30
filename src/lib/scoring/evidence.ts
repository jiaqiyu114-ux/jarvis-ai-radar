/**
 * Evidence & Truth Scoring v1 — pure rule-based, no AI/LLM.
 *
 * Computes truth_score, ev_score (evidence quality), source_trace_score,
 * claim_status, evidence_level, and source_nature from structured item metadata.
 *
 * Does NOT:
 * - Call any AI / LLM API.
 * - Use user behavior (clicks, saves, read-time) to adjust scores.
 * - Claim certainty beyond what the data supports.
 * - Automatically mark anything as 'confirmed' — multi-source is needed first.
 */

import type { ClaimStatus, EvidenceLevel, EvidenceProfile, SourceNature } from '@/types'
import type { DbItem } from '@/types/database'

// ── Source domain classification ──────────────────────────────────────────────

// Known official publisher domains (company/institution publishing their own content)
const OFFICIAL_DOMAINS = [
  'openai.com', 'anthropic.com', 'deepmind.google', 'blog.google',
  'research.google', 'ai.google', 'labs.google.com',
  'microsoft.com', 'github.blog', 'about.meta.com', 'ai.meta.com',
  'aws.amazon.com', 'cloud.google.com', 'developer.apple.com',
  'huggingface.co', 'mistral.ai', 'cohere.com',
]

// Established tech/science journalism (first-hand reporting)
const PRIMARY_REPORT_DOMAINS = [
  'techcrunch.com', 'theverge.com', 'wired.com', 'arstechnica.com',
  'reuters.com', 'ft.com', 'bloomberg.com', 'wsj.com', 'nytimes.com',
  'ieee.org', 'acm.org', 'engadget.com', 'venturebeat.com',
  'zdnet.com', 'infoq.com', 'technologyreview.com', 'nature.com',
  'theregister.com', 'cnbc.com',
]

// Academic preprints — primary research but not peer-reviewed
const RESEARCH_DOMAINS = [
  'arxiv.org', 'biorxiv.org', 'medrxiv.org', 'ssrn.com',
  'papers.nips.cc', 'openreview.net',
]

// Social / community / aggregator (high rumor risk)
const RUMOR_DOMAINS = [
  'twitter.com', 'x.com', 'reddit.com', 'news.ycombinator.com',
  'discord.com', 'telegram.org', 'threads.net',
]

function parseDomain(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch { return null }
}

function domainMatches(domain: string | null, patterns: string[]): boolean {
  if (!domain) return false
  return patterns.some(p => domain === p || domain.endsWith(`.${p}`))
}

export function getSourceNature(item: Pick<DbItem, 'url' | 'source_tier' | 'category'>): SourceNature {
  const domain = parseDomain(item.url)

  if (domainMatches(domain, OFFICIAL_DOMAINS))       return 'official'
  if (domainMatches(domain, RESEARCH_DOMAINS))        return 'research'
  if (domainMatches(domain, RUMOR_DOMAINS))           return 'rumor'
  if (domainMatches(domain, PRIMARY_REPORT_DOMAINS))  return 'primary_report'

  // Tier-based fallback
  const tier = item.source_tier?.toUpperCase()
  if (tier === 'S' || tier === 'A')                   return 'primary_report'
  if (tier === 'B')                                   return 'secondary_report'

  // Category-based hint
  if (item.category === '研究报告')                    return 'analysis'

  return 'unknown'
}

// ── Boolean signal detection ──────────────────────────────────────────────────

function detectHasArticleContent(item: DbItem): boolean {
  const wordCount = (item as { content_word_count?: number | null }).content_word_count
  const cleanText = (item as { clean_text?: string | null }).clean_text
  if (wordCount && wordCount >= 150) return true
  if (cleanText && cleanText.trim().length >= 500) return true
  return false
}

function detectHasAuthor(item: DbItem): boolean {
  const a = (item as { article_author?: string | null }).article_author
  return Boolean(a && a.trim().length > 0)
}

function detectHasPublishedTime(item: DbItem): boolean {
  const ap = (item as { article_published_at?: string | null }).article_published_at
  return Boolean(ap) || Boolean(item.published_at)
}

function detectHasOriginalSource(item: DbItem): boolean {
  // True when a traceable URL exists (the item itself, always true for stored items)
  // More meaningful: canonical_url was set during extraction (confirms live URL works)
  const canonical  = (item as { canonical_url?: string | null }).canonical_url
  const contentSrc = (item as { content_source_url?: string | null }).content_source_url
  return Boolean(canonical || contentSrc || item.url)
}

function detectHasMediaEvidence(item: DbItem): boolean {
  const cover  = (item as { cover_image_url?: string | null }).cover_image_url
  const media  = (item as { media_urls?: unknown }).media_urls as string[] | null
  return Boolean(cover) || (Array.isArray(media) && media.length > 0)
}

// ── Scoring functions ─────────────────────────────────────────────────────────

function clamp(n: number, min = 0, max = 100): number {
  return Math.min(Math.max(Math.round(n), min), max)
}

function sourceNatureEvPoints(nature: SourceNature): number {
  switch (nature) {
    case 'official':          return 20
    case 'primary_report':    return 15
    case 'secondary_report':  return 10
    case 'research':          return 10
    case 'analysis':          return 8
    case 'marketing':         return 3
    case 'rumor':             return 0
    case 'unknown':           return 3
  }
}

function sourceTierEvPoints(tier: string | null): number {
  switch (tier?.toUpperCase()) {
    case 'S': return 5
    case 'A': return 3
    case 'B': return 0
    case 'C': return -3
    default:  return 0
  }
}

export function calculateEvidenceScore(
  nature:             SourceNature,
  tier:               string | null,
  hasArticleContent:  boolean,
  hasAuthor:          boolean,
  hasPublishedTime:   boolean,
  hasMediaEvidence:   boolean,
  contentFetched:     boolean,
): number {
  let score = 0
  score += sourceNatureEvPoints(nature)     // 0-20
  score += sourceTierEvPoints(tier)         // -3 to +5
  score += hasArticleContent ? 20 : 0
  score += hasAuthor         ? 12 : 0
  score += hasPublishedTime  ? 10 : 0       // article-extracted time
  score += hasMediaEvidence  ? 10 : 0
  score += contentFetched    ? 10 : 0
  return clamp(score)
}

export function calculateTruthScore(
  evScore:     number,
  nature:      SourceNature,
  hasContent:  boolean,
  hasTime:     boolean,
): number {
  // Truth score is always ≤ evidence score, with additional conservatism.
  // Single-source cap: without multi-source verification we never exceed 75.
  let score = evScore - 8  // base discount vs evidence

  // Source-nature adjustments
  if (nature === 'rumor')     score -= 20
  if (nature === 'marketing') score -= 8
  if (nature === 'unknown')   score -= 5
  if (nature === 'analysis')  score -= 3   // analysis ≠ fact

  // Content quality adjustments
  if (!hasContent)  score -= 8
  if (!hasTime)     score -= 5

  // Single-source cap: v1 never goes above 75 (no multi-source yet)
  return clamp(Math.min(score, 75))
}

export function calculateSourceTraceScore(
  hasOriginalSource: boolean,
  contentFetched:    boolean,
  hasArticleTime:    boolean,
  hasAuthor:         boolean,
  hasMediaEvidence:  boolean,
): number {
  let score = 0
  score += hasOriginalSource ? 25 : 0
  score += contentFetched    ? 20 : 0
  score += hasArticleTime    ? 20 : 0
  score += hasAuthor         ? 20 : 0
  score += hasMediaEvidence  ? 15 : 0
  return clamp(score)
}

export function getClaimStatus(
  nature:           SourceNature,
  hasContent:       boolean,
  hasAuthor:        boolean,
  hasPublishedTime: boolean,
): ClaimStatus {
  if (nature === 'rumor')     return 'rumor'

  if (nature === 'official') {
    if (hasContent && hasPublishedTime) return 'source_claimed'
    return 'reported'
  }

  if (nature === 'research') {
    return 'reported'  // preprint = reported, not confirmed (not yet peer-reviewed)
  }

  if (nature === 'primary_report' || nature === 'secondary_report') {
    if (hasContent) return 'reported'
    return 'unverified'
  }

  if (nature === 'analysis') {
    return 'reported'  // reported as analysis/opinion
  }

  if (nature === 'marketing') {
    // marketing claims exist, but require independent verification
    return 'unverified'
  }

  // unknown
  if (!hasContent && !hasAuthor) return 'unclear'
  return 'unverified'
}

export function getEvidenceLevel(evScore: number): EvidenceLevel {
  if (evScore >= 75) return 'very_high'
  if (evScore >= 55) return 'high'
  if (evScore >= 35) return 'medium'
  return 'low'
}

// ── Notes generators ──────────────────────────────────────────────────────────

const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  unverified:     '未验证',
  reported:       '已报道',
  source_claimed: '官方说法',
  confirmed:      '已确认',
  disputed:       '存在争议',
  rumor:          '传闻',
  unclear:        '信息不明',
}

const SOURCE_NATURE_LABELS: Record<SourceNature, string> = {
  official:         '官方发布',
  primary_report:   '一手报道',
  secondary_report: '二手转载',
  research:         '学术预印本',
  analysis:         '分析/观点',
  marketing:        '商业宣传',
  rumor:            '传言',
  unknown:          '来源未知',
}

export function buildEvidenceNotes(
  nature:            SourceNature,
  hasContent:        boolean,
  hasAuthor:         boolean,
  hasPublishedTime:  boolean,
  hasMediaEvidence:  boolean,
  contentFetched:    boolean,
): string {
  const parts: string[] = []

  parts.push(`来源类型：${SOURCE_NATURE_LABELS[nature]}。`)

  if (!contentFetched) {
    parts.push('尚未抓取原文，证据评估基于 RSS 摘要和来源信息。')
  } else {
    parts.push('原文已抓取，证据评估基于正文内容。')
  }

  if (!hasAuthor) {
    parts.push('未能识别明确作者。')
  } else {
    parts.push('有明确作者归属。')
  }

  if (!hasPublishedTime) {
    parts.push('缺少精确发布时间。')
  }

  if (!hasMediaEvidence) {
    parts.push('无媒体附件（图片 / 视频）支撑。')
  }

  parts.push('当前主要来自单一来源，尚未完成多源交叉验证。')

  if (nature === 'research') {
    parts.push('学术预印本：尚未经过同行评审，结论需谨慎对待。')
  }

  if (nature === 'marketing') {
    parts.push('注意：可能含有商业宣传动机，需独立核实关键声明。')
  }

  if (nature === 'analysis') {
    parts.push('这是分析/观点类内容，不等同于可验证事实。')
  }

  return parts.join(' ')
}

export function buildTruthNotes(
  claimStatus:  ClaimStatus,
  nature:       SourceNature,
  truthScore:   number,
): string {
  const parts: string[] = []

  parts.push(`当前状态：${CLAIM_STATUS_LABELS[claimStatus]}。`)

  if (claimStatus === 'source_claimed') {
    parts.push('官方或当事方直接声明，可信度较高，但仍应独立审视潜在利益相关性。')
  } else if (claimStatus === 'reported') {
    parts.push('由媒体或研究机构报道，但未经多源交叉验证，不宜视为最终事实。')
  } else if (claimStatus === 'rumor') {
    parts.push('来自低可信度渠道或社交媒体，在独立核实前不应作为判断依据。')
  } else {
    parts.push('当前信息可验证程度有限，建议参考原文后自行判断。')
  }

  if (truthScore < 50) {
    parts.push('当前真实程度分数偏低，主要因为缺少原文支撑或来源不明确。')
  }

  // Always note single-source limitation
  parts.push('v1 阶段所有信息均视为单一来源，多源交叉验证待事件簇功能接入后补充。')

  return parts.join(' ')
}

// ── Main builder ──────────────────────────────────────────────────────────────

export function buildEvidenceProfile(item: DbItem): EvidenceProfile {
  const nature           = getSourceNature(item)
  const hasArticleContent = detectHasArticleContent(item)
  const hasAuthor        = detectHasAuthor(item)
  const hasArticleTime   = Boolean((item as { article_published_at?: string | null }).article_published_at)
  const hasPublishedTime = detectHasPublishedTime(item)
  const hasOriginalSource = detectHasOriginalSource(item)
  const hasMediaEvidence = detectHasMediaEvidence(item)
  const contentFetched   = (item as { content_fetch_status?: string | null }).content_fetch_status === 'fetched'

  const evScore         = calculateEvidenceScore(nature, item.source_tier, hasArticleContent, hasAuthor, hasArticleTime, hasMediaEvidence, contentFetched)
  const truthScore      = calculateTruthScore(evScore, nature, hasArticleContent, hasPublishedTime)
  const sourceTraceScore = calculateSourceTraceScore(hasOriginalSource, contentFetched, hasArticleTime, hasAuthor, hasMediaEvidence)
  const claimStatus     = getClaimStatus(nature, hasArticleContent, hasAuthor, hasArticleTime)
  const evidenceLevel   = getEvidenceLevel(evScore)

  return {
    truthScore,
    evidenceScore:    evScore,
    sourceTraceScore,
    claimStatus,
    evidenceLevel,
    sourceNature:     nature,
    hasOriginalSource,
    hasAuthor,
    hasPublishedTime,
    hasArticleContent,
    hasMediaEvidence,
    evidenceNotes: buildEvidenceNotes(nature, hasArticleContent, hasAuthor, hasArticleTime, hasMediaEvidence, contentFetched),
    truthNotes:    buildTruthNotes(claimStatus, nature, truthScore),
    checkedAt:     new Date().toISOString(),
  }
}
