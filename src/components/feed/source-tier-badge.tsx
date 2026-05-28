import { cn } from "@/lib/utils"
import type { SourceTier } from "@/types"

interface SourceTierBadgeProps {
  tier: SourceTier
}

const tierConfig: Record<SourceTier, { label: string; className: string }> = {
  S: {
    label: 'S',
    className: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/25',
  },
  A: {
    label: 'A',
    className: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-400 dark:border-sky-500/25',
  },
  B: {
    label: 'B',
    className: 'bg-stone-100 text-stone-500 border-stone-200 dark:bg-stone-500/15 dark:text-stone-400 dark:border-stone-500/25',
  },
  C: {
    label: 'C',
    className: 'bg-zinc-100 text-zinc-400 border-zinc-200 dark:bg-zinc-600/15 dark:text-zinc-500 dark:border-zinc-600/25',
  },
}

export function SourceTierBadge({ tier }: SourceTierBadgeProps) {
  const { label, className } = tierConfig[tier]
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold border shrink-0",
        className
      )}
    >
      {label}
    </span>
  )
}
