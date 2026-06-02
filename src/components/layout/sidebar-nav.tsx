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
    <aside className="fixed left-0 top-0 h-screen w-[220px] flex flex-col z-40 backdrop-blur-2xl"
           style={{
             background: "rgba(255,255,255,0.06)",
             borderRight: "1px solid rgba(255,255,255,0.10)",
           }}>

      {/* ── Brand ── */}
      <div className="px-5 pt-6 pb-4" style={{borderBottom:"1px solid rgba(255,255,255,0.08)"}}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[13px] font-bold tracking-[0.16em] font-mono leading-none"
                 style={{color:"rgba(244,241,234,0.95)"}}>
              J.A.R.V.I.S
            </div>
            <div className="text-[9px] mt-1 tracking-widest font-mono uppercase"
                 style={{color:"rgba(244,241,234,0.40)"}}>
              Personal AI Radar
            </div>
          </div>
          <div className="flex items-center gap-1 pt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[8px] font-mono tracking-widest" style={{color:"rgba(74,222,128,0.70)"}}>LIVE</span>
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
                "relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] transition-all duration-150 overflow-hidden",
              )}
              style={active
                ? { background:"rgba(232,93,61,0.12)", color:"rgba(244,241,234,0.96)" }
                : { color:"rgba(244,241,234,0.68)" }
              }
              onMouseEnter={e => {
                if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.07)"
              }}
              onMouseLeave={e => {
                if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"
              }}
            >
              {/* Orange left signal bar */}
              {active && (
                <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full"
                      style={{background:"#E85D3D"}} />
              )}
              <Icon className={cn("h-[15px] w-[15px] shrink-0")}
                    style={{color: active ? "#E85D3D" : "rgba(244,241,234,0.55)"}} />
              <span className="font-medium">{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* ── Footer ── */}
      <div className="px-5 py-4" style={{borderTop:"1px solid rgba(255,255,255,0.06)"}}>
        <div className="text-[9px] font-mono tracking-widest uppercase"
             style={{color:"rgba(244,241,234,0.22)"}}>
          v0.1 · Local Mode
        </div>
      </div>
    </aside>
  )
}
