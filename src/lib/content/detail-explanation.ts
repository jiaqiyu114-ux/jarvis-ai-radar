/**
 * Information Detail Explanation v1 — pure display layer.
 *
 * Generates structured detail content from InformationItem.
 * Based entirely on existing fields (title, summary, source, tags, etc.).
 *
 * Does NOT:
 * - Call any AI / LLM API.
 * - Fetch or read original article content.
 * - Incorporate behavioral feedback signals.
 * - Modify final_score or dimension weights.
 * - Claim to have "read" the full article.
 */

import type { InformationItem, SourceTier, Category } from '@/types'
import type { ScoreExplanation } from '@/lib/scoring/explanation'

// ── Types ─────────────────────────────────────────────────────────────────────

export type WhatHappened = {
  text:     string   // summary or short fallback from title
  dataNote: string   // honest note about data source
}

export type WhyItMatters = {
  primaryReason: string   // from score drivers
  evidenceNote:  string   // single vs multi source
  tierNote:      string   // source tier context
}

export type InsightType = 'content' | 'learning' | 'observation' | 'project'

export type UserInsight = {
  type: InsightType
  text: string
}

export type SourcePanel = {
  sourceName:  string
  sourceTier:  SourceTier
  tierLabel:   string
  originalUrl: string
  publishedAt: string
  category:    Category
  tags:        string[]
}

export type MediaStatus = {
  hasMedia: false
  note:     string
}

export type TimelineStatus = {
  multiSource:       boolean
  sourceCount:       number
  message:           string
  canLinkToClusters: boolean
}

export type InformationDetail = {
  whatHappened: WhatHappened
  whyItMatters: WhyItMatters
  userInsights: UserInsight[]
  sourcePanel:  SourcePanel
  media:        MediaStatus
  timeline:     TimelineStatus
}

// ── Tier labels ───────────────────────────────────────────────────────────────

const TIER_LABELS: Record<SourceTier, string> = {
  S: 'S 级 · 顶级信源',
  A: 'A 级 · 高质信源',
  B: 'B 级 · 普通信源',
  C: 'C 级 · 参考信源',
}

// ── Component builders ────────────────────────────────────────────────────────

function buildWhatHappened(item: InformationItem): WhatHappened {
  const hasMeaningfulSummary = item.summary && item.summary.trim().length >= 40

  if (hasMeaningfulSummary) {
    return {
      text:     item.summary,
      dataNote: '当前解释基于 RSS 摘要，尚未抓取全文。',
    }
  }

  // Summary too short or empty — honest fallback from title context
  return {
    text:     item.summary?.trim()
      ? item.summary
      : `来自 ${item.source} 的报道：${item.title}`,
    dataNote: '当前仅有标题信息，摘要较短，完整内容请查看原文。',
  }
}

function buildWhyItMatters(
  item:        InformationItem,
  explanation: ScoreExplanation,
): WhyItMatters {
  const positive = explanation.topPositiveDrivers
  const relCount = item.relatedReportCount

  let primaryReason: string
  if (positive.length >= 2) {
    primaryReason = `${positive[0]}且${positive[1]}，系统判断值得关注。`
  } else if (positive.length === 1) {
    primaryReason = `${positive[0]}，可进一步阅读原文确认。`
  } else if (explanation.isRuleBasedOnly) {
    primaryReason = '当前评分基于规则引擎基线，尚未经过深度分析，建议结合原文自行判断。'
  } else {
    primaryReason = '暂无明显强驱动因素，适合归档观察，等待更多信号。'
  }

  const evidenceNote = relCount > 1
    ? `已有 ${relCount} 篇相关报道，存在多源跟进，关注度较高。`
    : '目前主要来自单一来源，缺少多源交叉验证，适合初步参考。'

  const tierNote = `来源：${item.source}（${TIER_LABELS[item.sourceTier]}）。`

  return { primaryReason, evidenceNote, tierNote }
}

function buildUserInsights(
  item:        InformationItem,
  explanation: ScoreExplanation,
): UserInsight[] {
  const insights: UserInsight[] = []
  const sb = item.scoreBreakdown

  // Content potential
  if (sb.content_potential >= 65) {
    insights.push({
      type: 'content',
      text: '内容潜力较高，可作为公众号、小红书或长文选题候选素材。',
    })
  } else {
    insights.push({
      type: 'content',
      text: '内容潜力一般，直接作为选题需补充更多信息和背景材料。',
    })
  }

  // Actionability
  if (sb.actionability >= 65) {
    insights.push({
      type: 'learning',
      text: '可操作性较强，可转化为具体研究课题、产品判断或跟进计划。',
    })
  } else {
    insights.push({
      type: 'observation',
      text: '当前可操作性一般，建议进入观察列表，等待更多具体信号出现。',
    })
  }

  // Multi-source / cluster
  if (item.relatedReportCount > 1) {
    insights.push({
      type: 'project',
      text: `已有 ${item.relatedReportCount} 篇相关报道。后续持续跟进可考虑进入事件簇追踪。`,
    })
  } else {
    insights.push({
      type: 'observation',
      text: '当前为单一来源。后续若有多家媒体跟进，可进入事件簇追踪。',
    })
  }

  // Rule-based note
  if (explanation.isRuleBasedOnly) {
    insights.push({
      type: 'project',
      text: '评分基于规则引擎基线，多数维度尚未 AI 评分。当前目标匹配不代表兴趣偏好。',
    })
  }

  return insights.slice(0, 4)
}

function buildSourcePanel(item: InformationItem): SourcePanel {
  return {
    sourceName:  item.source,
    sourceTier:  item.sourceTier,
    tierLabel:   TIER_LABELS[item.sourceTier],
    originalUrl: item.originalUrl,
    publishedAt: item.publishedAt,
    category:    item.category,
    tags:        item.tags,
  }
}

function buildTimelineStatus(item: InformationItem): TimelineStatus {
  const multiSource = item.relatedReportCount > 1

  return {
    multiSource,
    sourceCount:       item.relatedReportCount,
    canLinkToClusters: multiSource,
    message: multiSource
      ? `已有 ${item.relatedReportCount} 篇关联报道，可查看事件追踪页面。`
      : '当前来自单一来源，暂未形成事件簇。后续有多源跟进时，可进入时间线追踪。',
  }
}

// ── Main function ─────────────────────────────────────────────────────────────

export function buildInformationDetail(
  item:        InformationItem,
  explanation: ScoreExplanation,
): InformationDetail {
  return {
    whatHappened: buildWhatHappened(item),
    whyItMatters: buildWhyItMatters(item, explanation),
    userInsights: buildUserInsights(item, explanation),
    sourcePanel:  buildSourcePanel(item),
    media: {
      hasMedia: false,
      note: '暂无媒体信息。后续 Article Content Extraction v1 将提取封面图、视频和正文图片。',
    },
    timeline: buildTimelineStatus(item),
  }
}
