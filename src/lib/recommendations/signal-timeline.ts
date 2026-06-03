/**
 * Signal timeline — turns the curated recommendation pool into a chronological,
 * day-grouped stream for the dashboard ("what happened, and when").
 *
 * Ordering is by PUBLISHED time (when the event actually happened), falling back
 * to fetched time when a source omits a publish date. All date math uses an
 * explicit timezone via Intl so the server and client produce identical groups
 * (no hydration mismatch) — see [[daily-gate]] for the same approach.
 */

import type { RecommendedItem } from '@/lib/recommendations/recommendation-engine'
import { getLocalDateKey, todayKey, JARVIS_TIMEZONE } from '@/lib/recommendations/daily-gate'

export type TimelineEntry = {
  item:      RecommendedItem
  /** ISO instant used for ordering (publishedAt, else fetchedAt). */
  iso:       string
  /** "HH:MM" in the configured timezone. */
  timeLabel: string
}

export type TimelineGroup = {
  /** YYYY-MM-DD local day key. */
  key:    string
  /** Human label: 今天 / 昨天 / M月D日. */
  label:  string
  entries: TimelineEntry[]
}

function timeLabel(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso))
  } catch {
    return '--:--'
  }
}

/** YYYY-MM-DD of the day before the given key (calendar arithmetic, UTC-safe). */
function previousDayKey(key: string): string {
  const ms = new Date(key + 'T00:00:00Z').getTime() - 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

function dayLabel(key: string, tz: string): string {
  const today = todayKey(tz)
  if (key === today) return '今天'
  if (key === previousDayKey(today)) return '昨天'
  const [, m, d] = key.split('-')
  return `${Number(m)}月${Number(d)}日`
}

/**
 * Build the day-grouped, newest-first timeline. Items without any usable
 * timestamp are dropped (a timeline entry with no time is meaningless).
 */
export function buildSignalTimeline(
  items: RecommendedItem[],
  opts: { tz?: string; limit?: number } = {},
): TimelineGroup[] {
  const tz    = opts.tz ?? JARVIS_TIMEZONE
  const limit = opts.limit ?? 50

  const entries: Array<TimelineEntry & { ts: number; dayKey: string }> = []
  for (const item of items) {
    const iso = item.publishedAt ?? item.fetchedAt
    if (!iso) continue
    const ts = new Date(iso).getTime()
    if (Number.isNaN(ts)) continue
    const dayKey = getLocalDateKey(iso, tz)
    if (!dayKey) continue
    entries.push({ item, iso, ts, dayKey, timeLabel: timeLabel(iso, tz) })
  }

  entries.sort((a, b) => b.ts - a.ts)
  const capped = entries.slice(0, limit)

  const groups: TimelineGroup[] = []
  for (const e of capped) {
    let group = groups[groups.length - 1]
    if (!group || group.key !== e.dayKey) {
      group = { key: e.dayKey, label: dayLabel(e.dayKey, tz), entries: [] }
      groups.push(group)
    }
    group.entries.push({ item: e.item, iso: e.iso, timeLabel: e.timeLabel })
  }
  return groups
}
