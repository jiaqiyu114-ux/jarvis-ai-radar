"use client"

import { useState } from "react"
import { ExternalLink, BookOpen, Eye, Pencil, GitBranch, ImageOff, Loader2, RefreshCw } from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import { zhCN } from "date-fns/locale"
import { Progress } from "@/components/ui/progress"
import { SourceTierBadge } from "./source-tier-badge"
import { ScoreBadge } from "./score-badge"
import { cn } from "@/lib/utils"
import { buildScoreExplanation } from "@/lib/scoring/explanation"
import { buildInformationDetail } from "@/lib/content/detail-explanation"
import type { InformationItem, ArticleContent, EvidenceProfile, AnalysisGate } from "@/types"
import type { DimensionStatus } from "@/lib/scoring/explanation"
import type { InsightType } from "@/lib/content/detail-explanation"

// ── Colors / maps ─────────────────────────────────────────────────────────────

const categoryColors: Record<string, string> = {
  'AI技术':   'text-blue-700 bg-blue-100 dark:text-blue-400 dark:bg-blue-400/10',
  '商业动态': 'text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-400/10',
  '产品发布': 'text-sky-700 bg-sky-100 dark:text-cyan-400 dark:bg-cyan-400/10',
  '监管政策': 'text-amber-700 bg-amber-100 dark:text-orange-400 dark:bg-orange-400/10',
  '融资并购': 'text-yellow-700 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-400/10',
  '行业趋势': 'text-violet-700 bg-violet-100 dark:text-violet-400 dark:bg-violet-400/10',
  '开源项目': 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-400/10',
  '研究报告': 'text-stone-600 bg-stone-100 dark:text-slate-400 dark:bg-slate-400/10',
  '人物动态': 'text-rose-700 bg-rose-100 dark:text-pink-400 dark:bg-pink-400/10',
  '其他':     'text-stone-500 bg-stone-100 dark:text-muted-foreground dark:bg-muted',
}

const dimStatusColor: Record<DimensionStatus, string> = {
  available: 'text-muted-foreground',
  fallback:  'text-muted-foreground/50',
  missing:   'text-danger/60',
}

const dimStatusText: Record<DimensionStatus, string> = {
  available: '',
  fallback:  '默认',
  missing:   '缺失',
}

const InsightIcon: Record<InsightType, React.ElementType> = {
  content:     Pencil,
  learning:    BookOpen,
  observation: Eye,
  project:     GitBranch,
}

// ── Layout helpers ────────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
        {label}
      </h3>
      {children}
    </section>
  )
}

function Divider() {
  return <div className="h-px bg-border/60" />
}

// ── Analysis gate section ─────────────────────────────────────────────────────

const TIER_LABELS: Record<string, { label: string; color: string }> = {
  none:     { label: '跳过',    color: 'text-muted-foreground/50 border-border/40 bg-muted/30' },
  light:    { label: '轻量判断', color: 'text-muted-foreground border-border bg-muted/50' },
  standard: { label: '标准解释', color: 'text-sky-600 border-sky-400/30 bg-sky-400/10 dark:text-sky-400' },
  deep:     { label: '深度分析', color: 'text-primary border-primary/30 bg-primary/10' },
  cluster:  { label: '事件追踪', color: 'text-success border-success/30 bg-success/10' },
}

const PRIORITY_LABELS: Record<string, string> = {
  low: '低', normal: '正常', high: '高', urgent: '紧急',
}

const BUDGET_LABELS: Record<string, string> = {
  none: '零消耗', cheap: '轻量档', normal: '标准档', premium: '高级档',
}

