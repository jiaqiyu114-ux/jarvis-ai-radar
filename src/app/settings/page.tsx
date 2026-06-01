"use client"

import { useState } from "react"
import { AppShell } from "@/components/layout/app-shell"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import {
  PROFILE_PRESETS,
  DEFAULT_PROFILE_ID,
  getProfileThresholds,
  SETTINGS_STORAGE_KEY,
  PROFILE_COOKIE,
  PROFILE_UPDATED_AT_COOKIE,
  type ProfileId,
} from "@/lib/recommendations/recommendation-thresholds"

// ── Persistence ────────────────────────────────────────────────────────────────

type SavedSettings = {
  profileId:              ProfileId
  autoScore:              boolean
  interests:              string
  blocklist:              string
  profileUpdatedAt?:      string  // ISO timestamp when profile last changed
}

function loadSettings(): SavedSettings {
  if (typeof window === 'undefined') {
    return { profileId: DEFAULT_PROFILE_ID, autoScore: true, interests: '', blocklist: '' }
  }
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as SavedSettings
  } catch {}
  return { profileId: DEFAULT_PROFILE_ID, autoScore: true, interests: '大语言模型, AI工具, 内容创作', blocklist: '' }
}

function persistSettings(s: SavedSettings) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(s))
    // Also write cookies so the server-rendered dashboard can read the profile
    const exp = '; max-age=31536000; path=/; SameSite=Strict'
    document.cookie = `${PROFILE_COOKIE}=${encodeURIComponent(s.profileId)}${exp}`
    if (s.profileUpdatedAt) {
      document.cookie = `${PROFILE_UPDATED_AT_COOKIE}=${encodeURIComponent(s.profileUpdatedAt)}${exp}`
    }
  } catch {}
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
  const [profileId, setProfileId]   = useState<ProfileId>(() => loadSettings().profileId)
  const [autoScore, setAutoScore]   = useState(() => loadSettings().autoScore)
  const [interests, setInterests]   = useState(() => loadSettings().interests)
  const [blocklist, setBlocklist]   = useState(() => loadSettings().blocklist)
  const [saveMsg, setSaveMsg]       = useState<string | null>(null)

  /** Auto-save when user selects a profile — no button required. */
  function handleProfileChange(id: ProfileId) {
    setProfileId(id)
    const now = new Date().toISOString()
    const s: SavedSettings = { profileId: id, autoScore, interests, blocklist, profileUpdatedAt: now }
    persistSettings(s)
    setSaveMsg('已自动保存，回到今日雷达后自动生效')
    setTimeout(() => setSaveMsg(null), 3000)
  }

  /** Save other settings (interests, blocklist, autoScore). */
  function handleMiscSave() {
    const s: SavedSettings = {
      profileId,
      autoScore,
      interests,
      blocklist,
      profileUpdatedAt: loadSettings().profileUpdatedAt,
    }
    persistSettings(s)
    setSaveMsg('其他设置已保存')
    setTimeout(() => setSaveMsg(null), 2000)
  }

  const activePreset   = PROFILE_PRESETS.find(p => p.id === profileId) ?? PROFILE_PRESETS[2]
  const activeThresholds = getProfileThresholds(profileId)

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

        {/* ── Recommendation intensity — auto-save on click ── */}
        <Section
          title="推荐强度"
          desc="选择你每天想看的信息密度。进入「今日推荐」的内容必须达到当前档位阈值；分数不够但有观察价值的内容会进入「近期观察」。"
        >
          <div className="space-y-2">
            {PROFILE_PRESETS.map(preset => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleProfileChange(preset.id)}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-lg border transition-colors",
                  profileId === preset.id
                    ? "border-primary bg-primary/8 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-border/80 hover:text-foreground",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "w-3 h-3 rounded-full shrink-0 border-2",
                      profileId === preset.id
                        ? "border-primary bg-primary"
                        : "border-muted-foreground/40 bg-transparent",
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

          {/* Auto-save status */}
          {saveMsg && (
            <p className="text-[11px] text-success">{saveMsg}</p>
          )}

          {/* Advanced thresholds */}
          <Collapsible title={`高级：当前档位「${activePreset.label}」的阈值详情`}>
            <div className="grid grid-cols-3 gap-3 text-xs">
              {[
                { label: '重点推荐门槛', val: activeThresholds.mustRead },
                { label: '今日推荐门槛', val: activeThresholds.highValue },
                { label: '近期观察门槛', val: activeThresholds.observe },
              ].map(({ label, val }) => (
                <div key={label} className="text-center p-2 rounded border border-border">
                  <p className="text-muted-foreground text-[10px] mb-1">{label}</p>
                  <p className="font-mono font-bold text-lg text-foreground">{val}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/60">
              分数 ≥ {activeThresholds.highValue}：进入今日推荐 ·{' '}
              {activeThresholds.observe}–{activeThresholds.highValue - 1}：进入近期观察 ·{' '}
              低于 {activeThresholds.observe}：不显示
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
              <Switch checked={autoScore} onCheckedChange={v => { setAutoScore(v); handleMiscSave() }} />
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
                onBlur={handleMiscSave}
                placeholder="大语言模型, AI工具, 独立开发..."
                className="text-xs h-8"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">屏蔽关键词</label>
              <Input
                value={blocklist}
                onChange={e => setBlocklist(e.target.value)}
                onBlur={handleMiscSave}
                placeholder="逗号分隔，匹配到的内容将被降权..."
                className="text-xs h-8"
              />
            </div>
          </div>
        </Section>

      </div>
    </AppShell>
  )
}
