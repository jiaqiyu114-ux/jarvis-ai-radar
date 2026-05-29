# J.A.R.V.I.S. Provider Architecture v1

## 1. Provider vs Source — 核心区别

| 概念 | 定义 | 例子 |
|------|------|------|
| **Provider** | 信息从哪个**外部入口**进入 J.A.R.V.I.S. | AIHOT API、AI 日报、RSS 聚合器、手动导入 |
| **Source** | 信息**最初来自哪里**（原始发布者） | OpenAI Blog、Anthropic、arXiv、The Verge |

**例子：**
某条信息通过 `AIHOT` 接口进入系统，但内容来自 `OpenAI Blog`。
- Provider = AIHOT（影响 `provider_signal`）
- Source = OpenAI Blog（影响 `source_score`、`credibility_score`、`evidence_score`）

**为什么要分开？**
- Provider 可信度 ≠ 内容可信度。
- 一条信息可以被多个 Provider 报道（multi-provider bonus）。
- 同一 Source 可以来自不同 Provider（RSS 直抓 vs 聚合器转发）。

## 2. NormalizedIngestItem — 标准化入口格式

所有 ProviderAdapter 必须返回 `NormalizedIngestItem[]`。
这是每条候选信号在进入 J.A.R.V.I.S. 评分管道之前的统一形态。

关键字段：

| 字段 | 说明 |
|------|------|
| `providerId` / `providerName` | 来源 Provider 标识 |
| `externalId` | Provider 侧的唯一 ID（用于 item_mentions 去重） |
| `title` + `normalizedTitle` | 原始标题和规范化标题（用于比较） |
| `url` + `canonicalUrl` | 原始 URL 和去追踪参数后的规范 URL（用于去重） |
| `originalSourceName` | 原始发布者名称（null = 来源不明，触发惩罚） |
| `providerScore` + `providerRank` | Provider 自己的质量/排名信号 |
| `featured` | Provider 是否标记为精选 |
| `rawPayload` | 完整原始 JSON（保留备用，不参与评分） |

## 3. 为什么需要 item_mentions

一条内容可以同时被多个 Provider 报道。`item_mentions` 表记录每个 Provider
对同一条 item 的引用，用于：

1. **multi_provider_bonus**：被 ≥2 个 Provider 报道 → provider_signal 加分
2. **审计溯源**：每条 item 可追溯到哪些 Provider、什么时间、什么分值
3. **去重判据**：`(provider_id, external_id)` UNIQUE 防止同一 Provider 重复写

## 4. provider_signal 公式

```
provider_signal =
  0.45 × provider_trust_score   (Provider 预设信任分，0-100)
+ 0.25 × provider_score         (Provider 对这条内容的质量评分，默认 50)
+ 0.15 × rank_score             (排名转换分)
+ 0.10 × featured_bonus         (是否被 Provider 标注为精选)
+ 0.05 × multi_provider_bonus   (多 Provider 报道加成)
```

**rank_score 映射：**

| 排名 | rank_score |
|------|-----------|
| 1 | 100 |
| 2–3 | 90 |
| 4–10 | 75 |
| 11–30 | 60 |
| ≥31 | 45 |
| 无排名 | 50 |

**featured_bonus：** `featured=true` → 100；否则 → 0

**multi_provider_bonus：**

| 引用次数 | bonus |
|---------|-------|
| ≥4 | 100 |
| 3 | 80 |
| 2 | 60 |
| ≤1 | 0 |

**注意：** `provider_signal` ≠ `final_score`。它是评分管道的一个输入维度，
最终分由 `calculateFinalScore()` 综合多维度计算。

## 5. 测试 mock provider API

```powershell
# 启动开发服务器
pnpm dev

# 新开终端
Invoke-RestMethod -Uri "http://localhost:3000/api/ingest/mock-provider"
```

```bash
curl http://localhost:3000/api/ingest/mock-provider
```

