/**
 * J.A.R.V.I.S. Database Types
 *
 * These types mirror the Supabase / PostgreSQL schema (snake_case).
 * They are kept separate from src/types/index.ts which holds
 * the camelCase frontend / mock-data types.
 *
 * Naming convention:
 *   Db<TableName>       — full row (SELECT *)
 *   Db<TableName>Insert — fields required for INSERT (no auto-generated fields)
 *   Db<TableName>Update — partial fields for UPDATE
 *
 * NOTE: All object types here use `type` (not `interface`).
 * TypeScript 6.0 changed behavior: `interface` no longer satisfies
 * `Record<string, unknown>`, which Supabase-js requires for GenericTable.
 * Using `type` aliases fixes the `never[]` insert/update errors.
 */

// ── Shared primitives ─────────────────────────────────────────────────────────

export type DbSourceTier = 'S' | 'A' | 'B' | 'C' | 'D'

export type SourceHealthStatus = 'unknown' | 'healthy' | 'degraded' | 'blocked'

export type DataOrigin = 'real' | 'demo' | 'seed' | 'mock' | 'unknown'

export type DbItemStatus = 'new' | 'scored' | 'selected' | 'archived' | 'rejected'

export type DbItemLanguage = 'zh' | 'en' | 'mixed'

export type DbFeedbackEventType =
  | 'view'
  | 'click'
  | 'read_30s'
  | 'read_2m'
  | 'save'
  | 'useful'
  | 'not_useful'
  | 'add_to_topic'
  | 'share'
  | 'dismiss'
  | 'block_source'

export type DbTopicPlatform = '公众号' | '小红书' | '知乎' | '视频号' | '长文' | '其他'

export type DbTopicStatus = '待判断' | '可写' | '正在写' | '已发布' | '放弃' | '归档'

export type DbTopicPriority = 'high' | 'medium' | 'low'

// ── sources ───────────────────────────────────────────────────────────────────

export type DbSource = {
  id:                string
  name:              string
  url:               string
  platform:          string
  source_tier:       DbSourceTier
  base_score:        number
  reliability_score: number
  category:          string
  is_official:       boolean
  is_blocked:        boolean
  last_fetched_at:   string | null
  items_today:       number
  description:       string | null
  data_origin:       DataOrigin
  created_at:        string
  updated_at:        string
  // RSS Source Health v1 fields (nullable — may be absent in older rows)
  health_status:     SourceHealthStatus | null
  last_fetch_at:     string | null
  last_success_at:   string | null
  last_error_at:     string | null
  last_error_message: string | null
  failure_count:     number
  avg_latency_ms:    number | null
  last_latency_ms:   number | null
  last_http_status:  number | null
  disabled_reason:   string | null
}

export type DbSourceInsert = {
  name:               string
  url:                string
  platform?:          string
  source_tier?:       DbSourceTier
  base_score?:        number
  reliability_score?: number
  category?:          string
  is_official?:       boolean
  description?:       string
  data_origin?:       DataOrigin
}

export type DbSourceUpdate = Partial<Omit<DbSourceInsert, 'url'>> & {
  is_blocked?:        boolean
  items_today?:       number
  last_fetched_at?:   string | null
  data_origin?:       DataOrigin
  // RSS Source Health v1
  health_status?:     string | null
  last_fetch_at?:     string | null
  last_success_at?:   string | null
  last_error_at?:     string | null
  last_error_message?: string | null
  failure_count?:     number
  avg_latency_ms?:    number | null
  last_latency_ms?:   number | null
  last_http_status?:  number | null
  disabled_reason?:   string | null
}

// ── items ─────────────────────────────────────────────────────────────────────

