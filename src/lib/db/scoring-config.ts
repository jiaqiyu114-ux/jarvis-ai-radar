import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { DbScoringConfig, DbScoringConfigUpdate, DbScoringWeights, DbScoringThresholds } from '@/types/database'

export const DEFAULT_WEIGHTS: DbScoringWeights = {
  relevance:        0.12,
  source:           0.13,
  importance:       0.18,
  novelty:          0.12,
  momentum:         0.10,
  credibility:      0.10,
  actionability:    0.10,
  content_potential: 0.08,
  personal_fit:     0.07,
}

export const DEFAULT_THRESHOLDS: DbScoringThresholds = {
  selected_min:  75,
  display_min:   30,
  must_read_min: 88,
  topic_worthy:  80,
}

const FALLBACK_CONFIG: DbScoringConfig = {
  id:              'default',
  config_name:     'default',
  weights_json:    DEFAULT_WEIGHTS,
  thresholds_json: DEFAULT_THRESHOLDS,
  active:          true,
  created_at:      new Date().toISOString(),
  updated_at:      new Date().toISOString(),
}

/** Returns the active scoring config from DB, or the hardcoded default if DB is unavailable. */
export async function getActiveScoringConfig(): Promise<DbScoringConfig> {
  if (!isSupabaseConfigured || !supabase) return FALLBACK_CONFIG
  const { data, error } = await supabase
    .from('scoring_config')
    .select('*')
    .eq('active', true)
    .single()
  if (error || !data) {
    console.warn('[db/scoring-config] No active config found, using default.')
    return FALLBACK_CONFIG
  }
  return data as DbScoringConfig
}

export async function updateScoringConfig(
  id:    string,
  input: DbScoringConfigUpdate,
): Promise<DbScoringConfig | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('scoring_config')
    .update(input)
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('[db/scoring-config] updateScoringConfig:', error.message); return null }
  return data as DbScoringConfig
}
