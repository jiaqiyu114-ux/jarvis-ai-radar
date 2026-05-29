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

## 6. 本轮没有做什么

| 未完成项 | 原因 |
|---------|------|
| 真实 AIHOT / AI 雷达 API 接入 | 需要 API key 和文档，不在本轮范围 |
| item_mentions 实际写入 DB | 依赖 items 表 upsert 返回真实 UUID |
| provider_signal 接入 final_score | 需要先完成 AI 评分管道 |
| evidence_score 计算 | 需要 Source 可信度数据库 |
| embedding / 语义聚类 | 需要向量模型，后续阶段 |

## 7. 下一轮：接入真实外部 Provider

1. **实现 RssProviderAdapter**：复用 `src/lib/ingest/rss.ts` 的解析逻辑，
   包装成 `ProviderAdapter` 接口。

2. **实现 AihotProviderAdapter**：调用 AIHOT REST API，
   将响应映射为 `NormalizedIngestItem[]`。

3. **items upsert + item_mentions 写入**：
   - 按 `canonicalUrl` upsert items 表
   - 使用返回的真实 UUID 写入 item_mentions

4. **provider_signal 接入 final_score**：
   在 `calculateFinalScore()` 中引入 `provider_signal` 作为输入维度之一。

5. **POST /api/ingest/run**：替代 GET mock 路由，
   支持实际 Provider 运行 + DB 写入 + 返回结果。