function AnalysisGateSection({ gate }: { gate: AnalysisGate }) {
  const tierStyle = TIER_LABELS[gate.analysisTier] ?? TIER_LABELS.none
  const showTokens = gate.estimatedTotalTokens > 0

  return (
    <Section label="处理策略">
      {/* Tier + priority + budget badges */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", tierStyle.color)}>
          {tierStyle.label}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded border text-muted-foreground border-border bg-muted/50">
          优先级：{PRIORITY_LABELS[gate.analysisPriority] ?? gate.analysisPriority}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded border text-muted-foreground border-border bg-muted/50">
          {BUDGET_LABELS[gate.tokenBudgetTier] ?? gate.tokenBudgetTier}
        </span>
      </div>

      {/* Reason */}
      {gate.analysisReason && (
        <p className="text-xs text-foreground/80 leading-relaxed mb-3">{gate.analysisReason}</p>
      )}

      {/* Boolean flags */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {[
          { label: '深度解释', value: gate.shouldDeepAnalyze },
          { label: '进日报',   value: gate.shouldEnterDailyReport },
          { label: '进选题池', value: gate.shouldEnterTopicPool },
          { label: '事件追踪', value: gate.shouldTrackEvent },
        ].map(({ label, value }) => (
          <span
            key={label}
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded border",
              value
                ? "text-success border-success/25 bg-success/8"
                : "text-muted-foreground/40 border-border/40"
            )}
          >
            {value ? '✓' : '✗'} {label}
          </span>
        ))}
      </div>

      {/* Token estimate */}
      {showTokens && (
        <p className="text-[10px] text-muted-foreground/60">
          预估 token：输入 {gate.estimatedInputTokens.toLocaleString()} + 输出 {gate.estimatedOutputTokens.toLocaleString()} ≈ 共 {gate.estimatedTotalTokens.toLocaleString()}
          <span className="ml-1 text-muted-foreground/40">（粗估，非实际消耗）</span>
        </p>
      )}
    </Section>
  )
}

// ── Evidence section ──────────────────────────────────────────────────────────

const CLAIM_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  unverified:     { label: '未验证',   color: 'text-muted-foreground border-border bg-muted/50' },
  reported:       { label: '已报道',   color: 'text-sky-600 border-sky-400/30 bg-sky-400/10 dark:text-sky-400' },
  source_claimed: { label: '官方说法', color: 'text-primary border-primary/30 bg-primary/10' },
  confirmed:      { label: '已确认',   color: 'text-success border-success/30 bg-success/10' },
  disputed:       { label: '存在争议', color: 'text-warning border-warning/30 bg-warning/10' },
  rumor:          { label: '传闻',     color: 'text-danger border-danger/30 bg-danger/10' },
  unclear:        { label: '信息不明', color: 'text-muted-foreground border-border bg-muted/50' },
}

const SOURCE_NATURE_LABELS: Record<string, string> = {
  official:         '官方发布',
  primary_report:   '一手报道',
  secondary_report: '二手转载',
  research:         '学术预印本',
  analysis:         '分析/观点',
  marketing:        '商业宣传',
  rumor:            '传言',
  unknown:          '来源未知',
}

const EVIDENCE_LEVEL_LABELS: Record<string, string> = {
  very_high: '证据较强',
  high:      '证据良好',
  medium:    '证据一般',
  low:       '证据不足',
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground w-5 text-right tabular-nums">{value}</span>
    </div>
  )
}

function EvidenceSection({ profile }: { profile: EvidenceProfile }) {
  const claimStyle = CLAIM_STATUS_LABELS[profile.claimStatus] ?? CLAIM_STATUS_LABELS.unverified
  const sourceLabel = SOURCE_NATURE_LABELS[profile.sourceNature] ?? '来源未知'
  const levelLabel  = EVIDENCE_LEVEL_LABELS[profile.evidenceLevel] ?? '证据不足'

  return (
    <Section label="真实与证据">
      {/* Status badges */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", claimStyle.color)}>
          {claimStyle.label}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded border text-muted-foreground border-border bg-muted/50">
          {sourceLabel}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded border text-muted-foreground border-border bg-muted/50">
          {levelLabel}
        </span>
      </div>

      {/* Score bars */}
      <div className="space-y-1.5 bg-muted/30 rounded-md p-3 mb-3">
        <ScoreBar label="真实程度"   value={profile.truthScore}       color={profile.truthScore >= 60 ? 'bg-success' : profile.truthScore >= 40 ? 'bg-warning' : 'bg-danger/60'} />
        <ScoreBar label="证据强度"   value={profile.evidenceScore}    color="bg-primary/60" />
        <ScoreBar label="来源可追溯" value={profile.sourceTraceScore} color="bg-sky-500/60 dark:bg-sky-400/60" />
      </div>

      {/* Boolean signals */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {[
          { label: '有原文',   value: profile.hasArticleContent },
          { label: '有作者',   value: profile.hasAuthor },
          { label: '有时间戳', value: profile.hasPublishedTime },
          { label: '有媒体证据', value: profile.hasMediaEvidence },
        ].map(({ label, value }) => (
          <span
            key={label}
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded border",
              value
                ? "text-success border-success/25 bg-success/8"
                : "text-muted-foreground/50 border-border/40"
            )}
          >
            {value ? '✓' : '✗'} {label}
          </span>
        ))}
      </div>

      {/* Evidence notes */}
      {profile.evidenceNotes && (
        <p className="text-[10px] text-muted-foreground/70 leading-relaxed mb-2">
          {profile.evidenceNotes}
        </p>
      )}

      {/* Truth notes */}
      {profile.truthNotes && (
        <p className="text-[10px] text-muted-foreground/60 leading-relaxed italic">
          {profile.truthNotes}
        </p>
      )}
    </Section>
  )
}

