"use client"

import { useState } from "react"
import { Copy, Check, FileText, TrendingUp, Lightbulb, PenLine, BookOpen, ExternalLink } from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import type { TopSignalData } from "@/components/layout/app-shell"
import { ScoreBadge } from "@/components/feed/score-badge"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import type { DailyReport, InformationItem } from "@/types"

function buildMarkdown(report: DailyReport): string {
  return [
    `# J.A.R.V.I.S. 日报 · ${report.date}`,
    '',
    '## 今日摘要',
    ...report.summary.map(s => `- ${s}`),
    '',
    '## 重点报道',
    ...report.topStories.map(s => `- **[${s.score}]** ${s.title}：${s.summary}`),
    '',
    '## 趋势话题',
    report.trendingTopics.map(t => `#${t}`).join('  '),
    '',
    '## 内容选题建议',
    ...report.contentAngles.map((a, i) => `${i + 1}. ${a}`),
    '',
    `---`,
    `*由 J.A.R.V.I.S. 生成于 ${new Date(report.generatedAt).toLocaleString('zh-CN')}*`,
  ].join('\n')
}

function buildWechatDraft(report: DailyReport): string {
  return [
    `【AI 日报 ${report.date}】`,
    '',
    '今日速览：',
    ...report.summary.slice(0, 3).map(s => `▶ ${s}`),
    '',
    '重点关注：',
    ...report.topStories.slice(0, 3).map(s => `📌 ${s.title}`),
    '',
    '---',
    '更多内容见完整日报。',
  ].join('\n')
}

function buildXhsTopics(report: DailyReport): string {
  return [
    `✨ 今日 AI 圈速览（${report.date}）`,
    '',
    ...report.contentAngles.map(a => `📝 ${a}`),
    '',
    report.trendingTopics.map(t => `#${t}`).join(' '),
  ].join('\n')
}

function CopyItem({ label, getText, accent }: { label: string; getText: () => string; accent?: boolean }) {
  const [copied, setCopied] = useState(false)
  const handle = async () => {
    await navigator.clipboard.writeText(getText())
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <button
      onClick={handle}
      className={cn(
        "w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-colors text-left",
        accent
          ? "bg-primary/8 border-primary/20 text-foreground hover:bg-primary/12"
          : "bg-card border-border text-foreground hover:bg-accent"
      )}
    >
      <span className="font-medium">{label}</span>
      {copied
        ? <Check className="h-3.5 w-3.5 text-success shrink-0" />
        : <Copy className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      }
    </button>
  )
}

type Props = {
  report:            DailyReport
  highItems:         InformationItem[]
  worthWritingCount: number
  topSignal?:        TopSignalData
  includeDemo?:      boolean
}

