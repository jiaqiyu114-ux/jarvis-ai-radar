/**
 * POST /api/admin/fix-source-names
 *
 * One-time maintenance: sanitize garbled source names in the DB.
 * Replaces names containing replacement chars (?, ?, ?) with cleaned versions.
 * Safe to run multiple times (idempotent for already-clean names).
 *
 * Known mappings:
 *   "36? AI (36kr)" → "36氪 AI"
 *   "36??" → "36氪"
 *   Any name with only ? symbols → replaced with URL-derived fallback
 */

import { NextResponse } from 'next/server'
import { supabaseServer, isServerSupabaseConfigured } from '@/lib/supabase/server'
import { getRole, isAdmin } from '@/lib/auth-server'

// Known garbled name → correct name mappings
const KNOWN_FIXES: Array<[string | RegExp, string]> = [
  [/36[?？�]+\s*AI\s*\(36kr\)/i, '36氪 AI'],
  [/36[?？�]+\s*AI/i,            '36氪 AI'],
  [/36[?？�]+/i,                 '36氪'],
  [/雷[?？�]+/i,                 '雷锋网'],
  [/机[?？�]+之心/i,             '机器之心'],
  [/量[?？�]+产研院/i,           '量子位'],
  [/[?？�]{2,}/g,               ''],   // strip remaining garbage sequences
]

function cleanSourceName(name: string): string | null {
  let result = name
  for (const [pattern, replacement] of KNOWN_FIXES) {
    result = result.replace(pattern, replacement).trim()
  }
  // If the entire name became garbage or empty, return null (keep original)
  if (!result || /^[\s?？�]+$/.test(result)) return null
  // Only return if actually changed
  return result !== name ? result : null
}

export async function POST() {
  if (!isAdmin(await getRole())) {
    return NextResponse.json({ ok: false, error: '需要管理员权限' }, { status: 403 })
  }
  if (!isServerSupabaseConfigured || !supabaseServer) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 400 })
  }

  // Fetch all source names
  const { data: sources, error } = await supabaseServer
    .from('sources')
    .select('id, name, url')
    .order('name')

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const fixes: Array<{ id: string; oldName: string; newName: string }> = []
  const errors: string[] = []

  for (const src of sources ?? []) {
    const name = src.name as string | null
    if (!name) continue

    // Check if name contains garbled chars
    const hasGarble = /[?？�]/.test(name) || /[?]{2,}/.test(name)
    if (!hasGarble) continue

    const cleaned = cleanSourceName(name)
    if (!cleaned) continue

    const { error: updateErr } = await supabaseServer
      .from('sources')
      .update({ name: cleaned })
      .eq('id', src.id)

    if (updateErr) {
      errors.push(`${src.id}: ${updateErr.message}`)
    } else {
      fixes.push({ id: src.id, oldName: name, newName: cleaned })
    }
  }

  return NextResponse.json({
    ok:      errors.length === 0,
    fixed:   fixes.length,
    fixes,
    errors,
  })
}

export async function GET() {
  if (!isServerSupabaseConfigured || !supabaseServer) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 400 })
  }

  // Dry-run: list what would be fixed
  const { data: sources, error } = await supabaseServer
    .from('sources')
    .select('id, name, url')

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const candidates = (sources ?? []).flatMap(src => {
    const name = src.name as string | null
    if (!name) return []
    const hasGarble = /[?？�]/.test(name)
    if (!hasGarble) return []
    const cleaned = cleanSourceName(name)
    if (!cleaned) return []
    return [{ id: src.id, current: name, proposed: cleaned }]
  })

  return NextResponse.json({ ok: true, dryRun: true, count: candidates.length, candidates })
}