// ── Fetch button ──────────────────────────────────────────────────────────────

type FetchState = 'idle' | 'loading' | 'done' | 'error'

function FetchButton({
  itemId,
  currentStatus,
  onSuccess,
}: {
  itemId:        string
  currentStatus: string
  onSuccess:     (content: ArticleContent) => void
}) {
  const [state, setState]   = useState<FetchState>('idle')
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const alreadyFetched = currentStatus === 'fetched'

  async function handleFetch(force = false) {
    setState('loading')
    setErrMsg(null)
    try {
      const res = await fetch('/api/fetch/content', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ itemId, force }),
      })
      const data = await res.json() as Record<string, unknown>
      if (data.ok) {
        onSuccess({
          fetchStatus:   'fetched',
          fetchedAt:     new Date().toISOString(),
          cleanText:     null,              // cleanText not returned in API response (too large)
          wordCount:     data.wordCount as number ?? null,
          excerpt:       data.excerpt as string | null ?? null,
          articleTitle:  data.title as string | null ?? null,
          siteName:      data.siteName as string | null ?? null,
          authorName:    data.author as string | null ?? null,
          coverImageUrl: data.coverImageUrl as string | null ?? null,
          mediaUrls:     (data.mediaUrls as string[]) ?? [],
        })
        setState('done')
      } else {
        setErrMsg((data.error as string) ?? '抓取失败')
        setState('error')
      }
    } catch {
      setErrMsg('网络错误')
      setState('error')
    }
  }

  if (state === 'loading') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        正在抓取原文…
      </span>
    )
  }

  if (state === 'done') {
    return (
      <span className="text-xs text-success">✓ 抓取完成，刷新页面后可查看完整正文。</span>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {state === 'error' && errMsg && (
        <span className="text-xs text-danger/80">{errMsg}</span>
      )}
      <button
        type="button"
        onClick={() => handleFetch(false)}
        className="flex items-center gap-1 text-xs text-primary border border-primary/20 bg-primary/5 hover:bg-primary/12 rounded px-2 py-1 transition-colors"
      >
        {alreadyFetched ? <RefreshCw className="h-3 w-3" /> : null}
        {alreadyFetched ? '重新抓取' : '抓取原文'}
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ItemDetailPanel({ item }: { item: InformationItem }) {
  // Local article content — updated after a successful fetch without page reload
  const [localContent, setLocalContent] = useState<ArticleContent | undefined>(item.articleContent)

  const explanation = buildScoreExplanation(item.scoreBreakdown, item.finalScore, item.penalties)
  const detail      = buildInformationDetail(item, explanation, localContent)

  const categoryClass  = categoryColors[item.category] ?? categoryColors['其他']
  const publishedAgo   = formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true, locale: zhCN })
  const publishedFmt   = format(new Date(item.publishedAt), 'yyyy-MM-dd HH:mm')
  const foldedPositive = explanation.topPositiveDrivers.slice(0, 2)

  const fetchStatus    = localContent?.fetchStatus ?? 'not_fetched'
  const hasCoverImg    = Boolean(localContent?.coverImageUrl)
  const mediaUrls      = localContent?.mediaUrls ?? []

  return (
    <div className="space-y-5">

      {/* ── 1. Header ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", explanation.scoreBand.color)}>
            {explanation.scoreBand.label}
          </span>
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", categoryClass)}>
            {item.category}
          </span>
          {foldedPositive.map(d => (
            <span key={d} className="text-[10px] px-1.5 py-0.5 rounded border text-success border-success/25 bg-success/8">
              ↑ {d}
            </span>
          ))}
        </div>
        <h2 className="text-base font-semibold text-foreground leading-snug">{item.title}</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <SourceTierBadge tier={item.sourceTier} />
          <span className="text-xs text-foreground/70 font-medium">{item.source}</span>
          <span className="text-muted-foreground/40 text-xs">·</span>
          <span className="text-xs text-muted-foreground">{publishedAgo}</span>
          <span className="text-muted-foreground/40 text-xs">·</span>
          <span className="text-xs text-muted-foreground/60 font-mono">{publishedFmt}</span>
        </div>
      </div>

      <Divider />

      {/* ── 2. 这条信息在说什么 ── */}
      <Section label="这条信息在说什么">
        <p className="text-sm text-foreground/85 leading-relaxed whitespace-pre-line">
          {detail.whatHappened.text}
        </p>
        <p className="text-[10px] text-muted-foreground/55 italic">{detail.whatHappened.dataNote}</p>
      </Section>

      <Divider />

      {/* ── 3. 为什么值得关注 ── */}
      <Section label="为什么值得关注">
        <p className="text-sm text-foreground/85 leading-relaxed">{detail.whyItMatters.primaryReason}</p>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{detail.whyItMatters.evidenceNote}</p>
          <p className="text-xs text-muted-foreground">{detail.whyItMatters.tierNote}</p>
        </div>
      </Section>

      <Divider />

      {/* ── 4. 可能给你的启发 ── */}
      <Section label="可能给你的启发">
        <div className="space-y-2">
          {detail.userInsights.map((insight, i) => {
            const Icon = InsightIcon[insight.type]
            return (
              <div key={i} className="flex items-start gap-2.5">
                <Icon className="h-3.5 w-3.5 text-muted-foreground/60 mt-0.5 shrink-0" />
                <p className="text-xs text-foreground/80 leading-relaxed">{insight.text}</p>
              </div>
            )
          })}
        </div>
      </Section>

      <Divider />

      {/* ── 5. 来源与原文 ── */}
      <Section label="来源与原文">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2">
              <SourceTierBadge tier={detail.sourcePanel.sourceTier} />
              <span className="text-sm font-medium text-foreground">{detail.sourcePanel.sourceName}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">{detail.sourcePanel.tierLabel}</p>
            {localContent?.authorName && (
              <p className="text-[10px] text-muted-foreground">作者：{localContent.authorName}</p>
            )}
            {localContent?.siteName && localContent.siteName !== item.source && (
              <p className="text-[10px] text-muted-foreground">站点：{localContent.siteName}</p>
            )}
            <p className="text-[10px] text-muted-foreground/70 font-mono">{publishedFmt} · {item.category}</p>
            {detail.sourcePanel.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {detail.sourcePanel.tags.slice(0, 5).map(tag => (
                  <span key={tag} className="text-[10px] text-muted-foreground bg-[var(--tag-bg)] px-1.5 py-px rounded">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {/* Fetch status indicator */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {fetchStatus === 'fetched' && (
                <span className="text-[9px] text-success border border-success/25 rounded px-1.5 py-0.5">
                  已抓取原文
                  {localContent?.wordCount ? ` · 约 ${localContent.wordCount} 字` : ''}
                </span>
              )}
              {fetchStatus === 'failed' && (
                <span className="text-[9px] text-danger/80 border border-danger/20 rounded px-1.5 py-0.5"
                  title={localContent?.errorMessage ?? ''}>
                  抓取失败
                </span>
              )}
              {fetchStatus === 'not_fetched' && (
                <span className="text-[9px] text-muted-foreground/50 border border-border/40 rounded px-1.5 py-0.5">
                  未抓取
                </span>
              )}
              <FetchButton
                itemId={item.id}
                currentStatus={fetchStatus}
                onSuccess={setLocalContent}
              />
            </div>
          </div>

          <a
            href={localContent?.canonicalUrl ?? item.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="shrink-0 flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 border border-primary/25 bg-primary/8 hover:bg-primary/15 rounded-md px-3 py-1.5 transition-colors font-medium"
          >
            <ExternalLink className="h-3 w-3" />
            查看原文
          </a>
        </div>
      </Section>

      <Divider />

      {/* ── 6. 媒体信息 ── */}
      <Section label="媒体信息">
        {hasCoverImg ? (
          <div className="space-y-2">
            {/* Cover image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={localContent!.coverImageUrl!}
              alt="封面图"
              className="w-full max-h-48 object-cover rounded-md border border-border/50"
              referrerPolicy="no-referrer"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            {mediaUrls.length > 0 && (
              <div className="text-[10px] text-muted-foreground/60">
                另有 {mediaUrls.length} 个媒体候选 URL
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 py-3 px-4 rounded-md bg-muted/40 border border-border/50">
            <ImageOff className="h-4 w-4 text-muted-foreground/40 shrink-0" />
            <p className="text-xs text-muted-foreground/60 italic">{detail.media.note}</p>
          </div>
        )}
      </Section>

      <Divider />

      {/* ── 6.5. 真实与证据 ── */}
      {item.evidenceProfile && (
        <EvidenceSection profile={item.evidenceProfile} />
      )}
      {item.evidenceProfile && <Divider />}

      {/* ── 6.8. 处理策略 ── */}
      {item.analysisGate && (
        <AnalysisGateSection gate={item.analysisGate} />
      )}
      {item.analysisGate && <Divider />}

      {/* ── 7. 事件追踪 ── */}
      <Section label="事件追踪">
        <div className="flex items-start justify-between gap-4">
          <p className="text-xs text-muted-foreground">{detail.timeline.message}</p>
          {detail.timeline.canLinkToClusters ? (
            <a
              href="/clusters"
              className="shrink-0 text-[10px] text-primary border border-primary/20 bg-primary/5 hover:bg-primary/12 rounded px-2 py-1 transition-colors font-medium whitespace-nowrap"
              onClick={e => e.stopPropagation()}
            >
              查看事件追踪 →
            </a>
          ) : (
            <span className="shrink-0 text-[10px] text-muted-foreground/40 border border-border/40 rounded px-2 py-1 whitespace-nowrap cursor-not-allowed">
              暂未形成事件簇
            </span>
          )}
        </div>
      </Section>

      <Divider />

      {/* ── 8. 评分审计（底部）── */}
      <Section label="评分审计">
        <div className="flex items-center gap-3">
          <ScoreBadge score={item.finalScore} size="md" />
          <div>
            <div className="flex items-center gap-2">
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", explanation.scoreBand.color)}>
                {explanation.scoreBand.label}
              </span>
              {explanation.isRuleBasedOnly && (
                <span className="text-[10px] text-muted-foreground/50 border border-border/40 rounded px-1.5 py-0.5">
                  规则基线
                </span>
              )}
            </div>
            {explanation.oneLineReason && (
              <p className="text-[10px] text-muted-foreground/70 mt-1">{explanation.oneLineReason}</p>
            )}
          </div>
        </div>

        {(explanation.topPositiveDrivers.length > 0 || explanation.topNegativeDrivers.length > 0) && (
          <div className="flex flex-wrap gap-1">
            {explanation.topPositiveDrivers.map(d => (
              <span key={d} className="text-[10px] px-1.5 py-0.5 rounded border text-success border-success/25 bg-success/8">↑ {d}</span>
            ))}
            {explanation.topNegativeDrivers.filter(d => !d.includes('分惩罚')).map(d => (
              <span key={d} className="text-[10px] px-1.5 py-0.5 rounded border text-muted-foreground border-border bg-muted/50">↓ {d}</span>
            ))}
          </div>
        )}

        <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 bg-muted/40 rounded-md p-3">
          {explanation.dimensions.map(dim => (
            <div key={dim.key} className="flex items-center gap-2">
              <span className={cn("text-[10px] w-14 shrink-0 truncate", dimStatusColor[dim.status])}>
                {dim.label}
              </span>
              <Progress
                value={dim.status === 'missing' ? 0 : dim.rawValue}
                className={cn("h-1 flex-1", dim.status === 'fallback' && "opacity-40")}
              />
              <span className={cn("text-[10px] font-mono w-5 text-right tabular-nums", dimStatusColor[dim.status])}>
                {dim.status === 'missing' ? '—' : dim.rawValue}
              </span>
              {dim.status !== 'available' && (
                <span className="text-[9px] text-muted-foreground/40 w-6 shrink-0">{dimStatusText[dim.status]}</span>
              )}
            </div>
          ))}
        </div>

        {explanation.penalties.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground/60">惩罚：</span>
            {explanation.penalties.map(p => (
              <span key={p.key} className="text-[10px] px-1.5 py-0.5 rounded border text-danger/80 border-danger/20 bg-danger/5">
                -{p.amount} {p.label}
              </span>
            ))}
          </div>
        )}

        {explanation.isRuleBasedOnly && (
          <p className="text-[10px] text-muted-foreground/45">
            当前为规则引擎基线评分，多数维度尚未经 AI 评分（默认值 50）。
            目标匹配维度不代表兴趣偏好，仅表示与当前阶段目标的关联程度。
          </p>
        )}
      </Section>

    </div>
  )
}
