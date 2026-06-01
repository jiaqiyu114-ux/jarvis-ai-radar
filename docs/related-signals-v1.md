# Related Signals v1.1

## Goal

Surface 0-5 contextually related items for each `must_read` / `high_value` recommendation. These are not recommendations themselves — they are supporting context signals for the reader to understand whether the main signal is isolated or part of a broader trend.

## Why not LLM

- LLM calls add latency and cost to the refresh pipeline.
- Signal matching is structural (company names, product names, topic IDs) — deterministic rules are sufficient and more transparent.
- No hallucinations, no per-item API cost.
- Results are fully auditable via the Audit Drawer.

## Candidate Pool

- The full `result.items` array from `getRecommendations()` — all tiers including `archive`.
- Pool size: up to 300 items (`Math.min(limit * 8, MAX_POOL)`).
- Items below 20 in the pool trigger a WARN (not FAIL) in verify scripts.
- Related signals are computed only for `must_read` and `high_value` tier items.

## Scoring Rules (v1.1)

| Signal | Score | Cap |
|--------|-------|-----|
| Same canonical company | +25/company | max 60 |
| Same canonical product | +25/product | max 60 |
| Same topic ID | +14/topic | max 42 |
| Shared tag | +8/tag | max 24 |
| Same source name | +8 | — |
| Same provider | +4 | — |
| Same domain | +6 | — |
| Title Jaccard overlap | 0–20 | — |
| Summary Jaccard overlap | 0–12 | — |
| Within 24h | +8 | — |
| Within 72h | +4 | — |
| Candidate tier must_read/high_value | +6 | — |
| Has full content | +4 | — |
| Short title penalty | -5 | — |
| No summary penalty | -5 | — |

**Anti-spam cap**: if only `same_source` with no semantic overlap (no companies, products, topics, keywords), score is hard-capped at 20 — below the inclusion threshold.

**Inclusion threshold**: 30 (raised from v1's 25).

**Per-source limit**: max 2 signals per source name, to prevent one source dominating.

**Max per item**: 5 signals, default UI shows 3 (expandable to 5).

## Company Alias Map

50+ text variants → canonical company name. Examples:
- `"chatgpt"`, `"gpt-4"`, `"sora"` → `OpenAI`
- `"claude"`, `"claude code"`, `"anthropic"` → `Anthropic`
- `"gemini"`, `"deepmind"`, `"notebooklm"` → `Google`
- `"github"`, `"copilot"`, `"azure"` → `Microsoft`
- `"blackwell"`, `"cuda"`, `"h100"` → `NVIDIA`

This means an item mentioning "ChatGPT" and another mentioning "OpenAI" are correctly scored as same_company.

## Product Alias Map

20+ text variants → canonical product name. Examples:
- `"github copilot"` → `GitHub Copilot`
- `"claude code"` → `Claude Code`
- `"gpt-4"` → `GPT-4`

Products score independently from companies — an item can match on both.

## Topic Taxonomy

14 topic IDs with English + Chinese keyword patterns:

| Topic ID | Display | Example keywords |
|----------|---------|-----------------|
| `ai_agent` | AI 智能体 | "ai agent", "agentic", "智能体" |
| `coding_agent` | AI 编程工具 | "github copilot", "coding agent", "编程助手" |
| `model_release` | 模型发布 | "new model", "language model", "新模型" |
| `chip` | AI 芯片 | "gpu", "chip", "blackwell", "芯片" |
| `robotics` | 机器人 | "humanoid", "robotics", "机器人" |
| `autonomous_driving` | 自动驾驶 | "self-driving", "fsd", "自动驾驶" |
| `token_pricing` | Token 定价 | "token pricing", "定价", "计费" |
| `multimodal` | 多模态 | "multimodal", "vision model", "多模态" |
| `voice_ai` | 语音 AI | "voice ai", "speech recognition", "语音" |
| `video_generation` | 视频生成 | "video generation", "视频生成" |
| `cloud_infra` | 云基础设施 | "machine traffic", "data center", "数据中心" |
| `enterprise_ai` | 企业 AI | "enterprise ai", "企业级" |
| `devtool` | 开发工具 | "developer tool", "ide", "开发工具" |
| `security` | AI 安全 | "ai safety", "alignment", "安全" |

## Relation Types

- `same_company` — shared canonical company name
- `same_product` — shared canonical product name
- `same_topic` — shared topic taxonomy ID
- `same_source` — same RSS source or LLM provider
- `shared_keyword` — shared title tokens or tags
- `time_proximity` — published within 72h of each other
- `same_entity` — kept for backward compatibility with v1 snapshots

## Relation Reason Generation

Reasons are 1-sentence, information-oriented (not recommendation-oriented). Priority:
1. Company + topic: "共同命中 NVIDIA 与 AI 芯片，可作为同一趋势下的关联信号。"
2. Product + topic: "共同涉及 GitHub Copilot 与 AI 编程工具，更像同一产品方向变化。"
3. Company only: "共同涉及 OpenAI，或指向同一主体近期动态。"
4. Topic only: "均属 AI 智能体方向，可作为趋势关联参考。"
5. Keyword overlap: "标题关键词重合：inference、agent，内容有一定关联。"

## Anti-Mismatch Protections

1. `same_source` alone never reaches threshold (hard cap at 20)
2. Duplicate URL → excluded
3. Same item ID → excluded
4. Identical normalized title → excluded
5. Per-source diversity (max 2 from same source)
6. Short title penalty (-5) and no summary penalty (-5)

## UI Display

- Main location: Signal Card detail modal, after Evidence Note, before Audit Drawer
- Default: 3 signals shown, "展开更多" button for up to 5
- Each row shows: title, source, age, relation tags (company/product/topic names), reason
- No images, no scores shown to user
- List card: shows subtle "相关信号 N" hint if N > 0

## Audit Debug

In Audit Drawer (collapsed by default):
- Number of related signals
- Per-signal: score, matchedCompanies, matchedProducts, matchedTopics, matchedKeywords, source, contentStatus
- scoreBreakdown (each contributing factor)

## Snapshot Storage

Related signals are encoded in the `source_reading_guide` JSON payload alongside DeepDive data. Backward compatible — old snapshots without `relatedSignals` gracefully produce empty arrays.

## Relation to Event Cluster Timeline

Related Signals v1.1 builds the data foundation for Event Cluster Timeline v1:
- `matchedCompanies`, `matchedProducts`, `matchedTopics` are the clustering keys
- `timeProximityHours` enables temporal grouping
- The same candidate pool used here would seed a cluster builder

**Next step**: when ≥3 items share a canonical company AND a topic ID within a 72h window, they can form a cluster. The cluster page would show the items in chronological order with shared entity/topic as the cluster title.

## Known Limitations

- No word-boundary matching — "meta" can match "metadata" in some edge cases
- Single-word ambiguous terms ("apple" = company or fruit, "cursor" = text cursor or AI tool) may rarely misfire, but require multiple signals to reach threshold so false positives are filtered
- Does not learn from user feedback — purely structural
- Chinese stopwords are not exhaustively filtered (future improvement)

## Next Steps to Upgrade

1. Add word-boundary matching for ambiguous short terms
2. Track user "dismiss" on related signals to filter future false positives
3. Expand topic taxonomy with more Chinese patterns
4. Add provider-level grouping (same LLM provider = weak signal)
5. Event Cluster Timeline v1: group related signals into named events
