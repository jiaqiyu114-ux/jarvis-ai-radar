"use client"

import Link from "next/link"
import { ChevronDown, Star, SlidersHorizontal, Rss } from "lucide-react"
import { RefreshRecommendationsButton } from "./_refresh-button"

/**
 * Secondary actions, demoted out of the first screen into a quiet "更多" menu:
 * manual snapshot, 重点精选, 推荐强度 (current preset), 全量流.
 * Native <details> dropdown, no JS state.
 */
export function DashboardMoreMenu({ presetLabel }: { presetLabel: string }) {
  return (
    <details className="more-menu shrink-0">
      <summary>
        更多 <ChevronDown className="h-3.5 w-3.5" />
      </summary>
      <div className="more-menu-panel">
        <p className="more-menu-label">手动操作</p>
        <div className="px-1.5 pb-1">
          <RefreshRecommendationsButton />
        </div>
        <p className="more-menu-label">前往</p>
        <Link href="/selected" className="more-menu-item">
          <Star className="h-4 w-4" /> 重点精选
        </Link>
        <Link href="/settings" className="more-menu-item">
          <SlidersHorizontal className="h-4 w-4" /> 推荐强度 · {presetLabel}
        </Link>
        <Link href="/feed" className="more-menu-item">
          <Rss className="h-4 w-4" /> 全量流
        </Link>
      </div>
    </details>
  )
}
