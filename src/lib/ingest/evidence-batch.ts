/**
 * Batch rule-based evidence scoring for unprocessed items.
 * Called from the daily cron pipeline — no LLM, no network calls.
 * Processes items that have never been evidence-scored (evidence_checked_at IS NULL).
 */

import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'
import { buildEvidenceProfile } from '@/lib/scoring/evidence'
import { updateItemEvidenceProfile } from '@/lib/db/items'
import type { DbItem } from '@/types/database'

const EVIDENCE_SELECT = [
  'id', 'url', 'canonical_url', 'category', 'published_at',
  'content_word_count', 'clean_text', 'cover_image_url', 'media_urls',
  'article_author', 'article_published_at', 'content_source_url',
  'sources!items_source_id_fkey(source_tier)',
].join(', ')

export type EvidenceBatchResult = {
  processed: number
  updated:   number
  skipped:   number
  errors:    number
  durationMs: number
}

export async function runBatchEvidenceScoring(maxItems = 120): Promise<EvidenceBatchResult> {
  if (!isServerSupabaseConfigured || !supabaseServer) {
    return { processed: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 }
  }

  const start = Date.now()

  const { data, error } = await supabaseServer
    .from('items')
    .select(EVIDENCE_SELECT)
    .eq('data_origin', 'real')
    .is('evidence_checked_at', null)
    .order('fetched_at', { ascending: false })
    .limit(maxItems)

  if (error || !data || data.length === 0) {
    if (error) console.error('[evidence-batch] query error:', error.message)
    return { processed: 0, updated: 0, skipped: 0, errors: 0, durationMs: Date.now() - start }
  }

  let updated = 0
  let skipped = 0
  let errors  = 0

  for (const raw of data) {
    // Attach source_tier from join so getSourceNature can use it
    const rawItem = raw as unknown as Record<string, unknown>
    const item = Object.assign({}, rawItem, {
      source_tier: (rawItem.sources as { source_tier?: string | null } | null)?.source_tier ?? null,
    }) as DbItem & { source_tier?: string | null }

    try {
      const profile = buildEvidenceProfile(item)

      // Skip if profile is entirely zero (no useful signals)
      if (profile.evidenceScore === 0 && profile.truthScore === 0) {
        skipped++
        continue
      }

      const saved = await updateItemEvidenceProfile(item.id, {
        truthScore:        profile.truthScore,
        evScore:           profile.evidenceScore,
        sourceTraceScore:  profile.sourceTraceScore,
        claimStatus:       profile.claimStatus,
        evidenceLevel:     profile.evidenceLevel,
        sourceNature:      profile.sourceNature,
        hasOriginalSource: profile.hasOriginalSource,
        hasAuthor:         profile.hasAuthor,
        hasPublishedTime:  profile.hasPublishedTime,
        hasArticleContent: profile.hasArticleContent,
        hasMediaEvidence:  profile.hasMediaEvidence,
        evidenceNotes:     profile.evidenceNotes,
        truthNotes:        profile.truthNotes,
      })

      if (saved) updated++
      else       errors++
    } catch (err) {
      console.error('[evidence-batch] item error:', item.id, err instanceof Error ? err.message : err)
      errors++
    }
  }

  console.log(
    `[evidence-batch] done — processed=${data.length} updated=${updated} ` +
    `skipped=${skipped} errors=${errors} ${Date.now() - start}ms`
  )

  return { processed: data.length, updated, skipped, errors, durationMs: Date.now() - start }
}
