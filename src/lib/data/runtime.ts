import { isSupabaseConfigured } from '@/lib/supabase/client'

export type DataMode = 'mock' | 'database'

export function getDataMode(): DataMode {
  return isSupabaseConfigured ? 'database' : 'mock'
}

export function shouldUseDatabase(): boolean {
  return isSupabaseConfigured
}
