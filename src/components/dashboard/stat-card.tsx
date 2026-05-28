import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface StatCardProps {
  label: string
  value: string | number
  change?: string
  icon?: LucideIcon
  trend?: 'up' | 'down' | 'neutral'
  accent?: boolean
}

export function StatCard({ label, value, change, icon: Icon, trend = 'neutral', accent }: StatCardProps) {
  const trendColor =
    trend === 'up'   ? 'text-success' :
    trend === 'down' ? 'text-danger'  :
    'text-muted-foreground'

  return (
    <div className={cn(
      "rounded-lg border border-border bg-card px-4 py-2.5 overflow-hidden",
      accent && "border-t-2 border-t-primary border-x-border border-b-border bg-primary/3"
    )}>
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon className="h-3 w-3 text-muted-foreground/60" />}
        <p className="muted-label">{label}</p>
      </div>
      <p className={cn(
        "text-2xl font-bold font-mono leading-none tabular-nums",
        accent ? "text-primary" : "text-foreground"
      )}>
        {value}
      </p>
      {change && (
        <p className={cn("text-[11px] mt-1", trendColor)}>{change}</p>
      )}
    </div>
  )
}
