import { cn } from "@/lib/utils"

interface SourceTierBadgeProps {
  tier: string | null | undefined
}

const tierConfig: Record<string, { label: string; className: string; description: string }> = {
  S: {
    label: '信源S',
    className: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/25',
    description: '官方博客 / 官方文档 / 论文原文 / GitHub 官方仓库',
  },
  A: {
    label: '信源A',
    className: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-400 dark:border-sky-500/25',
    description: '官方社媒 / 创始人 / 核心员工 / 顶级研究机构',
  },
  B: {
    label: '信源B',
    className: 'bg-stone-100 text-stone-500 border-stone-200 dark:bg-stone-500/15 dark:text-stone-400 dark:border-stone-500/25',
    description: '高质量媒体 / 专业分析师 / 垂直 KOL',
  },
  C: {
    label: '信源C',
    className: 'bg-zinc-100 text-zinc-400 border-zinc-200 dark:bg-zinc-600/15 dark:text-zinc-500 dark:border-zinc-600/25',
    description: '普通 KOL / 综合资讯站',
  },
  D: {
    label: '信源D',
    className: 'bg-zinc-50 text-zinc-300 border-zinc-100 dark:bg-zinc-800/20 dark:text-zinc-600 dark:border-zinc-700/25',
    description: '搬运号 / 营销号 / 低质量来源',
  },
}

function normalizeSourceTier(value: string | null | undefined): 'S' | 'A' | 'B' | 'C' | 'D' {
  const t = String(value ?? '').trim().toUpperCase()
  if (t === 'S' || t === 'A' || t === 'B' || t === 'C' || t === 'D') return t
  return 'C'
}

export function SourceTierBadge({ tier }: SourceTierBadgeProps) {
  const safeTier = normalizeSourceTier(tier)
  const { label, className, description } = tierConfig[safeTier]
  return (
    <span
      title={`${label}：${description}（信源可信度评级，不是内容评分）`}
      className={cn(
        "inline-flex items-center justify-center h-5 px-1.5 rounded text-[10px] font-bold border shrink-0 cursor-help whitespace-nowrap",
        className,
      )}
    >
      {label}
    </span>
  )
}
