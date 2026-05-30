"use client"

import { useState, useEffect } from "react"
import {
  Bookmark, Eye, Pencil, GitBranch,
  ShieldCheck, ShieldOff, AlertTriangle, Copy, TrendingDown, XCircle,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { DbItemFeedbackType } from "@/types/database"

// ── Feedback action definitions ───────────────────────────────────────────────

type FeedbackAction = {
  type:    DbItemFeedbackType
  label:   string
  icon:    React.ElementType
  group:   'positive' | 'calibrate'
  activeColor: string
}

const FEEDBACK_ACTIONS: FeedbackAction[] = [
  // Positive / processing intent
  { type: 'save_reference',       label: '保存资料',    icon: Bookmark,      group: 'positive',   activeColor: 'text-primary border-primary/40 bg-primary/10' },
  { type: 'add_to_watch',         label: '加入观察',    icon: Eye,           group: 'positive',   activeColor: 'text-sky-500 border-sky-400/40 bg-sky-400/10' },
  { type: 'worth_writing',        label: '值得写',      icon: Pencil,        group: 'positive',   activeColor: 'text-violet-500 border-violet-400/40 bg-violet-400/10' },
  { type: 'project_related',      label: '项目相关',    icon: GitBranch,     group: 'positive',   activeColor: 'text-emerald-500 border-emerald-400/40 bg-emerald-400/10' },
  { type: 'strong_evidence',      label: '证据强',      icon: ShieldCheck,   group: 'positive',   activeColor: 'text-success border-success/40 bg-success/10' },
  { type: 'weak_evidence',        label: '证据弱',      icon: ShieldOff,     group: 'calibrate',  activeColor: 'text-warning border-warning/40 bg-warning/10' },
  // Calibration
  { type: 'clickbait_or_marketing', label: '标题党/营销', icon: AlertTriangle, group: 'calibrate', activeColor: 'text-orange-500 border-orange-400/40 bg-orange-400/10' },
  { type: 'duplicate_info',         label: '重复信息',    icon: Copy,          group: 'calibrate', activeColor: 'text-muted-foreground border-border bg-muted/50' },
  { type: 'overestimated',          label: '系统高估',    icon: TrendingDown,  group: 'calibrate', activeColor: 'text-warning border-warning/40 bg-warning/10' },
  { type: 'not_worth_reading',      label: '不值得看',    icon: XCircle,       group: 'calibrate', activeColor: 'text-danger/80 border-danger/30 bg-danger/8' },
]

// ── Component ─────────────────────────────────────────────────────────────────

type ButtonState = 'idle' | 'loading' | 'done' | 'error'

type Props = {
  itemId:      string
  contextPage?: string
}

export function ItemFeedbackActions({ itemId, contextPage = 'feed' }: Props) {
  const [active, setActive]       = useState<Set<DbItemFeedbackType>>(new Set())
  const [btnState, setBtnState]   = useState<Partial<Record<DbItemFeedbackType, ButtonState>>>({})
  const [loadingInit, setLoadingInit] = useState(true)

  // Load existing annotations on mount
  useEffect(() => {
    async function load() {
      try {
        const res  = await fetch(`/api/items/${itemId}/feedback`)
        const data = await res.json() as { ok: boolean; feedbacks?: { feedback_type: string }[] }
        if (data.ok && data.feedbacks) {
          setActive(new Set(data.feedbacks.map(f => f.feedback_type as DbItemFeedbackType)))
        }
      } catch {
        // non-fatal — just show all as inactive
      } finally {
        setLoadingInit(false)
      }
    }
    load()
  }, [itemId])

  async function handleClick(type: DbItemFeedbackType) {
    const isActive = active.has(type)
    setBtnState(prev => ({ ...prev, [type]: 'loading' }))

    try {
      const res  = await fetch(`/api/items/${itemId}/feedback`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          feedbackType: type,
          action:       isActive ? 'remove' : 'add',
          contextPage,
        }),
      })
      const data = await res.json() as { ok: boolean; error?: string }

      if (data.ok) {
        setActive(prev => {
          const next = new Set(prev)
          if (isActive) next.delete(type)
          else          next.add(type)
          return next
        })
        setBtnState(prev => ({ ...prev, [type]: 'done' }))
        // Clear done state after 1.5s
        setTimeout(() => setBtnState(prev => ({ ...prev, [type]: 'idle' })), 1500)
      } else {
        setBtnState(prev => ({ ...prev, [type]: 'error' }))
        setTimeout(() => setBtnState(prev => ({ ...prev, [type]: 'idle' })), 2500)
      }
    } catch {
      setBtnState(prev => ({ ...prev, [type]: 'error' }))
      setTimeout(() => setBtnState(prev => ({ ...prev, [type]: 'idle' })), 2500)
    }
  }

  const positiveActions  = FEEDBACK_ACTIONS.filter(a => a.group === 'positive')
  const calibrateActions = FEEDBACK_ACTIONS.filter(a => a.group === 'calibrate')

  function renderButton(action: FeedbackAction) {
    const isActive = active.has(action.type)
    const state    = btnState[action.type] ?? 'idle'
    const Icon     = state === 'loading' ? Loader2 : action.icon

    return (
      <button
        key={action.type}
        type="button"
        disabled={state === 'loading' || loadingInit}
        onClick={() => handleClick(action.type)}
        title={isActive ? `取消标注：${action.label}` : `标注：${action.label}`}
        className={cn(
          "inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded border transition-colors",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          isActive
            ? action.activeColor
            : "text-muted-foreground border-border/50 bg-transparent hover:border-border hover:text-foreground",
          state === 'error' && "text-danger/80 border-danger/30 bg-danger/5",
        )}
      >
        <Icon className={cn("h-3 w-3 shrink-0", state === 'loading' && "animate-spin")} />
        {action.label}
        {isActive && state !== 'loading' && <span className="text-[9px] opacity-60">✓</span>}
      </button>
    )
  }

  return (
    <div className="space-y-2.5">
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
          我的判断标注
        </p>
        <p className="text-[10px] text-muted-foreground/50 mb-3">
          这些标注用于校准信息质量和后续处理意图，不作为喜好信号。
        </p>
      </div>

      {/* Primary actions */}
      <div className="flex flex-wrap gap-1.5">
        {positiveActions.map(renderButton)}
      </div>

      {/* Calibration actions */}
      <div className="flex flex-wrap gap-1.5">
        {calibrateActions.map(renderButton)}
      </div>

      {loadingInit && (
        <p className="text-[10px] text-muted-foreground/40 flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          加载标注状态…
        </p>
      )}
    </div>
  )
}
