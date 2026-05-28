# J.A.R.V.I.S. Page Structure

## /dashboard — 今日雷达

**Purpose:** Daily starting point. Shows the most important signals today.

### Panels

#### Stat Row (top)
4 stat cards in a row:
- Today's items: total fetched today
- High score (≥80): count of items scoring 80+
- New clusters: event clusters formed today
- Pending topics: items waiting in topic pool

#### 今日必须看
- Items with final_score ≥ 88
- Max 5 items
- Compact card list
- No filter needed — these are the best of the day

#### 高分精选
- Items with final_score 75–87
- Max 8 items
- Score badge prominent

#### 趋势上升
- Items in growing clusters (momentum_score ≥ 70)
- Cluster label visible
- Related report count shown

#### 适合写成内容
- Items with content_potential_score ≥ 80
- actionability_score ≥ 70
- Max 5 items
- Quick "加入选题池" button

#### 与当前项目相关
- Items with ai_relevance_score ≥ 85
- Derived from user's current project keywords
- Max 5 items

#### 今日统计 (bottom right)
- Sources fetched today
- Average score
- Score distribution chart (bar)
- Top categories today

---

## /feed — 全量流

**Purpose:** Complete chronological stream of all fetched items.

### Layout

Dense list format (not card grid).

### Controls (top bar)
- Search: full-text search on title + summary
- Filter by category (multi-select)
- Filter by source tier (S/A/B/C)
- Filter by score range (slider)
- Sort: newest / highest score / most momentum

### Content
- InformationCard (compact variant) per item
- Infinite scroll or pagination (50 per page)
- Sticky date dividers
- Quick feedback actions inline

---

## /selected — 精选流

**Purpose:** Curated high-signal feed. Only items above selected_min_score threshold.

### Layout

Similar to /feed but denser — only high-quality items.

### Controls
- Filter by category
- Sort: score / time
- Toggle: show score breakdown inline

### Notes
- Default threshold: final_score ≥ 75
- Threshold configurable in /settings

---

## /clusters — 事件簇

**Purpose:** View information grouped by event/topic cluster.

### Layout

List of clusters, each expandable.

### Cluster Card
- Cluster title (auto-generated from entity + event type)
- Source count (e.g., "14 sources")
- Score of primary item
- Time range (first seen → latest update)
- Source distribution chips

### Expanded Cluster View
- Primary item (highest score)
- Timeline of related items
- Source breakdown by tier

---

## /reports — 日报

**Purpose:** Auto-generated daily digest.

### Layout

Single page per day, selectable by date.

### Sections
- Executive summary (3–5 bullets)
- Top stories with one-line summaries
- Trending topics
- Suggested content angles

### Actions
- Copy as Markdown
- Generate 公众号 draft outline
- Generate 小红书 topic suggestions
- Export as PDF (future)

---

## /topics — 选题池

**Purpose:** Manage writing/analysis opportunities derived from information items.

### Layout

Default: list view with status filter tabs
Optional: kanban view by status column

### Status Tabs
pending / worth_writing / writing / published / abandoned / archived

### Topic Card
- Title + core info
- Target platform badge
- Priority indicator
- Status badge
- Source item link
- Possible angles (collapsed)

### Actions
- Change status
- Edit angles
- Mark priority
- Link to report

---

## /sources — 信源管理

**Purpose:** Manage all information sources.

### Layout

Table with filters.

### Columns
| Column | Description |
|--------|-------------|
| Name | Source name |
| URL | Feed URL |
| Tier | S/A/B/C badge |
| Category | Primary category |
| Enabled | Toggle on/off |
| Last Fetched | Relative timestamp |
| Items Today | Count |
| Avg Score | Average final_score of recent items |
| Actions | Edit / Block / Delete |

### Actions
- Add new source (form)
- Bulk enable/disable
- Import OPML (future)

---

## /settings — 后台配置

**Purpose:** Configure scoring weights, thresholds, interest profile, and system settings.

### Sections

#### 评分权重
- Sliders for each dimension weight
- Must sum to 1.0 (validated in real-time)
- Reset to defaults button

#### 阈值配置
- selected_min_score
- must_read_min_score
- topic_worthy_score
- display_min_score

#### 个人兴趣画像
- Text area: describe current focus areas
- Tags: add interest keywords

#### 当前项目关键词
- Tag input for project-specific terms
- These boost ai_relevance_score

#### 黑名单关键词
- Keywords that trigger noise_penalty
- Source blocklist

#### 模型配置
- AI model selection
- API key status (masked)
- Scoring mode: auto / manual review