export type DbItem = {
  id:                      string
  source_id:               string | null
  source_tier:             DbSourceTier
  title:                   string
  url:                     string
  author:                  string | null
  raw_content:             string | null
  clean_content:           string | null
  summary:                 string
  language:                DbItemLanguage
  published_at:            string
  fetched_at:              string

  // AI-output dimension scores (0-100)
  ai_relevance_score:      number
  source_score:            number
  importance_score:        number
  novelty_score:           number
  momentum_score:          number
  credibility_score:       number
  actionability_score:     number
  content_potential_score: number
  personal_fit_score:      number

  // Code-computed penalties
  duplicate_penalty:       number
  clickbait_penalty:       number
  marketing_penalty:       number
  cognitive_load_penalty:  number

  // Code-computed final score — NEVER set by AI directly
  final_score:             number

  // Provider architecture additions
  canonical_url:           string | null
  provider_signal:         number | null
  evidence_score:          number | null
  raw_payload:             Record<string, unknown> | null

  category:                string
  entities:                string[]
  tags:                    string[]
  embedding:               number[] | null
  cluster_id:              string | null
  status:                  DbItemStatus
  data_origin:             DataOrigin

  // Evidence & Truth Scoring v1
  truth_score:             number | null
  ev_score:                number | null   // evidence quality (avoids collision with rule scorer's evidence_score)
  source_trace_score:      number | null
  claim_status:            string | null
  evidence_level:          string | null
  source_nature:           string | null
  has_original_source:     boolean | null
  has_author:              boolean | null
  has_published_time:      boolean | null
  has_article_content:     boolean | null
  has_media_evidence:      boolean | null
  evidence_notes:          string | null
  truth_notes:             string | null
  evidence_checked_at:     string | null

  // Article Content Extraction v1
  content_fetch_status:    string | null
  content_fetched_at:      string | null
  content_error_message:   string | null
  content_source_url:      string | null
  article_title:           string | null
  article_author:          string | null
  article_site_name:       string | null
  article_published_at:    string | null
  article_excerpt:         string | null
  clean_text:              string | null
  content_word_count:      number | null
  cover_image_url:         string | null
  media_urls:              string[] | null
  content_hash:            string | null

  created_at:              string
  updated_at:              string
}

export type DbItemInsert = {
  source_id?:               string
  source_tier?:             DbSourceTier
  title:                    string
  url:                      string
  author?:                  string
  raw_content?:             string
  clean_content?:           string
  summary?:                 string
  language?:                DbItemLanguage
  published_at:             string
  category?:                string
  entities?:                string[]
  tags?:                    string[]
  status?:                  DbItemStatus
  // Scoring fields — optional; DB defaults to 0 if omitted.
  // Ingest pipeline provides these via calculateFinalScore().
  ai_relevance_score?:      number
  source_score?:            number
  importance_score?:        number
  novelty_score?:           number
  momentum_score?:          number
  credibility_score?:       number
  actionability_score?:     number
  content_potential_score?: number
  personal_fit_score?:      number
  duplicate_penalty?:       number
  clickbait_penalty?:       number
  marketing_penalty?:       number
  cognitive_load_penalty?:  number
  final_score?:             number
  // Provider architecture additions (optional)
  canonical_url?:           string
  provider_signal?:         number
  evidence_score?:          number
  raw_payload?:             Record<string, unknown>
  data_origin?:             DataOrigin
}

