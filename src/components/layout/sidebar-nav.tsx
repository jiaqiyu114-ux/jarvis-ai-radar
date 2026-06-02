"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, Rss, Radio, Settings, Layers,
  FileText, Lightbulb, MessageSquare, Star, Search, Plus,
} from "lucide-react"
import { cn } from "@/lib/utils"

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
  { href: "/reports",  label: "日报",     icon: FileText },
  { href: "/topics",   label: "选题池",   icon: Lightbulb },
  { href: "/feedback", label: "反馈记录", icon: MessageSquare },
  { href: "/settings", label: "配置",     icon: Settings },
]

export function SidebarNav() {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/")
  const streamActive = streamGroup.children.some(c => isActive(c.href))

  return (
    <aside className="rf-sidebar">

      {/* ── Identity card ── */}
      <div className="rf-id-card">
        <div className="rf-id-avatar">JV</div>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-bold tracking-[0.04em]" style={{ color: "var(--text-primary)" }}>
            J.A.R.V.I.S
          </div>
          <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
            <span>Personal Radar</span>
            <span className="rounded px-1 py-px text-[8.5px] font-semibold tracking-wider"
                  style={{ background: "var(--rf-purple-soft)", color: "#C5BCFF" }}>PRO</span>
          </div>
        </div>
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

        {/* Stream group — expanded tree */}
        <div className={cn("rf-nav-item", streamActive && !isActive("/feed") && "")} aria-hidden={false}>
          <streamGroup.icon className="rf-nav-ico h-[16px] w-[16px]" />
          <span className="flex-1">{streamGroup.label}</span>
        </div>
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

      {/* ── Add source CTA ── */}
      <Link href="/sources" className="rf-add-card">
        <span className="rf-add-ico"><Plus className="h-4 w-4" /></span>
        <span>新增信源</span>
        <span className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>扩展你的雷达覆盖</span>
      </Link>

      {/* ── Footer ── */}
      <div className="mt-3 flex items-center gap-1.5 px-2">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--success)", boxShadow: "0 0 10px var(--success)" }} />
        <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>Pipeline ready</span>
        <span className="ml-auto text-[9px] font-mono uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
          v0.1
        </span>
      </div>
    </aside>
  )
}
