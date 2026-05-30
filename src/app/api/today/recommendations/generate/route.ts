import { type NextRequest, NextResponse } from 'next/server'
import { generateDailyRecommendationSnapshot } from '@/lib/data/daily-recommendation-snapshot'

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  try {
    const result = await generateDailyRecommendationSnapshot({
      date: typeof body.date === 'string' ? body.date : undefined,
      windowHours: Number(body.windowHours) || undefined,
      limit: Number(body.limit) || undefined,
      force: body.force === true,
      dryRun: body.dryRun === true,
    })

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const migrationHint = message.includes('daily_recommendation')
      ? 'Run supabase/daily-recommendation-snapshot-v1.sql in the Supabase SQL Editor, then retry with dryRun=false.'
      : undefined

    return NextResponse.json({
      ok: false,
      error: message,
      migrationHint,
    }, { status: 500 })
  }
}
