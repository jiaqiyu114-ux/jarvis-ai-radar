"use client"

import { useState } from "react"
import { AppShell } from "@/components/layout/app-shell"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

const defaultWeights = {
  ai_relevance:      12,
  source_score:      13,
  importance:        18,
  novelty:           12,
  momentum:          10,
  credibility:       10,
  actionability:     10,
  content_potential:  8,
  personal_fit:       7,
}

const weightLabels: Record<string, string> = {
  ai_relevance:      'AI 相关性',
  source_score:      '信源质量',
  importance:        '重要性',
  novelty:           '新颖性',
  momentum:          '势头',
  credibility:       '可信度',
  actionability:     '可操作性',
  content_potential: '内容潜力',
  personal_fit:      '个人适配',
}

const defaultThresholds = {
  selectedMinScore:  75,
  mustReadMinScore:  88,
  topicWorthyScore:  80,
  displayMinScore:   30,
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      {children}
    </section>
  )
}

export default function SettingsPage() {
  const [weights, setWeights]     = useState(defaultWeights)
  const [thresholds, setThresholds] = useState(defaultThresholds)
  const [autoScore, setAutoScore] = useState(true)

  const weightSum = Object.values(weights).reduce((s, v) => s + v, 0)

  return (
    <AppShell>
      <div className="p-8 max-w-[680px] space-y-10">

        {/* ── Editorial header ── */}
        <div>
          <p className="page-kicker mb-1">Preferences</p>
          <h1 className="editorial-title text-3xl">配置</h1>
          <p className="text-muted-foreground text-sm mt-2">评分系统、阈值、外观和模型设置</p>
        </div>

        {/* ── Appearance ── */}
        <Section title="外观" desc="选择界面主题">
          <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card">
            <div>
              <p className="text-sm font-medium text-foreground">界面主题</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                浅色 Warm Paper · 深色 Warm Ink · 或跟随系统
              </p>
            </div>
            <ThemeToggle />
          </div>
        </Section>

        <Separator />

        {/* ── Scoring weights ── */}
        <Section title="评分维度权重" desc="各维度对最终分的影响比例，总和须为 100%">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">当前总和</span>
            <span className={cn(
              "text-xs font-mono font-bold",
              weightSum === 100 ? "text-success" : "text-danger"
            )}>
              {weightSum}%
            </span>
          </div>
          <div className="space-y-4 p-4 rounded-lg border border-border bg-card">
            {Object.entries(weights).map(([key, value]) => (
              <div key={key} className="grid grid-cols-[130px_1fr_36px] items-center gap-4">
                <span className="text-xs text-muted-foreground text-right">{weightLabels[key]}</span>
                <Slider
                  min={0} max={30} step={1}
                  value={[value]}
                  onValueChange={([v]) => setWeights(prev => ({ ...prev, [key]: v }))}
                />
                <span className="text-xs font-mono text-foreground text-right tabular-nums">{value}%</span>
              </div>
            ))}
          </div>
        </Section>

        <Separator />

        {/* ── Thresholds ── */}
        <Section title="分数阈值">
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: 'mustReadMinScore',  label: '今日必须看',  desc: '最低分数线' },
              { key: 'selectedMinScore',  label: '精选流门槛',  desc: '/selected 页面' },
              { key: 'topicWorthyScore',  label: '选题价值线',  desc: '建议加入选题池' },
              { key: 'displayMinScore',   label: '全量流最低',  desc: '低于此分不显示' },
            ].map(({ key, label, desc }) => (
              <div key={key} className="p-3.5 rounded-lg border border-border bg-card space-y-2">
                <div>
                  <p className="text-xs font-medium text-foreground">{label}</p>
                  <p className="text-[10px] text-muted-foreground">{desc}</p>
                </div>
                <Input
                  type="number" min={0} max={100}
                  value={thresholds[key as keyof typeof thresholds]}
                  onChange={e => setThresholds(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                  className="h-8 text-sm font-mono w-20"
                />
              </div>
            ))}
          </div>
        </Section>

        <Separator />

        {/* ── Model config ── */}
        <Section title="模型配置">
          <div className="space-y-3 p-4 rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">自动评分</p>
                <p className="text-xs text-muted-foreground">抓取后自动调用模型打分</p>
              </div>
              <Switch checked={autoScore} onCheckedChange={setAutoScore} />
            </div>
            <Separator />
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">API Key</label>
              <Input type="password" placeholder="sk-••••••••••••••••" className="h-8 text-xs font-mono" />
            </div>
          </div>
        </Section>

        <Separator />

        {/* ── Interest profile ── */}
        <Section title="个人兴趣画像" desc="影响 AI 相关性评分，逗号分隔关键词">
          <div className="space-y-3 p-4 rounded-lg border border-border bg-card">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">当前项目关键词</label>
              <Input
                defaultValue="大语言模型, AI工具, 内容创作, 独立开发, 信息管理"
                className="text-xs h-8"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">屏蔽关键词</label>
              <Input placeholder="逗号分隔，匹配到的内容将被降权..." className="text-xs h-8" />
            </div>
          </div>
        </Section>

      </div>
    </AppShell>
  )
}
