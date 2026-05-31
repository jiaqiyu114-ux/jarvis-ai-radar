"use client"

import { useCallback, useMemo, useState } from "react"
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
import { cn } from "@/lib/utils"
import type { SourceWithHealth } from "@/lib/data/sources-adapter"
import type { SourceHealthStatus } from "@/types/database"
import { Ban, Check, Copy, Pencil, Plus, Star } from "lucide-react"

// ── Health badge ──────────────────────────────────────────────────────────────

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

function fetchStatusLabel(status: string | null): string {
  if (!status) return "—"
  return FETCH_STATUS_LABEL[status] ?? status
}

function HealthBadge({ status, isRss }: { status: SourceHealthStatus; isRss: boolean }) {
  if (!isRss) return <span className="text-[10px] text-muted-foreground/40">—</span>
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full border font-medium",
      HEALTH_STYLE[status] ?? HEALTH_STYLE.unknown,
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full", HEALTH_DOT[status] ?? HEALTH_DOT.unknown)} />
      {HEALTH_LABEL[status] ?? status}
    </span>
  )
}

// ── Filter types ──────────────────────────────────────────────────────────────

type FilterKey = "all" | "my" | "official" | "rss" | "failing" | "blocked"

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",      label: "全部" },
  { key: "my",       label: "我的源" },
  { key: "official", label: "官方源" },
  { key: "rss",      label: "RSS" },
  { key: "failing",  label: "失败" },
  { key: "blocked",  label: "被屏蔽" },
]

function applyFilter(sources: SourceWithHealth[], filter: FilterKey): SourceWithHealth[] {
  switch (filter) {
    case "my":       return sources.filter(s => s.isUserCurated)
    case "official": return sources.filter(s => s.isOfficial)
    case "rss":      return sources.filter(s => s.platform === "rss")
    case "failing":  return sources.filter(s => s.healthStatus === "failing" || s.healthStatus === "degraded")
    case "blocked":  return sources.filter(s => s.isBlocked)
    default:         return sources
  }
}

// ── Form state ────────────────────────────────────────────────────────────────

const CATEGORIES = ['AI技术', '商业动态', '产品发布', '监管政策', '融资并购', '行业趋势', '开源项目', '研究报告', '人物动态', '其他'] as const
const PLATFORMS  = ['rss', 'website', 'api', 'x', 'youtube', 'other'] as const
const TIERS      = ['S', 'A', 'B', 'C', 'D'] as const

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
    user_source_label:    s.userSourceLabel ?? '外部精选源',
    user_source_note:     s.userSourceNote  ?? '',
    user_source_priority: s.userSourcePriority,
    is_official:          s.isOfficial,
    is_blocked:           s.isBlocked,
    data_origin:          s.dataOrigin,
  }
}

// ── Form field helper ─────────────────────────────────────────────────────────

