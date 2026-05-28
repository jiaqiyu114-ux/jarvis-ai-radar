# J.A.R.V.I.S. UI Design Guide

## Design Philosophy

The interface is a personal command center, not a consumer app. It is used by one person, repeatedly, every day. Every design decision should optimize for:

- Speed of information scanning
- Signal vs noise clarity
- Low cognitive overhead
- Repeatability without fatigue

## Color System

### Base Palette

```
Background:      #0a0e17  (near-black, cold blue-tinted)
Surface:         #0f1623  (cards, panels)
Surface-raised:  #161e2e  (hover, selected)
Border:          #1e2d42  (subtle, low contrast)
Border-strong:   #2a3f5c  (interactive elements)
```

### Text

```
Primary:         #e2e8f0  (main content)
Secondary:       #94a3b8  (metadata, labels)
Muted:           #4a5568  (timestamps, disabled)
Accent-cold:     #60a5fa  (links, highlights, active state)
Accent-cyan:     #22d3ee  (high-score badges, alerts)
Accent-violet:   #a78bfa  (topic pool, creative signals)
```

### Semantic Colors

```
Score-high:      #22c55e  (≥80: green)
Score-mid:       #eab308  (50–79: yellow)
Score-low:       #ef4444  (< 50: red)

Tier-S:          #f59e0b  (gold — top sources)
Tier-A:          #60a5fa  (blue — reliable sources)
Tier-B:          #94a3b8  (slate — standard sources)
Tier-C:          #4a5568  (muted — low-credibility sources)

Status-new:      #22d3ee
Status-read:     #4a5568
Status-saved:    #a78bfa
Status-flagged:  #f59e0b
```

### What NOT to use
- Bright neon greens or pinks
- Full-saturation colorful gradients
- White backgrounds
- Pastel palettes
- Drop shadows with heavy blur

## Typography

Font stack: Geist Sans (UI), Geist Mono (scores, metadata, code)

### Scale

```
xs:   11px / 14px  — timestamps, micro-labels
sm:   12px / 16px  — tags, badges, source names
base: 14px / 20px  — card body text
md:   15px / 22px  — card titles
lg:   18px / 26px  — section headers
xl:   22px / 30px  — page titles
```

### Density Rules

- Card body: 2-line max for summary, truncate with "..."
- Tags: max 3 visible, rest behind "+N" badge
- Timestamps: relative format ("2h ago"), ISO on hover
- Source name: always visible, never truncated

## Layout

### Shell

```
┌─────────────────────────────────────────────────────┐
│  Top Status Bar (h=40)                              │
├──────────┬──────────────────────────────────────────┤
│ Sidebar  │                                          │
│ (w=220)  │   Main Content Area                      │
│          │                                          │
│ Nav      │                                          │
│ Items    │                                          │
│          │                                          │
└──────────┴──────────────────────────────────────────┘
```

- Sidebar: collapsible on mobile, always visible on desktop
- Status bar: shows last fetch time, item count, system status
- Main: scrollable, 100vh - 40px

### Dashboard Layout

```
┌────────────────────────────────┐
│ Stat Row (4 cards)             │
├────────────┬───────────────────┤
│ Must-Read  │ High Score Feed   │
│ (narrow)   │ (wider)           │
├────────────┴───────────────────┤
│ Trending / Related to Project  │
└────────────────────────────────┘
```

### Feed Layout

Dense list, not card grid. One item per row with:
```
[Score] [Tier] Title                    [Category] [Time]
        Source • Summary preview                   [Actions]
        [tag] [tag] [tag]
```

### Topic Pool Layout

Kanban-style columns by status, or flat list with status filter.

## Components Behavior

### Score Badge
- Circle with number, color-coded
- ≥80: green bg / white text
- 50-79: yellow bg / dark text
- <50: red bg / white text
- Always monospace font

### Source Tier Badge
- Small pill: "S" "A" "B" "C"
- Gold / Blue / Slate / Muted

### Information Card (expanded)
- Hover reveals full action row
- Default state: compact, max 2 lines
- Click: expand to show score breakdown

### Empty State
- Icon + one-line message + optional action button
- No illustrations, no stock images
- Muted color, not sad/playful

### Loading State
- Skeleton only (no spinners)
- Skeleton matches card dimensions
- 3-5 skeleton cards max at once

## Do / Don't

| Do | Don't |
|----|-------|
| Compact information density | Large hero images |
| Monochrome base + sparse accent | Rainbow color schemes |
| Subtle borders for cards | Heavy box shadows |
| Score always visible | Hide score behind hover |
| Relative timestamps | Long date strings |
| Consistent icon set (lucide) | Mixed icon styles |
| Dark bg throughout | White/light mode default |
| Information hierarchy via weight | Information hierarchy via color alone |
