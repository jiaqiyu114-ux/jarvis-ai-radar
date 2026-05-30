/**
 * normalizeDisplayText — pure display-layer helper.
 * Decodes common HTML entities found in RSS feed titles and summaries.
 * Never modifies stored data; only used in the presentation layer.
 */

const NAMED_ENTITIES: Record<string, string> = {
  '&amp;':   '&',
  '&lt;':    '<',
  '&gt;':    '>',
  '&quot;':  '"',
  '&apos;':  "'",
  '&nbsp;':  ' ',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;':'…',
  '&lsquo;': '‘',
  '&rsquo;': '’',
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&trade;': '™',
  '&copy;':  '©',
  '&reg;':   '®',
}

/** Map of decimal code point → character for common typography entities. */
const NUMERIC_ENTITIES: Record<number, string> = {
  8216: '‘',  // '
  8217: '’',  // '
  8220: '“',  // "
  8221: '”',  // "
  8211: '–',  // –
  8212: '—',  // —
  8230: '…',  // …
  8482: '™',  // ™
  169:  '©',  // ©
  174:  '®',  // ®
  39:   "'",
  34:   '"',
  38:   '&',
  60:   '<',
  62:   '>',
  160:  ' ',       // non-breaking space
}

export function normalizeDisplayText(input?: string | null): string {
  if (!input) return ''

  let text = input

  // 1. Named entities
  text = text.replace(/&[a-zA-Z]+;/g, match => NAMED_ENTITIES[match] ?? match)

  // 2. Decimal numeric entities  &#NNN;
  text = text.replace(/&#(\d{1,6});/g, (_, code) => {
    const n = parseInt(code, 10)
    return NUMERIC_ENTITIES[n] ?? String.fromCodePoint(n)
  })

  // 3. Hex numeric entities  &#xHHHH;
  text = text.replace(/&#x([0-9a-fA-F]{1,6});/g, (_, hex) => {
    return String.fromCodePoint(parseInt(hex, 16))
  })

  // 4. Collapse whitespace runs (but not within URLs)
  text = text.replace(/[ \t]+/g, ' ').trim()

  return text
}