function FormRow({ label, required, children }: {
  label: string
  required?: boolean
  children: React.ReactNode
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

function SourceFormDialog({
  open,
  editSource,
  onClose,
  onSuccess,
}: {
  open:        boolean
  editSource:  SourceWithHealth | null
  onClose:     () => void
  onSuccess:   () => void
}) {
  const isEdit = editSource !== null
  const [form, setForm] = useState<SourceFormState>(
    () => isEdit ? sourceToForm(editSource!) : { ...DEFAULT_FORM },
  )
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  function set<K extends keyof SourceFormState>(key: K, value: SourceFormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.url.trim()) {
      setError('名称和 URL 不能为空')
      return
    }
    setSaving(true)
    setError(null)

    const payload = {
      name:                 form.name.trim(),
      url:                  form.url.trim(),
      platform:             form.platform,
      source_tier:          form.source_tier,
      category:             form.category,
      is_user_curated:      form.is_user_curated,
      user_source_label:    form.is_user_curated ? form.user_source_label : null,
      user_source_note:     form.user_source_note || null,
      user_source_priority: form.user_source_priority,
      is_official:          form.is_official,
      data_origin:          form.data_origin,
      ...(isEdit && { is_blocked: form.is_blocked }),
      source_badge_variant: form.is_user_curated ? 'user_curated' : null,
    }

    const url    = isEdit ? `/api/sources/${editSource!.id}` : '/api/sources'
    const method = isEdit ? 'PATCH' : 'POST'

    const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const json = await res.json() as { ok: boolean; error?: string }

    setSaving(false)
    if (!json.ok) { setError(json.error ?? '保存失败'); return }
    onSuccess()
  }

  // Reset form when dialog opens with new target
  const handleOpenChange = (v: boolean) => {
    if (!v) { onClose(); setError(null) }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {isEdit ? `编辑信源 · ${editSource!.name}` : '添加信源'}
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            {isEdit
              ? '修改信源属性。URL 不可更改，屏蔽状态可在此切换。'
              : '填写信源基本信息。添加后系统会在下次抓取时纳入观察。用户认可源不等于已验证事实，仍需多源验证。'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          {/* ── 基本信息 ── */}
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider pb-1 border-b border-border">基本信息</p>

          <FormRow label="名称" required>
            <Input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="例：AIHOT 精选、The Verge AI"
              className="h-8 text-sm"
            />
          </FormRow>

          <FormRow label="URL" required>
            <Input
              value={form.url}
              onChange={e => set('url', e.target.value)}
              placeholder="https://example.com/feed.xml"
              className="h-8 text-sm font-mono"
              disabled={isEdit}
              title={isEdit ? 'URL 创建后不可更改' : undefined}
            />
            {isEdit && (
              <p className="text-[10px] text-muted-foreground/60 mt-1">URL 创建后不可更改</p>
            )}
          </FormRow>

          {/* ── 分类 ── */}
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider pb-1 border-b border-border pt-2">分类</p>

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
                    {t} — {t === 'S' ? '顶级权威' : t === 'A' ? '高可信' : t === 'B' ? '中等可信' : t === 'C' ? '参考' : '低可信'}
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
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider pb-1 border-b border-border pt-2">认可设置</p>

          <FormRow label="我的源">
            <div className="flex items-center gap-2 pt-1">
              <Switch
                checked={form.is_user_curated}
                onCheckedChange={v => set('is_user_curated', v)}
                id="is_user_curated"
              />
              <label htmlFor="is_user_curated" className="text-xs text-muted-foreground cursor-pointer">
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
                  placeholder="为什么接入这个源？例：高质量 AI 每日精选，注重信噪比"
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
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider pb-1 border-b border-border pt-2">高级设置</p>

          <FormRow label="官方源">
            <div className="flex items-center gap-2 pt-1">
              <Switch
                checked={form.is_official}
                onCheckedChange={v => set('is_official', v)}
                id="is_official"
              />
              <label htmlFor="is_official" className="text-xs text-muted-foreground cursor-pointer">
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
                  id="is_blocked"
                />
                <label htmlFor="is_blocked" className={cn(
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

// ── Row actions type ──────────────────────────────────────────────────────────

type RowActions = {
  onEdit:        (s: SourceWithHealth) => void
  onToggleBlock: (s: SourceWithHealth) => Promise<void>
  onMarkCurated: (s: SourceWithHealth) => Promise<void>
  onCopyUrl:     (s: SourceWithHealth) => void
}

// ── Source row ────────────────────────────────────────────────────────────────

function SourceRow({ source, actions, copiedId }: {
  source:   SourceWithHealth
  actions:  RowActions
  copiedId: string | null
}) {
  const isRss  = source.platform === "rss"
  const isDemo = source.dataOrigin === "demo"

  return (
    <tr className={cn(
      "border-b border-border last:border-0 transition-colors hover:bg-accent",
      isDemo            && "opacity-60",
      source.isBlocked  && "opacity-50",
      source.isUserCurated && "border-l-2 border-l-teal-500/60",
    )}>
      {/* Name + URL */}
      <td className="px-5 py-3.5">
        <div className="flex items-start gap-2 flex-wrap">
          <p className={cn(
            "text-sm font-medium",
            isDemo ? "text-muted-foreground" : "text-foreground",
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
        <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[220px] truncate">
          {source.url}
        </p>
        {source.userSourceNote && (
          <p className="text-[10px] text-teal-600/70 dark:text-teal-400/60 mt-0.5 max-w-[260px] line-clamp-2">
            {source.userSourceNote}
          </p>
        )}
        {source.isBlocked && (
          <span className="text-[9px] text-danger font-medium">BLOCKED</span>
        )}
        {isDemo && (
          <span className="text-[9px] text-muted-foreground/50 font-medium">DEMO</span>
        )}
      </td>

      {/* Platform */}
      <td className="px-4 py-3.5">
        <span className={cn(
          "text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase",
          source.platform === "rss"
            ? "text-primary/70 border-primary/20 bg-primary/5"
            : "text-muted-foreground/50 border-border/40",
        )}>
          {source.platform}
        </span>
      </td>

      {/* Tier */}
      <td className="px-4 py-3.5">
        <SourceTierBadge tier={source.tier} />
      </td>

      {/* Health */}
      <td className="px-4 py-3.5 text-center">
        <HealthBadge status={source.healthStatus} isRss={isRss} />
      </td>

      {/* Health score */}
      <td className="px-4 py-3.5 text-right">
        {isRss ? (
          <span className={cn(
            "text-xs font-mono tabular-nums",
            source.healthScore >= 70 ? "text-success" :
            source.healthScore >= 40 ? "text-warning" : "text-danger",
          )}>
            {source.healthScore}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/40">—</span>
        )}
      </td>

      {/* Success / Failure counts */}
      <td className="px-4 py-3.5 text-right">
        {isRss ? (
          <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
            <span className="text-success">{source.successfulFetchCount}</span>
            <span className="text-muted-foreground/40">/</span>
            <span className={source.failedFetchCount > 0 ? "text-warning" : "text-muted-foreground"}>
              {source.failedFetchCount}
            </span>
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/40">—</span>
        )}
      </td>

      {/* Last status */}
      <td className="px-4 py-3.5">
        {isRss ? (
          <span className={cn(
            "text-[10px]",
            source.lastFetchStatus === "success" ? "text-success"
              : source.lastFetchStatus ? "text-warning"
              : "text-muted-foreground/40",
          )}>
            {fetchStatusLabel(source.lastFetchStatus)}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/40">—</span>
        )}
      </td>

      {/* Latency */}
      <td className="px-4 py-3.5">
        {isRss && source.lastLatencyMs != null ? (
          <span className={cn(
            "text-[10px] font-mono tabular-nums",
            source.lastLatencyMs > 8000 ? "text-warning" : "text-muted-foreground",
          )}>
            {source.lastLatencyMs > 1000
              ? `${(source.lastLatencyMs / 1000).toFixed(1)}s`
              : `${source.lastLatencyMs}ms`}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/40">—</span>
        )}
      </td>

      {/* Actions */}
      <td className="px-3 py-3.5">
        <div className="flex items-center gap-1">
          <ActionBtn title="编辑" onClick={() => actions.onEdit(source)}>
            <Pencil className="w-3 h-3" />
          </ActionBtn>
          {!source.isUserCurated && (
            <ActionBtn title="标记为我的源" onClick={() => actions.onMarkCurated(source)}
              className="hover:text-teal-500">
              <Star className="w-3 h-3" />
            </ActionBtn>
          )}
          <ActionBtn
            title={source.isBlocked ? "取消屏蔽" : "屏蔽"}
            onClick={() => actions.onToggleBlock(source)}
            className={source.isBlocked ? "text-danger/60 hover:text-danger" : "hover:text-warning"}
          >
            <Ban className="w-3 h-3" />
          </ActionBtn>
          <ActionBtn title="复制 URL" onClick={() => actions.onCopyUrl(source)}>
            {copiedId === source.id
              ? <Check className="w-3 h-3 text-success" />
              : <Copy className="w-3 h-3" />}
          </ActionBtn>
        </div>
      </td>
    </tr>
  )
}

function ActionBtn({ children, title, onClick, className }: {
  children:  React.ReactNode
  title:     string
  onClick:   () => void
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "p-1 rounded text-muted-foreground/40 hover:bg-accent hover:text-muted-foreground transition-colors",
        className,
      )}
    >
      {children}
    </button>
  )
}

// ── Stat pill ─────────────────────────────────────────────────────────────────

function StatPill({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("font-mono font-semibold tabular-nums", accent ?? "text-foreground")}>
        {value}
      </span>
      {label}
    </span>
  )
}

// ── Main client component ─────────────────────────────────────────────────────

export default function SourcesClient({ sources: initialSources }: { sources: SourceWithHealth[] }) {
  const [sources,   setSources]   = useState<SourceWithHealth[]>(initialSources)
  const [filter,    setFilter]    = useState<FilterKey>("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editSource, setEditSource] = useState<SourceWithHealth | null>(null)
  const [copiedId,   setCopiedId]   = useState<string | null>(null)
  const [busyId,     setBusyId]     = useState<string | null>(null)

  // Refresh source list from API
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
    setDialogOpen(true)
  }

  function openEdit(s: SourceWithHealth) {
    setEditSource(s)
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditSource(null)
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

  const handleMarkCurated = useCallback(async (s: SourceWithHealth) => {
    if (busyId) return
    setBusyId(s.id)
    try {
      await fetch(`/api/sources/${s.id}/mark-curated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: '外部精选源', priority: 10 }),
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

  const rowActions: RowActions = {
    onEdit:        openEdit,
    onToggleBlock: handleToggleBlock,
    onMarkCurated: handleMarkCurated,
    onCopyUrl:     handleCopyUrl,
  }

  const stats = useMemo(() => {
    const rss      = sources.filter(s => s.platform === "rss")
    const healthy  = rss.filter(s => s.healthStatus === "healthy").length
    const degraded = rss.filter(s => s.healthStatus === "degraded").length
    const failing  = rss.filter(s => s.healthStatus === "failing").length
    return {
      total:     sources.length,
      myCurated: sources.filter(s => s.isUserCurated).length,
      official:  sources.filter(s => s.isOfficial).length,
      rssCount:  rss.length,
      healthy,
      degraded,
      failing,
      blocked:   sources.filter(s => s.isBlocked).length,
      demo:      sources.filter(s => s.dataOrigin === "demo").length,
      active:    sources.filter(s => !s.isBlocked).length,
    }
  }, [sources])

  const filtered = useMemo(() => applyFilter(sources, filter), [sources, filter])

  return (
    <AppShell>
      <div className="p-8">
        {/* ── Header ── */}
        <div className="mb-6">
          <p className="page-kicker mb-1">Source Library</p>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="editorial-title text-3xl">信源管理</h1>
            </div>
            <div className="flex items-center gap-3 pb-1">
              <p className="text-xs text-muted-foreground">
                {sources.length} 个信源 · {stats.active} 个运行中
              </p>
              <Button size="sm" onClick={openAdd} className="h-7 gap-1.5 text-xs">
                <Plus className="w-3.5 h-3.5" />
                添加信源
              </Button>
            </div>
          </div>
        </div>

        {/* ── Stats bar ── */}
        <div className="flex items-center gap-4 mb-4 px-1 flex-wrap">
          <StatPill label="Total"  value={stats.total} />
          <span className="w-px h-3 bg-border" />
          <StatPill label="我的源" value={stats.myCurated} accent="text-teal-600 dark:text-teal-400" />
          <StatPill label="官方源" value={stats.official}  accent="text-amber-600 dark:text-amber-400" />
          <span className="w-px h-3 bg-border" />
          <StatPill label="RSS"    value={stats.rssCount}  accent="text-primary/80" />
          <StatPill label="正常"   value={stats.healthy}   accent="text-success" />
          <StatPill label="不稳定" value={stats.degraded}  accent="text-warning" />
          {stats.failing  > 0 && <StatPill label="连续失败" value={stats.failing}  accent="text-danger" />}
          {stats.blocked  > 0 && <StatPill label="屏蔽"     value={stats.blocked}  accent="text-danger" />}
          {stats.demo     > 0 && (
            <>
              <span className="w-px h-3 bg-border" />
              <StatPill label="demo" value={stats.demo} accent="text-muted-foreground/50" />
            </>
          )}
        </div>

        {/* ── Filter bar ── */}
        <div className="flex items-center gap-1.5 mb-4">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-md border transition-colors",
                filter === key
                  ? key === "my"
                    ? "bg-teal-500/15 text-teal-700 border-teal-400/40 dark:text-teal-400 font-medium"
                    : "bg-primary/10 text-primary border-primary/25 font-medium"
                  : "text-muted-foreground border-border hover:border-border hover:bg-accent",
              )}
            >
              {label}
              {key === "my"       && stats.myCurated > 0 && (
                <span className="ml-1.5 font-mono text-[10px] opacity-70">{stats.myCurated}</span>
              )}
              {key === "official" && stats.official  > 0 && (
                <span className="ml-1.5 font-mono text-[10px] opacity-70">{stats.official}</span>
              )}
              {key === "failing"  && stats.failing   > 0 && (
                <span className="ml-1.5 font-mono text-[10px] text-danger opacity-80">{stats.failing}</span>
              )}
              {key === "blocked"  && stats.blocked   > 0 && (
                <span className="ml-1.5 font-mono text-[10px] text-danger opacity-80">{stats.blocked}</span>
              )}
            </button>
          ))}
          {filter !== "all" && (
            <span className="ml-2 text-xs text-muted-foreground">
              显示 {filtered.length} / {sources.length}
            </span>
          )}
        </div>

        {/* ── My curated sources banner ── */}
        {filter === "my" && filtered.length > 0 && (
          <div className="mb-4 rounded border border-teal-400/30 bg-teal-50/50 dark:bg-teal-400/8 px-4 py-3">
            <p className="text-sm font-medium text-teal-700 dark:text-teal-400 mb-1">你主动接入的信息源</p>
            <p className="text-[11px] text-teal-700/70 dark:text-teal-400/60">
              这些信源由你手动接入，系统会提高观察优先级，但仍需通过证据评分与多源验证后才构成事实判断。
            </p>
          </div>
        )}

        {/* ── Table ── */}
        <div className="border border-border rounded-lg overflow-hidden bg-card overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="text-left px-5 py-3"><span className="muted-label">信源</span></th>
                <th className="text-left px-4 py-3"><span className="muted-label">类型</span></th>
                <th className="text-left px-4 py-3"><span className="muted-label">等级</span></th>
                <th className="text-center px-4 py-3"><span className="muted-label">健康</span></th>
                <th className="text-right px-4 py-3"><span className="muted-label">得分</span></th>
                <th className="text-right px-4 py-3"><span className="muted-label">成功/失败</span></th>
                <th className="text-left px-4 py-3"><span className="muted-label">上次状态</span></th>
                <th className="text-left px-4 py-3"><span className="muted-label">延迟</span></th>
                <th className="text-left px-3 py-3"><span className="muted-label">操作</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center">
                    <p className="text-sm text-muted-foreground">
                      {filter === "all" ? "暂无信源" : "当前筛选无结果"}
                    </p>
                  </td>
                </tr>
              )}
              {filtered.map(source => (
                <SourceRow
                  key={source.id}
                  source={source}
                  actions={rowActions}
                  copiedId={copiedId}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add / Edit dialog ── */}
      <SourceFormDialog
        open={dialogOpen}
        editSource={editSource}
        onClose={closeDialog}
        onSuccess={handleDialogSuccess}
      />
    </AppShell>
  )
}
