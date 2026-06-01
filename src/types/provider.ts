/**
 * Provider Architecture types — business / frontend layer (camelCase).
 *
 * Key distinction:
 *   Provider = the external service J.A.R.V.I.S. pulls candidate signals from
 *              (e.g. AIHOT, AI Radar API, RSS, newsletter).
 *   Source   = the original publisher of the content
 *              (e.g. OpenAI Blog, Anthropic, arXiv, The Verge).
 *
 * A single item can enter via Provider "AIHOT" while its original Source
 * is "OpenAI Blog". provider_signal and source_score are computed separately.
 */

// ── Provider ──────────────────────────────────────────────────────────────────

export type ProviderType =
  | 'aihot'
  | 'rest_api'
  | 'rss'
  | 'manual'
  | 'official_feed'
  | 'newsletter'
  | 'unknown'

export type ProviderConfig = {
  id:             string
  name:           string
  type:           ProviderType
  baseUrl?:       string | null
  trustScore:     number        // 0-100; influences provider_signal weight
  enabled:        boolean
  lastFetchedAt?: string | null
  createdAt?:     string
  updatedAt?:     string
  // Declares the data origin of items this provider produces.
  // 'demo' providers (e.g. mock-provider) are excluded from the default feed.
  dataOrigin?:    import('@/types/database').DataOrigin
}

// ── Normalized item from any provider ────────────────────────────────────────

/**
 * The canonical shape every ProviderAdapter must return.
 * All provider-specific quirks are resolved before this point.
 */
export type NormalizedIngestItem = {
  // Provider context
  providerId:          string
  providerName:        string
  providerTrustScore:  number
  externalId:          string          // provider's own ID for this item
  providerScore?:      number | null   // ranking score from the provider (0-100)
  providerRank?:       number | null   // position in provider's feed (1 = top)
  providerCategory?:   string | null
  providerTags?:       string[]
  featured?:           boolean

  // Content (normalised)
  title:               string
  normalizedTitle:     string           // lowercase + stripped — used for dedup
  summary?:            string | null
  rssFullContent?:     string | null    // Full text from content:encoded (stripped HTML, up to 12k)
  url:                 string           // raw URL from provider
  canonicalUrl:        string           // cleaned, tracking-param-stripped URL

  // Original source attribution (may be null if provider doesn't expose it)
  originalSourceName?: string | null
  originalSourceUrl?:  string | null

  // Classification
  category?:           string | null
  tags?:               string[]
  entities?:           string[]

  // Timestamps
  publishedAt?:        string | null   // ISO 8601 from provider, or null
  fetchedAt:           string          // when J.A.R.V.I.S. fetched this

  // Raw data preservation
  rawPayload:          Record<string, unknown>
}

// ── Provider adapter interface ────────────────────────────────────────────────

export type ProviderAdapter = {
  provider:    ProviderConfig
  fetchItems:  () => Promise<NormalizedIngestItem[]>
}

// ── Item mention (one record per provider × item pair) ───────────────────────

/**
 * Tracks that a specific item was seen by a specific provider.
 * One item can have many mentions (from multiple providers).
 * mentionCount feeds into multi_provider_bonus in provider_signal.
 */
export type ItemMention = {
  id:               string
  itemId:           string
  providerId:       string
  externalId:       string
  providerScore?:   number | null
  providerRank?:    number | null
  providerCategory?: string | null
  providerTags?:    string[]
  rawPayload?:      Record<string, unknown>
  seenAt:           string
}
