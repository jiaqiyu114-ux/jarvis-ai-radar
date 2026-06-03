"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard, Rss, Radio, Settings, Layers,
  FileText, Lightbulb, MessageSquare, Star, Search, Plus, LogOut, Megaphone,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ROLE_COOKIE } from "@/lib/auth"
import { useEffect, useState } from "react"

// Primary entries (OVERVIEW). 今日雷达 is the home signal view.
const overview = [
  { href: "/dashboard", label: "今日雷达", icon: LayoutDashboard, live: true },
  { href: "/analysis",  label: "处理队列", icon: Layers },
  { href: "/sources",   label: "信源管理", icon: Radio },
]

// Nested group — the information streams, shown as an expanded tree (reference look).
const streamGroup = {
  label: "信息流", icon: Rss,
  children: [
    { href: "/feed",     label: "全量流" },
    { href: "/selected", label: "精选流" },
    { href: "/clusters", label: "事件簇" },
  ],
}

// Secondary section.
const workspace = [
  { href: "/reports",  label: "日报",   icon: FileText },
  { href: "/topics",   label: "选题池", icon: Lightbulb },
  // { href: "/feedback", label: "反馈记录", icon: MessageSquare },  // hidden for now
  { href: "/settings", label: "配置",   icon: Settings },
]

function readRoleCookie(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${ROLE_COOKIE}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

export function SidebarNav() {
  const pathname = usePathname()
  const router   = useRouter()
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/")
  const streamActive = streamGroup.children.some(c => isActive(c.href))

  const [role, setRole] = useState<string | null>(null)
  useEffect(() => { setRole(readRoleCookie()) }, [pathname])

  const isAdmin = role === 'admin'

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="rf-sidebar">

      {/* ── Identity card — click avatar to open account modal ── */}
      <div className="rf-id-card">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("jarvis:open-account"))}
          title="查看账号详情"
          className="rf-id-avatar shrink-0 transition-opacity hover:opacity-80 cursor-pointer"
        >
          JV
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-bold tracking-[0.04em]" style={{ color: "var(--text-primary)" }}>
            J.A.R.V.I.S
          </div>
          <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
            <span>Personal Radar</span>
            {role && (
              <span className="rounded px-1 py-px text-[8.5px] font-semibold tracking-wider"
                    style={{
                      background: isAdmin ? "var(--primary-soft)" : "rgba(255,255,255,0.06)",
                      color:      isAdmin ? "var(--primary-on-soft)" : "var(--text-muted)",
                    }}>
                {isAdmin ? 'ADMIN' : 'GUEST'}
              </span>
            )}
          </div>
        </div>
        {role && (
          <button
            type="button"
            onClick={() => void handleLogout()}
            title="退出登录"
            className="shrink-0 rounded-lg p-1.5 transition-colors hover:bg-white/[0.08]"
            style={{ color: "var(--text-muted)" }}
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ── Search (links to full feed) ── */}
      <Link href="/feed" className="rf-search">
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1">搜索信号…</span>
        <Star className="h-3.5 w-3.5" style={{ color: "var(--rf-yellow)" }} />
      </Link>

      {/* ── Overview ── */}
      <div className="rf-sec-label">Overview</div>
      <nav className="space-y-0.5">
        {overview.map(({ href, label, icon: Icon, live }) => (
          <Link key={href} href={href} className={cn("rf-nav-item", isActive(href) && "active")}>
            <Icon className="rf-nav-ico h-[16px] w-[16px]" />
            <span className="flex-1">{label}</span>
            {live && (
              <span className="h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--success)", boxShadow: "0 0 10px var(--success)" }} />
            )}
          </Link>
        ))}

        {/* Stream group — parent links to /feed (the "all signals" view) */}
        <Link href="/feed" className={cn("rf-nav-item", streamActive && "active")}>
          <streamGroup.icon className="rf-nav-ico h-[16px] w-[16px]" />
          <span className="flex-1">{streamGroup.label}</span>
        </Link>
        <div className="space-y-0.5">
          {streamGroup.children.map(({ href, label }) => (
            <Link key={href} href={href} className={cn("rf-nav-sub", isActive(href) && "active")}
                  style={isActive(href) ? { color: "var(--text-primary)", fontWeight: 600 } : undefined}>
              {label}
            </Link>
          ))}
        </div>
      </nav>

      {/* ── Workspace ── */}
      <div className="rf-sec-label">Workspace</div>
      <nav className="space-y-0.5">
        {workspace.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={cn("rf-nav-item", isActive(href) && "active")}>
            <Icon className="rf-nav-ico h-[15px] w-[15px]" />
            <span className="flex-1">{label}</span>
          </Link>
        ))}
      </nav>

      {/* ── Changelog entry ── */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('jarvis:open-changelog'))}
        className={cn("rf-nav-item w-full text-left")}
      >
        <Megaphone className="rf-nav-ico h-[15px] w-[15px]" />
        <span className="flex-1">更新说明</span>
      </button>

      {/* ── Add source CTA — admin only ── */}
      {isAdmin && (
        <Link href="/sources?add=true" className="rf-add-card">
          <span className="rf-add-ico"><Plus className="h-4 w-4" /></span>
          <span>新增信源</span>
          <span className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>扩展你的雷达覆盖</span>
        </Link>
      )}

      {/* ── Footer ── */}
      <div className="mt-3 flex items-center gap-1.5 px-2">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--success)", boxShadow: "0 0 10px var(--success)" }} />
        <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>Pipeline ready</span>
        <span className="ml-auto text-[9px] font-mono uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
          v1.3.1
        </span>
      </div>
    </aside>
  )
}
