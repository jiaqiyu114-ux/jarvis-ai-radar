# J.A.R.V.I.S. Rule-based Scoring v0

## 1. 为什么第一版不用 AI 评分

- AI 评分每次调用有延迟和成本
- 当前 items 数量小，规则分已足够排序展示
- 规则分稳定、可解释、可重现
- AI 评分在规则分建立后可作为叠加层，覆盖 `ai_relevance_score` 等维度

## 2. 评分组成

### source_score（0-100）

信源质量分。基于 `source_tier`、`is_official` 和 `reliability_score`。

| source_tier | 基础分 |
|-------------|:------:|
| S (官方头部) | 90 |
| A (高质量) | 80 |
| B (可靠媒体) | 70 |
| C (普通) | 60 |
| D / 未知 | 50 |

- `is_official = true` → +5（最高 100）
- 若存在 `reliability_score`：与 tier 基础分取均值

### evidence_score（0-100）

来源归属质量。反映这条信息的来源是否可以被追溯。

| 情况 | 分数 |
|------|:----:|
| 有 source_id，S tier | 95 |
| 有 source_id，A tier | 85 |
| 有 source_id，B tier | 75 |
| 有 source_id，C tier | 65 |
| 无 source_id（来源不明） | 30 |

### freshness_score（计算中间值，不单独存储）

时效性分。基于 `published_at` 或 `fetched_at`。

| 发布时间 | 分数 |
|---------|:----:|
| 24小时内 | 90 |
| 3天内 | 80 |
| 7天内 | 70 |
| 30天内 | 50 |
| 更久 | 35 |

### relevance_score（计算中间值，不单独存储）

关键词相关性分。在标题和摘要中匹配 AI / 开发者话题关键词。

| 匹配数 | 分数 |
|-------|:----:|
| ≥ 5 | 90 |
| ≥ 3 | 80 |
| ≥ 2 | 70 |
| ≥ 1 | 60 |
| 0 | 40 |

关键词覆盖：`ai, llm, model, openai, anthropic, claude, gpt, gemini, cursor, copilot, developer, api, inference, benchmark, robotics, multimodal, reasoning, neural, machine learning, transformer, open source, github...`

### penalties（惩罚项）

| 触发条件 | 扣分 |
|---------|:----:|
| 标题长度 < 20 字符 | -5 |
| 摘要缺失或过短 | -5 |
| 标题含 sponsored / 广告 / 推广 等 | -15 |

### final_score（0-100，取整）

```
final_score =
  0.35 × provider_signal
+ 0.25 × source_score
+ 0.20 × freshness_score
+ 0.20 × relevance_score
− penalties
```

clamp 到 [0, 100]，取整数。

**`provider_signal` ≠ `final_score`** — provider 信号是其中一个权重项。

## 3. source_score / evidence_score / provider_signal / final_score 的区别

| 字段 | 含义 | 计算时机 |
|------|------|---------|
| `provider_signal` | Provider 投递这条信息的质量信号 | 信息入库时（ingest） |
| `source_score` | 原始信源的可信度 | 评分时（score/rules） |
| `evidence_score` | 来源归属的可靠程度 | 评分时（score/rules） |
| `final_score` | 综合质量分，用于排序展示 | 评分时（score/rules） |

## 4. 如何执行 RSS seed SQL

在 Supabase SQL Editor 执行：

```sql
-- 粘贴 supabase/rss-sources-seed.sql 的全部内容
```

执行后验证：
```sql
SELECT name, url, source_tier, is_blocked
FROM sources WHERE platform = 'rss'
ORDER BY source_tier, name;
```

## 5. 如何跑 score dry-run

```powershell
pnpm dev

# dry-run（不写库）
Invoke-RestMethod -Uri "http://localhost:3000/api/score/rules" | ConvertTo-Json -Depth 10

# dry-run with limit
Invoke-RestMethod -Uri "http://localhost:3000/api/score/rules?limit=10" | ConvertTo-Json -Depth 10
```

Dry-run 返回示例：
```json
{
  "ok": true,
  "mode": "dry-run",
  "totalCandidates": 27,
  "sample": [
    {
      "id": "...",
      "title": "Claude Code 正式发布...",
      "oldFinalScore": 0,
      "newFinalScore": 74,
      "sourceScore": 65,
      "evidenceScore": 65,
      "freshnessScore": 90,
      "relevanceScore": 90,
      "penalties": 0,
      "reasons": ["provider_signal: 86", "source_score: 65", ...]
    }
  ]
}
```

## 6. 如何写入评分

```powershell
# 评分前 100 条
try {
  Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/score/rules?limit=100" `
    -ErrorAction Stop | ConvertTo-Json -Depth 10
} catch {
  $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
  $reader.ReadToEnd()
}
```

Write 返回示例：
```json
{
  "ok": true,
  "mode": "database",
  "scored": 27,
  "failed": 0,
  "errors": []
}
```

重复调用评分是安全的 — 会用新分覆盖旧分。

## 7. 如何检查 /feed 排序

评分写入后，`/feed` 页面展示真实 DB items，按 `final_score desc, published_at desc` 排序。

验证 SQL：
```sql
SELECT title, final_score, source_score, evidence_score, provider_signal, status, updated_at
FROM items
ORDER BY final_score DESC NULLS LAST, fetched_at DESC
LIMIT 20;
```

浏览器打开：
```
http://localhost:3000/feed
```

高分 item 排在最前。如果数据库没有 items，继续显示 mock 数据（fallback 安全）。

## 8. 当前未做的事

| 未完成项 | 说明 |
|---------|------|
| AI 维度评分 | `ai_relevance_score`, `importance_score` 等暂时使用入库时的规则默认值 |
| 个性化推荐 | 后续阶段 |
| 自动重新评分 | 当前需要手动 POST |
| 评分权重配置 UI | 后续接入 `/settings` 的评分配置 |
