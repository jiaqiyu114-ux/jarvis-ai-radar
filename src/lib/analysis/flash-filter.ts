/**
 * Flash Filter — DeepSeek-chat (fast/cheap) batch pre-filter.
 *
 * Sits BEFORE the expensive deep-dive pipeline. Batches unprocessed items,
 * sends them to the flash model in groups of BATCH_SIZE, and marks items that
 * score below MIN_PASS_SCORE as analysis_tier='none' so they never enter the
 * expensive tier. Items that pass get their analysis_tier set by budget-gate.ts.
 *
 * Cost estimate: ~$0.002 per 100 items at DeepSeek-chat pricing ($0.14/1M input).
 */

import { supabaseServer } from '@/lib/supabase/server'
import { requestDeepDiveLlmJson, getLlmConfig } from '@/lib/llm/deep-dive-client'
import { buildAnalysisGate } from '@/lib/analysis/budget-gate'
import type { DbItem } from '@/types/database'

// ── Config ────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 25        // items per Flash API call
const MIN_PASS_SCORE = 3     // 1–5 scale; items below this are rejected
const MAX_ITEMS_PER_RUN = 150 // safety cap
const MIN_FINAL_SCORE = 28   // skip obviously-low items before Flash sees them

// ── Types ─────────────────────────────────────────────────────────────────────

type CandidateRow = {
  id: string
  title: string | null
  summary: string | null
  category: string | null
  final_score: number | null
  data_origin: string | null
  sources?: { source_tier?: string | null } | null
}

type FlashResult = { id: string; score: number; reason: string }

export type FlashFilterRunResult = {
  processed: number
  passed: number
  rejected: number
  skipped: number   // already had analysis_queued_at
  errors: string[]
  durationMs: number
}

// ── Prompt ────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a pre-filter for a personal AI/tech intelligence radar used by a Chinese tech professional.

For each article, rate its value 1–5:
5 = Must-see (major AI breakthrough, significant product launch, critical policy, key funding)
4 = High value (relevant industry news, research findings, notable developments)
3 = Worth seeing (general interest, secondary coverage, moderate relevance)
2 = Low value (marketing fluff, repetitive minor update, weak signal)
1 = Skip (spam, noise, unrelated, clickbait)

Return ONLY a valid JSON array, one object per article, in the same order as input:
[{"id":"<id>","score":<1-5>,"reason":"<one sentence in Chinese>"}]

