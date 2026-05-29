/**
 * Server-side Supabase client — for API routes only.
 *
 * Key selection order:
 *   1. SUPABASE_SERVICE_ROLE_KEY  — bypasses RLS; required when policies are enabled
 *   2. NEXT_PUBLIC_SUPABASE_ANON_KEY — works for MVP with no RLS (current default)
 *
 * MVP note: J.A.R.V.I.S. currently has no RLS policies, so the anon key can
 * both read and write. When RLS is added before production, set
 * SUPABASE_SERVICE_ROLE_KEY so API routes can still write to protected tables.
 *
 * NEVER import this file in client components or pages — it should only be
 * used in src/app/api/ routes and src/lib/ingest/.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const url     = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
const key     = svcKey || anonKey

export const isServerSupabaseConfigured = Boolean(url && key)

export const supabaseServer: SupabaseClient<Database> | null =
  url && key
    ? createClient<Database>(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null
