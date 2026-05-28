import { cn } from "@/lib/utils"

interface ScoreBadgeProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
}

export function ScoreBadge({ score, size = 'md' }: ScoreBadgeProps) {
  const colorClass =
    score >= 80
      ? 'bg-success/15 text-success border-success/35'
      : score >= 50
      ? 'bg-warning/15 text-warning border-warning/35'
      : 'bg-danger/15 text-danger border-danger/35'

  const sizeClass = {
    sm: 'w-7 h-7 text-[10px]',
    md: 'w-9 h-9 text-xs',
    lg: 'w-11 h-11 text-sm',
  }[size]

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full border font-mono font-bold shrink-0",
        colorClass,
        sizeClass
      )}
    >
      {score}
    </div>
  )
}