No extra text before or after the JSON array.`

function buildUserPrompt(items: CandidateRow[]): string {
  const lines = items.map(item => {
    const tier = item.sources?.source_tier ?? '?'
    const title = (item.title ?? '').slice(0, 200)
    const summary = (item.summary ?? '').slice(0, 150)
    const cat = item.category ?? ''
    return `{"id":"${item.id}","tier":"${tier}","cat":"${cat}","title":${JSON.stringify(title)},"summary":${JSON.stringify(summary)}}`
  })
  return `Articles:\n[${lines.join(',\n')}]`
}

// ── Flash model call ──────────────────────────────────────────────────────────

async function runFlashBatch(items: CandidateRow[]): Promise<FlashResult[]> {
  const res = await requestDeepDiveLlmJson({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: buildUserPrompt(items) },
    ],
    modelKind: 'fast',   // uses LLM_FAST_MODEL → deepseek-chat
    temperature: 0,
  })

  if (!res.ok || !res.rawText) {
    throw new Error(res.error ?? 'Flash model returned no text')
  }

  const raw = res.rawText.trim()
  const text = raw.startsWith('[') ? raw : raw.substring(raw.indexOf('['))

  let parsed: unknown
  try { parsed = JSON.parse(text) } catch {
    throw new Error(`Flash model JSON parse failed: ${raw.slice(0, 200)}`)
  }

  if (!Array.isArray(parsed)) throw new Error('Flash model did not return an array')

  return (parsed as unknown[]).map((item: unknown) => {
    if (typeof item !== 'object' || item === null) throw new Error('Invalid flash result item')
    const obj = item as Record<string, unknown>
    return {
      id:     String(obj.id ?? ''),
      score:  Number(obj.score ?? 0),
      reason: String(obj.reason ?? ''),
    }
  })
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function fetchUnprocessedItems(limit: number): Promise<CandidateRow[]> {
  if (!supabaseServer) return []
  const { data, error } = await supabaseServer
    .from('items')
    .select('id, title, summary, category, final_score, data_origin, sources!items_source_id_fkey(source_tier)')
    .eq('data_origin', 'real')
    .is('analysis_queued_at', null)
    .gte('final_score', MIN_FINAL_SCORE)
    .order('final_score', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`fetchUnprocessedItems: ${error.message}`)
  return (data ?? []) as CandidateRow[]
}

/** Mark a rejected item: analysis_tier=none, analysis_queued_at=now, reason. */
async function markRejected(id: string, reason: string): Promise<void> {
  if (!supabaseServer) return
  await supabaseServer
    .from('items')
    .update({
      analysis_tier:     'none',
      analysis_stage:    'skipped',
      analysis_priority: 'low',
      analysis_reason:   `[Flash filter rejected] ${reason}`,
      analysis_queued_at: new Date().toISOString(),
    })
    .eq('id', id)
}

/** Mark a passed item: apply budget-gate tier, set analysis_queued_at. */
async function markPassed(item: CandidateRow, flashReason: string): Promise<void> {
  if (!supabaseServer) return
  const gate = buildAnalysisGate(item as unknown as DbItem)
  await supabaseServer
    .from('items')
    .update({
      analysis_tier:           gate.analysisTier,
      analysis_stage:          gate.analysisStage,
      analysis_priority:       gate.analysisPriority,
      token_budget_tier:       gate.tokenBudgetTier,
      estimated_input_tokens:  gate.estimatedInputTokens,
      estimated_output_tokens: gate.estimatedOutputTokens,
      estimated_total_tokens:  gate.estimatedTotalTokens,
      should_deep_analyze:     gate.shouldDeepAnalyze,
      should_track_event:      gate.shouldTrackEvent,
      should_enter_daily_report: gate.shouldEnterDailyReport,
      should_enter_topic_pool:   gate.shouldEnterTopicPool,
      analysis_reason:  `[Flash ✓ ${flashReason}] ${gate.analysisReason}`,
      analysis_queued_at: gate.queuedAt,
    })
    .eq('id', item.id)
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Run the flash filter. Fetches unprocessed items, filters them in batches,
 * and writes the results back to the database.
 */
export async function runFlashFilter(
  opts: { maxItems?: number } = {},
): Promise<FlashFilterRunResult> {
  const t0 = Date.now()
  const errors: string[] = []
  let processed = 0; let passed = 0; let rejected = 0; let skipped = 0

  const cfg = getLlmConfig()
  if (!cfg.apiKey) {
    errors.push('LLM_API_KEY not set — flash filter disabled')
    return { processed: 0, passed: 0, rejected: 0, skipped: 0, errors, durationMs: 0 }
  }

  const maxItems = Math.min(opts.maxItems ?? MAX_ITEMS_PER_RUN, MAX_ITEMS_PER_RUN)
  const items = await fetchUnprocessedItems(maxItems)

  // Deduplicate by normalized title (same story from different sources → send once)
  const seen = new Set<string>()
  const deduped: CandidateRow[] = []
  for (const item of items) {
    const key = (item.title ?? '').toLowerCase().trim().slice(0, 80)
    if (seen.has(key)) { skipped++; continue }
    seen.add(key)
    deduped.push(item)
  }

  // Process in batches
  for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
    const batch = deduped.slice(i, i + BATCH_SIZE)
    let results: FlashResult[] = []

    try {
      results = await runFlashBatch(batch)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${msg}`)
      // Don't skip the batch — just leave items unprocessed so next run retries
      continue
    }

    // Map results by id
    const resultMap = new Map(results.map(r => [r.id, r]))

    for (const item of batch) {
      const result = resultMap.get(item.id)
      processed++

      if (!result) {
        // Flash didn't return this item — leave unprocessed, log
        errors.push(`Item ${item.id.slice(0, 8)} missing from flash response`)
        continue
      }

      if (result.score >= MIN_PASS_SCORE) {
        await markPassed(item, result.reason)
        passed++
      } else {
        await markRejected(item.id, result.reason)
        rejected++
      }
    }
  }

  return { processed, passed, rejected, skipped, errors, durationMs: Date.now() - t0 }
}
