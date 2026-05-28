# J.A.R.V.I.S. Product Map

## Product Vision

A personal AI-era information command center. Not a feed reader — a signal radar.

The system turns raw information noise into structured, scored, actionable knowledge assets.

## Core Loop

```
Sources → Fetch → Clean → Pre-filter → Score → Cluster → Display → Feedback → Topic Pool
```

### Stage 1: Source Management (`/sources`)
- User defines sources: RSS feeds, newsletters, APIs, manual inputs
- Each source has a tier (S/A/B/C), category, and enabled/disabled state
- Sources can be blocked after repeated low-quality signals

### Stage 2: Information Fetching
- Background jobs fetch from each enabled source
- Raw content stored before any processing
- Deduplication by URL and content hash

### Stage 3: Content Cleaning
- Strip HTML, extract main body
- Normalize encoding and whitespace
- Extract metadata: title, author, published_at, url

### Stage 4: Pre-filtering
- Keyword blacklist filter
- Source blocklist check
- Minimum content length check
- Duplicate detection

### Stage 5: Scoring
- AI model outputs dimension scores (0-100 each)
- Code calculates final_score using weighted formula
- Freshness multiplier applied
- Cluster bonus applied if item belongs to trending cluster

### Stage 6: Clustering
- Items grouped into event clusters by entity + topic similarity
- Cluster has a main item (highest score) and related items
- Cluster momentum tracked over time

### Stage 7: Display
- `/dashboard`: Today's top signals, grouped by intent
- `/feed`: Full chronological stream with filters
- `/selected`: High-score items only (threshold configurable)

### Stage 8: User Feedback
- favorite / useful / useless → adjusts personal_fit_score for future items
- add_to_topic_pool → creates a topic asset from the item
- block_source → disables source, marks all its items as low priority
- track_entity → adds entity to watch list

### Stage 9: Topic Pool (`/topics`)
- Topic assets with status workflow
- Stores angles, evidence, target platform, reader pain points
- Status: pending → worth_writing → writing → published / abandoned

## Key Entities

| Entity | Description |
|--------|-------------|
| Source | RSS feed or data source with tier and metadata |
| Item | A single piece of information, cleaned and scored |
| Cluster | A group of related items covering the same event |
| Topic | A writing/analysis opportunity derived from items |
| Report | A daily AI-generated summary digest |
| FeedbackEvent | User action on an item (affects future scoring) |

## Iteration Order (V1)

1. DB schema + TypeScript types
2. Source management UI
3. Mock data pipeline (no real fetch)
4. Scoring system (code-based)
5. Feed display + filtering
6. Dashboard with panels
7. Topic pool
8. Daily report generation
9. Real fetch + cleaning pipeline
10. Cluster detection
