/** One article extracted from an RSS / Atom feed, before DB normalisation. */
export type ParsedRssItem = {
  title:          string
  url:            string
  guid?:          string | null   // RSS <guid> or Atom <id> — preferred externalId
  author:         string | null
  summary:        string           // Short excerpt (~300 chars), for display
  rssFullContent: string | null    // Full text from content:encoded / Atom content (stripped HTML, up to 12k chars)
  publishedAt:    string           // ISO 8601
}

/** Per-source summary after a single ingest run. */
export type IngestSourceResult = {
  sourceId:      string
  sourceName:    string
  itemsParsed:   number
  itemsInserted: number
  itemsSkipped:  number
  error?:        string
}

/** Aggregate result returned by POST /api/fetch/rss. */
export type IngestResult = {
  sourcesChecked: number
  itemsParsed:    number
  itemsInserted:  number
  itemsSkipped:   number
  errors:         Array<{ source: string; message: string }>
}
