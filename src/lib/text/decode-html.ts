/**
 * Presentation-layer HTML entity decoder.
 * Never modifies DB content — only used before rendering.
 *
 * Handles the most common HTML entities found in RSS/Atom feed titles and summaries.
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

export function decodeHtmlEntities(text: string | null | undefined): string {
  if (!text) return ''

  return text
    // Named entities
    .replace(/&[a-zA-Z]+;/g, m => NAMED[m] ?? m)
    // Decimal numeric entities e.g. &#8216; &#8217; &#8230;
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    // Hex numeric entities e.g. &#x2019;
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

/**
 * Returns a fallback display name for a source whose stored name looks garbled.
 * Derives from the URL domain if the name contains known garbage characters.
 */
export function safeSourceName(name: string | null | undefined, url: string | null | undefined): string {
  const n = name?.trim() ?? ''

  // Detect garbled: contains multibyte-as-latin1 patterns or replacement chars
  const isGarbled =
    n.length > 0 && (
      /[ååäöéàèçü�]/.test(n) ||
      n.includes('â€') ||
      n.includes('Ã') ||
      n.includes('?') && n.replace(/\?/g, '').trim().length < 2
    )

  if (!isGarbled && n.length > 0) return decodeHtmlEntities(n)

  // Fallback: derive readable name from URL domain
  if (url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '')
      // Known domain → display name mappings
      const KNOWN: Record<string, string> = {
        'qbitai.com':        '量子位',
        'jiqizhixin.com':    '机器之心',
        'leiphone.com':      '雷锋网',
        '36kr.com':          '36氪',
        'syncedreview.com':  'Synced Review',
        'venturebeat.com':   'VentureBeat',
        'techcrunch.com':    'TechCrunch',
        'theverge.com':      'The Verge',
        'wired.com':         'Wired',
        'technologyreview.com': 'MIT Tech Review',
        'openai.com':        'OpenAI Blog',
        'anthropic.com':     'Anthropic Blog',
        'deepmind.google':   'DeepMind Blog',
        'blog.google':       'Google AI Blog',
        'microsoft.com':     'Microsoft Research',
        'huggingface.co':    'Hugging Face',
        'arxiv.org':         'arXiv',
        'arstechnica.com':   'Ars Technica',
        'blogs.nvidia.com':  'NVIDIA Blog',
        'mistral.ai':        'Mistral AI',
      }
      return KNOWN[host] ?? host
    } catch {
      return n || '未知信源'
    }
  }

  return n || '未知信源'
}