export type DbItemUpdate = Partial<DbItemInsert> & {
  cluster_id?:              string | null
  status?:                  DbItemStatus
  fetched_at?:              string
  // Scoring fields — updated together via updateItemScore()
  ai_relevance_score?:      number
  source_score?:            number
  importance_score?:        number
  novelty_score?:           number
  momentum_score?:          number
  credibility_score?:       number
  actionability_score?:     number
  content_potential_score?: number
  personal_fit_score?:      number
  duplicate_penalty?:       number
  clickbait_penalty?:       number
  marketing_penalty?:       number
  cognitive_load_penalty?:  number
  final_score?:             number
  // Evidence & Truth Scoring v1
  truth_score?:             number | null
  ev_score?:                number | null
  source_trace_score?:      number | null
  claim_status?:            string | null
  evidence_level?:          string | null
  source_nature?:           string | null
  has_original_source?:     boolean | null
  has_author?:              boolean | null
  has_published_time?:      boolean | null
  has_article_content?:     boolean | null
  has_media_evidence?:      boolean | null
  evidence_notes?:          string | null
  truth_notes?:             string | null
  evidence_checked_at?:     string | null
  // Article Content Extraction v1
  content_fetch_status?:    string | null
  content_fetched_at?:      string | null
  content_error_message?:   string | null
  content_source_url?:      string | null
  article_title?:           string | null
  article_author?:          string | null
  article_site_name?:       string | null
  article_published_at?:    string | null
  article_excerpt?:         string | null
  clean_text?:              string | null
  content_word_count?:      number | null
  cover_image_url?:         string | null
  media_urls?:              string[] | null
  content_hash?:            string | null
}

export type DbItemScoreUpdate = {
  ai_relevance_score:      number
  source_score:            number
  importance_score:        number
  novelty_score:           number
  momentum_score:          number
  credibility_score:       number
  actionability_score:     number
  content_potential_score: number
  personal_fit_score:      number
  duplicate_penalty:       number
  clickbait_penalty:       number
  marketing_penalty:       number
  cognitive_load_penalty:  number
  final_score:             number
  status:                  DbItemStatus
}

// ── clusters ──────────────────────────────────────────────────────────────────

export type DbCluster = {
  id:                    string
  main_item_id:          string | null
  title:                 string
  summary:               string
  category:              string
  entities:              string[]
  source_count:          number
  official_source_count: number
  cluster_score:         number
  momentum_score:        number
  first_seen_at:         string
  last_seen_at:          string
  created_at:            string
  updated_at:            string
}

export type DbClusterInsert = {
  title:                  string
  summary?:               string
  category?:              string
  entities?:              string[]
  source_count?:          number
  official_source_count?: number
  cluster_score?:         number
  momentum_score?:        number
  first_seen_at?:         string
  last_seen_at?:          string
  main_item_id?:          string
}

export type DbClusterUpdate = Partial<DbClusterInsert>

// ── user_feedback ─────────────────────────────────────────────────────────────

export type DbUserFeedback = {
  id:             string
  item_id:        string
  event_type:     DbFeedbackEventType
  feedback_value: number
  created_at:     string
}

export type DbUserFeedbackInsert = {
  item_id:        string
  event_type:     DbFeedbackEventType
  feedback_value: number
}

export type DbUserFeedbackUpdate = Partial<DbUserFeedbackInsert>

// ── scoring_config ────────────────────────────────────────────────────────────

export type DbScoringWeights = {
  relevance:         number
  source:            number
  importance:        number
  novelty:           number
  momentum:          number
  credibility:       number
  actionability:     number
  content_potential: number
  personal_fit:      number
}

export type DbScoringThresholds = {
  selected_min:  number
  display_min:   number
  must_read_min: number
  topic_worthy:  number
}

export type DbScoringConfig = {
  id:              string
  config_name:     string
  weights_json:    DbScoringWeights
  thresholds_json: DbScoringThresholds
  active:          boolean
  created_at:      string
  updated_at:      string
}

export type DbScoringConfigInsert = {
  config_name:      string
  weights_json?:    DbScoringWeights
  thresholds_json?: DbScoringThresholds
  active?:          boolean
}

export type DbScoringConfigUpdate = {
  weights_json?:    Partial<DbScoringWeights>
  thresholds_json?: Partial<DbScoringThresholds>
  active?:          boolean
}

// ── topics ────────────────────────────────────────────────────────────────────

export type DbTopic = {
  id:             string
  source_item_id: string | null
  title:          string
  core_info:      string
  angles:         string[]
  platform:       DbTopicPlatform
  target_reader:  string
  pain_point:     string
  controversy:    string | null
  stance:         string | null
  notes:          string | null
  material_urls:  string[]
  priority:       DbTopicPriority
  status:         DbTopicStatus
  created_at:     string
  updated_at:     string
}

