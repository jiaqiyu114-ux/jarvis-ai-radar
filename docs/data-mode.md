# J.A.R.V.I.S. Data Mode Architecture

## 1. 两种数据模式

| 模式 | 触发条件 | 说明 |
|------|----------|------|
| **mock mode** | 默认（无环境变量） | 使用 `src/config/mock-data.ts`，无需任何配置，适合开发和演示 |
| **database mode** | 配置 Supabase 环境变量后自动启用 | 从 Supabase PostgreSQL 读取真实数据 |

模式判断逻辑在 `src/lib/data/runtime.ts`：

```ts
export function shouldUseDatabase(): boolean {
  return isSupabaseConfigured  // both env vars non-empty
}
```

## 2. 环境变量

```env
# 复制 .env.example 到 .env.local，填入真实值
# 不要提交 .env.local 到版本控制

NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

两个变量都非空时，自动切换到 database mode。任意一个为空则使用 mock mode。

## 3. Fallback 规则

| 情况 | 行为 |
|------|------|
| 未配置 Supabase 环境变量 | 全部使用 mock 数据 |
| 配置了环境变量但 Supabase 查询返回空数组 | fallback 到 mock 数据 |
| 配置了环境变量但查询抛出错误 | 各 db/*.ts 函数内部捕获错误并返回 `[]`，adapter 检测到 `[]` 后 fallback 到 mock |
| `pnpm build` 阶段（无 Supabase 连接） | 不影响，所有页面静态生成时使用 mock 数据 |

**核心 fallback 模式**（所有 adapter 一致）：

```ts
export async function getFeedItems(): Promise<InformationItem[]> {
  if (shouldUseDatabase()) {
    const rows = await listItems()        // 内部已 guard：错误时返回 []
    if (rows.length > 0) return rows.map(mapDbItem)
    // 空结果 → fall through
  }
  return mockItems                        // 始终安全
}
```

## 4. 页面接入状态

| 页面 | 路由 | 使用 adapter | 支持 fallback | 依赖真实 DB | 备注 |
|------|------|:---:|:---:|:---:|------|
| 今日雷达 | `/dashboard` | ✓ | ✓ | 否 | `getFeedItems` + `getDashboardStats` |
| 全量流 | `/feed` | ✓ | ✓ | 否 | `getFeedItems`，客户端过滤 |
| 精选流 | `/selected` | ✓ | ✓ | 否 | `getSelectedItems`（score ≥ 75） |
| 事件簇 | `/clusters` | ✓ | ✓ | 否 | `getClusters` + `getFeedItems` |
| 日报 | `/reports` | ✓ | ✓ | 否 | 报告始终使用 mock（AI 管道未就绪） |
| 选题池 | `/topics` | ✓ | ✓ | 否 | `getTopics` |
| 信源管理 | `/sources` | ✓ | ✓ | 否 | `getSources` |
| 配置 | `/settings` | — | — | 否 | 纯客户端状态，无数据依赖 |

**说明：**
- "使用 adapter"：页面通过 `src/lib/data/*` 而非直接导入 `mock-data.ts`
- "支持 fallback"：Supabase 不可用时自动使用 mock，不白屏
- "依赖真实 DB"：所有页面当前均可在无 DB 情况下正常展示

## 5. 数据架构

```
页面 (Server/Client Components)
  └── src/lib/data/*-adapter.ts      ← 统一入口，隐藏数据源
        ├── mock mode → src/config/mock-data.ts
        └── db mode   → src/lib/db/*.ts
                            └── src/lib/supabase/client.ts
                                  └── Supabase PostgreSQL
```

### 服务端组件页面（直接 await）

```tsx
// page.tsx
export default async function DashboardPage() {
  const [items, stats] = await Promise.all([getFeedItems(), getDashboardStats()])
  // ...
}
```

### 客户端组件页面（服务端 wrapper + 客户端组件分离）

```tsx
// page.tsx (server)
export default async function FeedPage() {
  const items = await getFeedItems()
  return <FeedClient items={items} />   // 传入初始数据
}

// _feed-client.tsx
"use client"
export default function FeedClient({ items }) { /* useState, 过滤等 */ }
```

## 6. 已知限制（当前版本）

| 限制 | 影响 | 计划 |
|------|------|------|
| `source` 字段在 DB 模式下显示 source UUID | 信源名称显示 "未知信源" | 添加 sources 表 JOIN |
| `relatedItemIds` 在 cluster 中始终为空 | 事件簇展开后无关联条目 | 通过 cluster_id 查询关联 items |
| `newClusters` 和 `pendingTopics` 在 DB 模式下始终为 0 | dashboard 统计数不完整 | 单独查询 clusters/topics 计数 |
| 日报始终使用 mock | /reports 页面 | 待 AI 评分管道完成后接入 |

## 7. 启用真实 Supabase 数据库

```bash
# 1. 创建 .env.local（不要提交到 git）
cp .env.example .env.local
# 编辑 .env.local，填入真实值

# 2. 在 Supabase 控制台执行 schema
# 粘贴 supabase/schema.sql 到 SQL Editor 运行

# 3. （可选）种入 mock 数据
pnpm add -D tsx                                            # 一次性安装
npx tsx --env-file=.env.local scripts/seed-mock-data.ts

# 4. 重启开发服务器
pnpm dev
# 项目自动检测环境变量，切换到 database mode
```

## 8. 安全声明

- **无硬编码 key**：所有 Supabase 凭据只通过环境变量传入
- **构建安全**：`pnpm build` 不依赖 Supabase 连接，所有路由静态生成时使用 mock 数据
- **MVP 阶段无 RLS**：当前为个人工具，未启用 Row Level Security。上线前须在 Supabase 控制台为所有表添加 RLS 策略
