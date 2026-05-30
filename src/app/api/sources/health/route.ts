import { NextResponse } from 'next/server'
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'

/**
 * GET /api/sources/health
 * Returns all RSS sources with their v1+v2 health tracking fields.
 * Read-only. No mock fallback.
 */
export async function GET() {
  if (!isServerSupabaseConfigured || !supabaseServer) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured', sources: [] }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from('sources')
    .select([
      'id', 'name', 'url', 'platform', 'source_tier', 'is_blocked', 'data_origin',
      // v1 health fields
      'health_status', 'failure_count', 'last_fetch_at', 'last_success_at',
      'last_error_at', 'last_error_message', 'last_latency_ms', 'avg_latency_ms',
      'last_http_status', 'disabled_reason',
      // v2 health fields
      'last_fetch_status', 'last_fetch_error_stage',
      'total_fetch_count', 'successful_fetch_count', 'failed_fetch_count', 'health_score',
    ].join(', '))
    .eq('platform', 'rss')
    .order('health_score', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true })

  if (error) {
    // If v2 columns don't exist yet, give a clear migration hint
    const needsMigration = error.message.includes('does not exist')
    return NextResponse.json({
      ok:    false,
      error: error.message,
      hint:  needsMigration
        ? 'Run supabase/rss-source-health-v2.sql in Supabase SQL Editor to add missing columns.'
        : undefined,
      sources: [],
    }, { status: 500 })
  }

  return NextResponse.json({ ok: true, sources: data ?? [] })
}
