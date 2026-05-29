/**
 * Seed mock data into Supabase.
 *
 * Prerequisites:
 *   1. pnpm add -D tsx          (TypeScript runner)
 *   2. Create .env.local with:
 *        NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
 *        NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/seed-mock-data.ts
 *
 * The script is safe to run without keys — it exits 0 with a warning.
 */

import { createClient } from '@supabase/supabase-js'
import { mockSources, mockItems, mockTopics } from '../src/config/mock-data'
import type { Database } from '../src/types/database'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
  console.warn('[seed] Supabase env vars not set — nothing to do.')
  console.warn('       Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
  process.exit(0)
}

const client = createClient<Database>(url, key)

async function seedSources() {
  console.log(`[seed] Seeding ${mockSources.length} sources…`)
  const rows = mockSources.map(s => ({
    id:               s.id,
    name:             s.name,
    url:              s.url,
    platform:         'web',
    source_tier:      s.tier,
    base_score:       s.avgScore,
    reliability_score: s.avgScore,
    category:         s.category,
    is_official:      s.tier === 'S',
    is_blocked:       !s.enabled,
    items_today:      s.itemsToday,
    description:      s.description,
  }))
  const { error } = await client.from('sources').upsert(rows, { onConflict: 'id' })
  if (error) console.error('[seed] sources error:', error.message)
  else       console.log('[seed] sources ✓')
}

async function seedItems() {
  console.log(`[seed] Seeding ${mockItems.length} items…`)
  const sourceRow = (await client.from('sources').select('id').limit(1)).data?.[0]
  const rows = mockItems.map(item => ({
    id:                      item.id,
    source_id:               sourceRow?.id ?? null,
    title:                   item.title,
    url:                     item.originalUrl,
    summary:                 item.summary,
    language:                'zh' as const,
    published_at:            item.publishedAt,
    category:                item.category,
    tags:                    item.tags,
    ai_relevance_score:      item.scoreBreakdown.ai_relevance,
    source_score:            item.scoreBreakdown.source_score,
    importance_score:        item.scoreBreakdown.importance,
    novelty_score:           item.scoreBreakdown.novelty,
    momentum_score:          item.scoreBreakdown.momentum,
    credibility_score:       item.scoreBreakdown.credibility,
    actionability_score:     item.scoreBreakdown.actionability,
    content_potential_score: item.scoreBreakdown.content_potential,
    personal_fit_score:      item.scoreBreakdown.personal_fit,
    duplicate_penalty:       0,
    clickbait_penalty:       0,
    marketing_penalty:       0,
    cognitive_load_penalty:  0,
    final_score:             item.finalScore,
    status:                  (item.finalScore >= 75 ? 'selected' : 'scored') as 'selected' | 'scored',
  }))
  const { error } = await client.from('items').upsert(rows, { onConflict: 'id' })
  if (error) console.error('[seed] items error:', error.message)
  else       console.log('[seed] items ✓')
}

async function seedTopics() {
  console.log(`[seed] Seeding ${mockTopics.length} topics…`)
  const statusMap: Record<string, string> = {
    pending:       '待判断',
    worth_writing: '可写',
    writing:       '正在写',
    published:     '已发布',
    abandoned:     '放弃',
    archived:      '归档',
  }
  const rows = mockTopics.map(t => ({
    id:             t.id,
    title:          t.topicTitle,
    core_info:      t.coreInfo,
    angles:         t.possibleAngles,
    platform:       t.targetPlatform as '公众号' | '小红书' | '知乎' | '视频号' | '长文' | '其他',
    target_reader:  t.targetReader,
    pain_point:     t.readerPainPoint,
    priority:       t.priority,
    status:         (statusMap[t.status] ?? '待判断') as '待判断' | '可写' | '正在写' | '已发布' | '放弃' | '归档',
  }))
  const { error } = await client.from('topics').upsert(rows, { onConflict: 'id' })
  if (error) console.error('[seed] topics error:', error.message)
  else       console.log('[seed] topics ✓')
}

async function main() {
  console.log('[seed] Starting mock data seed…')
  await seedSources()
  await seedItems()
  await seedTopics()
  console.log('[seed] Done.')
}

main().catch(err => {
  console.error('[seed] Fatal:', err)
  process.exit(1)
})
