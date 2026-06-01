"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, Rss, Radio, Settings, Layers,
} from "lucide-react"
import { cn } from "@/lib/utils"

// Primary navigation — only stable, user-facing routes
const navItems = [
  { href: "/dashboard", label: "今日雷达",  icon: LayoutDashboard },
  { href: "/feed",      label: "全量流",    icon: Rss             },
  { href: "/analysis",  label: "处理队列",  icon: Layers          },
  { href: "/sources",   label: "信源管理",  icon: Radio           },
  { href: "/settings",  label: "配置",      icon: Settings        },
]

// Hidden routes (accessible via URL, show experimental notice via ExperimentalNotice):
// /selected, /clusters, /reports, /topics, /feedback

export function SidebarNav() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-10 h-[calc(100vh-40px)] w-[220px] border-r border-white/[0.07] bg-sidebar/90 backdrop-blur-xl flex flex-col z-40">
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150",
                active
                  ? "bg-primary/15 text-primary font-medium"
                  : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active ? "opacity-100" : "opacity-60")} />
              <span>{label}</span>
              {active && <span className="ml-auto w-1 h-3.5 rounded-full bg-primary/60" />}
            </Link>
          )
        })}
      </nav>

      <div className="px-4 py-3 border-t border-white/[0.05]">
        <span className="text-[9px] tracking-[0.18em] text-muted-foreground/30 uppercase font-mono">
          J.A.R.V.I.S v0.1
        </span>
      </div>
    </aside>
  )
}
