import { cn } from "@/lib/utils"

/**
 * SourceOriginBadge — displays the origin/curation type of a source.
 *
 * Priority order:
 *   1. user_curated  → "我的源"  (teal, highest priority, always shown)
 *   2. official      → "官方源"  (amber)
 *   3. media         → "媒体源"  (stone)
 *   4. rss           → "RSS"    (primary/blue)
 *   5. research      → "研究"    (violet)
 *   6. unknown/null  → nothing
 */

type BadgeVariant = "user_curated" | "official" | "media" | "rss" | "research" | "unknown"

function resolveBadgeVariant(
  isUserCurated:      boolean | null | undefined,
  isOfficial:         boolean | null | undefined,
  sourceBadgeVariant: string  | null | undefined,
): BadgeVariant | null {
  if (isUserCurated) return "user_curated"
  if (isOfficial)    return "official"
  const v = sourceBadgeVariant as BadgeVariant | null | undefined
  if (v === "user_curated") return "user_curated"
  if (v === "official")     return "official"
  if (v === "media")        return "media"
  if (v === "rss")          return "rss"
  if (v === "research")     return "research"
  return null
}

const BADGE_CONFIG: Record<BadgeVariant, {
  label:   string
  classes: string
  title:   string
}> = {
  user_curated: {
    label:   "我的源",
    classes: "text-teal-700 border-teal-400/40 bg-teal-50 dark:text-teal-400 dark:border-teal-400/30 dark:bg-teal-400/10",
    title:   "用户主动接入的信息源，系统优先纳入观察，但仍需多源验证后才构成事实依据。",
  },
  official: {
    label:   "官方源",
    classes: "text-amber-700 border-amber-400/40 bg-amber-50 dark:text-amber-400 dark:border-amber-400/30 dark:bg-amber-400/10",
    title:   "第一方发布源，真实性权重较高，但仍需结合内容质量判断。",
  },
  media: {
    label:   "媒体源",
    classes: "text-stone-600 border-stone-300/60 bg-stone-50 dark:text-stone-400 dark:border-stone-500/30 dark:bg-stone-500/10",
    title:   "媒体机构来源，报道质量参差，建议结合证据评分判断。",
  },
  rss: {
    label:   "RSS",
    classes: "text-primary/70 border-primary/25 bg-primary/5",
    title:   "通过 RSS 订阅抓取的信息源。",
  },
  research: {
    label:   "研究",
    classes: "text-violet-700 border-violet-400/40 bg-violet-50 dark:text-violet-400 dark:border-violet-400/30 dark:bg-violet-400/10",
    title:   "学术或研究机构来源。",
  },
  unknown: {
    label:   "未知",
    classes: "text-muted-foreground border-border bg-muted/40",
    title:   "来源类型未分类。",
  },
}

interface SourceOriginBadgeProps {
  isUserCurated?:      boolean | null
  isOfficial?:         boolean | null
  sourceBadgeVariant?: string  | null
  /** "sm" (default, 10px) or "xs" (9px, for tight spaces) */
  size?: "sm" | "xs"
  className?: string
}

export function SourceOriginBadge({
  isUserCurated,
  isOfficial,
  sourceBadgeVariant,
  size = "sm",
  className,
}: SourceOriginBadgeProps) {
  const variant = resolveBadgeVariant(isUserCurated, isOfficial, sourceBadgeVariant)
  if (!variant) return null

  const { label, classes, title } = BADGE_CONFIG[variant]

  return (
    <span
      className={cn(
        "inline-flex items-center rounded border font-medium whitespace-nowrap shrink-0",
        size === "xs" ? "px-1 py-px text-[9px]" : "px-1.5 py-px text-[10px]",
        classes,
        className,
      )}
      title={title}
    >
      {label}
    </span>
  )
}
