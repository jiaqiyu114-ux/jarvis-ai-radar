/**
 * Presentation-layer text cleaning utilities.
 * Never modifies DB content — only used before rendering.
 *
 * Call cleanDisplayText() on any user-facing string (titles, summaries, source names).
 */

const NAMED: Record<string, string> = {
  '&amp;':   '&',
  '&lt;':    '<',
  '&gt;':    '>',
  '&quot;':  '"',
  '&#39;':   "'",
  '&apos;':  "'",
  '&nbsp;':  ' ',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;':'…',
  '&lsquo;': '‘',
  '&rsquo;': '’',
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&laquo;': '«',
  '&raquo;': '»',
  '&copy;':  '©',
  '&reg;':   '®',
  '&trade;': '™',
}

/** Decode HTML entities in a display string. */
export function decodeHtmlEntities(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .replace(/&[a-zA-Z]+;/g, m => NAMED[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

/**
 * Detect garbled text: UTF-8 bytes decoded as Latin-1/Windows-1252,
 * or Unicode replacement characters.
 */
function isGarbled(text: string): boolean {
  if (!text || text.length < 2) return false
  return (
    text.includes('â€') ||   // broken UTF-8 smart quotes/dashes
    text.includes('Ã©') ||   // é as mojibake
    text.includes('Ã ') ||   // à as mojibake
    text.includes('Ã¨') ||   // è as mojibake
    text.includes('Ã¼') ||   // ü as mojibake
    text.includes('Ã¶') ||   // ö as mojibake
    text.includes('â‚¬') ||  // € as mojibake
    text.includes('锟')  ||  // common GBK corruption
    text.includes('鈧')  ||
    text.includes('�') || // Unicode replacement char
    /\?\?\?/.test(text)        // triple question marks
  )
}

/**
 * Clean a display-layer string:
 * 1. Decode HTML entities
 * 2. Strip lone replacement characters
 * 3. Collapse excessive whitespace
 * 4. Return empty string if the result is still garbled
 */
export function cleanDisplayText(text: string | null | undefined): string {
  if (!text) return ''
  let cleaned = decodeHtmlEntities(text)
  cleaned = cleaned.replace(/�/g, '').trim()
  cleaned = cleaned.replace(/\s+/g, ' ')
  if (isGarbled(cleaned)) return ''
  return cleaned
}

/** Known domain → friendly display name overrides. */
const DOMAIN_NAMES: Record<string, string> = {
  'qbitai.com':           '量子位',
  'jiqizhixin.com':       '机器之心',
  'leiphone.com':         '雷锋网',
  '36kr.com':             '36氪',
  'syncedreview.com':     'Synced Review',
  'venturebeat.com':      'VentureBeat',
  'techcrunch.com':       'TechCrunch',
  'theverge.com':         'The Verge',
  'wired.com':            'Wired',
  'technologyreview.com': 'MIT Tech Review',
  'openai.com':           'OpenAI Blog',
  'anthropic.com':        'Anthropic Blog',
  'deepmind.google':      'DeepMind Blog',
  'blog.google':          'Google AI Blog',
  'microsoft.com':        'Microsoft Research',
  'huggingface.co':       'Hugging Face',
  'arxiv.org':            'arXiv',
  'arstechnica.com':      'Ars Technica',
  'blogs.nvidia.com':     'NVIDIA Blog',
  'mistral.ai':           'Mistral AI',
  'read.deeplearning.ai': 'The Batch',
  'thegradient.pub':      'The Gradient',
  'paperswithcode.com':   'Papers With Code',
  'infoq.com':            'InfoQ',
}

/**
 * Returns a clean display name for a source.
 * Falls back to URL hostname when the stored name is garbled or empty.
 */
export function safeSourceName(name: string | null | undefined, url: string | null | undefined): string {
  const n = cleanDisplayText(name)

  if (n.length > 0 && !isGarbled(n)) return n

  // Derive from URL
  if (url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '')
      return DOMAIN_NAMES[host] ?? host.split('.')[0].toUpperCase()
    } catch {
      // fall through
    }
  }

  return '未知信源'
}
