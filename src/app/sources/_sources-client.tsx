"use client"

import { useCallback, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { AppShell } from "@/components/layout/app-shell"
import { SourceTierBadge } from "@/components/feed/source-tier-badge"
import { SourceOriginBadge } from "@/components/sources/source-origin-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { SourceWithHealth } from "@/lib/data/sources-adapter"
import type { SourceHealthStatus } from "@/types/database"
import { Ban, Check, Copy, MoreHorizontal, Pencil, Plus, Search, Star } from "lucide-react"

// ── Time formatting ────────────────────────────────────────────────────────────

function timeAgo(at: string | null): string {
  if (!at) return ''
  const ms = Date.now() - new Date(at).getTime()
  if (ms < 60_000)     return '刚刚'
  if (ms < 3_600_000)  return `${Math.floor(ms / 60_000)}m 前`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h 前`
  return `${Math.floor(ms / 86_400_000)}d 前`
}

// ── Health badge ───────────────────────────────────────────────────────────────

const HEALTH_STYLE: Record<SourceHealthStatus, string> = {
  healthy:  "bg-success/10 text-success border-success/25",
  degraded: "bg-warning/10 text-warning border-warning/25",
  failing:  "bg-danger/10 text-danger border-danger/25",
  blocked:  "bg-danger/10 text-danger border-danger/25",
  unknown:  "bg-muted text-muted-foreground border-border",
}

const HEALTH_LABEL: Record<SourceHealthStatus, string> = {
  healthy:  "正常",
  degraded: "不稳定",
  failing:  "连续失败",
  blocked:  "已屏蔽",
  unknown:  "未检测",
}

const HEALTH_DOT: Record<SourceHealthStatus, string> = {
  healthy:  "bg-success",
  degraded: "bg-warning",
  failing:  "bg-danger",
  blocked:  "bg-danger",
  unknown:  "bg-muted-foreground",
}

const FETCH_STATUS_LABEL: Record<string, string> = {
  success:     "成功",
  failed:      "失败",
  timeout:     "超时",
  aborted:     "中断",
  parse_error: "解析失败",
  db_error:    "写入失败",
}

function HealthCell({ source }: { source: SourceWithHealth }) {
  if (source.platform !== "rss") {
    const isPendingWeb = source.userSourceNote?.includes("pendingWeb:true")
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full border border-sky-400/25 bg-sky-400/[0.07] text-sky-300/80"
        title="该源不参与 RSS 抓取，等待网页抓取通道"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-sky-400/70" />
        {isPendingWeb ? "待网页抓取 · 不参与 RSS" : "非 RSS · 不参与抓取"}
      </span>
    )
  }
  const status = source.healthStatus
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn(
        "inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full border font-medium",
        HEALTH_STYLE[status] ?? HEALTH_STYLE.unknown,
      )}>
        <span className={cn("w-1.5 h-1.5 rounded-full", HEALTH_DOT[status] ?? HEALTH_DOT.unknown)} />
        {HEALTH_LABEL[status] ?? status}
      </span>
      <span className={cn(
        "text-[10px] font-mono tabular-nums",
        source.healthScore >= 70 ? "text-success/70" :
        source.healthScore >= 40 ? "text-warning/70" : "text-danger/70",
      )}>
        {source.healthScore}
      </span>
    </div>
  )
}

// ── Filter types ──────────────────────────────────────────────────────────────

type FilterKey = "all" | "my" | "official" | "kol" | "never_fetched" | "web" | "failing" | "rss" | "blocked"

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",           label: "全部" },
  { key: "my",            label: "我的源" },
  { key: "official",      label: "官方" },
  { key: "kol",           label: "KOL" },
  { key: "never_fetched", label: "未抓取" },
  { key: "web",           label: "Web待抓" },
  { key: "failing",       label: "失败" },
  { key: "rss",           label: "RSS" },
  { key: "blocked",       label: "停用/移出" },
]

function isKolSource(source: SourceWithHealth): boolean {
  const note = source.userSourceNote?.toLowerCase() ?? ""
  return note.includes("sourcepack:ai-kol-sources-v1")
    || note.includes("role:key_person")
    || note.includes("role:kol")
    || note.includes("role:ai_research_kol")
    || note.includes("role:ai_engineering_kol")
    || note.includes("role:ai_infra_kol")
    || note.includes("role:analyst_kol")
}

function applyFilter(sources: SourceWithHealth[], filter: FilterKey): SourceWithHealth[] {
  switch (filter) {
    case "my":            return sources.filter(s => s.isUserCurated)
    case "official":      return sources.filter(s => s.isOfficial)
    case "kol":           return sources.filter(isKolSource)
    case "never_fetched": return sources.filter(s => !s.lastFetchAt && !s.isBlocked)
    case "web":           return sources.filter(s => s.platform !== "rss" && !s.isBlocked)
    case "failing":       return sources.filter(s => s.healthStatus === "failing" || s.healthStatus === "degraded")
    case "rss":           return sources.filter(s => s.platform === "rss")
    case "blocked":       return sources.filter(s => s.isBlocked)
    default:              return sources
  }
}

function matchesSourceSearch(source: SourceWithHealth, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [
    source.name,
    source.url,
    source.platform,
    source.tier,
    source.category,
    source.userSourceLabel,
    source.userSourceNote,
  ].some(value => String(value ?? "").toLowerCase().includes(q))
}

// ── Form state ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  'AI技术', '商业动态', '产品发布', '监管政策', '融资并购',
  '行业趋势', '开源项目', '研究报告', '人物动态', '其他',
] as const

const PLATFORMS = ['rss', 'website', 'api', 'x', 'youtube', 'other'] as const
const TIERS     = ['S', 'A', 'B', 'C', 'D'] as const

type SourceFormState = {
  name:                 string
  url:                  string
  platform:             string
  source_tier:          string
  category:             string
  is_user_curated:      boolean
  user_source_label:    string
  user_source_note:     string
  user_source_priority: number
  is_official:          boolean
  is_blocked:           boolean
  data_origin:          string
}

const DEFAULT_FORM: SourceFormState = {
  name:                 '',
  url:                  '',
  platform:             'rss',
  source_tier:          'B',
  category:             'AI技术',
  is_user_curated:      true,
  user_source_label:    '外部精选源',
  user_source_note:     '',
  user_source_priority: 10,
  is_official:          false,
  is_blocked:           false,
  data_origin:          'real',
}

function sourceToForm(s: SourceWithHealth): SourceFormState {
  return {
    name:                 s.name,
    url:                  s.url,
    platform:             s.platform,
    source_tier:          s.tier,
    category:             s.category,
    is_user_curated:      s.isUserCurated,
    user_source_label:    s.userSourceLabel      ?? '外部精选源',
    user_source_note:     s.userSourceNote       ?? '',
    user_source_priority: s.userSourcePriority,
    is_official:          s.isOfficial,
    is_blocked:           s.isBlocked,
    data_origin:          s.dataOrigin,
  }
}

// ── Form field helper ─────────────────────────────────────────────────────────

function FormRow({ label, required, children }: {
  label:     string
  required?: boolean
  children:  React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-start gap-3">
      <label className="text-xs text-muted-foreground pt-2 text-right leading-none">
        {label}{required && <span className="text-danger ml-0.5">*</span>}
      </label>
      <div>{children}</div>
    </div>
  )
}

// ── Source form dialog ────────────────────────────────────────────────────────
//
// IMPORTANT: This component MUST receive a stable `key` from its parent:
//   key={editSource?.id ?? `new-${addKey}`}
//
// The key forces a remount (and full state reset) every time the user opens
// a different source's edit dialog, preventing form state from leaking across
// sources (the "串数据" bug).

function SourceFormDialog({
  open,
  editSource,
  onClose,
  onSuccess,
}: {
  open:       boolean
  editSource: SourceWithHealth | null
  onClose:    () => void
  onSuccess:  () => void
}) {
  const isEdit = editSource !== null

  // useState initializer runs only on mount — remounting via key ensures correct init
  const [form, setForm] = useState<SourceFormState>(
    () => isEdit ? sourceToForm(editSource) : { ...DEFAULT_FORM },
  )
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  function set<K extends keyof SourceFormState>(key: K, value: SourceFormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Validate: name always required; URL only required for new sources (readonly in edit)
    if (!form.name.trim()) { setError('名称不能为空'); return }
    if (!isEdit && !form.url.trim()) { setError('URL 不能为空'); return }

    setSaving(true)
    setError(null)

    const isCurated = form.is_user_curated

    if (isEdit) {
      // PATCH: URL is readonly — do not send it; update by sourceId in the route
      const patch = {
        name:                 form.name.trim(),
        platform:             form.platform,
        source_tier:          form.source_tier,
        category:             form.category,
        is_user_curated:      isCurated,
        user_source_label:    isCurated ? (form.user_source_label.trim() || '外部精选源') : null,
        user_source_note:     form.user_source_note.trim() || null,
        user_source_priority: form.user_source_priority,
        is_official:          form.is_official,
        data_origin:          form.data_origin,
        is_blocked:           form.is_blocked,
        source_badge_variant: isCurated ? 'user_curated' : null,
      }
      const res  = await fetch(`/api/sources/${editSource.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(patch),
      })
      const json = await res.json() as { ok: boolean; error?: string }
      setSaving(false)
      if (!json.ok) { setError(`保存失败：${json.error ?? '数据库更新失败'}`); return }
    } else {
      // POST: include url for new source creation
      const post = {
        name:                 form.name.trim(),
        url:                  form.url.trim(),
        platform:             form.platform,
        source_tier:          form.source_tier,
        category:             form.category,
        is_user_curated:      isCurated,
        user_source_label:    isCurated ? (form.user_source_label.trim() || '外部精选源') : null,
        user_source_note:     form.user_source_note.trim() || null,
        user_source_priority: form.user_source_priority,
        is_official:          form.is_official,
        data_origin:          form.data_origin,
        source_badge_variant: isCurated ? 'user_curated' : null,
      }
      const res  = await fetch('/api/sources', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(post),
      })
      const json = await res.json() as { ok: boolean; error?: string }
      setSaving(false)
      if (!json.ok) { setError(`添加失败：${json.error ?? '数据库写入失败'}`); return }
    }

    onSuccess()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); setError(null) } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {isEdit ? `编辑信源 · ${editSource.name}` : '添加信源'}
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            {isEdit
              ? 'URL 不可修改，如需更换 URL 请新建信源。修改其他字段后点击保存。'
              : '填写信源信息。用户认可源不等于已验证事实，仍需多源验证。'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          {/* ── 基本信息 ── */}
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider pb-1 border-b border-border">
            基本信息
          </p>

          <FormRow label="名称" required>
            <Input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="例：AIHOT 精选、The Verge AI"
              className="h-8 text-sm"
            />
          </FormRow>

          <FormRow label="URL" required={!isEdit}>
            {isEdit ? (
              // Display real URL as read-only — never empty, never editable
              <div>
                <div className="h-8 px-3 flex items-center rounded-md border border-input bg-muted/40 overflow-hidden">
                  <span className="text-sm font-mono text-muted-foreground truncate">{editSource.url}</span>
                </div>
                <p className="text-[10px] text-muted-foreground/60 mt-1">
                  URL 创建后暂不可修改，如需更换请新建信源
                </p>
              </div>
            ) : (
              <Input
                value={form.url}
                onChange={e => set('url', e.target.value)}
                placeholder="https://example.com/feed.xml"
                className="h-8 text-sm font-mono"
              />
            )}
          </FormRow>

          {/* ── 分类 ── */}
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider pb-1 border-b border-border pt-2">
            分类
          </p>

          <FormRow label="平台类型">
            <Select value={form.platform} onValueChange={v => set('platform', v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLATFORMS.map(p => (
                  <SelectItem key={p} value={p} className="text-sm">{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormRow>

          <FormRow label="信源等级">
            <Select value={form.source_tier} onValueChange={v => set('source_tier', v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIERS.map(t => (
                  <SelectItem key={t} value={t} className="text-sm">
                    {t} — {
                      t === 'S' ? '顶级权威' :
                      t === 'A' ? '高可信'   :
                      t === 'B' ? '中等可信' :
                      t === 'C' ? '参考'     : '低可信'
                    }
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormRow>

          <FormRow label="内容分类">
            <Select value={form.category} onValueChange={v => set('category', v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c} value={c} className="text-sm">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormRow>

          {/* ── 认可设置 ── */}
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider pb-1 border-b border-border pt-2">
            认可设置
          </p>

          <FormRow label="我的源">
            <div className="flex items-center gap-2 pt-1">
              <Switch
                checked={form.is_user_curated}
                onCheckedChange={v => set('is_user_curated', v)}
                id="sw_curated"
              />
              <label htmlFor="sw_curated" className="text-xs text-muted-foreground cursor-pointer">
                标记为「我的源」（优先观察，仍需多源验证）
              </label>
            </div>
          </FormRow>

          {form.is_user_curated && (
            <>
              <FormRow label="来源标签">
                <Input
                  value={form.user_source_label}
                  onChange={e => set('user_source_label', e.target.value)}
                  placeholder="外部精选源"
                  className="h-8 text-sm"
                />
              </FormRow>

              <FormRow label="备注说明">
                <textarea
                  value={form.user_source_note}
                  onChange={e => set('user_source_note', e.target.value)}
                  placeholder="为什么接入这个源？（可选）"
                  rows={2}
                  className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 resize-none text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </FormRow>

              <FormRow label="优先级">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    value={form.user_source_priority}
                    onChange={e => set('user_source_priority', Number(e.target.value))}
                    className="h-8 text-sm w-24 font-mono"
                  />
                  <span className="text-xs text-muted-foreground">0–20，越高越优先</span>
                </div>
              </FormRow>
            </>
          )}

          {/* ── 高级设置 ── */}
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider pb-1 border-b border-border pt-2">
            高级设置
          </p>

          <FormRow label="官方源">
            <div className="flex items-center gap-2 pt-1">
              <Switch
                checked={form.is_official}
                onCheckedChange={v => set('is_official', v)}
                id="sw_official"
              />
              <label htmlFor="sw_official" className="text-xs text-muted-foreground cursor-pointer">
                第一方发布源（不应与「我的源」同时勾选）
              </label>
            </div>
          </FormRow>

          <FormRow label="数据来源">
            <Select value={form.data_origin} onValueChange={v => set('data_origin', v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="real"  className="text-sm">real — 真实抓取</SelectItem>
                <SelectItem value="demo"  className="text-sm">demo — 演示数据</SelectItem>
                <SelectItem value="seed"  className="text-sm">seed — 种子数据</SelectItem>
                <SelectItem value="mock"  className="text-sm">mock — 测试数据</SelectItem>
              </SelectContent>
            </Select>
          </FormRow>

          {isEdit && (
            <FormRow label="屏蔽状态">
              <div className="flex items-center gap-2 pt-1">
                <Switch
                  checked={form.is_blocked}
                  onCheckedChange={v => set('is_blocked', v)}
                  id="sw_blocked"
                />
                <label htmlFor="sw_blocked" className={cn(
                  "text-xs cursor-pointer",
                  form.is_blocked ? "text-danger" : "text-muted-foreground",
                )}>
                  {form.is_blocked ? '已屏蔽 — 不再抓取' : '正常运行'}
                </label>
              </div>
            </FormRow>
          )}

          {/* ── Error ── */}
          {error && (
            <p className="text-xs text-danger bg-danger/10 border border-danger/25 rounded px-3 py-2">
              {error}
            </p>
          )}

          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
              取消
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? '保存中…' : isEdit ? '保存修改' : '添加信源'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Source row ────────────────────────────────────────────────────────────────

function SourceRow({ source, onEdit, onToggleBlock, onMarkCurated, onCopyUrl, onRemove, copiedId, isAdmin = false }: {
  source:        SourceWithHealth
  onEdit:        (s: SourceWithHealth) => void
  onToggleBlock: (s: SourceWithHealth) => Promise<void>
  onMarkCurated: (s: SourceWithHealth) => Promise<void>
  onCopyUrl:     (s: SourceWithHealth) => void
  onRemove:      (s: SourceWithHealth) => Promise<void>
  copiedId:      string | null
  isAdmin?:      boolean
}) {
  const isDemo  = source.dataOrigin === "demo"
  const fetchAt = source.lastSuccessAt ?? source.lastFetchAt

  // Hierarchy is expressed via explicit text colors, NOT parent opacity
  // (parent opacity would wash out the whole row and is banned this round).
  const isDimmed = isDemo || source.isBlocked

  return (
    <tr className={cn(
      "border-b border-white/[0.05] last:border-0 transition-colors hover:bg-white/[0.025]",
      source.isUserCurated && "border-l-2 border-l-teal-500/50",
    )}>
      {/* 信源 */}
      <td className="px-5 py-3.5 max-w-[280px]">
        <div className="flex items-start gap-2 flex-wrap">
          <p className={cn(
            "text-sm font-medium leading-snug",
            isDimmed ? "text-muted-foreground/70" : "text-foreground",
          )}>
            {source.name}
          </p>
          <SourceOriginBadge
            isUserCurated={source.isUserCurated}
            isOfficial={source.isOfficial}
            sourceBadgeVariant={source.sourceBadgeVariant}
            size="xs"
          />
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate max-w-[240px]">
          {source.url}
        </p>
        {source.userSourceNote && (
          <p className="text-[10px] text-teal-600/70 dark:text-teal-400/60 mt-0.5 line-clamp-1 max-w-[240px]">
            {source.userSourceNote}
          </p>
        )}
        <div className="flex gap-1.5 mt-0.5">
          {source.isBlocked && <span className="text-[9px] text-danger font-medium">BLOCKED</span>}
          {isDemo           && <span className="text-[9px] text-muted-foreground/50 font-medium">DEMO</span>}
        </div>
      </td>

      {/* 等级 */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <SourceTierBadge tier={source.tier} />
      </td>

      {/* 健康 */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <HealthCell source={source} />
      </td>

      {/* 最近同步 */}
      <td className="px-4 py-3.5">
        {source.lastFetchStatus ? (
          <div className="space-y-0.5">
            <span className={cn(
              "text-[10px]",
              source.lastFetchStatus === "success" ? "text-success" : "text-warning",
            )}>
              {FETCH_STATUS_LABEL[source.lastFetchStatus] ?? source.lastFetchStatus}
            </span>
            {fetchAt && (
              <p className="text-[10px] text-muted-foreground/50">{timeAgo(fetchAt)}</p>
            )}
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground/40">—</span>
        )}
      </td>

      {/* 操作 */}
      <td className="px-3 py-3.5">
        {isAdmin ? (
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost" size="sm"
              className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => onEdit(source)}
            >
              <Pencil className="w-3 h-3" />
              编辑
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground">
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {!source.isUserCurated && (
                  <DropdownMenuItem
                    className="text-xs gap-2 cursor-pointer text-teal-600 dark:text-teal-400 focus:text-teal-600 dark:focus:text-teal-400"
                    onSelect={() => onMarkCurated(source)}
                  >
                    <Star className="w-3.5 h-3.5" />
                    标记为我的源
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-xs gap-2 cursor-pointer"
                  onSelect={() => onCopyUrl(source)}
                >
                  {copiedId === source.id
                    ? <Check className="w-3.5 h-3.5 text-success" />
                    : <Copy className="w-3.5 h-3.5" />}
                  {copiedId === source.id ? '已复制' : '复制 URL'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className={cn(
                    "text-xs gap-2 cursor-pointer",
                    source.isBlocked
                      ? "text-muted-foreground"
                      : "text-warning focus:text-warning",
                  )}
                  onSelect={() => onToggleBlock(source)}
                >
                  <Ban className="w-3.5 h-3.5" />
                  {source.isBlocked ? '取消屏蔽' : '屏蔽此源'}
                </DropdownMenuItem>
                {!source.isBlocked && (
                  <DropdownMenuItem
                    className="text-xs gap-2 cursor-pointer text-danger focus:text-danger"
                    onSelect={() => onRemove(source)}
                  >
                    <Ban className="w-3.5 h-3.5" />
                    移出信源库
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <Button
            variant="ghost" size="sm"
            className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-muted-foreground cursor-default"
            onClick={() => onCopyUrl(source)}
          >
            {copiedId === source.id
              ? <Check className="w-3 h-3 text-success" />
              : <Copy className="w-3 h-3" />}
            复制
          </Button>
        )}
      </td>
    </tr>
  )
}


// ── Main client component ─────────────────────────────────────────────────────

export default function SourcesClient({ sources: initialSources, isAdmin = false }: { sources: SourceWithHealth[]; isAdmin?: boolean }) {
  const searchParams = useSearchParams()
  const shouldAutoOpenAdd = searchParams.get("add") === "true"
  const [sources,    setSources]    = useState<SourceWithHealth[]>(initialSources)
  const [filter,     setFilter]     = useState<FilterKey>("all")
  const [sourceSearch, setSourceSearch] = useState(() => searchParams.get("search") ?? "")
  const [dialogOpen, setDialogOpen] = useState(shouldAutoOpenAdd)
  const [editSource, setEditSource] = useState<SourceWithHealth | null>(null)
  const [copiedId,   setCopiedId]   = useState<string | null>(null)
  const [busyId,     setBusyId]     = useState<string | null>(null)
  // Increments on every "add new" open to force SourceFormDialog remount
  const [addKey,     setAddKey]     = useState(0)

  // Re-fetch entire sources list after any mutation
  const refresh = useCallback(async () => {
    try {
      const res  = await fetch('/api/sources')
      const json = await res.json() as { ok: boolean; sources?: SourceWithHealth[] }
      if (json.ok && json.sources) setSources(json.sources)
    } catch (err) {
      console.error('[sources] refresh failed', err)
    }
  }, [])

  function openAdd() {
    setEditSource(null)
    setAddKey(k => k + 1)   // ensure fresh form every time
    setDialogOpen(true)
  }

  // Each source gets a unique key so the form is always initialized from that source
  function openEdit(s: SourceWithHealth) {
    setEditSource(s)
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditSource(null)   // must clear before next open
  }

  async function handleDialogSuccess() {
    closeDialog()
    await refresh()
  }

  const handleToggleBlock = useCallback(async (s: SourceWithHealth) => {
    if (busyId) return
    setBusyId(s.id)
    try {
      await fetch(`/api/sources/${s.id}/toggle-block`, { method: 'POST' })
      await refresh()
    } finally {
      setBusyId(null)
    }
  }, [busyId, refresh])

  const handleRemove = useCallback(async (s: SourceWithHealth) => {
    if (busyId) return
    if (!confirm(`将「${s.name}」移出信源库？该源将停止抓取，可在"停用/移出"筛选中恢复。`)) return
    setBusyId(s.id)
    try {
      await fetch(`/api/sources/${s.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          is_blocked:        true,
          user_source_label: '已移出',
          user_source_note:  `removed_at:${new Date().toISOString()}`,
        }),
      })
      await refresh()
    } finally {
      setBusyId(null)
    }
  }, [busyId, refresh])

  const handleMarkCurated = useCallback(async (s: SourceWithHealth) => {
    if (busyId) return
    setBusyId(s.id)
    try {
      await fetch(`/api/sources/${s.id}/mark-curated`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ label: '外部精选源', priority: 10 }),
      })
      await refresh()
    } finally {
      setBusyId(null)
    }
  }, [busyId, refresh])

  const handleCopyUrl = useCallback((s: SourceWithHealth) => {
    navigator.clipboard.writeText(s.url).catch(() => null)
    setCopiedId(s.id)
    setTimeout(() => setCopiedId(prev => prev === s.id ? null : prev), 1500)
  }, [])

  const stats = useMemo(() => {
    const rss = sources.filter(s => s.platform === "rss" && !s.isBlocked)
    return {
      total:      sources.length,
      myCurated:  sources.filter(s => s.isUserCurated).length,
      official:   sources.filter(s => s.isOfficial).length,
      kol:        sources.filter(isKolSource).length,
      neverFetched: sources.filter(s => !s.lastFetchAt && !s.isBlocked).length,
      rssOk:      rss.filter(s => s.healthStatus === "healthy").length,
      failing:    rss.filter(s => s.healthStatus === "failing" || s.healthStatus === "degraded").length,
      blocked:    sources.filter(s => s.isBlocked).length,
      active:     sources.filter(s => !s.isBlocked).length,
      pendingWeb: sources.filter(s => s.platform !== "rss" && !s.isBlocked).length,
    }
  }, [sources])

  // Sort: healthy RSS first → degraded → non-RSS/pending → failing → blocked last.
  const sortRank = useCallback((s: SourceWithHealth): number => {
    if (s.isBlocked) return 90
    if (s.platform !== "rss") return 50
    switch (s.healthStatus) {
      case "healthy":  return 10
      case "unknown":  return 20
      case "degraded": return 40
      case "failing":  return 70
      case "blocked":  return 90
      default:         return 30
    }
  }, [])

  const filtered = useMemo(
    () => applyFilter(sources, filter)
      .filter(source => matchesSourceSearch(source, sourceSearch))
      .slice()
      .sort((a, b) => sortRank(a) - sortRank(b) || b.healthScore - a.healthScore),
    [sources, filter, sourceSearch, sortRank],
  )

  // Dialog key: changes whenever the target source changes, forcing a clean remount
  // — edit mode: key = source.id (unique per source)
  // — add mode:  key = `new-${addKey}` (increments on every open)
  const dialogKey = dialogOpen
    ? (editSource ? editSource.id : `new-${addKey}`)
    : 'closed'

  return (
    <AppShell>
      <div className="p-6 md:p-8">
        {/* ── Header ── */}
        <div className="mb-6">
          <p className="text-[9px] font-mono tracking-[0.2em] text-slate-500 uppercase mb-2">Source Library</p>
          <div className="flex items-end justify-between">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-[2rem] font-bold tracking-tight text-slate-50">信源管理</h1>
              {!isAdmin && (
                <span className="text-[10px] px-2 py-0.5 rounded-full border"
                      style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
                  访客只读
                </span>
              )}
            </div>
            {isAdmin && (
              <Button size="sm" onClick={openAdd} className="h-8 gap-1.5 text-xs mb-1">
                <Plus className="w-3.5 h-3.5" />
                添加信源
              </Button>
            )}
          </div>
        </div>

        {/* ── Stats cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-5">
          {[
            { label: "总信源",  value: stats.total,        color: "text-foreground" },
            { label: "正常",    value: stats.rssOk,        color: "text-emerald-600 dark:text-emerald-400" },
            { label: "官方",    value: stats.official,     color: "text-sky-600 dark:text-sky-400" },
            { label: "KOL",     value: stats.kol,          color: "text-teal-600 dark:text-teal-400" },
            { label: "未抓取",  value: stats.neverFetched, color: stats.neverFetched > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground" },
            { label: "不稳定",  value: stats.failing,      color: stats.failing > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground" },
            { label: "屏蔽",    value: stats.blocked,      color: stats.blocked > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-border bg-card px-3 py-2.5">
              <p className="text-[9px] font-mono tracking-widest text-muted-foreground uppercase mb-1">{label}</p>
              <p className={cn("text-xl font-bold tabular-nums font-mono", color)}>{value}</p>
            </div>
          ))}
        </div>

        {/* ── Filter bar ── */}
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          <div className="relative mr-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={sourceSearch}
              onChange={e => setSourceSearch(e.target.value)}
              placeholder="搜索信源、URL、角色..."
              className="h-8 w-56 pl-8 text-xs bg-background"
            />
          </div>
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "text-[11px] px-3 py-1.5 rounded-xl border transition-colors",
                filter === key
                  ? "bg-primary/12 text-primary border-primary/25 font-medium"
                  : "text-slate-500 border-white/[0.07] hover:bg-white/[0.05] hover:text-slate-300",
              )}
            >
              {label}
              {key === "failing" && stats.failing > 0 && (
                <span className="ml-1.5 font-mono text-[10px] text-amber-400/80">{stats.failing}</span>
              )}
              {key === "official" && stats.official > 0 && (
                <span className="ml-1.5 font-mono text-[10px] text-sky-400/80">{stats.official}</span>
              )}
              {key === "kol" && stats.kol > 0 && (
                <span className="ml-1.5 font-mono text-[10px] text-teal-300/80">{stats.kol}</span>
              )}
              {key === "never_fetched" && stats.neverFetched > 0 && (
                <span className="ml-1.5 font-mono text-[10px] text-amber-400/80">{stats.neverFetched}</span>
              )}
              {key === "web" && stats.pendingWeb > 0 && (
                <span className="ml-1.5 font-mono text-[10px] text-sky-400/80">{stats.pendingWeb}</span>
              )}
              {key === "blocked" && stats.blocked > 0 && (
                <span className="ml-1.5 font-mono text-[10px] text-red-400/80">{stats.blocked}</span>
              )}
            </button>
          ))}
          {(filter !== "all" || sourceSearch) && (
            <span className="ml-2 text-[11px] text-slate-500">
              {filtered.length} / {sources.length}
            </span>
          )}
        </div>

        {/* ── My curated banner ── */}
        {filter === "my" && filtered.length > 0 && (
          <div className="mb-4 rounded-xl border border-teal-400/25 bg-teal-400/[0.07] px-4 py-3">
            <p className="text-sm font-medium text-teal-300 mb-1">
              你主动接入的信息源
            </p>
            <p className="text-[11px] text-teal-300/65">
              系统提高观察优先级，但仍需证据评分与多源验证后才构成事实判断。
            </p>
          </div>
        )}

        {/* ── Table ── */}
        <div className="border border-white/[0.08] rounded-xl overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.07] bg-white/[0.03]">
                <th className="text-left px-5 py-3"><span className="jarvis-console-text">信源</span></th>
                <th className="text-left px-4 py-3"><span className="jarvis-console-text">等级</span></th>
                <th className="text-left px-4 py-3"><span className="jarvis-console-text">健康</span></th>
                <th className="text-left px-4 py-3"><span className="jarvis-console-text">最近同步</span></th>
                <th className="text-left px-3 py-3"><span className="jarvis-console-text">操作</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center">
                    <p className="text-sm text-muted-foreground">
                      {filter === "all"
                        ? "暂无信源，点击右上角「添加信源」开始"
                        : "当前筛选无结果"}
                    </p>
                  </td>
                </tr>
              )}
              {filtered.map(source => (
                <SourceRow
                  key={source.id}
                  source={source}
                  onEdit={openEdit}
                  onToggleBlock={handleToggleBlock}
                  onMarkCurated={handleMarkCurated}
                  onCopyUrl={handleCopyUrl}
                  onRemove={handleRemove}
                  copiedId={copiedId}
                  isAdmin={isAdmin}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/*
       * Dialog key is critical for correctness:
       *   - 'closed'       → remount with clean state when dialog is not visible
       *   - source.id      → remount with that source's data when editing
       *   - `new-${addKey}` → fresh empty form on every new-source open
       * This prevents form state from leaking across sources.
       */}
      <SourceFormDialog
        key={dialogKey}
        open={dialogOpen}
        editSource={editSource}
        onClose={closeDialog}
        onSuccess={handleDialogSuccess}
      />
    </AppShell>
  )
}
