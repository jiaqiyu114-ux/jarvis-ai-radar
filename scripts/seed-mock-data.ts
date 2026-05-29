/**
 * Seed mock data into Supabase.
 *
 * Prerequisites:
 *   1. pnpm add -D tsx          (TypeScript runner, one-time)
 *   2. Create .env.local:
 *        NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
 *        NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
 *   3. Apply supabase/schema.sql in the Supabase SQL Editor
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/seed-mock-data.ts
 *
 * Safety:
 *   - Exits 0 with a warning if env vars are missing (no crash)
 *   - Uses upsert (idempotent — safe to run multiple times)
 *   - Does NOT modify src/config/mock-data.ts
 *   - NOT wired into the build or dev scripts
 */

import { createClient } from '@supabase/supabase-js'
import { mockSources, mockItems, mockTopics } from '../src/config/mock-data'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

if (!url || !key) {
  console.warn('[seed] ⚠  Supabase env vars not set — nothing to do.')
  console.warn('       Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
  console.warn('       Then run: npx tsx --env-file=.env.local scripts/seed-mock-data.ts')
  process.exit(0)
}

const client = createClient(url, key)

// ── Step 1: Seed sources ──────────────────────────────────────────────────────

async function seedSources() {
  console.log(`[seed] Seeding ${mockSources.length} sources…`)
  const rows = mockSources.map(s => ({
    id:                s.id,
    name:              s.name,
    url:               s.url,
    platform:          'web',
    source_tier:       s.tier,
    base_score:        s.avgScore,
    reliability_score: s.avgScore,
    category:          s.category,
    is_official:       s.tier === 'S',
    is_blocked:        !s.enabled,
    items_today:       s.itemsToday,
    description:       s.description,
  }))
  const { error } = await client.from('sources').upsert(rows, { onConflict: 'id' })
  if (error) { console.error('[seed] sources ✗', error.message); return false }
  console.log('[seed] sources ✓')
  return true
}

// ── Step 2: Seed items ────────────────────────────────────────────────────────

async function seedItems(sourceIdMap: Map<string, string>) {
  console.log(`[seed] Seeding ${mockItems.length} items…`)

  // Use first available source id as fallback when source can't be mapped
  const fallbackSourceId = mockSources[0]?.id ?? null

  const rows = mockItems.map(item => {
    const sourceId = sourceIdMap.get(item.source) ?? fallbackSourceId
    return {
      id:                      item.id,
      source_id:               sourceId,
      source_tier:             item.sourceTier,
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
    }
  })

  const { error } = await client.from('items').upsert(rows, { onConflict: 'id' })
  if (error) { console.error('[seed] items ✗', error.message); return false }
  console.log('[seed] items ✓')
  return true
}

// ── Step 3: Seed topics ───────────────────────────────────────────────────────

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

  const platformMap: Record<string, string> = {
    'Twitter/X': '其他',
    '即刻':      '其他',
    '内部报告':  '其他',
  }

  const rows = mockTopics.map(t => ({
    id:             t.id,
    title:          t.topicTitle,
    core_info:      t.coreInfo,
    angles:         t.possibleAngles,
    platform:       (platformMap[t.targetPlatform] ?? t.targetPlatform) as '公众号' | '小红书' | '知乎' | '视频号' | '长文' | '其他',
    target_reader:  t.targetReader,
    pain_point:     t.readerPainPoint,
    priority:       t.priority,
    status:         (statusMap[t.status] ?? '待判断') as '待判断' | '可写' | '正在写' | '已发布' | '放弃' | '归档',
  }))

  const { error } = await client.from('topics').upsert(rows, { onConflict: 'id' })
  if (error) { console.error('[seed] topics ✗', error.message); return false }
  console.log('[seed] topics ✓')
  return true
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[seed] Starting mock data seed…')
  console.log(`[seed] Target: ${url}`)

  const sourceOk = await seedSources()
  if (!sourceOk) { console.error('[seed] Aborting — sources failed.'); process.exit(1) }

  // Build source name → id map for item seeding
  const { data: sources } = await client.from('sources').select('id, name')
  const sourceIdMap = new Map((sources ?? []).map(s => [s.name as string, s.id as string]))

  await seedItems(sourceIdMap)
  await seedTopics()

  console.log('[seed] Done. Run pnpm dev to see live data.')
}

main().catch(err => {
  console.error('[seed] Fatal:', err)
  process.exit(1)
})
