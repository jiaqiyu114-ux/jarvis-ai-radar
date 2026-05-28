# J.A.R.V.I.S. Mock Data Spec

## Purpose

Mock data is used during V1 UI development before the real pipeline exists. All mock data should be realistic in structure and representative of actual information the system would process.

## Data Location

`src/config/mock-data.ts`

## Schema Definitions

### InformationItem

```typescript
interface InformationItem {
  id: string
  title: string
  summary: string                // one_sentence_summary
  source: string                 // source display name
  sourceTier: 'S' | 'A' | 'B' | 'C'
  publishedAt: string            // ISO 8601
  category: Category
  tags: string[]
  finalScore: number             // 0-100
  scoreBreakdown: ScoreBreakdown
  originalUrl: string
  relatedReportCount: number
}
```

### Source

```typescript
interface MockSource {
  id: string
  name: string
  url: string
  tier: 'S' | 'A' | 'B' | 'C'
  category: Category
  enabled: boolean
  lastFetchedAt: string
  itemsToday: number
  avgScore: number
  description: string
}
```

### Topic

```typescript
interface TopicItem {
  id: string
  sourceItemId: string
  topicTitle: string
  coreInfo: string
  possibleAngles: string[]
  targetPlatform: Platform
  targetReader: string
  readerPainPoint: string
  controversy: string
  stance: string
  evidenceLinks: string[]
  priority: 'high' | 'medium' | 'low'
  status: TopicStatus
  createdAt: string
}
```

### Cluster

```typescript
interface MockCluster {
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
```

### DailyReport

```typescript
interface DailyReport {
  id: string
  date: string
  summary: string[]
  topStories: Array<{ title: string; summary: string; score: number }>
  trendingTopics: string[]
  contentAngles: string[]
  generatedAt: string
}
```

## Category Enum

```typescript
type Category =
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
```

## Topic Status Enum

```typescript
type TopicStatus =
  | 'pending'
  | 'worth_writing'
  | 'writing'
  | 'published'
  | 'abandoned'
  | 'archived'
```

## Mock Data Quality Standards

- Titles should be specific and informative (not generic)
- Summaries should be 1 sentence, ≤30 words
- Scores should be realistic (distributed across ranges, not all 90+)
- Published times should cover last 48 hours
- At least 15 items for meaningful feed display
- At least 5 topics in various statuses
- At least 8 sources with varied tiers
- At least 3 clusters
- 1 daily report
