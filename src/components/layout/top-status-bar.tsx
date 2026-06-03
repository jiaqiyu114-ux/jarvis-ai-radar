"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, FileText, Loader2, Search, Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import { cleanDisplayText } from "@/lib/text/decode-html"
import { ClientRelativeTime } from "@/components/time/client-relative-time"
import { ThemeToggleButton } from "@/components/theme/theme-toggle"

interface TopSignal {
  score:    number
  title:    string
  category: string
}

interface TopStatusBarProps {
  /** ISO timestamp of the latest snapshot / fetch — rendered client-only. */
  lastUpdated?:  string | null
  /** Number of items captured (real value passed from the page). */
  capturedCount?: number
  systemStatus?: 'ok' | 'fetching' | 'error'
  topSignal?:    TopSignal
}

const statusDot: Record<string, string> = {
  ok:       'bg-success',
  fetching: 'bg-warning animate-pulse',
  error:    'bg-danger',
}

const statusLabel: Record<string, string> = {
  ok:       'LIVE',
  fetching: 'SYNC',
  error:    'ERR',
}

type GlobalSearchResult = {
  id: string
  type: 'items' | 'sources' | 'clusters' | 'topics'
  title: string
  subtitle: string
  href: string
  score: number | null
  sourceTier: string | null
  metadata: {
    label?: string
    healthStatus?: string
    status?: string
    category?: string
  }
}

const resultTypeLabel: Record<GlobalSearchResult['type'], string> = {
  items: '信号',
  sources: '信源',
  clusters: '事件簇',
  topics: '选题',
}

/** Client-only date — avoids SSR/client locale + timezone mismatch. */
function ClientDate() {
  const [text, setText] = useState("")
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(new Date().toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' }))
  }, [])
  return (
    <span suppressHydrationWarning className="shrink-0 text-[10px] font-mono tracking-widest"
          style={{ color: "var(--text-muted)" }}>
      {text}
    </span>
  )
}

function TopSearch() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<GlobalSearchResult[]>([])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=8`, {
          signal: controller.signal,
        })
        const json = await res.json() as { ok?: boolean; results?: GlobalSearchResult[] }
        if (!controller.signal.aborted) {
          setResults(json.ok ? (json.results ?? []) : [])
          setOpen(true)
        }
      } catch {
        if (!controller.signal.aborted) setResults([])
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 180)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  function updateQuery(value: string) {
    setQuery(value)
    if (value.trim().length < 2) {
      setResults([])
      setLoading(false)
    }
  }

  function submitSearch(event?: { preventDefault: () => void }) {
    event?.preventDefault()
    const q = query.trim()
    if (!q) return
    router.push(`/feed?q=${encodeURIComponent(q)}`)
    setOpen(false)
  }

  return (
    <div className="rf-tool-search-wrap" onBlur={() => window.setTimeout(() => setOpen(false), 120)}>
      <form className="rf-tool-search" onSubmit={event => submitSearch(event)}>
        <Search className="h-3.5 w-3.5 shrink-0" />
        <input
          value={query}
          onFocus={() => setOpen(true)}
          onChange={e => updateQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Escape") setOpen(false)
          }}
          className="rf-tool-search-input"
          placeholder="搜索信号、信源、事件簇..."
          aria-label="全局搜索"
        />
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" style={{ color: "var(--text-muted)" }} />
        ) : (
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => submitSearch()}
            className="rf-tool-search-go"
            aria-label="打开搜索结果"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </form>

      {open && query.trim().length >= 2 && (
        <div className="rf-search-popover">
          {results.length > 0 ? (
            <>
              <div className="rf-search-popover-head">
                <span>GLOBAL SEARCH</span>
                <span>{results.length}</span>
              </div>
              <div className="rf-search-results">
                {results.map(result => (
                  <Link
                    key={`${result.type}-${result.id}`}
                    href={result.href}
                    className="rf-search-result"
                    onClick={() => setOpen(false)}
                  >
                    <span className="rf-search-result-type">
                      {result.metadata?.label ?? resultTypeLabel[result.type]}
                    </span>
                    {result.score != null && (
                      <span className="rf-search-result-score">{Math.round(result.score)}</span>
                    )}
                    {result.sourceTier && (
                      <span className="rf-search-result-tier">{result.sourceTier}</span>
                    )}
                    <span className="rf-search-result-main">
                      <span className="rf-search-result-title">{cleanDisplayText(result.title)}</span>
                      <span className="rf-search-result-subtitle">{cleanDisplayText(result.subtitle)}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <div className="rf-search-empty">
              {loading ? "搜索中..." : "没有匹配结果"}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function TopStatusBar({
  lastUpdated,
  capturedCount,
  systemStatus = 'ok',
  topSignal,
}: TopStatusBarProps) {
  return (
    <header className="rf-toolbar">

      {/* ── Left: live status + snapshot meta ── */}
      <div className="flex shrink-0 items-center gap-2.5">
        <div className="flex items-center gap-1.5">
          <div className={cn("h-1.5 w-1.5 rounded-full shadow-[0_0_12px_currentColor]", statusDot[systemStatus])} />
          <span className="text-[10px] font-mono tracking-widest" style={{ color: "var(--text-tertiary)" }}>
            {statusLabel[systemStatus]}
          </span>
        </div>
        {(lastUpdated || capturedCount != null) && (
          <div className="rf-breadcrumb">
            <span style={{ color: "var(--hairline)" }}>/</span>
            {lastUpdated && <ClientRelativeTime value={lastUpdated} className="tabular-nums font-mono" fallback="—" />}
            {capturedCount != null && (
              <>
                <span style={{ color: "var(--hairline)" }}>·</span>
                <span className="font-mono tabular-nums" style={{ color: "var(--text-tertiary)" }}>{capturedCount}</span>
                <span>条</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Center: search ── */}
      <TopSearch />

      {/* ── Top signal ticker ── */}
      {topSignal && (
        <div className="hidden min-w-0 items-center gap-2 lg:flex" style={{ maxWidth: "260px" }}>
          <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-mono font-bold tracking-widest"
                style={{ background: "var(--primary-soft)", color: "var(--primary-on-soft)" }}>TOP</span>
          <span className="shrink-0 font-mono text-[12px] font-bold tabular-nums" style={{ color: "var(--primary)" }}>
            {topSignal.score}
          </span>
          <span className="truncate text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            {cleanDisplayText(topSignal.title)}
          </span>
        </div>
      )}

      {/* ── Right: actions + date ── */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <ThemeToggleButton />
        <Link href="/reports" className="rf-icon-btn" aria-label="日报">
          <FileText className="h-4 w-4" />
        </Link>
        <Link href="/settings" className="rf-icon-btn" aria-label="配置">
          <Settings className="h-4 w-4" />
          {systemStatus === 'error' && <span className="rf-icon-dot" />}
        </Link>
        <ClientDate />
      </div>
    </header>
  )
}
