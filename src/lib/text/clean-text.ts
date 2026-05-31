/**
 * Unified text cleaner for ingest and cluster generation.
 *
 * Processing order:
 *   1. Mojibake — UTF-8 bytes misread as Windows-1252/Latin-1
 *   2. HTML entities — named, decimal (&#NNN;), hex (&#xHH;)
 *   3. Whitespace normalisation
 *
 * Use cleanText() before storing titles/summaries to the DB.
 * Use fixMojibake() alone when you need just the first pass.
 */

// ── Mojibake table ────────────────────────────────────────────────────────────
// Each entry maps the Windows-1252 misread of a UTF-8 sequence to its correct char.
// Longer / more specific patterns must come first.

const MOJIBAKE_MAP: ReadonlyArray<readonly [string, string]> = [
  // 3-byte UTF-8 sequences decoded as Windows-1252
  ['â€™', '’'],  // â€™ → ' (right single quotation mark)
  ['â€˜', '‘'],  // â€˜ → ' (left single quotation mark)
  ['â€œ', '“'],  // â€œ → " (left double quotation mark)
  ['â€', '”'],  // â€  → " (right double quotation mark)
  ['â€“', '–'],  // â€" → – (en dash)
  ['â€”', '—'],  // â€" → — (em dash)
  ['â€¦', '…'],  // â€¦ → … (ellipsis)
  ['â€¢', '•'],  // â€¢ → • (bullet)
  ['â‚¬', '€'],  // â‚¬ → € (euro sign, CP1252 path)
  // Less common variants
  ['Ã©', 'é'],        // Ã© → é
  ['Ã ', 'à'],        // Ã  → à
  ['Ã¨', 'è'],        // Ã¨ → è
  ['Ã¼', 'ü'],        // Ã¼ → ü
  ['Ã¶', 'ö'],        // Ã¶ → ö
  ['Ã¤', 'ä'],        // Ã¤ → ä
]

export function fixMojibake(input: string): string {
  let text = input
  for (const [pattern, replacement] of MOJIBAKE_MAP) {
    // String.split().join() is faster than regex replace for literal strings
    if (text.includes(pattern)) {
      text = text.split(pattern).join(replacement)
    }
  }
  return text
}

// ── HTML entity decoder ───────────────────────────────────────────────────────

function decodeEntities(input: string): string {
  return input
    // Named entities
    .replace(/&amp;/gi,    '&')
    .replace(/&lt;/gi,     '<')
    .replace(/&gt;/gi,     '>')
    .replace(/&quot;/gi,   '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&nbsp;/gi,   ' ')
    .replace(/&mdash;/gi,  '—')
    .replace(/&ndash;/gi,  '–')
    .replace(/&hellip;/gi, '…')
    .replace(/&rsquo;/gi,  '’')
    .replace(/&lsquo;/gi,  '‘')
    .replace(/&rdquo;/gi,  '”')
    .replace(/&ldquo;/gi,  '“')
    .replace(/&trade;/gi,  '™')
    .replace(/&copy;/gi,   '©')
    .replace(/&reg;/gi,    '®')
    // Decimal numeric entities &#NNN;
    .replace(/&#(\d{1,6});/g, (_, code) => {
      const n = parseInt(code, 10)
      try { return String.fromCodePoint(n) } catch { return '' }
    })
    // Hex numeric entities &#xHHHH;
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (_, hex) => {
      const n = parseInt(hex, 16)
      try { return String.fromCodePoint(n) } catch { return '' }
    })
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Full text cleaning pipeline: mojibake → HTML entities → whitespace.
 * Safe on null/undefined (returns '').
 * Does NOT strip HTML tags — call stripHtml before this if needed.
 */
export function cleanText(input: string | null | undefined): string {
  if (!input) return ''
  let text = fixMojibake(input)
  text = decodeEntities(text)
  text = text.replace(/[ \t\r\n]+/g, ' ').trim()
  return text
}

/**
 * Returns true when cleanText(input) !== input.
 * Cheap dirty-check for counting.
 */
export function isDirtyText(input: string | null | undefined): boolean {
  if (!input) return false
  return cleanText(input) !== input
}
