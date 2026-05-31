export type Category =
  | 'AI技术'
  | '商业动态'
  | '产品发布'
  | '监管政策'
  | '融资并购'
  | '行业趋势'
  | '开源项目'
  | '研究报告'
  | '人物动态'
  | '其他'

export type SourceTier = 'S' | 'A' | 'B' | 'C'

export type TopicStatus =
  | 'pending'
  | 'worth_writing'
  | 'writing'
  | 'published'
  | 'abandoned'
  | 'archived'

export type Platform =
  | '公众号'
  | '小红书'
  | '知乎'
  | 'Twitter/X'
  | '即刻'
  | '内部报告'
  | '其他'

export type FeedbackAction =
  | 'favorite'
  | 'useful'
  | 'useless'
  | 'add_to_topic_pool'
  | 'generate_angle'
  | 'block_source'
  | 'track_entity'

export interface ScoreBreakdown {
  ai_relevance: number
  source_score: number
  importance: number
  novelty: number
  momentum: number
  credibility: number
  actionability: number
  content_potential: number
  personal_fit: number
}

export interface ItemPenalties {
  duplicate:     number
  clickbait:     number
  marketing:     number
  cognitiveLoad: number
}

// ── Analysis Queue / Token Budget Gate ───────────────────────────────────────

export type AnalysisTier     = 'none' | 'light' | 'standard' | 'deep' | 'cluster'
export type AnalysisPriority = 'low' | 'normal' | 'high' | 'urgent'
export type AnalysisStage    =
  | 'unprocessed' | 'skipped'
  | 'light_ready'    | 'light_done'
  | 'standard_ready' | 'standard_done'
  | 'deep_ready'     | 'deep_done'
  | 'cluster_ready'  | 'archived'
export type TokenBudgetTier  = 'none' | 'cheap' | 'normal' | 'premium'

export interface AnalysisGate {
  analysisTier:           AnalysisTier
  analysisPriority:       AnalysisPriority
  analysisStage:          AnalysisStage
  tokenBudgetTier:        TokenBudgetTier
  estimatedInputTokens:   number
  estimatedOutputTokens:  number
  estimatedTotalTokens:   number
  shouldDeepAnalyze:      boolean
  shouldTrackEvent:       boolean
  shouldEnterDailyReport: boolean
  shouldEnterTopicPool:   boolean
  analysisReason:         string
  queuedAt:               string | null
}

// ── Evidence & Truth Scoring ──────────────────────────────────────────────────

export type ClaimStatus =
  | 'unverified'      // not enough information to judge
  | 'reported'        // reputable media reports it
  | 'source_claimed'  // official source says it themselves
  | 'confirmed'       // multi-source cross-verified (not yet available in v1)
  | 'disputed'        // conflicting reports exist
  | 'rumor'           // low-credibility origin
  | 'unclear'         // contradictory or ambiguous

export type EvidenceLevel = 'low' | 'medium' | 'high' | 'very_high'

export type SourceNature =
  | 'official'          // official company or institution
  | 'primary_report'    // first-hand journalism / direct coverage
  | 'secondary_report'  // re-reporting from other sources
  | 'analysis'          // opinion / analysis / commentary
  | 'research'          // academic preprint or peer-reviewed paper
  | 'marketing'         // promotional / company announcement
  | 'rumor'             // unverified / social media / speculation
  | 'unknown'           // cannot determine

export interface EvidenceProfile {
  // Scores (0-100)
  truthScore:        number
  evidenceScore:     number   // mapped from ev_score in DB
  sourceTraceScore:  number
  // Classification
  claimStatus:       ClaimStatus
  evidenceLevel:     EvidenceLevel
  sourceNature:      SourceNature
  // Boolean signals
  hasOriginalSource: boolean
  hasAuthor:         boolean
  hasPublishedTime:  boolean
  hasArticleContent: boolean
  hasMediaEvidence:  boolean
  // Notes
  evidenceNotes:     string
  truthNotes:        string
  checkedAt:         string | null
}

export type ContentFetchStatus = 'not_fetched' | 'fetched' | 'failed' | 'skipped'

export interface ArticleContent {
  fetchStatus:    ContentFetchStatus
  fetchedAt?:     string | null
  errorMessage?:  string | null
  // Extracted content
  cleanText?:     string | null
  wordCount?:     number | null
  excerpt?:       string | null   // article_excerpt (meta description or og:description)
  articleTitle?:  string | null
  authorName?:    string | null
  siteName?:      string | null
  canonicalUrl?:  string | null
  // Media
  coverImageUrl?: string | null
  mediaUrls?:     string[]
}

export interface InformationItem {
  id: string
  title: string
  summary: string
  source: string
  sourceTier: SourceTier
  publishedAt: string
  fetchedAt?: string | null
  category: Category
  tags: string[]
  finalScore: number
  scoreBreakdown: ScoreBreakdown
  originalUrl: string
  relatedReportCount: number
  penalties?: ItemPenalties         // populated from DB penalty columns
  articleContent?: ArticleContent   // populated after content extraction
  evidenceProfile?: EvidenceProfile  // populated after evidence scoring
  analysisGate?:   AnalysisGate     // populated after budget gate run
  // Source curation (source-curation-v1) — optional for backward compat
  isOfficial?:         boolean
  isUserCurated?:      boolean
  userSourceLabel?:    string | null
  userSourceNote?:     string | null
  sourceBadgeVariant?: string | null
}

export interface MockSource {
  id: string
  name: string
  url: string
  tier: SourceTier
  category: Category
  enabled: boolean
  lastFetchedAt: string
  itemsToday: number
  avgScore: number
  description: string
}

export interface TopicItem {
  id:              string
  sourceItemId:    string
  topicTitle:      string
  coreInfo:        string
  possibleAngles:  string[]
  targetPlatform:  Platform
  targetReader:    string
  readerPainPoint: string
  priority:        'high' | 'medium' | 'low'
  status:          TopicStatus
  createdAt:       string
  // Topic pool from item v1
  sourceName?:     string | null
  sourceUrl?:      string | null
  finalScore?:     number | null
  truthScore?:     number | null
  evScore?:        number | null
}

export interface MockCluster {
  id: string
  title: string
  primaryItemId: string
  relatedItemIds: string[]
  sourceCount: number
  firstSeenAt: string
  latestAt: string
  momentum: number
  category: Category
}

export interface DailyReport {
  id: string
  date: string
  summary: string[]
  topStories: Array<{ title: string; summary: string; score: number }>
  trendingTopics: string[]
  contentAngles: string[]
  generatedAt: string
}

export interface DashboardStats {
  todayTotal: number
  highScoreCount: number
  newClusters: number
  pendingTopics: number
}
