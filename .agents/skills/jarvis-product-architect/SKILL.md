# jarvis-product-architect

Product architecture, page structure, module design, requirement scoping, and iteration planning for J.A.R.V.I.S.

## Trigger

Use when:
- Deciding whether to build a feature
- Scoping what's in/out of V1
- Planning page layouts and information hierarchy
- Choosing between architectural approaches
- Reviewing module boundaries
- Deciding iteration order

## Product Principles

### J.A.R.V.I.S. is NOT:
- A generic RSS reader
- A news aggregator
- A content management system
- A social platform
- A generic SaaS tool

### J.A.R.V.I.S. IS:
- A personal signal radar
- An information-to-asset conversion system
- A daily-use command center for one person
- A tool for converting information into writing, analysis, and decisions

### Core Value Proposition

The user should be able to:
1. Start every day seeing the 5 most important signals
2. Quickly mark useful vs noise
3. Convert any signal into a writing angle in < 30 seconds
4. Build up a topic pool that compounds over time
5. Generate a daily brief without manual work

## Architecture Decisions

### Keep in V1
- Source management (manual input of RSS URLs)
- Mock data pipeline for UI testing
- Scoring system (code-based, AI-assisted dimensions)
- Feed display with filtering
- Dashboard with panels
- Topic pool with status workflow
- Basic daily report view

### Defer from V1
- Real RSS fetching (mock first, real later)
- AI dimension scoring via API (mock first)
- Event clustering algorithm (show mock clusters)
- Email/newsletter parsing
- Browser extension for manual capture
- Mobile app
- Team/multi-user features
- Billing or authentication

### Never Build (unless explicitly requested)
- User registration or login
- Payment processing
- Social features (comments, sharing, followers)
- Public content pages
- FastAPI backend

## Module Boundaries

```
src/
  app/           → Next.js pages (route handlers + page components)
  components/    → Reusable UI components
    layout/      → Shell, sidebar, status bar
    feed/        → Information cards, score/tier badges
    dashboard/   → Stat cards, dashboard panels
    topics/      → Topic cards, status badges
  config/        → Mock data, constants, scoring config
  lib/           → Scoring logic, utilities, type definitions
  types/         → Shared TypeScript types
```

## Iteration Order for V2+

1. Supabase schema + migrations
2. TypeScript types from schema
3. Source management CRUD (real DB)
4. Placeholder fetch jobs (mock data in DB)
5. Real RSS fetching
6. AI scoring integration (dimension API)
7. Cluster detection
8. Daily report generation
9. Feedback learning loop

## Feature Scoping Checklist

Before building any feature, verify:
- [ ] Is this part of the core loop?
- [ ] Does it serve information filtering or asset accumulation?
- [ ] Can it be tested with mock data?
- [ ] Is there a UI page or API route for it?
- [ ] Does it fit in V1 scope?

If any answer is No → defer or reject.

## Page Hierarchy

```
/                  → redirect to /dashboard
/dashboard         → today's radar (primary page)
/feed              → full stream (secondary)
/selected          → filtered high-score (secondary)
/clusters          → event groupings (secondary)
/reports           → daily digest (secondary)
/topics            → topic pool (asset page)
/sources           → source config (settings)
/settings          → scoring + preferences (settings)
```

## Component Coupling Rules

- Pages import components, never vice versa
- Feed components don't know about dashboard panels
- Topic components don't know about feed cards
- All components receive data via props, not by fetching themselves (in V1)
- Shared types live in `src/types/`, not inside component files
