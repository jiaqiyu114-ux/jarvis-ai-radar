# J.A.R.V.I.S. Foundation Hardening v1

## 1. 当前已打通的主链路

```
POST /api/ingest/mock-provider   →  providers → sources → items → item_mentions
POST /api/ingest/rss             →  providers → sources → items → item_mentions
POST /api/fetch/rss              →  sources → items  (旧链路，保留兼容)
```

所有写入链路均具备幂等能力：重复调用不重复创建数据。

---

## 2. mock provider 验收命令

**写入（第一次）：**
```powershell
try {
  Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/ingest/mock-provider" `
    -ErrorAction Stop | ConvertTo-Json -Depth 10
} catch {
  $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
  $reader.ReadToEnd()
}
```

预期结果：
```json
{
  "ok": true,
  "mode": "database",
  "insertedItems": 7,
  "reusedItems": 0,
  "insertedMentions": 7,
  "skippedMentions": 0,
  "errors": []
}
```

**幂等验证（第二次）：**
```powershell
# 同上，预期：
# insertedItems: 0, reusedItems: 7
# insertedMentions: 0, skippedMentions: 7
```

---

## 3. RSS provider 验收命令

**Dry-run（不需要 Supabase）：**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/ingest/rss" | ConvertTo-Json -Depth 10
```

预期结果：
```json
{
  "ok": true,
  "mode": "dry-run",
  "provider": "RSS Sources",
  "fetched": N,
  "uniqueItems": M,
  "feedErrors": [...],
  "itemErrors": [],
  "sample": [...]
}
```

若全部 feed 失败：`"ok": false`（说明网络不通或 feed URL 失效）

**Write（第一次）：**
```powershell
try {
  Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/ingest/rss" `
    -ErrorAction Stop | ConvertTo-Json -Depth 10
} catch {
  $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
  $reader.ReadToEnd()
}
```

**幂等验证（第二次）：**
```powershell
# 同上，预期：
# insertedItems: 0, reusedItems: N
# insertedMentions: 0, skippedMentions: N
```

---

## 4. 如何判断幂等成功

幂等的本质是：同样的数据进入系统两次，结果只存在一份。

判断依据：

| 第一次调用 | 第二次调用 | 含义 |
|-----------|-----------|------|
| `insertedItems: 7` | `reusedItems: 7` | items 表正常去重 |
| `insertedMentions: 7` | `skippedMentions: 7` | item_mentions 正常去重 |
| `errors: []` | `errors: []` | 无异常 |

若第二次仍有 `insertedItems > 0`，说明去重逻辑存在问题（URL 变化、canonical_url 计算不一致）。

---

## 5. feedErrors 如何理解

`feedErrors` 是 RSS 适配器报告的 feed 级别错误。

每条包含：
```json
{
  "sourceName": "The Verge AI",
  "feedUrl": "https://www.theverge.com/rss/...",
  "stage": "fetch",
  "message": "HTTP 403 from ..."
}
```

| stage | 含义 |
|-------|------|
| `fetch` | 网络请求失败（超时、403、DNS 失败） |
| `parse` | 返回了内容但不是合法 XML |

**feedErrors ≠ 致命错误。** 部分 feed 失败时：
- 其他 feed 继续正常处理
- `ok = true`（至少有一个 feed 成功）
- `feedErrors[]` 里有记录，方便排查

**全部 feed 失败时：**
- `ok = false`
- HTTP 500
- `items = []`

常见原因：
- 网络环境不支持访问目标 feed（公司内网、防火墙）
- Feed URL 失效或 CDN 屏蔽了 User-Agent
- 证书错误（HTTPS）

---

## 6. debug 输出规则

| 环境 | debug 字段 | 说明 |
|------|:----------:|------|
| `NODE_ENV = development`（默认） | ✓ 包含 | 包含 `providerDbId`、`firstSourceId`、`firstItemPayloadKeys` 等 |
| `NODE_ENV = production` | ✗ 移除 | API 路由自动过滤 |

`debug` 字段不包含：
- Supabase key 或 service role
- 完整 raw_payload 内容
- .env 变量值

---

## 7. sources 重复检查

如果发现数据库中有重复 sources，在 Supabase SQL Editor 运行：

（完整 SQL 见 `docs/source-dedupe-check.sql`）

```sql
-- 快速检查：name 重复
SELECT name, count(*) cnt FROM sources GROUP BY name HAVING count(*) > 1;

-- 快速检查：url 重复
SELECT url, count(*) cnt FROM sources GROUP BY url HAVING count(*) > 1;
```

**本轮不做自动清理。** 如果存在历史重复，需要手动在 Supabase Studio 中删除多余行，
保留 item 引用最多的那一条。

---

## 8. 本轮未做的事

| 未完成项 | 说明 |
|---------|------|
| source 重复自动清理 | 需人工确认后手动处理 |
| RSS feed URL 管理 UI | 当前通过 SQL 添加 |
| 定时任务 / cron | 手动 POST 触发 |
| AI 评分接入 | 后续阶段 |
| 事件簇聚合 | 后续阶段 |
| 全文抓取 | 后续阶段 |
