import { type NextRequest, NextResponse } from 'next/server'
import { listEventClusters } from '@/lib/db/event-clusters'

function parseLimit(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return undefined
  return parsed
}

function parseIncludeItems(value: string | null): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes'
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  try {
    const result = await listEventClusters({
      status: searchParams.get('status') ?? undefined,
      limit: parseLimit(searchParams.get('limit')),
      includeItems: parseIncludeItems(searchParams.get('includeItems')),
    })

    return NextResponse.json({
      ok: true,
      clusters: result.clusters,
      count: result.clusters.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const migrationHint = message.includes('event cluster tables not found')
      ? 'Run supabase/event-clusters-v1.sql in Supabase SQL Editor, then retry.'
      : undefined

    return NextResponse.json({
      ok: false,
      error: message,
      migrationHint,
    }, { status: 500 })
  }
}
