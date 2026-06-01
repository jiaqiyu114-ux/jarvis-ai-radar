"use client"

import { usePathname } from "next/navigation"

const NOTICES: Record<string, string> = {
  '/selected': '精选流暂未纳入当前每日推荐主流程，数据可能滞后。',
  '/clusters': '事件簇处于实验阶段，单条观察不代表已形成多源事件。暂未纳入每日推荐主流程。',
  '/reports':  '日报功能处于实验阶段。如无今日日报，不代表今日推荐为空，请查看今日雷达。',
  '/topics':   '选题池暂缓，当前优先保障每日推荐稳定运行。',
  '/feedback': '反馈记录处于实验阶段，部分字段可能包含未解码的 HTML 实体。',
  '/analysis': '处理队列是系统维护页面，不是阅读入口。危险操作请谨慎使用。',
  '/feed':     '全量流是系统原始捕捉，不代表推荐。内容按抓取时间排序，包含未经筛选的原始信息。',
}

export function ExperimentalNotice() {
  const pathname = usePathname()
  const message = Object.entries(NOTICES).find(([r]) => pathname.startsWith(r))?.[1]
  if (!message) return null

  return (
    <div className="border-b border-amber-300/20 bg-amber-50/5 px-5 py-2 text-[11px] text-amber-600/80 dark:text-amber-400/70">
      <span className="font-medium">注意：</span>{message}
    </div>
  )
}
