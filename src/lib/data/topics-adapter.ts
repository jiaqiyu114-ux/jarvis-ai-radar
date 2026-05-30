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
    sourceName:      topic.source_name ?? null,
    sourceUrl:       topic.source_url  ?? null,
    finalScore:      topic.final_score  ?? null,
    truthScore:      topic.truth_score  ?? null,
    evScore:         topic.ev_score     ?? null,
  }
}

// ── Sync constant (Client Components) ────────────────────────────────────────

export const allTopics: TopicItem[] = mockTopics

// ── Async functions ───────────────────────────────────────────────────────────

/**
 * Returns topics for the 选题池 page.
 *
 * In DB mode (Supabase configured):
 *   - DB has real topics → return them
 *   - DB empty + includeDemo=false → return [] (empty state; no mock fallback)
 *   - DB empty + includeDemo=true → return mockTopics as demo preview
 *
 * In non-DB mode: always return mockTopics for dev experience.
 */
export async function getTopics(opts?: { includeDemo?: boolean }): Promise<TopicItem[]> {
  if (shouldUseDatabase()) {
    const rows = await listTopics()
    if (rows.length > 0) return rows.map(mapDbTopic)
    if (opts?.includeDemo) return mockTopics   // demo overlay when explicitly requested
    return []   // DB mode, no real topics yet — show empty state
  }
  return mockTopics   // non-DB mode: always show mock for development
}
