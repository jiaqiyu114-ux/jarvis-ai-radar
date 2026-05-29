# RSS Provider Adapter

## 1. 作用

`RssProviderAdapter` 把 RSS / Atom 抓取纳入统一 Provider 架构。

RSS 内容不再走孤立的 `ingestRssSources()` 直写路径，而是与 Mock AI Radar、
未来的 AIHOT 适配器走同一条链路：

```
RSS feed
  → fetchRssProviderItems()
  → ParsedRssItem[]
  → NormalizedIngestItem[]      ← 统一格式
  → dedupeByCanonicalUrl()
  → ingestNormalizedItemsToDatabase()
  → providers / sources / items / item_mentions
```

## 2. Provider 和 Source 的区别

| 概念 | 在 RSS 场景里的含义 |
|------|-----------------|
| **Provider** | `RSS Sources` — RSS 是信息的**传送机制** |
| **Source** | 具体 RSS 来源，例如 `The Verge`、`Anthropic Blog` |

每条 RSS item 在 `NormalizedIngestItem` 里：
- `providerId = 'rss'`
- `originalSourceName = source.name`（e.g. "The Verge AI"）
- `originalSourceUrl = source.feedUrl`（RSS feed URL）

`ingestNormalizedItemsToDatabase` 调用 `findOrCreateSource({ url: feedUrl })` 时，
会按 feed URL 找到或新建对应的 `sources` 行。Source ≠ Provider。

## 3. RSS 源的获取方式

优先级：

1. **数据库 sources 表**（`platform = 'rss'`）
   - `listRssSources()` 返回未 block 且 `platform='rss'` 的源
   - 新建 source 时不指定 platform → schema 默认值 `'rss'` → 自动被 RSS adapter 拾取
2. **Fallback 列表**（数据库无 RSS 源时）
   - The Verge AI、TechCrunch AI、Hugging Face Blog
   - 仅用于开发测试；不在 build 阶段访问网络

## 4. /api/ingest/rss — dry-run 和 write 模式

| 请求 | 行为 | 是否需要 Supabase |
|------|------|:---:|
| `GET /api/ingest/rss` | dry-run，只抓取不写库 | 否 |
| `GET /api/ingest/rss?write=true` | 抓取并写库 | 是 |
| `POST /api/ingest/rss` | 抓取并写库 | 是 |

**Dry-run** 返回：
```json
{
  "ok": true,
  "mode": "dry-run",
  "provider": "RSS Sources",
  "fetched": 30,
  "uniqueItems": 28,
  "feedErrors": [{ "sourceName": "...", "feedUrl": "...", "message": "..." }],
  "itemErrors": [],
  "sample": [
    {
      "title": "...",
      "canonicalUrl": "https://...",
      "providerRank": 1,
      "providerSignal": 67,
      "originalSource": "The Verge AI",
      "category": "AI技术",
      "publishedAt": "2026-05-29T..."
    }
  ]
}
```

**Write** 返回（同 mock-provider）：
```json
{
  "ok": true,
  "mode": "database",
  "provider": "RSS Sources",
  "fetched": 30,
  "uniqueItems": 28,
  "insertedItems": 28,
  "reusedItems": 0,
  "insertedMentions": 28,
  "skippedMentions": 0,
  "errors": [],
  "feedErrors": [],
  "itemErrors": [],
  "debug": { "providerResolved": true, "providerDbId": "...", ... }
}
```

## 5. 如何测试

**启动开发服务器：**
```powershell
pnpm dev
```

**Dry-run（不需要 Supabase，可能实际联网）：**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/ingest/rss" | ConvertTo-Json -Depth 10
```

**第一次 write（需要 Supabase）：**
```powershell
try {
  Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/ingest/rss" -ErrorAction Stop |
    ConvertTo-Json -Depth 10
} catch {
  $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
  $body = $reader.ReadToEnd()
  $body
}
```

**第二次 write — 验证幂等性（insertedItems=0，reusedItems=N）：**
```powershell
try {
  Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/ingest/rss" -ErrorAction Stop |
    ConvertTo-Json -Depth 10
} catch {
  $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
  $body = $reader.ReadToEnd()
  $body
}
```

**验证 mock-provider 没有受影响：**
```powershell
try {
  Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/ingest/mock-provider" -ErrorAction Stop |
    ConvertTo-Json -Depth 10
} catch {
  $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
  $body = $reader.ReadToEnd()
  $body
}
```

## 6. externalId 策略

| 优先级 | 来源 | 说明 |
|--------|------|------|
| 1 | RSS `<guid>` / Atom `<id>` | 最稳定，内容更新不变 |
| 2 | canonical URL | 可靠，去追踪参数后唯一 |

`item_mentions.UNIQUE(provider_id, external_id)` 保证幂等性。

## 7. providerTrustScore 计算

| 信源等级 | providerTrustScore | providerScore |
|---------|:-----------------:|:------------:|
| S | 90 | 80 |
| A | 82 | 70 |
| B | 70 | 55 |
| C | 60 | 40 |
| D | 55 | 30 |
| 默认 | 65 | 50 |

`provider_signal` 由 `calculateProviderSignal()` 统一计算，不直接等于 `final_score`。

## 8. 与旧 /api/fetch/rss 的关系

| | `/api/fetch/rss` | `/api/ingest/rss` |
|---|---|---|
| 架构 | 独立 pipeline，`insertItemIfNew` 直写 | Provider 架构，走 `ingestNormalizedItemsToDatabase` |
| 去重 | URL unique constraint | canonical_url + url 两级查重 |
| source_mentions | 无 | 写 item_mentions 表 |
| debug 信息 | 无 | 有 stage / debug 字段 |
| 推荐程度 | 保留兼容 | **新方式，推荐使用** |

旧接口保留不删除，可继续使用，但后续功能迭代在新接口上进行。

## 9. 如何向 DB 添加 RSS 源

在 Supabase SQL Editor 中执行：

```sql
INSERT INTO sources (name, url, platform, source_tier, category, reliability_score, base_score)
VALUES
  ('The Verge AI',      'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', 'rss', 'A', 'AI技术', 80, 75),
  ('Hugging Face Blog', 'https://huggingface.co/blog/feed.xml', 'rss', 'A', 'AI技术', 85, 80),
  ('TechCrunch AI',     'https://techcrunch.com/category/artificial-intelligence/feed/',      'rss', 'B', 'AI技术', 70, 65);
```

添加后，下次 `POST /api/ingest/rss` 会自动抓取这些源。

## 10. 本轮未做的事

| 未完成项 | 说明 |
|---------|------|
| AI 评分 | 维度分使用规则默认值，AI 接入是后续阶段 |
| 事件簇聚合 | 未做 |
| RSS source URL 管理 UI | 当前通过 SQL 或 seed 脚本添加 |
| 定时任务 / cron | 未做，手动 POST 触发 |
| 全文抓取 | 仅抓 RSS summary，不做全文 |
