"use client"

import { useState } from "react"
import { AppShell } from "@/components/layout/app-shell"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

// ── Recommendation intensity presets ──────────────────────────────────────────

type PresetId = 'minimal' | 'conservative' | 'standard' | 'relaxed' | 'all'

type Preset = {
  id:       PresetId
  label:    string
  desc:     string
  daily:    string    // expected daily count estimate
  thresholds: {
    mustRead:   number  // maps to engine must_read tier threshold
    highValue:  number  // maps to engine high_value tier threshold
    observeMin: number  // maps to observe tier minimum
  }
}

const PRESETS: Preset[] = [
  {
    id: 'minimal',
    label: '极简',
    desc: '只推最重要的内容',
    daily: '每日约 1-3 条',
    thresholds: { mustRead: 88, highValue: 78, observeMin: 60 },
  },
  {
    id: 'conservative',
    label: '保守',
    desc: '少量高确信内容',
    daily: '每日约 3-8 条',
    thresholds: { mustRead: 84, highValue: 72, observeMin: 55 },
  },
  {
    id: 'standard',
    label: '标准',
    desc: '平衡质量和覆盖',
    daily: '每日约 5-20 条',
    thresholds: { mustRead: 80, highValue: 65, observeMin: 50 },
  },
  {
    id: 'relaxed',
    label: '宽松',
    desc: '多看一些潜在重要信息',
    daily: '每日约 10-30 条',
    thresholds: { mustRead: 75, highValue: 58, observeMin: 45 },
  },
  {
    id: 'all',
    label: '全量观察',
    desc: '尽量多推，仍过滤垃圾',
    daily: '每日约 20+ 条',
    thresholds: { mustRead: 70, highValue: 50, observeMin: 40 },
  },
]

const SETTINGS_KEY = 'jarvis_settings_v1'

type SavedSettings = {
  presetId: PresetId
  autoScore: boolean
  interests: string
  blocklist: string
}

function loadSettings(): SavedSettings {
  if (typeof window === 'undefined') return { presetId: 'standard', autoScore: true, interests: '', blocklist: '' }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return JSON.parse(raw) as SavedSettings
  } catch {}
  return { presetId: 'standard', autoScore: true, interests: '大语言模型, AI工具, 内容创作, 独立开发', blocklist: '' }
}

function saveSettings(s: SavedSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch {}
}

// ── Layout helpers ────────────────────────────────────────────────────────────

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

function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <span className="text-muted-foreground/50 text-xs">{open ? '▲ 收起' : '▼ 展开'}</span>
      </button>
      {open && <div className="border-t border-border px-4 py-4 space-y-4">{children}</div>}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  // Lazy initializers read localStorage only on first render (client-side).
  // During SSR the `typeof window` guard returns the default value.
  const [savedPresetId, setSavedPresetId] = useState<PresetId>(() => loadSettings().presetId)
  const [presetId, setPresetId]           = useState<PresetId>(() => loadSettings().presetId)
  const [autoScore, setAutoScore]         = useState(() => loadSettings().autoScore)
  const [interests, setInterests]         = useState(() => loadSettings().interests)
  const [blocklist, setBlocklist]         = useState(() => loadSettings().blocklist)
  const [saveMsg, setSaveMsg]             = useState('')

  function handleSave() {
    const s: SavedSettings = { presetId, autoScore, interests, blocklist }
    saveSettings(s)
    setSavedPresetId(presetId)
    setSaveMsg('已保存')
    setTimeout(() => setSaveMsg(''), 2000)
  }

  const activePreset = PRESETS.find(p => p.id === presetId) ?? PRESETS[2]

  return (
    <AppShell>
      <div className="p-8 max-w-[660px] space-y-8">

        <div>
          <p className="page-kicker mb-1">Preferences</p>
          <h1 className="editorial-title text-3xl">配置</h1>
          <p className="text-muted-foreground text-sm mt-2">外观、推荐强度和模型设置</p>
        </div>

        {/* ── Appearance ── */}
        <Section title="外观">
          <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card">
            <div>
              <p className="text-sm font-medium text-foreground">界面主题</p>
              <p className="text-xs text-muted-foreground mt-0.5">浅色 / 深色 / 跟随系统</p>
            </div>
            <ThemeToggle />
          </div>
        </Section>

        <Separator />

        {/* ── Recommendation intensity ── */}
        <Section title="推荐强度" desc="控制每日推荐的松紧程度，影响今日雷达的推荐数量">
          <div className="space-y-2">
            {PRESETS.map(preset => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setPresetId(preset.id)}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-lg border transition-colors",
                  presetId === preset.id
                    ? "border-primary bg-primary/8 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-border/80 hover:text-foreground",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "w-3 h-3 rounded-full shrink-0 border-2",
                      presetId === preset.id ? "border-primary bg-primary" : "border-muted-foreground/40 bg-transparent",
                    )} />
                    <div>
                      <span className="text-sm font-medium">{preset.label}</span>
                      <span className="text-xs text-muted-foreground ml-2">{preset.desc}</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground/60 shrink-0">{preset.daily}</span>
                </div>
              </button>
            ))}
          </div>

          {savedPresetId !== presetId && (
            <p className="text-[11px] text-warning/80">· 当前设置未保存</p>
          )}

          {/* Advanced: show internal thresholds */}
          <Collapsible title="高级：阈值详情（当前档位）">
            <div className="grid grid-cols-3 gap-3 text-xs">
              {[
                { label: 'Must Read 阈值', val: activePreset.thresholds.mustRead },
                { label: 'High Value 阈值', val: activePreset.thresholds.highValue },
                { label: 'Observe 最低分', val: activePreset.thresholds.observeMin },
              ].map(({ label, val }) => (
                <div key={label} className="text-center">
                  <p className="text-muted-foreground text-[10px]">{label}</p>
                  <p className="font-mono font-bold text-base text-foreground">{val}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              TODO: 下一版本将这些阈值同步到推荐引擎，当前仅展示。
            </p>
          </Collapsible>
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
              <label className="text-xs font-medium text-foreground">关注关键词</label>
              <Input
                value={interests}
                onChange={e => setInterests(e.target.value)}
                placeholder="大语言模型, AI工具, 独立开发..."
                className="text-xs h-8"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">屏蔽关键词</label>
              <Input
                value={blocklist}
                onChange={e => setBlocklist(e.target.value)}
                placeholder="逗号分隔，匹配到的内容将被降权..."
                className="text-xs h-8"
              />
            </div>
          </div>
        </Section>

        <Separator />

        {/* ── Save button ── */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            保存设置
          </button>
          {saveMsg && <span className="text-xs text-success">{saveMsg}</span>}
          <span className="text-[10px] text-muted-foreground/50 ml-auto">
            设置保存在本地，不同步到服务器
          </span>
        </div>

      </div>
    </AppShell>
  )
}
