# Information Detail Card v1

## Why

J.A.R.V.I.S. is a personal information judgment system, not an RSS reader or a score list.
When a user clicks on an item, the system should help them answer:

1. What is this about?
2. Why does it matter?
3. What can I do with this?
4. Is this reliable?
5. Where is the original source?
6. Should this enter the topic pool or event timeline?

Previously, clicking a card either opened the original URL or showed an inline score breakdown.
Neither answered these questions.

## What this does NOT do

- Does NOT call any AI/LLM API.
- Does NOT fetch or scrape the original article.
- Does NOT read beyond title, summary, source, and metadata.
- Does NOT modify final_score or scoring weights.
- Does NOT incorporate behavioral signals (clicks, saves, read time).
- Does NOT generate fake event timelines.
- Does NOT fake media content.

## Implementation

### Components

| File | Purpose |
|------|---------|
| `src/lib/content/detail-explanation.ts` | Pure function — generates `InformationDetail` from item fields |
| `src/components/feed/item-detail-panel.tsx` | Renders the detail panel content (client component) |
| `src/components/feed/information-card.tsx` | Card list row — opens Dialog on click |

### Data source

All content is generated from:
- `item.title`, `item.summary` — RSS feed data
- `item.source`, `item.sourceTier` — source metadata
- `item.category`, `item.tags` — classification
- `item.publishedAt` — timestamp
- `item.scoreBreakdown`, `item.finalScore` — scoring dimensions
- `item.penalties` — penalty data
- `item.relatedReportCount` — multi-source proxy

### What each section contains

| Section | Data source | Notes |
|---------|-------------|-------|
| 这条信息在说什么 | `item.summary` or `item.title` | Honest note if only summary available |
| 为什么值得关注 | `explanation.topPositiveDrivers`, `relatedReportCount`, `sourceTier` | No fake reasoning |
| 可能给你的启发 | `scoreBreakdown.content_potential`, `actionability`, `relatedReportCount` | Template-based, not LLM |
| 来源与原文 | `source`, `sourceTier`, `originalUrl`, `publishedAt` | Prominent external link |
| 媒体信息 | — | Placeholder only; real extraction in future sprint |
| 事件追踪 | `relatedReportCount` (proxy) | Links to /clusters; shows disabled if no cluster |
| 评分审计 | `scoreBreakdown`, `penalties`, `explanation` | Full score detail at the bottom |

## Interaction

### Card list (folded)
- Title: plain `<span>` text, NOT a link
- ExternalLink icon: the ONLY way to open the original URL
- FeedbackActions: action-only, does not open dialog
- Chevron button: opens the detail dialog
- Click anywhere else on card: opens the detail dialog

### Detail dialog
- Close via `×` button or pressing `Escape`
- "查看原文" button inside: opens the original URL
- "查看事件追踪" link: navigates to `/clusters`
- Scrollable for long content

## Why not navigate to the original URL on card click

J.A.R.V.I.S. is a judgment system. When you click on a card, you want to understand the item's
context and significance FIRST, then decide if the original article is worth reading.

If clicking always opened the original URL:
- Every click = a context switch to an external site.
- The system provides no interpretation layer.
- The original article may be behind a paywall, in a different language, or very long.

The detail panel gives you a structured judgment layer within J.A.R.V.I.S.

## Why the external link is separate

The `ExternalLink` icon (and the "查看原文" button in the detail panel) are explicit navigation
actions. Users who want to read the original article can always access it — but it's a deliberate
action, not a default behavior.

## Why the score audit is at the bottom

Users should read the content interpretation FIRST:
- What happened?
- Why does it matter?
- What insights can I get?

Score numbers and dimension bars are for verification, not for decision-making. Putting them
at the bottom respects the reading flow.

## Media section — first version

No image/video extraction is done in this sprint. The media section shows a placeholder:
"暂无媒体信息。后续 Article Content Extraction v1 将提取封面图、视频和正文图片。"

## Event timeline — first version

The timeline section checks `item.relatedReportCount > 1` as a proxy for multi-source coverage.
If multiple sources are present: links to `/clusters`.
If single source: shows "暂未形成事件簇".

No real cluster data or event timeline generation is done in this sprint.

## Why behavioral signals are not used

"Point of interest" actions (save, star, read 2 minutes) are not interpreted as preference signals.
J.A.R.V.I.S. is a personal information radar, not a recommendation engine.

Future feedback will be explicit editorial annotation:
- "Mark this source as tier A"
- "This topic is relevant to current goals"
- "Add to topic pool"

Not: "You clicked 3 similar articles, so we're showing more like this."

## Verification

1. Open `/feed` → click any card body or chevron → Dialog opens.
2. Dialog should show all 8 sections.
3. Click `ExternalLink` icon in the card list → opens original URL.
4. Click `×` or press Escape → Dialog closes.
5. "查看原文" button in dialog → opens original URL.
6. Default `/feed` shows only real items (no demo/mock).
7. `pnpm lint` and `pnpm build` pass.
