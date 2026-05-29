# J.A.R.V.I.S. Database Layer

## 当前状态

页面仍使用 mock data（位于 `src/config/mock-data.ts`）。数据库层已完整搭建，但尚未连接到页面。下一步是实现 Mock → Database Adapter 切换。

---

## 数据库表说明

### 1. `sources` — 信源

管理信息来源（RSS 订阅、微信公众号、Twitter 账号等）。

| 关键字段 | 说明 |
|---|---|
| `source_tier` | 可信度等级：S/A/B/C/D |
| `base_score` | 基础评分权重 |
| `is_blocked` | 是否已屏蔽 |
| `last_fetched_at` | 最近抓取时间 |

### 2. `items` — 信息条目

系统的核心实体，每条抓取到的原始内容对应一条 item。

| 关键字段 | 说明 |
|---|---|
| `source_id` | 关联 sources.id |
| `cluster_id` | 关联 clusters.id（可为 null） |
| `status` | new / scored / selected / archived / rejected |
| `final_score` | 代码计算得出（不由 AI 直接输出） |
| `ai_*_score` | AI 输出的 9 个维度分 |
| `embedding` | 预留字段，当前用 jsonb，后续可升级 pgvector |

### 3. `clusters` — 事件簇

多条 item 聚合后形成的事件主题。

| 关键字段 | 说明 |
|---|---|
| `main_item_id` | 代表性主 item |
| `source_count` | 来源数量（越多越重要） |
| `cluster_score` | 综合评分 |

### 4. `user_feedback` — 用户反馈

记录用户与 item 的交互行为（点击、收藏、有用/无用等）。

| 关键字段 | 说明 |
|---|---|
| `item_id` | 关联 items.id |
| `event_type` | 行为类型（view/click/save/useful/not_useful/...） |
| `feedback_value` | 行为权重分（由 FEEDBACK_VALUE_MAP 计算） |

### 5. `scoring_config` — 评分配置

存储评分权重和阈值，支持动态调整。

| 关键字段 | 说明 |
|---|---|
| `weights_json` | 9 个维度的权重（总和为 1.0） |
| `thresholds_json` | selected_min / display_min / must_read_min / topic_worthy |
| `active` | 当前生效的配置（同时只有一条 active=true） |

### 6. `topics` — 选题池

从高价值 item 衍生出的写作/创作选题。

| 关键字段 | 说明 |
|---|---|
| `source_item_id` | 来源 item（可为 null） |
| `angles` | 写作角度（jsonb 数组） |
| `status` | 待判断/可写/正在写/已发布/放弃/归档 |

---

## 当前页面为什么仍用 mock data

页面使用 `src/config/mock-data.ts` 中的静态数据，原因：

1. 数据库层（`src/lib/db/*`）已建立但未接入页面
2. 没有 Supabase 配置时，所有 db 函数都返回安全 fallback（`[]` 或 `null`）
3. 下一步需要实现 `src/lib/data/` adapter 层，才能在页面中切换数据源

---

## 如何配置本地 Supabase 环境

### 1. 在 Supabase 创建项目

前往 [supabase.com](https://supabase.com) 创建一个新项目，获取：
- Project URL（格式：`https://xxxx.supabase.co`）
- anon public key

### 2. 创建 .env.local

```bash
# 复制模板
cp .env.example .env.local
# 编辑填入真实 key（注意：.env.local 已在 .gitignore 中，不会提交）
```

`.env.local` 内容：
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. 执行 schema.sql

在 Supabase 控制台 → SQL Editor 中，执行整个 `supabase/schema.sql` 文件。

该 SQL 会创建 6 张表、索引、触发器，并插入一条默认评分配置。

---

## 数据访问层文件说明

所有文件位于 `src/lib/db/`：

| 文件 | 负责 |
|---|---|
| `sources.ts` | listSources / getSourceById / createSource / updateSource / blockSource |
| `items.ts` | listItems / listSelectedItems / createItem / updateItemScore / archiveItem / rejectItem |
| `clusters.ts` | listClusters / getClusterById / createCluster / attachItemToCluster / updateClusterScore |
| `feedback.ts` | createFeedback / listFeedbackByItem |
| `topics.ts` | listTopics / createTopicFromItem / updateTopicStatus / updateTopicPriority |
| `scoring-config.ts` | getActiveScoringConfig / updateScoringConfig |

所有函数在 Supabase 未配置时返回安全 fallback：
- list 类 → `[]`
- get / create / update 类 → `null`
- boolean 类 → `false`

---

## 评分架构

### AI 只输出维度分

AI 模型（未来接入）仅负责输出 9 个维度评分（0-100）：

```
relevance / source / importance / novelty / momentum /
credibility / actionability / content_potential / personal_fit
```

### final_score 由代码计算

`src/lib/scoring/final-score.ts` 中的 `calculateFinalScore()` 负责：

1. 将 9 个维度分按权重加权求和（rawScore）
2. 应用代码规则 penalties（重复、标题党、营销内容惩罚）
3. 应用 cluster bonus（多来源覆盖加分）
4. 应用 freshness multiplier（时间衰减）
5. 将结果 clamp 到 0–100

**这是一个纯函数，不依赖数据库、不调用 AI、不读取环境变量，完全可测试。**

---

## 下一步：Mock Data Adapter → Database Adapter

`src/lib/data/` 目录包含 adapter 骨架，设计用于未来切换数据源：

```
src/lib/data/
  runtime.ts          — getDataMode(): "mock" | "database"
  feed-adapter.ts     — getFeedItems() / getSelectedItems()
  sources-adapter.ts  — getSources()
  clusters-adapter.ts — getClusters()
  topics-adapter.ts   — getTopics()
```

切换流程：

1. 配置 `.env.local`（Supabase URL + Key）
2. `runtime.ts` 自动检测 `isSupabaseConfigured`，返回 `"database"`
3. 各 adapter 函数在 database mode 下调用对应 `src/lib/db/*.ts`
4. 页面改为调用 adapter 而非直接导入 mock data

---

## 当前尚未实现

以下功能在下一阶段再做，本轮不涉及：

- RSS 抓取（信源内容自动拉取）
- AI 评分（调用 LLM 对 item 评分）
- 定时任务（定时抓取/评分）
- 用户登录 / 认证
- RLS（Row Level Security）
- Supabase 部署
- pgvector（embedding 搜索，目前用 jsonb 占位）
