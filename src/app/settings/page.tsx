"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AppShell } from "@/components/layout/app-shell"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { Eye, EyeOff, Zap, Clock, Database, Sliders } from "lucide-react"
import {
  PROFILE_PRESETS,
  DEFAULT_PROFILE_ID,
  getProfileThresholds,
  SETTINGS_STORAGE_KEY,
  PROFILE_COOKIE,
  PROFILE_UPDATED_AT_COOKIE,
  type ProfileId,
} from "@/lib/recommendations/recommendation-thresholds"

// ── Persistence ───────────────────────────────────────────────────────────────

type SavedSettings = {
  profileId:         ProfileId
  autoScore:         boolean
  interests:         string
  blocklist:         string
  profileUpdatedAt?: string
}

function loadSettings(): SavedSettings {
  if (typeof window === "undefined") {
    return { profileId: DEFAULT_PROFILE_ID, autoScore: true, interests: "", blocklist: "" }
  }
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as SavedSettings
  } catch {}
  return { profileId: DEFAULT_PROFILE_ID, autoScore: true, interests: "大语言模型, AI工具, 内容创作", blocklist: "" }
}

function persistSettings(s: SavedSettings, cb?: () => void) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(s))
    const exp = "; max-age=31536000; path=/; SameSite=Strict"
    document.cookie = `${PROFILE_COOKIE}=${encodeURIComponent(s.profileId)}${exp}`
    if (s.profileUpdatedAt) {
      document.cookie = `${PROFILE_UPDATED_AT_COOKIE}=${encodeURIComponent(s.profileUpdatedAt)}${exp}`
    }
    cb?.()
  } catch {}
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function SettingCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn("rounded-xl border p-4 space-y-4", className)}
      style={{ background: "var(--bg-card)", borderColor: "var(--border-subtle)", boxShadow: "var(--shadow-soft)" }}
    >
      {children}
    </div>
  )
}

function SettingRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>{label}</p>
        {desc && <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Divider() {
  return <div className="h-px" style={{ background: "var(--border-subtle)" }} />
}

function SavedBadge({ msg }: { msg: string | null }) {
  if (!msg) return null
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium"
         style={{ background: "color-mix(in srgb, var(--accent-lime) 10%, transparent)", color: "var(--accent-lime)", border: "1px solid color-mix(in srgb, var(--accent-lime) 24%, transparent)" }}>
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--accent-lime)" }} />
      {msg}
    </div>
  )
}

/** Parse comma-separated string into trimmed non-empty tag list */
function parseTags(s: string): string[] {
  return s.split(",").map(t => t.trim()).filter(Boolean)
}

function TagPreview({ raw }: { raw: string }) {
  const tags = parseTags(raw)
  if (tags.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {tags.map(t => (
        <span key={t} className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium"
              style={{ background: "var(--overlay-3)", color: "var(--text-tertiary)", border: "1px solid var(--border-subtle)" }}>
          {t}
        </span>
      ))}
    </div>
  )
}

function InfoRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <span className="font-mono font-semibold" style={{ color: accent ?? "var(--text-secondary)" }}>{value}</span>
    </div>
  )
}

// ── Tab definitions ───────────────────────────────────────────────────────────

type Tab = "外观" | "推荐" | "数据" | "模型"

