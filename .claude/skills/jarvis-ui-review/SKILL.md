# jarvis-ui-review

Review or design UI for J.A.R.V.I.S. pages and components.

## Trigger

Use when:
- Designing a new page or component
- Reviewing existing UI for quality or consistency
- Asking "does this look right?" for any J.A.R.V.I.S. page
- Checking InformationCard, Dashboard, Feed, Topic Pool, Settings UI

## J.A.R.V.I.S. UI Standards

### Required

- **Dark mode only**: background #0a0e17, surface #0f1623
- **High information density**: no wasted whitespace, compact typography
- **Score always visible**: ScoreBadge must appear on every InformationCard
- **Source credibility visible**: SourceTierBadge always present
- **Published time always visible**: relative format ("2h ago")
- **Feedback actions accessible**: either always shown or on hover

### Forbidden

- White or light backgrounds
- Childish gradients (rainbow, pastel)
- Random neon effects not part of the design system
- Generic SaaS homepage layout (large hero, marketing copy)
- Low-density card layouts with huge empty space
- Score hidden behind hover or click only
- Source name absent or truncated

### Color Verification Checklist

- [ ] Background: near-black (#0a0e17 or similar)
- [ ] Cards: slightly lighter surface (#0f1623 or similar)
- [ ] Borders: subtle, low contrast
- [ ] Accent: cold blue / cyan (not warm, not neon)
- [ ] Score ≥80: green
- [ ] Score 50-79: yellow
- [ ] Score <50: red
- [ ] Tier S: gold/amber
- [ ] Tier A: blue
- [ ] Tier B: slate
- [ ] Tier C: muted

### Layout Verification Checklist

- [ ] Sidebar present (220px) with nav items
- [ ] Top status bar present (40px)
- [ ] Main content area scrollable
- [ ] Mobile: sidebar collapses or becomes drawer
- [ ] Dashboard: stat row at top
- [ ] Feed: dense list, not card grid
- [ ] Empty state: handled with message + optional action
- [ ] Loading state: skeleton, not spinner

### Component Checklist

For every InformationCard review:
- [ ] ScoreBadge with correct color
- [ ] SourceTierBadge visible
- [ ] Title present and readable
- [ ] One-sentence summary shown
- [ ] Source name shown
- [ ] Published time shown (relative)
- [ ] Category tag shown
- [ ] At least 3 feedback action buttons accessible
- [ ] Tags shown (max 3 + "+N" overflow)

For Dashboard review:
- [ ] 4 stat cards in top row
- [ ] "今日必须看" panel present
- [ ] "高分精选" panel present
- [ ] Score distribution chart present
- [ ] No marketing language or generic SaaS copy

## Review Output Format

When reviewing, output:
1. Pass/Fail for each checklist item
2. Specific issues with file:line references
3. Concrete fix suggestions
4. Priority: Critical / Important / Minor
