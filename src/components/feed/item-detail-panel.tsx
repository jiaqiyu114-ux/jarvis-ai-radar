"use client"

import { ExternalLink, BookOpen, Eye, Pencil, GitBranch, ImageOff } from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import { zhCN } from "date-fns/locale"
import { Progress } from "@/components/ui/progress"
import { SourceTierBadge } from "./source-tier-badge"
import { ScoreBadge } from "./score-badge"
import { cn } from "@/lib/utils"
import { buildScoreExplanation } from "@/lib/scoring/explanation"
import { buildInformationDetail } from "@/lib/content/detail-explanation"
import type { InformationItem } from "@/types"
import type { DimensionStatus } from "@/lib/scoring/explanation"
import type { InsightType } from "@/lib/content/detail-explanation"

// ── Category colors ───────────────────────────────────────────────────────────

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

// ── Insight icon ──────────────────────────────────────────────────────────────

const InsightIcon: Record<InsightType, React.ElementType> = {
  content:     Pencil,
  learning:    BookOpen,
  observation: Eye,
  project:     GitBranch,
}

// ── Section wrapper ───────────────────────────────────────────────────────────

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

// ── Main component ────────────────────────────────────────────────────────────

export function ItemDetailPanel({ item }: { item: InformationItem }) {
  const explanation = buildScoreExplanation(item.scoreBreakdown, item.finalScore, item.penalties)
  const detail      = buildInformationDetail(item, explanation)

  const categoryClass = categoryColors[item.category] ?? categoryColors['其他']

  const publishedAgo = formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true, locale: zhCN })
  const publishedFmt = format(new Date(item.publishedAt), 'yyyy-MM-dd HH:mm')

  // Folded driver chips (same as card list)
  const foldedPositive = explanation.topPositiveDrivers.slice(0, 2)

  return (
    <div className="space-y-5">

      {/* ── 1. Header ── */}
      <div className="space-y-2">
        {/* scoreBand + category */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn(
            "text-[10px] px-1.5 py-0.5 rounded border font-medium",
            explanation.scoreBand.color,
          )}>
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

        {/* Title */}
        <h2 className="text-base font-semibold text-foreground leading-snug">
          {item.title}
        </h2>

        {/* Source + time */}
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
        <p className="text-sm text-foreground/85 leading-relaxed">
          {detail.whatHappened.text}
        </p>
        <p className="text-[10px] text-muted-foreground/55 italic">
          {detail.whatHappened.dataNote}
        </p>
      </Section>

      <Divider />

      {/* ── 3. 为什么值得关注 ── */}
      <Section label="为什么值得关注">
        <p className="text-sm text-foreground/85 leading-relaxed">
          {detail.whyItMatters.primaryReason}
        </p>
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
                <div className="shrink-0 mt-0.5">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground/60" />
                </div>
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
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <SourceTierBadge tier={detail.sourcePanel.sourceTier} />
              <span className="text-sm font-medium text-foreground">{detail.sourcePanel.sourceName}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">{detail.sourcePanel.tierLabel}</p>
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
          </div>
          <a
            href={item.originalUrl}
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
        <div className="flex items-center gap-2 py-3 px-4 rounded-md bg-muted/40 border border-border/50">
          <ImageOff className="h-4 w-4 text-muted-foreground/40 shrink-0" />
          <p className="text-xs text-muted-foreground/60 italic">{detail.media.note}</p>
        </div>
      </Section>

      <Divider />

      {/* ── 7. 事件追踪 ── */}
      <Section label="事件追踪">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{detail.timeline.message}</p>
            {detail.timeline.multiSource && (
              <p className="text-[10px] text-muted-foreground/60">
                关联 {detail.timeline.sourceCount} 篇报道
              </p>
            )}
          </div>
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
        {/* Score header */}
        <div className="flex items-center gap-3">
          <ScoreBadge score={item.finalScore} size="md" />
          <div>
            <div className="flex items-center gap-2">
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded border font-medium",
                explanation.scoreBand.color,
              )}>
                {explanation.scoreBand.label}
              </span>
              {explanation.isRuleBasedOnly && (
                <span className="text-[10px] text-muted-foreground/50 border border-border/40 rounded px-1.5 py-0.5">
                  规则基线
                </span>
              )}
            </div>
            {explanation.oneLineReason && (
              <p className="text-[10px] text-muted-foreground/70 mt-1">
                {explanation.oneLineReason}
              </p>
            )}
          </div>
        </div>

        {/* Drivers */}
        {(explanation.topPositiveDrivers.length > 0 || explanation.topNegativeDrivers.length > 0) && (
          <div className="flex flex-wrap gap-1">
            {explanation.topPositiveDrivers.map(d => (
              <span key={d} className="text-[10px] px-1.5 py-0.5 rounded border text-success border-success/25 bg-success/8">
                ↑ {d}
              </span>
            ))}
            {explanation.topNegativeDrivers
              .filter(d => !d.includes('分惩罚'))
              .map(d => (
                <span key={d} className="text-[10px] px-1.5 py-0.5 rounded border text-muted-foreground border-border bg-muted/50">
                  ↓ {d}
                </span>
              ))}
          </div>
        )}

        {/* Dimension bars */}
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
                <span className="text-[9px] text-muted-foreground/40 w-6 shrink-0">
                  {dimStatusText[dim.status]}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Penalties */}
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

        {/* Rule-based note */}
        {explanation.isRuleBasedOnly && (
          <p className="text-[10px] text-muted-foreground/45">
            当前为规则引擎基线评分，多数维度尚未经 AI 评分（默认值 50）。
            当前目标匹配维度不代表兴趣偏好，仅表示与当前阶段目标的关联程度。
          </p>
        )}
      </Section>

    </div>
  )
}
