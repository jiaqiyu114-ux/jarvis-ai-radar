# J.A.R.V.I.S. Component Spec

## Layout Components

### AppShell
**Purpose:** Root layout wrapper providing sidebar + top bar + main area structure.

**Props:**
```ts
interface AppShellProps {
  children: React.ReactNode
}
```

**Notes:**
- Sidebar fixed left, 220px width
- Top status bar fixed top, 40px height
- Main content scrolls independently
- Body bg: #0a0e17

**Path:** `src/components/layout/app-shell.tsx`

---

### SidebarNav
**Purpose:** Left navigation with page links and active state.

**Props:**
```ts
interface SidebarNavProps {
  currentPath: string
}
```

**Nav items:**
- Dashboard (今日雷达)
- Feed (全量流)
- Selected (精选流)
- Clusters (事件簇)
- Reports (日报)
- Topics (选题池)
- Sources (信源管理)
- Settings (设置)

**Notes:**
- Active item: accent-cold highlight, left border indicator
- Icons from lucide-react
- Bottom section: system status dot

**Path:** `src/components/layout/sidebar-nav.tsx`

---

### TopStatusBar
**Purpose:** Top bar showing system status, last fetch time, today's item count.

**Props:**
```ts
interface TopStatusBarProps {
  lastFetchAt?: string
  todayCount?: number
  systemStatus?: 'ok' | 'fetching' | 'error'
}
```

**Notes:**
- Height: 40px
- Shows: "JARVIS" brand + status dot + last fetch + item count
- Status dot: green=ok, yellow=fetching, red=error

**Path:** `src/components/layout/top-status-bar.tsx`

---

## Feed Components

### InformationCard
**Purpose:** Primary content unit. Displays one piece of information with score, source, summary, and actions.

**Props:**
```ts
interface InformationCardProps {
  item: InformationItem
  variant?: 'compact' | 'expanded'
  onFeedback?: (action: FeedbackAction, itemId: string) => void
}
```

**Layout (compact):**
```
[ScoreBadge] [SourceTierBadge] Title                    [CategoryTag] [time]
             source • one_sentence_summary                             [⋯]
             [tag][tag][tag]  relatedReportCount reports
```

**Notes:**
- Hover: reveal full action row
- Click anywhere: toggle expanded view
- Expanded: shows score_breakdown panel below

**Path:** `src/components/feed/information-card.tsx`

---

### ScoreBadge
**Purpose:** Circular badge showing final_score with color coding.

**Props:**
```ts
interface ScoreBadgeProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
}
```

**Color logic:**
- ≥80: bg-green-500 text-white
- 50-79: bg-yellow-500 text-black
- <50: bg-red-500 text-white

**Notes:**
- Always monospace
- Size sm: 28px, md: 36px, lg: 44px

**Path:** `src/components/feed/score-badge.tsx`

---

### SourceTierBadge
**Purpose:** Small pill showing source credibility tier.

**Props:**
```ts
interface SourceTierBadgeProps {
  tier: 'S' | 'A' | 'B' | 'C'
}
```

**Styling:**
- S: amber/gold
- A: blue
- B: slate
- C: muted gray

**Path:** `src/components/feed/source-tier-badge.tsx`

---

### FeedbackActions
**Purpose:** Row of action buttons for user feedback on an item.

**Props:**
```ts
interface FeedbackActionsProps {
  itemId: string
  currentState?: {
    isFavorited?: boolean
    isUseful?: boolean
    isUseless?: boolean
    inTopicPool?: boolean
  }
  onAction: (action: FeedbackAction, itemId: string) => void
}

type FeedbackAction =
  | 'favorite'
  | 'useful'
  | 'useless'
  | 'add_to_topic_pool'
  | 'generate_angle'
  | 'block_source'
  | 'track_entity'
```

**Notes:**
- Compact: icon-only buttons
- Tooltip on hover for each action
- Mutually exclusive: useful/useless

**Path:** `src/components/feed/feedback-actions.tsx`

---

### ScoreBreakdownPanel
**Purpose:** Expandable panel showing dimension-level score breakdown.

**Props:**
```ts
interface ScoreBreakdownPanelProps {
  breakdown: ScoreBreakdown
}

interface ScoreBreakdown {
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
```

**Notes:**
- Horizontal bar per dimension
- Label + bar + number
- Small font, compact rows

**Path:** `src/components/feed/score-breakdown-panel.tsx`

---

## Dashboard Components

### StatCard
**Purpose:** Small metric card for dashboard summary row.

**Props:**
```ts
interface StatCardProps {
  label: string
  value: string | number
  change?: string
  icon?: React.ReactNode
  trend?: 'up' | 'down' | 'neutral'
}
```

**Path:** `src/components/dashboard/stat-card.tsx`

---

## Topic Components

### TopicCard
**Purpose:** Card showing a topic asset in the topic pool.

**Props:**
```ts
interface TopicCardProps {
  topic: TopicItem
  onStatusChange?: (id: string, status: TopicStatus) => void
}
```

**Notes:**
- Shows: title, core_info, target_platform, priority badge, status badge
- Actions: change status, open detail

**Path:** `src/components/topics/topic-card.tsx`

---

### TopicStatusBadge
**Purpose:** Status indicator for topic workflow state.

**Props:**
```ts
interface TopicStatusBadgeProps {
  status: TopicStatus
}

type TopicStatus =
  | 'pending'
  | 'worth_writing'
  | 'writing'
  | 'published'
  | 'abandoned'
  | 'archived'
```

**Path:** `src/components/topics/topic-status-badge.tsx`

---

## Utility Components

### EmptyState
**Props:**
```ts
interface EmptyStateProps {
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}
```

**Path:** `src/components/ui/empty-state.tsx`

---

### LoadingState
**Props:**
```ts
interface LoadingStateProps {
  count?: number  // number of skeleton cards to show
  variant?: 'card' | 'row'
}
```

**Path:** `src/components/ui/loading-state.tsx`
