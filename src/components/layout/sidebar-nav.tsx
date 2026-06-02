"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, Rss, Radio, Settings, Layers,
} from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/dashboard", label: "今日雷达",  icon: LayoutDashboard },
  { href: "/feed",      label: "全量流",    icon: Rss             },
  { href: "/analysis",  label: "处理队列",  icon: Layers          },
  { href: "/sources",   label: "信源管理",  icon: Radio           },
  { href: "/settings",  label: "配置",      icon: Settings        },
]

// Hidden: /selected /clusters /reports /topics /feedback — URL accessible, not in nav

export function SidebarNav() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 h-screen w-[220px] border-r border-white/[0.07] bg-sidebar/95 backdrop-blur-xl flex flex-col z-40">

      {/* ── Brand ── */}
      <div className="px-5 pt-6 pb-4 border-b border-white/[0.06]">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[13px] font-bold tracking-[0.16em] text-foreground font-mono leading-none">
              J.A.R.V.I.S
            </div>
            <div className="text-[9px] text-muted-foreground/45 mt-1 tracking-widest font-mono uppercase">
              Personal AI Radar
            </div>
          </div>
          <div className="flex items-center gap-1 pt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <span className="text-[8px] text-success/60 font-mono tracking-widest">LIVE</span>
          </div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] transition-all duration-150 overflow-hidden",
                active
                  ? "bg-white/[0.07] text-foreground font-medium"
                  : "text-muted-foreground/60 hover:bg-white/[0.04] hover:text-foreground/80"
              )}
            >
              {/* Orange left signal bar */}
              {active && (
                <span className="absolute left-0 top-2 bottom-2 w-[2.5px] rounded-r-full bg-primary" />
              )}
              <Icon className={cn(
                "h-[15px] w-[15px] shrink-0 transition-colors",
                active ? "text-primary" : "opacity-40"
              )} />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* ── Footer ── */}
      <div className="px-5 py-4 border-t border-white/[0.05] space-y-0.5">
        <div className="text-[9px] font-mono tracking-widest text-muted-foreground/25 uppercase">
          v0.1 · Local Mode
        </div>
      </div>
    </aside>
  )
}
