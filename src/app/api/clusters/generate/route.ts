import { type NextRequest, NextResponse } from 'next/server'
import { generateEventClusters } from '@/lib/db/event-clusters'

function readNumber(value: unknown): number | undefined {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return undefined
  return parsed
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  try {
    const result = await generateEventClusters({
      windowHours: readNumber(body.windowHours),
      limit: readNumber(body.limit),
      dryRun: body.dryRun !== false,
      force: body.force === true,
    })

    return NextResponse.json(result)
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