export default function ReportsClient({ report, highItems, worthWritingCount, topSignal, includeDemo }: Props) {
  return (
    <AppShell topSignal={topSignal}>
      <div className="p-8 max-w-[1240px] mx-auto">

        {/* ── Editorial header ── */}
        <div className="mb-8">
          <p className="page-kicker mb-1">{report.date} · Editorial Brief</p>
          <div className="flex items-end justify-between gap-4">
            <h1 className="editorial-title text-[2.25rem]">今日日报</h1>
            {includeDemo && (
              <span className="text-[10px] text-warning border border-warning/30 bg-warning/10 rounded px-1.5 py-0.5 mb-1">
                演示日报
              </span>
            )}
          </div>
          <p className="page-subtitle mt-1.5">
            生成于 {new Date(report.generatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            {' · '}{report.topStories.length} 条重点 · {report.trendingTopics.length} 个趋势话题
          </p>
        </div>

        {/* ── Two-column layout ── */}
        <div className="flex gap-8 items-start">

          {/* ══ LEFT: Report content ══ */}
          <div className="flex-1 min-w-0 space-y-8">

            <section>
              <div className="flex items-center gap-2 mb-4">
                <FileText className="h-4 w-4 text-primary" />
                <h2 className="text-base font-semibold text-foreground">今日摘要</h2>
              </div>
              <ul className="space-y-2.5">
                {report.summary.map((line, i) => (
                  <li key={i} className="flex gap-3 text-sm text-foreground/85 leading-relaxed">
                    <span className="text-primary font-mono font-bold shrink-0 mt-0.5 w-4 text-center">{i + 1}</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </section>

            <Separator />

            <section>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-4 w-4 text-warning" />
                <h2 className="text-base font-semibold text-foreground">重点报道</h2>
              </div>
              <div className="space-y-0 border border-border/60 rounded-lg overflow-hidden bg-card">
                {report.topStories.map((story, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-3 border-b border-border/40 last:border-0 hover:bg-accent transition-colors">
                    <ScoreBadge score={story.score} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{story.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{story.summary}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <Separator />

            <section>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-4 w-4 text-sky-500 dark:text-sky-400" />
                <h2 className="text-base font-semibold text-foreground">趋势话题</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {report.trendingTopics.map(topic => (
                  <span
                    key={topic}
                    className="text-xs px-2.5 py-1 rounded-full border border-border bg-card text-foreground hover:border-primary/30 hover:text-primary transition-colors cursor-default"
                  >
                    #{topic}
                  </span>
                ))}
              </div>
            </section>

            <Separator />

            <section>
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                <h2 className="text-base font-semibold text-foreground">内容选题建议</h2>
              </div>
              <ul className="space-y-2">
                {report.contentAngles.map((angle, i) => (
                  <li key={i} className="flex gap-3 items-start py-2.5 border-b border-border/40 last:border-0">
                    <span className="text-xs font-mono font-bold text-primary mt-0.5 shrink-0 w-4 text-center">{i + 1}</span>
                    <span className="text-sm text-foreground/85">{angle}</span>
                  </li>
                ))}
              </ul>
            </section>

          </div>

          {/* ══ RIGHT: Conversion panel (sticky) ══ */}
          <div className="w-[360px] shrink-0 sticky top-14 space-y-4">

            <div>
              <p className="muted-label mb-1.5">内容转化工作台</p>
              <h3 className="text-sm font-semibold text-foreground">信息 → 判断 → 选题 → 内容</h3>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: '可写选题', value: worthWritingCount },
                { label: '趋势话题', value: report.trendingTopics.length },
                { label: '内容方向', value: report.contentAngles.length },
              ].map(({ label, value }) => (
                <div key={label} className="border border-border rounded-lg px-3 py-2.5 bg-card text-center">
                  <p className="text-xl font-bold font-mono text-primary tabular-nums">{value}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            <div className="border border-border rounded-lg p-4 bg-card space-y-2">
              <p className="muted-label mb-3">导出 / 生成草稿</p>
              <CopyItem label="复制完整 Markdown" getText={() => buildMarkdown(report)} accent />
              <CopyItem label="生成公众号草稿" getText={() => buildWechatDraft(report)} />
              <CopyItem label="生成小红书选题" getText={() => buildXhsTopics(report)} />
            </div>

            <div className="border border-border rounded-lg p-4 bg-card space-y-3">
              <p className="muted-label">今日内容方向</p>
              {[
                { icon: PenLine, platform: '公众号', angle: report.contentAngles[0] },
                { icon: BookOpen, platform: '小红书', angle: report.contentAngles[2] },
              ].filter(d => d.angle).map(({ platform, angle }) => (
                <div key={platform} className="space-y-1">
                  <p className="text-[10px] font-semibold text-primary">{platform}</p>
                  <p className="text-xs text-foreground/75 leading-relaxed">{angle}</p>
                </div>
              ))}
            </div>

            <div className="border border-border rounded-lg p-4 bg-card">
              <p className="muted-label mb-3">今日高分参考</p>
              <div className="space-y-2">
                {highItems.map(item => (
                  <div key={item.id} className="flex items-center gap-2.5 py-1">
                    <ScoreBadge score={item.finalScore} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{item.title}</p>
                      <p className="text-[10px] text-muted-foreground">{item.source}</p>
                    </div>
                    <a href={item.originalUrl} target="_blank" rel="noopener noreferrer"
                       className="text-muted-foreground/40 hover:text-primary transition-colors shrink-0">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </AppShell>
  )
}
