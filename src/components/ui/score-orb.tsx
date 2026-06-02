import { cn } from "@/lib/utils"

/**
 * ScoreOrb — the recommendation score, shown as a colored signal orb.
 *
 * Color encodes signal strength (NOT source tier):
 *   80+   orange  (hot)
 *   72–79 cyan
 *   65–71 blue
 *   <65   dim
 *
 * Glow classes (.jarvis-score-*) live in globals.css and react to `.group:hover`.
 */
export function ScoreOrb({
  score,
  size = "md",
  className,
}: {
  score: number
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const isHot  = score >= 80
  const isCyan = score >= 72 && score < 80
  const isBlue = score >= 65 && score < 72

  const sizeCls = {
    sm: "w-9 h-9 text-[12px] rounded-xl",
    md: "w-11 h-11 text-[14px] rounded-2xl",
    lg: "w-14 h-14 text-[17px] rounded-2xl",
  }[size]

  return (
    <div
      className={cn(
        "shrink-0 flex items-center justify-center border font-bold font-mono tabular-nums select-none transition-all duration-300",
        sizeCls,
        isHot  && "jarvis-score-hot",
        isCyan && "jarvis-score-cyan",
        isBlue && "jarvis-score-blue",
        !isHot && !isCyan && !isBlue && "jarvis-score-dim",
        className,
      )}
    >
      {score}
    </div>
  )
}
