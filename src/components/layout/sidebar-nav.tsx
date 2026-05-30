"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, Rss, Star, GitBranch, FileText,
  BookOpen, Radio, Settings, Layers, MessageSquareText
} from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/dashboard", label: "今日雷达",  icon: LayoutDashboard },
  { href: "/feed",      label: "全量流",    icon: Rss             },
  { href: "/analysis",  label: "处理队列",  icon: Layers          },
  { href: "/selected",  label: "精选流",    icon: Star            },
  { href: "/clusters",  label: "事件簇",    icon: GitBranch       },
  { href: "/reports",   label: "日报",      icon: FileText        },
  { href: "/topics",    label: "选题池",    icon: BookOpen        },
  { href: "/feedback",  label: "反馈记录",  icon: MessageSquareText },
  { href: "/sources",   label: "信源管理",  icon: Radio           },
  { href: "/settings",  label: "配置",      icon: Settings        },
]

export function SidebarNav() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-10 h-[calc(100vh-40px)] w-[220px] border-r border-border bg-sidebar flex flex-col">
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:bg-primary/10 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="px-4 py-3 border-t border-border">
        <span className="text-[10px] tracking-widest text-muted-foreground/50 uppercase">
          Jarvis v0.1
        </span>
      </div>
    </aside>
  )
}
