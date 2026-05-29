import { mockTopics } from '@/config/mock-data'
import { listTopics } from '@/lib/db/topics'
import { shouldUseDatabase } from './runtime'
import type { TopicItem, TopicStatus, Platform } from '@/types'
import type { DbTopic, DbTopicStatus } from '@/types/database'

// ── DbTopicStatus → TopicStatus mapping ──────────────────────────────────────

const topicStatusMap: Record<DbTopicStatus, TopicStatus> = {
  '待判断': 'pending',
  '可写':   'worth_writing',
  '正在写': 'writing',
  '已发布': 'published',
  '放弃':   'abandoned',
  '归档':   'archived',
}

// ── Type-safe platform validator ──────────────────────────────────────────────
// DbTopicPlatform includes '视频号' and '长文' which don't map to Platform — fall to '其他'

const validPlatforms: readonly Platform[] = [
  '公众号', '小红书', '知乎', 'Twitter/X', '即刻', '内部报告', '其他',
]

function toPlatform(s: string): Platform {
  return validPlatforms.find(p => p === s) ?? '其他'
}

// ── DbTopic → TopicItem mapper ────────────────────────────────────────────────

function mapDbTopic(topic: DbTopic): TopicItem {
  return {
    id:              topic.id,
    sourceItemId:    topic.source_item_id ?? '',
    topicTitle:      topic.title,
    coreInfo:        topic.core_info,
    possibleAngles:  topic.angles ?? [],
    targetPlatform:  toPlatform(topic.platform),
    targetReader:    topic.target_reader,
    readerPainPoint: topic.pain_point,
    priority:        topic.priority,
    status:          topicStatusMap[topic.status] ?? 'pending',
    createdAt:       topic.created_at,
  }
}

// ── Sync constant (Client Components) ────────────────────────────────────────

export const allTopics: TopicItem[] = mockTopics

// ── Async functions ───────────────────────────────────────────────────────────

export async function getTopics(): Promise<TopicItem[]> {
  if (shouldUseDatabase()) {
    const rows = await listTopics()
    if (rows.length > 0) return rows.map(mapDbTopic)
  }
  return mockTopics
}
