import { cn } from "@/lib/utils"

/**
 * RadarStat — a single console metric.
 *
 * Default: stacked card with a big number. `compact` switches to a low
 * horizontal row (number + label/sub) so primary content can sit higher on the
 * page. Hierarchy via explicit color, not parent opacity.
 */
export function RadarStat({
  label,
  value,
  sub,
  hot = false,
  warn = false,
  compact = false,
  className,
}: {
  label: string
  value: string
  sub?: string
  hot?: boolean
  warn?: boolean
  compact?: boolean
  className?: string
}) {
  const numberColor = hot ? "#FF7A45" : warn ? "#F4C95D" : "rgba(246,241,231,0.96)"

  if (compact) {
    return (
      <div className={cn("radar-stat is-compact", hot && "is-hot", className)}>
        <span
          className="text-[1.35rem] font-bold tabular-nums leading-none font-mono shrink-0"
          style={{ color: numberColor }}
        >
          {value}
        </span>
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-medium leading-tight" style={{ color: "rgba(246,241,231,0.82)" }}>
            {label}
          </span>
          {sub && (
            <span className="text-[10px] leading-tight truncate" style={{ color: "rgba(246,241,231,0.55)" }}>
              {sub}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={cn("radar-stat", hot && "is-hot", className)}>
      <span
        className="text-[9px] font-mono tracking-[0.16em] uppercase"
        style={{ color: "rgba(246,241,231,0.55)" }}
      >
        {label}
      </span>
      <span
        className="text-[1.9rem] font-bold tabular-nums leading-none font-mono"
        style={{ color: numberColor }}
      >
        {value}
      </span>
      {sub && (
        <span className="text-[10.5px]" style={{ color: "rgba(246,241,231,0.6)" }}>
          {sub}
        </span>
      )}
    </div>
  )
}
