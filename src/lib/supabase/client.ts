import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * True only when both env vars are present and non-empty.
 * All db/* modules check this before executing queries so the app
 * stays functional with mock data when Supabase is not configured.
 */
export const isSupabaseConfigured =
  typeof supabaseUrl === 'string' && supabaseUrl.trim() !== '' &&
  typeof supabaseKey === 'string' && supabaseKey.trim() !== ''

/**
 * Typed Supabase client — null when env vars are missing.
 * Always null-check before use (or use the db/* helpers which do it for you).
 */
export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl!, supabaseKey!)
  : null
