# J.A.R.V.I.S. Project Instructions

J.A.R.V.I.S. is a personal information radar system.

## Product Definition

J.A.R.V.I.S. helps the user collect information from multiple sources, clean it, score it, cluster it, display it, and convert high-value information into topic ideas, judgments, project inspiration, and long-term knowledge assets.

It is not a generic RSS reader. It is a personal AI-era information command center.

## Tech Stack

* Next.js
* TypeScript
* Tailwind CSS
* shadcn/ui
* Supabase PostgreSQL
* pgvector later
* pnpm

Do not change the tech stack without explicit permission.

## Core Product Loop

The first version must support this loop:

source management → information fetching → content cleaning → pre-filtering → scoring → clustering → display → user feedback → topic pool

## Product Pages

* /dashboard: 今日雷达
* /feed: 全量流
* /selected: 精选流
* /clusters: 事件簇
* /reports: 日报
* /topics: 选题池
* /sources: 信源管理
* /settings: 后台配置

## Development Rules

1. Do not add authentication, payment, or multi-user features unless explicitly requested.
2. Do not introduce FastAPI unless explicitly requested.
3. Keep code readable and easy to iterate.
4. Every feature must have either a visible UI page or a testable API route.
5. Use TypeScript types for all core entities.
6. AI models may output structured scores, but final_score must be calculated by code.
7. Always preserve source, source tier, published time, URL, and score information.
8. Do not build generic SaaS-style UI.
9. Do not use childish gradients or random neon effects.
10. Before major changes, explain which files will be changed.

## UI Direction

The interface should feel like a personal AI command center:

* dark mode first
* high information density
* calm but sharp
* professional
* card-based
* source credibility visible
* final score obvious
* useful for daily repeated use
* dashboard should feel like "today's signal radar"

Avoid:

* generic startup SaaS homepage style
* oversized empty cards
* random colorful gradients
* fake futuristic decorations
* low-density landing-page layout

## Core Information Card

Every information card should support these fields:

* title
* one_sentence_summary
* source
* source_tier
* published_at
* category
* tags
* final_score
* score_breakdown
* original_url
* related_report_count
* actions: favorite, useful, useless, add_to_topic_pool, generate_angle, block_source, track_entity