export type DbTopicInsert = {
  source_item_id?: string
  title:           string
  core_info?:      string
  angles?:         string[]
  platform?:       DbTopicPlatform
  target_reader?:  string
  pain_point?:     string
  controversy?:    string
  stance?:         string
  notes?:          string
  material_urls?:  string[]
  priority?:       DbTopicPriority
  status?:         DbTopicStatus
}

// ── providers ─────────────────────────────────────────────────────────────────

export type DbProviderType = 'aihot' | 'rest_api' | 'rss' | 'manual' | 'official_feed' | 'newsletter' | 'unknown'

export type DbProvider = {
  id:              string
  provider_key:    string   // stable business key (e.g. 'mock-provider-001')
  name:            string
  type:            DbProviderType
  base_url:        string | null
  trust_score:     number
  enabled:         boolean
  last_fetched_at: string | null
  created_at:      string
  updated_at:      string
}

export type DbProviderInsert = {
  provider_key:     string   // required; used as upsert conflict key
  name:             string
  type:             DbProviderType
  base_url?:        string
  trust_score?:     number
  enabled?:         boolean
}

export type DbProviderUpdate = Partial<DbProviderInsert> & {
  last_fetched_at?: string | null
}

// ── item_mentions ─────────────────────────────────────────────────────────────

export type DbItemMention = {
  id:                string
  item_id:           string
  provider_id:       string
  external_id:       string
  provider_score:    number | null
  provider_rank:     number | null
  provider_category: string | null
  provider_tags:     string[]
  raw_payload:       Record<string, unknown> | null
  seen_at:           string
  created_at:        string
}

export type DbItemMentionInsert = {
  item_id:            string
  provider_id:        string
  external_id:        string
  provider_score?:    number
  provider_rank?:     number
  provider_category?: string
  provider_tags?:     string[]
  raw_payload?:       Record<string, unknown>
  seen_at?:           string
}

// ── Supabase Database helper type ──────────────────────────────────────────────
// Used to type the SupabaseClient: createClient<Database>(url, key)
//
// Database['public'] must satisfy GenericSchema from @supabase/postgrest-js:
//   { Tables: Record<string, GenericTable>; Views: ...; Functions: ... }
//
// GenericTable requires Row/Insert/Update to extend Record<string, unknown>.
// In TypeScript 6.0, only `type` aliases satisfy this — `interface` does not.
// The Relationships: [] empty tuple extends GenericRelationship[] safely.

export type Database = {
  public: {
    Tables: {
      sources: {
        Row:           DbSource
        Insert:        DbSourceInsert
        Update:        DbSourceUpdate
        Relationships: []
      }
      items: {
        Row:           DbItem
        Insert:        DbItemInsert
        Update:        DbItemUpdate
        Relationships: []
      }
      clusters: {
        Row:           DbCluster
        Insert:        DbClusterInsert
        Update:        DbClusterUpdate
        Relationships: []
      }
      user_feedback: {
        Row:           DbUserFeedback
        Insert:        DbUserFeedbackInsert
        Update:        DbUserFeedbackUpdate
        Relationships: []
      }
      scoring_config: {
        Row:           DbScoringConfig
        Insert:        DbScoringConfigInsert
        Update:        DbScoringConfigUpdate
        Relationships: []
      }
      topics: {
        Row:           DbTopic
        Insert:        DbTopicInsert
        Update:        Partial<DbTopicInsert>
        Relationships: []
      }
      providers: {
        Row:           DbProvider
        Insert:        DbProviderInsert
        Update:        DbProviderUpdate
        Relationships: []
      }
      item_mentions: {
        Row:           DbItemMention
        Insert:        DbItemMentionInsert
        Update:        Partial<DbItemMentionInsert>
        Relationships: []
      }
    }
    Views:          { [_ in never]: never }
    Functions:      { [_ in never]: never }
    Enums:          { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