const TABS: { id: Tab; icon: typeof Sliders }[] = [
  { id: "外观",  icon: Eye },
  { id: "推荐",  icon: Sliders },
  { id: "数据",  icon: Database },
  { id: "模型",  icon: Zap },
]

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>("外观")

  const [profileId,  setProfileId]  = useState<ProfileId>(() => loadSettings().profileId)
  const [autoScore,  setAutoScore]  = useState(() => loadSettings().autoScore)
  const [interests,  setInterests]  = useState(() => loadSettings().interests)
  const [blocklist,  setBlocklist]  = useState(() => loadSettings().blocklist)
  const [showKey,    setShowKey]    = useState(false)
  const [saveMsg,    setSaveMsg]    = useState<string | null>(null)

  function flash(msg: string) {
    setSaveMsg(msg)
    setTimeout(() => setSaveMsg(null), 2500)
  }

  function handleProfileChange(id: ProfileId) {
    setProfileId(id)
    const now = new Date().toISOString()
    // Persist cookie + localStorage immediately, then navigate to dashboard.
    // Dashboard is server-rendered and reads the cookie, so the new thresholds
    // take effect on first render — no waiting for a background API call.
    persistSettings({ profileId: id, autoScore, interests, blocklist, profileUpdatedAt: now })
    router.push('/dashboard')
  }

  function handleSave() {
    persistSettings({ profileId, autoScore, interests, blocklist,
      profileUpdatedAt: loadSettings().profileUpdatedAt },
      () => flash("已保存"))
  }

  const activePreset     = PROFILE_PRESETS.find(p => p.id === profileId) ?? PROFILE_PRESETS[2]
  const activeThresholds = getProfileThresholds(profileId)

  return (
    <AppShell>
      <div className="mx-auto max-w-[680px] px-6 py-8">

        {/* ── Header ── */}
        <div className="mb-7">
          <p className="page-kicker mb-1.5">Preferences</p>
          <h1 className="editorial-title">配置</h1>
        </div>

        {/* ── Tab bar ── */}
        <div className="mb-6 flex items-center gap-1 p-1 rounded-xl"
             style={{ background: "var(--overlay-2)", border: "1px solid var(--border-subtle)" }}>
          {TABS.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-medium transition-all",
                activeTab === id ? "shadow-sm" : "hover:opacity-75",
              )}
              style={activeTab === id
                ? { background: "var(--bg-card)", color: "var(--text-primary)", boxShadow: "var(--shadow-soft)" }
                : { color: "var(--text-tertiary)" }}
            >
              <Icon className="h-3.5 w-3.5" />
              {id}
            </button>
          ))}
        </div>

        {/* ── Save badge (global) ── */}
        {saveMsg && (
          <div className="mb-4">
            <SavedBadge msg={saveMsg} />
          </div>
        )}

        {/* ════════════════════════════════════════════════
            外观 tab
            ════════════════════════════════════════════════ */}
        {activeTab === "外观" && (
          <div className="space-y-4">
            <SettingCard>
              <SettingRow
                label="界面主题"
                desc="浅色 / 深色 / 跟随系统（跟随系统时由操作系统决定）"
              >
                <ThemeToggle />
              </SettingRow>
            </SettingCard>

            {/* Placeholder cards for future */}
            <SettingCard>
              <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                更多外观设置（信息密度、字号）将在后续版本加入。
              </p>
            </SettingCard>
          </div>
        )}

        {/* ════════════════════════════════════════════════
            推荐 tab
            ════════════════════════════════════════════════ */}
        {activeTab === "推荐" && (
          <div className="space-y-5">

            {/* Presets */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.10em] mb-3"
                 style={{ color: "var(--text-tertiary)" }}>推荐强度</p>
              <p className="text-[12px] mb-3" style={{ color: "var(--text-muted)" }}>
                达到阈值的内容进入今日推荐；接近但未达标的进入近期观察。
              </p>
              <div className="space-y-1.5">
                {PROFILE_PRESETS.map(preset => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleProfileChange(preset.id)}
                    className="w-full text-left px-3.5 py-2.5 rounded-xl border transition-all duration-150"
                    style={profileId === preset.id
                      ? { background: "var(--primary-soft)", borderColor: "color-mix(in srgb, var(--primary-color) 35%, transparent)" }
                      : { background: "var(--overlay-1)", borderColor: "var(--border-subtle)" }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-2 h-2 rounded-full shrink-0 border-2 transition-all"
                          style={profileId === preset.id
                            ? { background: "var(--primary-color)", borderColor: "var(--primary-color)" }
                            : { background: "transparent", borderColor: "var(--text-muted)" }}
                        />
                        <span className="text-[13px] font-medium" style={{ color: profileId === preset.id ? "var(--primary-on-soft)" : "var(--text-secondary)" }}>
                          {preset.label}
                        </span>
                        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{preset.desc}</span>
                      </div>
                      <span className="text-[10px] font-mono shrink-0" style={{ color: "var(--text-muted)" }}>{preset.daily}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Advanced thresholds — collapsible inline */}
            <details className="rounded-xl border overflow-hidden"
                     style={{ borderColor: "var(--border-subtle)", background: "var(--overlay-1)" }}>
              <summary className="flex items-center justify-between px-4 py-2.5 cursor-pointer list-none text-[11px]"
                       style={{ color: "var(--text-muted)" }}>
                <span>高级：当前档位「{activePreset.label}」的阈值详情</span>
                <span className="font-mono text-[10px]">▼</span>
              </summary>
              <div className="border-t px-4 py-3 space-y-3"
                   style={{ borderColor: "var(--border-subtle)" }}>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "重点推荐", val: activeThresholds.mustRead },
                    { label: "今日推荐", val: activeThresholds.highValue },
                    { label: "近期观察", val: activeThresholds.observe },
                  ].map(({ label, val }) => (
                    <div key={label} className="text-center p-2 rounded-lg"
                         style={{ background: "var(--overlay-2)", border: "1px solid var(--border-subtle)" }}>
                      <p className="text-[10px] mb-1" style={{ color: "var(--text-muted)" }}>{label}</p>
                      <p className="font-mono font-bold text-lg" style={{ color: "var(--text-primary)" }}>{val}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  ≥ {activeThresholds.highValue} 进入今日推荐 · {activeThresholds.observe}–{activeThresholds.highValue - 1} 进入近期观察 · 低于 {activeThresholds.observe} 不显示
                </p>
              </div>
            </details>

            {/* Interest profile */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.10em] mb-3"
                 style={{ color: "var(--text-tertiary)" }}>兴趣画像</p>
              <SettingCard className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
                    关注关键词 <span style={{ color: "var(--text-muted)" }}>（逗号分隔，提升相关内容权重）</span>
                  </label>
                  <Input
                    value={interests}
                    onChange={e => setInterests(e.target.value)}
                    onBlur={handleSave}
                    placeholder="大语言模型, AI工具, 独立开发..."
                    className="text-[12px] h-8"
                  />
                  <TagPreview raw={interests} />
                </div>
                <Divider />
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
                    屏蔽关键词 <span style={{ color: "var(--text-muted)" }}>（逗号分隔，降低匹配内容权重）</span>
                  </label>
                  <Input
                    value={blocklist}
                    onChange={e => setBlocklist(e.target.value)}
                    onBlur={handleSave}
                    placeholder="广告, 营销号..."
                    className="text-[12px] h-8"
                  />
                  <TagPreview raw={blocklist} />
                </div>
              </SettingCard>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════
            数据 tab
            ════════════════════════════════════════════════ */}
        {activeTab === "数据" && (
          <div className="space-y-5">

            {/* Pipeline automation */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.10em] mb-3"
                 style={{ color: "var(--text-tertiary)" }}>自动化管道（Vercel Cron）</p>
              <SettingCard>
                <div className="space-y-3">
                  <InfoRow label="信号抓取 + 推荐快照" value="每天 07:30 北京时间" accent="var(--accent-lime)" />
                  <InfoRow label="维护批次（Flash 初筛 + Evidence + 聚类 + 日报）" value="每天 08:30 北京时间" accent="var(--accent-blue)" />
                  <InfoRow label="选题池自动填充"     value="同维护批次" />
                  <InfoRow label="日报时间窗口"       value="00:00 – 24:00" />
                  <Divider />
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Hobby 计划每天各触发一次。本地开发时请在 Dashboard 手动点击「手动生成快照」。
                  </p>
                </div>
              </SettingCard>
            </div>

            {/* Security — PIPELINE_SECRET */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.10em] mb-3"
                 style={{ color: "var(--text-tertiary)" }}>安全配置</p>
              <SettingCard>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg"
                       style={{ background: "color-mix(in srgb, #f59e0b 8%, transparent)", border: "1px solid color-mix(in srgb, #f59e0b 25%, transparent)" }}>
                    <span className="text-base leading-none mt-0.5">⚠️</span>
                    <div className="space-y-1">
                      <p className="text-[12px] font-medium" style={{ color: "#b45309" }}>
                        请在 Vercel 环境变量中设置 PIPELINE_SECRET
                      </p>
                      <p className="text-[11px]" style={{ color: "#92400e" }}>
                        未设置时，任何人知道 URL 都可以触发 pipeline 消耗 token。
                        在 Vercel Dashboard → Settings → Environment Variables 中添加
                        任意强密码作为 PIPELINE_SECRET 的值。
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg"
                       style={{ background: "color-mix(in srgb, var(--accent-blue) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-blue) 20%, transparent)" }}>
                    <span className="text-base leading-none mt-0.5">🔧</span>
                    <div>
                      <p className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
                        信源名称修复
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        如发现信源名显示乱码（如"36? AI"），可调用
                        <code className="mx-1 px-1 rounded text-[10px]"
                              style={{ background: "var(--overlay-2)" }}>
                          POST /api/admin/fix-source-names
                        </code>
                        一次性修复数据库中的乱码信源名。
                      </p>
                    </div>
                  </div>
                </div>
              </SettingCard>
            </div>

            {/* Flash filter info */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.10em] mb-3"
                 style={{ color: "var(--text-tertiary)" }}>Flash 初筛说明</p>
              <SettingCard>
                <div className="space-y-2.5">
                  <InfoRow label="初筛模型"   value="deepseek-chat" accent="var(--accent-blue)" />
                  <InfoRow label="批量大小"   value="25 条/次" />
                  <InfoRow label="最低分数"   value="≥ 4 / 5（高价值及以上通过）" />
                  <InfoRow label="预估成本"   value="~¥0.015 / 100 条" />
                  <Divider />
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Flash 初筛通过的内容再经规则分级（none/light/standard/deep），
                    仅 deep/cluster 级别才会调用 deepseek-reasoner 做深度解读。
                    可在处理队列页手动触发「Flash 初筛」按钮。
                  </p>
                </div>
              </SettingCard>
            </div>

            {/* Data window */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.10em] mb-3"
                 style={{ color: "var(--text-tertiary)" }}>数据范围</p>
              <SettingCard>
                <div className="space-y-2.5">
                  <InfoRow label="时区"          value="Asia/Singapore (UTC+8)" />
                  <InfoRow label="日报周期"       value="当日 00:00 → 24:00" />
                  <InfoRow label="时间线排序依据" value="发布时间（publishedAt）" />
                </div>
              </SettingCard>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════
            模型 tab
            ════════════════════════════════════════════════ */}
        {activeTab === "模型" && (
          <div className="space-y-5">

            {/* Scoring */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.10em] mb-3"
                 style={{ color: "var(--text-tertiary)" }}>自动评分</p>
              <SettingCard>
                <SettingRow label="抓取后自动打分" desc="关闭后仍可在处理队列手动触发">
                  <Switch checked={autoScore} onCheckedChange={v => { setAutoScore(v); handleSave() }} />
                </SettingRow>
              </SettingCard>
            </div>

            {/* API Keys */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.10em] mb-3"
                 style={{ color: "var(--text-tertiary)" }}>API 配置</p>
              <SettingCard>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
                        DeepSeek API Key
                      </label>
                      <span className="text-[10px] px-2 py-0.5 rounded font-medium"
                            style={{ background: "color-mix(in srgb, var(--accent-lime) 12%, transparent)", color: "var(--accent-lime)", border: "1px solid color-mix(in srgb, var(--accent-lime) 25%, transparent)" }}>
                        已配置（.env.local）
                      </span>
                    </div>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      在项目根目录的 .env.local 中设置 LLM_API_KEY。当前已检测到有效密钥。
                    </p>
                  </div>
                </div>
              </SettingCard>
            </div>

            {/* Model info */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.10em] mb-3"
                 style={{ color: "var(--text-tertiary)" }}>使用模型</p>
              <SettingCard>
                <div className="space-y-2.5">
                  <InfoRow label="深度解读 / 深度分析" value="deepseek-reasoner" accent="var(--accent-orange)" />
                  <InfoRow label="Flash 初筛（批量预过滤）" value="deepseek-chat"    accent="var(--accent-blue)" />
                  <Divider />
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    可通过 .env.local 中的 LLM_MODEL（深度）和 LLM_FAST_MODEL（初筛）修改。
                  </p>
                </div>
              </SettingCard>
            </div>
          </div>
        )}

      </div>
    </AppShell>
  )
}
