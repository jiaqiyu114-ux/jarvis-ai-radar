/**
 * Mock Provider Adapter — "Mock AI Radar"
 *
 * Simulates an external curated AI news provider.
 * Returns 7 representative items without any network calls or API keys.
 * Used for local development and pipeline testing.
 *
 * Item 7 intentionally has no originalSourceName to test evidence_score
 * penalty logic when source attribution is missing.
 */

import { canonicalizeUrl, normalizeTitle } from '@/lib/ingest/normalize'
import type { ProviderAdapter, ProviderConfig, NormalizedIngestItem } from '@/types/provider'

const PROVIDER: ProviderConfig = {
  id:          'mock-provider-001',
  name:        'Mock AI Radar',
  type:        'rest_api',
  baseUrl:     null,
  trustScore:  78,
  enabled:     true,
}

const NOW = new Date().toISOString()
const YESTERDAY = new Date(Date.now() - 20 * 3_600_000).toISOString()
const TWO_DAYS  = new Date(Date.now() - 45 * 3_600_000).toISOString()

const RAW_ITEMS: Omit<NormalizedIngestItem, 'normalizedTitle' | 'canonicalUrl' | 'providerId' | 'providerName' | 'providerTrustScore' | 'fetchedAt'>[] = [
  {
    externalId:          'mock-001',
    providerScore:       95,
    providerRank:        1,
    providerCategory:    'AI工具',
    providerTags:        ['Claude', 'CLI', 'IDE', '开发工具'],
    featured:            true,
    title:               'Claude Code 正式发布：AI 原生 IDE 集成开发工具全面升级',
    summary:             'Anthropic 发布 Claude Code 正式版，支持多文件上下文、工具调用、代码执行沙箱，并深度集成主流 IDE。开发者可通过 CLI 或 VS Code 扩展直接使用。',
    url:                 'https://www.anthropic.com/news/claude-code?utm_source=newsletter&utm_campaign=launch',
    originalSourceName:  'Anthropic Blog',
    originalSourceUrl:   'https://www.anthropic.com',
    category:            'AI技术',
    tags:                ['Claude', 'AI编程', '开发工具', 'IDE'],
    entities:            ['Claude Code', 'Anthropic', 'VS Code'],
    publishedAt:         NOW,
    rawPayload:          { rank: 1, score: 95, source: 'anthropic-blog', featured: true },
  },
  {
    externalId:          'mock-002',
    providerScore:       88,
    providerRank:        2,
    providerCategory:    'API更新',
    providerTags:        ['OpenAI', 'API', 'GPT', '定价'],
    featured:            true,
    title:               'OpenAI 更新 API 定价与速率限制，GPT-4.1 系列正式上线',
    summary:             'OpenAI 宣布新一轮 API 调整：GPT-4.1 输入价格下调 30%，新增批量处理端点，速率限制按账户级别分级。企业用户可申请更高并发配额。',
    url:                 'https://platform.openai.com/docs/changelog?ref=ai-radar',
    originalSourceName:  'OpenAI Platform Docs',
    originalSourceUrl:   'https://platform.openai.com',
    category:            '产品发布',
    tags:                ['OpenAI', 'API', 'GPT-4.1', '定价'],
    entities:            ['GPT-4.1', 'OpenAI', 'API'],
    publishedAt:         NOW,
    rawPayload:          { rank: 2, score: 88, source: 'openai-changelog', featured: true },
  },
  {
    externalId:          'mock-003',
    providerScore:       82,
    providerRank:        3,
    providerCategory:    '模型发布',
    providerTags:        ['Anthropic', 'Claude', 'Sonnet', '推理'],
    featured:            false,
    title:               'Anthropic 发布 Claude Sonnet 4.6：推理能力提升，上下文窗口扩展至 400K',
    summary:             '新版 Sonnet 在代码生成、多步骤推理和长文档理解上显著提升，上下文窗口从 200K 扩展到 400K，价格维持不变。多项基准测试超越前代。',
    url:                 'https://www.anthropic.com/news/claude-sonnet-46',
    originalSourceName:  'Anthropic Blog',
    originalSourceUrl:   'https://www.anthropic.com',
    category:            'AI技术',
    tags:                ['Claude', 'Sonnet', '大模型', '推理'],
    entities:            ['Claude Sonnet 4.6', 'Anthropic'],
    publishedAt:         YESTERDAY,
    rawPayload:          { rank: 3, score: 82, source: 'anthropic-blog', featured: false },
  },
  {
    externalId:          'mock-004',
    providerScore:       76,
    providerRank:        4,
    providerCategory:    '开源项目',
    providerTags:        ['GitHub', 'AI Agent', '开源', 'Python'],
    featured:            false,
    title:               'microsoft/autogen v0.5 发布：支持分布式多 Agent 协作框架',
    summary:             'AutoGen 0.5 重写了核心调度器，引入分布式执行模式，支持多 Agent 并发对话与任务委托。新增 Azure Container Apps 一键部署模板。',
    url:                 'https://github.com/microsoft/autogen/releases/tag/v0.5.0',
    originalSourceName:  'GitHub',
    originalSourceUrl:   'https://github.com/microsoft/autogen',
    category:            '开源项目',
    tags:                ['AutoGen', 'AI Agent', 'Microsoft', '多智能体'],
    entities:            ['AutoGen', 'Microsoft', 'GitHub'],
    publishedAt:         YESTERDAY,
    rawPayload:          { rank: 4, score: 76, source: 'github-trending', featured: false },
  },
  {
    externalId:          'mock-005',
    providerScore:       71,
    providerRank:        5,
    providerCategory:    'AI工具',
    providerTags:        ['AI Agent', 'workflow', '自动化', 'SaaS'],
    featured:            false,
    title:               'Cursor 0.42 上线 Background Agent：后台自动修 bug、跑测试不打断工作流',
    summary:             'Cursor 新版本引入 Background Agent，可在用户继续编码时异步执行长时间任务：运行测试套件、修复已知 lint 错误、生成文档。任务完成后通知用户审查结果。',
    url:                 'https://changelog.cursor.com/0-42',
    originalSourceName:  'Cursor Changelog',
    originalSourceUrl:   'https://changelog.cursor.com',
    category:            '产品发布',
    tags:                ['Cursor', 'AI编程', 'IDE', 'Agent'],
    entities:            ['Cursor', 'Background Agent'],
    publishedAt:         TWO_DAYS,
    rawPayload:          { rank: 5, score: 71, source: 'cursor-changelog', featured: false },
  },
  {
    externalId:          'mock-006',
    providerScore:       68,
    providerRank:        6,
    providerCategory:    '研究论文',
    providerTags:        ['DeepMind', 'arXiv', '强化学习', '推理'],
    featured:            false,
    title:               'DeepMind 发布 AlphaProof 技术报告：形式化数学定理证明达到 IMO 金牌水平',
    summary:             '谷歌 DeepMind 在 arXiv 发布 AlphaProof 完整技术报告，详细介绍其结合 Lean 4 证明器与强化学习实现 IMO 2024 金牌水平的方法论。附完整代码和评测数据集。',
    url:                 'https://arxiv.org/abs/2503.12345',
    originalSourceName:  'arXiv',
    originalSourceUrl:   'https://arxiv.org',
    category:            '研究报告',
    tags:                ['AlphaProof', 'DeepMind', '数学推理', 'arXiv'],
    entities:            ['AlphaProof', 'Google DeepMind', 'Lean 4', 'IMO'],
    publishedAt:         TWO_DAYS,
    rawPayload:          { rank: 6, score: 68, source: 'arxiv', featured: false },
  },
  {
    // Intentionally high provider score but NO originalSourceName.
    // Used to test evidence_score / source attribution penalty in future scoring.
    externalId:          'mock-007',
    providerScore:       88,
    providerRank:        7,
    providerCategory:    '行业动态',
    providerTags:        ['AI', '未知来源', '待核实'],
    featured:            false,
    title:               '某大厂内部备忘录泄露：AGI 时间线已提前至 2027 年',
    summary:             '据称来自内部邮件截图的信息显示，某头部 AI 公司内部评估 AGI 到达时间已从 2030 提前至 2027，但来源未经核实。',
    url:                 'https://unknown-blog.example.com/agi-memo-leak',
    originalSourceName:  null,   // 🚨 source unknown — triggers evidence_score penalty
    originalSourceUrl:   null,
    category:            '其他',
    tags:                ['AGI', '未核实', '传言'],
    entities:            ['AGI'],
    publishedAt:         NOW,
    rawPayload:          { rank: 7, score: 88, source: 'unknown', verified: false },
  },
]

function buildItems(): NormalizedIngestItem[] {
  return RAW_ITEMS.map(raw => ({
    ...raw,
    providerId:          PROVIDER.id,
    providerName:        PROVIDER.name,
    providerTrustScore:  PROVIDER.trustScore,
    normalizedTitle:     normalizeTitle(raw.title),
    canonicalUrl:        canonicalizeUrl(raw.url),
    fetchedAt:           NOW,
  }))
}

export const MockProviderAdapter: ProviderAdapter = {
  provider:   PROVIDER,
  fetchItems: async () => buildItems(),
}
