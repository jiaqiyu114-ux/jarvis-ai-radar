# J.A.R.V.I.S. Data Mode Architecture

## Overview

All pages access data through a unified adapter layer at `src/lib/data/`.
This makes it possible to switch between mock data and Supabase with a single
env-var change, without touching any page code.

```
Page → data adapter → mock data (default)
                    → Supabase database (when env vars are set)
```

## How the Mode Is Determined

`src/lib/data/runtime.ts` exports:

```ts
getDataMode(): 'mock' | 'database'
shouldUseDatabase(): boolean
```

The mode is `database` when both `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` are non-empty in the environment.
Otherwise it is `mock`.

## Fallback Guarantee

Every adapter function follows this pattern:

```ts
export async function getFeedItems(): Promise<InformationItem[]> {
  if (shouldUseDatabase()) {
    const rows = await listItems()      // returns [] on error or no config
    if (rows.length > 0) return rows.map(mapDbItem)
  }
  return mockItems                      // always safe
}
```

The page will never crash — if Supabase is unreachable or returns nothing,
mock data is returned transparently.

## Adapters

| File | Exports | Notes |
|------|---------|-------|
| `feed-adapter.ts` | `getFeedItems`, `getSelectedItems`, `getDashboardStats`, `allItems`, `dashboardStats` | `allItems` is sync mock for client components |
| `clusters-adapter.ts` | `getClusters`, `allClusters` | `relatedItemIds` always `[]` from DB until items join added |
| `sources-adapter.ts` | `getSources` | `DbSourceTier 'D'` mapped to `'C'` |
| `topics-adapter.ts` | `getTopics`, `allTopics` | DbTopicStatus → TopicStatus mapped exhaustively |
| `reports-adapter.ts` | `getDailyReport`, `latestReport` | Always mock — reports need AI pipeline |
| `runtime.ts` | `getDataMode`, `shouldUseDatabase` | Single source of truth for mode detection |

## Page Architecture

Server-component pages (`/dashboard`, `/selected`, `/sources`) use `await` directly:

```tsx
export default async function DashboardPage() {
  const [items, stats] = await Promise.all([getFeedItems(), getDashboardStats()])
  // render with live data
}
```

Client-component pages (`/feed`, `/clusters`, `/topics`, `/reports`) are split into
a thin server wrapper that fetches data + a `_*-client.tsx` that owns state:

```tsx
// page.tsx (server)
export default async function FeedPage() {
  const items = await getFeedItems()
  return <FeedClient items={items} />
}

// _feed-client.tsx (client)
"use client"
export default function FeedClient({ items }) { /* useState, filtering, etc. */ }
```

## Enabling Supabase (Database Mode)

1. Create `.env.local` in the project root (do **not** commit this file):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

2. Apply the schema:

```bash
# Paste contents of supabase/schema.sql into the Supabase SQL editor
```

3. Optionally seed mock data into Supabase:

```bash
pnpm add -D tsx                                          # one-time
npx tsx --env-file=.env.local scripts/seed-mock-data.ts
```

4. Restart the dev server. The app will automatically switch to database mode.

## Known Limitations (Current Sprint)

- `source` name in `InformationItem` shows the raw UUID when items come from DB
  (source name requires a JOIN; tracked for next sprint).
- `sourceTier` defaults to `'B'` for DB items (same reason).
- `relatedItemIds` on clusters is always empty from DB (requires items JOIN).
- `DashboardStats.newClusters` and `.pendingTopics` are always `0` in DB mode
  (separate cluster/topic queries not yet wired to stats).
- Reports always come from mock data regardless of mode (AI pipeline not yet built).
