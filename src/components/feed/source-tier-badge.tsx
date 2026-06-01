import { cn } from "@/lib/utils"

interface SourceTierBadgeProps {
  tier: string | null | undefined
}

const tierConfig: Record<string, { label: string; className: string }> = {
  S: {
    label: '信源S',
    className: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/25',
  },
  A: {
    label: '信源A',
    className: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-400 dark:border-sky-500/25',
  },
  B: {
    label: '信源B',
    className: 'bg-stone-100 text-stone-500 border-stone-200 dark:bg-stone-500/15 dark:text-stone-400 dark:border-stone-500/25',
  },
  C: {
    label: '信源C',
    className: 'bg-zinc-100 text-zinc-400 border-zinc-200 dark:bg-zinc-600/15 dark:text-zinc-500 dark:border-zinc-600/25',
  },
}

function normalizeSourceTier(value: string | null | undefined): 'S' | 'A' | 'B' | 'C' {
  const t = String(value ?? '').trim().toUpperCase()
  if (t === 'S' || t === 'A' || t === 'B' || t === 'C') return t
  return 'C'
}

export function SourceTierBadge({ tier }: SourceTierBadgeProps) {
  const safeTier = normalizeSourceTier(tier)
  const { label, className } = tierConfig[safeTier]
  return (
    <span
      title={`${label}（信源可信度评级，不是内容评分）`}
      className={cn(
        "inline-flex items-center justify-center h-5 px-1.5 rounded text-[10px] font-bold border shrink-0 cursor-help whitespace-nowrap",
        className,
      )}
    >
      {label}
    </span>
  )
}
