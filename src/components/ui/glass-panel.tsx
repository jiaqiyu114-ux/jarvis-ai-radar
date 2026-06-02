import { cn } from "@/lib/utils"

/**
 * GlassPanel — large rounded frosted container.
 *
 * Never relies on parent opacity; weakening is done with explicit text/border
 * colors instead. Use `tone="soft"` for secondary asides.
 */
export function GlassPanel({
  children,
  className,
  tone = "default",
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { tone?: "default" | "soft" }) {
  return (
    <div
      className={cn(tone === "soft" ? "glass-panel-soft" : "glass-panel", className)}
      {...rest}
    >
      {children}
    </div>
  )
}
