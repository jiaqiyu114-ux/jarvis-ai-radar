import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'
import type { DbProvider, DbProviderInsert } from '@/types/database'
import type { ProviderConfig } from '@/types/provider'

/**
 * Upsert a provider by provider_key.
 * ProviderConfig.id is used as the provider_key (stable business identifier).
 * Returns the database UUID, or null if Supabase is not configured.
 */
export async function upsertProvider(config: ProviderConfig): Promise<string | null> {
  if (!isServerSupabaseConfigured || !supabaseServer) return null

  const providerKey = config.id   // business key (e.g. 'mock-provider-001')

  // Check if already exists
  const { data: existing } = await supabaseServer
    .from('providers')
    .select('id')
    .eq('provider_key', providerKey)
    .maybeSingle()

  if (existing?.id) return existing.id

  // Insert
  const row: DbProviderInsert = {
    provider_key: providerKey,
    name:         config.name,
    type:         config.type,
    base_url:     config.baseUrl ?? undefined,
    trust_score:  config.trustScore,
    enabled:      config.enabled,
  }

  const { data, error } = await supabaseServer
    .from('providers')
    .insert(row)
    .select('id')
    .single()

  if (error) {
    // Race condition: another process inserted same provider_key
    if (error.code === '23505') {
      const { data: retry } = await supabaseServer
        .from('providers').select('id').eq('provider_key', providerKey).maybeSingle()
      return retry?.id ?? null
    }
    console.error('[db/providers] upsertProvider:', error.message)
    return null
  }
  return data?.id ?? null
}

export async function getProviderByKey(providerKey: string): Promise<DbProvider | null> {
  if (!isServerSupabaseConfigured || !supabaseServer) return null
  const { data, error } = await supabaseServer
    .from('providers')
    .select('*')
    .eq('provider_key', providerKey)
    .maybeSingle()
  if (error) { console.error('[db/providers] getProviderByKey:', error.message); return null }
  return data ?? null
}