返回示例：
```json
{
  "ok": true,
  "provider": "Mock AI Radar",
  "fetched": 7,
  "normalized": 7,
  "uniqueItems": 7,
  "mentions": 7,
  "items": [...],
  "sample": [
    {
      "title": "Claude Code 正式发布...",
      "canonicalUrl": "https://www.anthropic.com/news/claude-code",
      "providerRank": 1,
      "providerScore": 95,
      "providerSignal": 86,
      "featured": true,
      "originalSource": "Anthropic Blog"
    }
  ]
}
```

注意 item 7（来源不明）：`originalSource: "(unknown)"`。
这模拟了 `evidence_score` 惩罚场景，未来评分管道会对此扣分。

## 6. Provider Persistence v1（已实现）

### 前置条件

1. 在 Supabase SQL Editor 中依次执行：
   ```
   supabase/schema.sql
   supabase/provider-architecture.sql
   ```
2. 配置 `.env.local`：
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   # 可选（生产 RLS 启用后需要）：
   # SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

### Dry-run 与 Write 模式

| 调用方式 | 行为 | 是否需要 Supabase |
|----------|------|:---:|
| `GET /api/ingest/mock-provider` | dry-run，仅返回预览 | 否 |
| `GET /api/ingest/mock-provider?write=true` | 写入 DB | 是 |
| `POST /api/ingest/mock-provider` | 写入 DB | 是 |

### 测试方式（PowerShell）

```powershell
pnpm dev

# dry-run — 无需 Supabase
Invoke-RestMethod -Uri "http://localhost:3000/api/ingest/mock-provider" |
  ConvertTo-Json -Depth 10

# write — 需要 Supabase 配置
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/ingest/mock-provider" |
  ConvertTo-Json -Depth 10

# 第二次 POST，验证幂等性
# insertedItems 应为 0，reusedItems 增加，insertedMentions 为 0，skippedMentions 增加
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/ingest/mock-provider" |
  ConvertTo-Json -Depth 10
```

### 写入链路

```
POST /api/ingest/mock-provider
  ↓
runMockProviderIngest({ dryRun: false })
  ↓ MockProviderAdapter.fetchItems() → 7 items
  ↓ dedupeByCanonicalUrl()
  ↓
ingestNormalizedItemsToDatabase(items, providerConfig)
  ├─ upsertProvider(config)     → providers 表，providerDbId (UUID)
  │    provider_key = config.id (e.g. 'mock-provider-001')
  ├─ per item:
  │  ├─ findOrCreateSource(originalSourceUrl)  → sources 表，sourceId
  │  ├─ calculateProviderSignal(...)           → 0-100
  │  ├─ calculateFinalScore(defaultDims, publishedAt) → 0-100
  │  ├─ upsertItemByCanonicalUrl(DbItemInsert) → items 表，itemId (UUID)
  │  │    lookup: canonical_url → url → INSERT
  │  └─ upsertItemMention({ itemId, providerDbId, item })
  │       UNIQUE(provider_id, external_id) → 幂等
  └─ return PersistResult
```

### 幂等机制

| 步骤 | 幂等方式 |
|------|---------|
| providers | `provider_key UNIQUE` → select-or-insert |
| sources | `url UNIQUE` → select-or-insert (race: 23505 → retry) |
| items | select by `canonical_url` → select by `url` → insert (race: 23505 → reuse) |
| item_mentions | `UNIQUE(provider_id, external_id)` → insert, 23505 → 'existing' |

## 7. 本轮未做的事

| 未完成项 | 原因 |
|---------|------|
| 真实 AIHOT / AI 雷达 API 接入 | 需要 API key 和文档，下一轮 |
| provider_signal 接入 final_score | 需要 AI 评分管道 |
| evidence_score 计算 | 需要 Source 可信度数据库 |
| embedding / 语义聚类 | 需要向量模型，后续阶段 |
| RssProviderAdapter 包装 | 复用 rss.ts，下一轮 |

## 8. 下一步

1. **配置 Supabase** → 执行 schema → 测试 POST 幂等写入
2. **实现 RssProviderAdapter**：把 `rss.ts` 包装成 `ProviderAdapter` 接口
3. **provider_signal 接入评分**：在 `calculateFinalScore()` 加 provider_signal 维度
4. **源名称解析**：通过 sources JOIN 替换 source_id UUID 显示
