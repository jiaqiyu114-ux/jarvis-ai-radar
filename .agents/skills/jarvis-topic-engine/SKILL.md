# jarvis-topic-engine

Convert information items into topic assets. Design and implement the topic pool workflow.

## Trigger

Use when:
- Building or modifying the /topics page
- Designing the "add to topic pool" flow
- Creating the topic generation feature
- Working on topic status management
- Implementing "generate angle" from InformationCard

## Topic Asset Schema

```typescript
interface TopicItem {
  id: string
  sourceItemId: string           // linked InformationItem
  topicTitle: string             // proposed article/analysis title
  coreInfo: string               // the core signal that makes this worth writing
  possibleAngles: string[]       // 3-5 different angles to approach this topic
  targetPlatform: Platform       // where this will be published
  targetReader: string           // who reads this
  readerPainPoint: string        // what problem does this solve for the reader
  controversy: string            // is there a debate or counterpoint?
  stance: string                 // recommended author stance
  evidenceLinks: string[]        // URLs supporting the angles
  priority: 'high' | 'medium' | 'low'
  status: TopicStatus
  createdAt: string
  updatedAt: string
}

type Platform =
  | '公众号'
  | '小红书'
  | '知乎'
  | 'Twitter/X'
  | '即刻'
  | '内部报告'
  | '其他'

type TopicStatus =
  | 'pending'        // just added, not yet evaluated
  | 'worth_writing'  // decided it's worth pursuing
  | 'writing'        // actively being written
  | 'published'      // done and published
  | 'abandoned'      // decided not to pursue
  | 'archived'       // kept for reference but not active
```

## Status Workflow

```
pending → worth_writing → writing → published
    ↓            ↓           ↓
 abandoned    abandoned   abandoned
                              ↓
                           archived
```

## Topic Pool UI Rules

- Default view: list grouped by status tab
- Status tabs: pending / worth_writing / writing / published / abandoned / archived
- Sorting: priority (high first) then createdAt (newest first)
- Platform filter: filter by targetPlatform
- Priority sort: high > medium > low

## Topic Card Display

Compact card showing:
- Title (bold)
- Platform badge
- Priority indicator (colored left border: red=high, yellow=medium, gray=low)
- Status badge
- Core info (1 line, truncated)
- Created date
- Link to source item

Expanded card adds:
- Possible angles list
- Target reader description
- Reader pain point
- Controversy note
- Stance recommendation

## "Generate Angle" Feature

When user clicks "生成选题" on an InformationCard:
1. Create a TopicItem with status: 'pending'
2. Pre-fill topicTitle from item.title
3. Pre-fill coreInfo from item.summary
4. Open topic editor modal/sheet
5. AI can suggest possibleAngles, targetReader, readerPainPoint (but user must review)

## Priority Scoring Logic

Suggested priority based on:
- high: final_score ≥ 85 AND content_potential_score ≥ 80
- medium: final_score ≥ 70 OR content_potential_score ≥ 70
- low: everything else

## Topic Pool Metrics (for dashboard)

- pending: count
- worth_writing: count
- in_progress (writing): count
- published_this_week: count
- conversion_rate: published / (pending + worth_writing + writing)
