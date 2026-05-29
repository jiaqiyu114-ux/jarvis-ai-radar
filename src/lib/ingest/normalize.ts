/**
 * URL and title normalisation utilities.
 *
 * These are pure functions — no I/O, no side effects.
 * Used by providers to produce canonical forms for deduplication.
 */

// ── URL canonicalisation ──────────────────────────────────────────────────────

/** Query parameters that carry no semantic value and should be stripped. */
const STRIP_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'ref',
])

/**
 * Return a canonical form of the URL suitable for deduplication.
 *
 * - Empty input → empty string (never throws)
 * - Malformed URL → original trimmed value (never throws)
 * - Hostname lowercased
 * - Tracking parameters removed
 * - Trailing slash on pathname removed (preserves root "/")
 * - Meaningful query params preserved
 * - Pathname not touched
 */
export function canonicalizeUrl(input: string): string {
  const raw = input.trim()
  if (!raw) return ''

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    // Not a valid absolute URL — return as-is (could be a relative path or malformed)
    return raw
  }

  // Lowercase hostname
  url.hostname = url.hostname.toLowerCase()

  // Strip tracking parameters
  for (const key of [...url.searchParams.keys()]) {
    if (STRIP_PARAMS.has(key)) url.searchParams.delete(key)
  }

  // Normalise remaining params to deterministic order
  url.searchParams.sort()

  // Remove trailing slash from non-root paths
  if (url.pathname !== '/' && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1)
  }

  return url.toString()
}

// ── Title normalisation ───────────────────────────────────────────────────────

/**
 * Return a normalised title for deduplication and display consistency.
 *
 * - Trims leading/trailing whitespace
 * - Compresses internal runs of whitespace to a single space
 * - Lowercases (for dedup comparison; display uses original title)
 * - Lightly unifies punctuation (curly quotes, em dash, NBSP)
 * - Strips leading/trailing decorative symbols (·, |, -, 【, etc.)
 *
 * Does NOT: rewrite semantics, remove entity names, version numbers, model names.
 */
export function normalizeTitle(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, ' ')           // compress whitespace
    .toLowerCase()
    // Unify common typographic variants
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[—–]/g, '-')
    .replace(/ /g, ' ')        // non-breaking space → space
    .replace(/​/g, '')         // zero-width space → remove
    // Strip leading decorative symbols
    .replace(/^[\s\-·|【】「」『』《》\[\]<>＜＞#＃！!]+/, '')
    // Strip trailing decorative symbols
    .replace(/[\s\-·|【】「」『』《》\[\]<>＜＞#＃！!]+$/, '')
    .trim()
}
