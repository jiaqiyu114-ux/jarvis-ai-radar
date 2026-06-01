/**
 * Source Bundle Types — candidate source pool management.
 *
 * SourceBundleSource is a pre-DB staging type for external/curated source candidates.
 * candidateOnly=true (default) means the source is NOT auto-inserted into the DB.
 * Use preview-source-bundles.ps1 to inspect candidates; manually enable after health check.
 */

export type SourceBundleOrigin =
  | 'ai_news_radar'  // from LearnPrompt/ai-news-radar
  | 'trendradar'     // from sansan0/TrendRadar (config reference only, no GPL code copied)
  | 'manual'         // manually curated
  | 'aihot'          // from aihot.news or similar aggregators
  | 'official'       // official company/org feed

export type SourceBundleType =
  | 'rss'
  | 'atom'
  | 'opml'
  | 'json'
  | 'unknown'

export type SourceBundleSource = {
  id:           string           // kebab-case unique id within bundle
  name:         string
  url:          string           // RSS/Atom/OPML/JSON feed URL (not website URL)
  type:         SourceBundleType
  origin:       SourceBundleOrigin
  category:     string           // maps to DB category
  tier:         string           // S | A | B | C | D — initial quality estimate
  priority:     number           // 1=highest, 5=lowest
  official:     boolean          // is this an official org/company feed?
  userCurated:  boolean          // manually added by user?
  candidateOnly: boolean         // true = do NOT auto-insert into DB sources
  notes:        string           // human-readable notes
  importedFrom: string           // source project or tool
  riskNotes:    string           // known issues (paywall, reliability, encoding, etc.)
}

export type SourceBundleFile = {
  version:     string
  generatedAt: string
  sources:     SourceBundleSource[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Filter candidates by origin. */
export function filterByOrigin(
  sources: SourceBundleSource[],
  origin: SourceBundleOrigin,
): SourceBundleSource[] {
  return sources.filter(s => s.origin === origin)
}

/** Get sources safe to enable (healthy candidates, tier A/B+). */
export function getRecommendedToEnable(sources: SourceBundleSource[]): SourceBundleSource[] {
  return sources.filter(s =>
    s.candidateOnly &&
    s.type === 'rss' &&
    (s.tier === 'S' || s.tier === 'A' || s.tier === 'B') &&
    s.priority <= 3 &&
    !s.riskNotes.toLowerCase().includes('paywall'),
  )
}

/** Deduplicate by URL (normalised). */
export function deduplicateByUrl(sources: SourceBundleSource[]): {
  unique: SourceBundleSource[]
  duplicates: Array<{ url: string; kept: string; dropped: string }>
} {
  const seen = new Map<string, string>()
  const unique: SourceBundleSource[] = []
  const duplicates: Array<{ url: string; kept: string; dropped: string }> = []

  for (const s of sources) {
    const norm = s.url.trim().replace(/\/$/, '').toLowerCase()
    if (seen.has(norm)) {
      duplicates.push({ url: s.url, kept: seen.get(norm)!, dropped: s.id })
    } else {
      seen.set(norm, s.id)
      unique.push(s)
    }
  }

  return { unique, duplicates }
}
