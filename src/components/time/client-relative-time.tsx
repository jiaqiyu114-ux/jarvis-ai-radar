"use client"

import { useEffect, useState } from "react"

function formatRelativeTimeClient(value: string | Date | null | undefined): string {
  if (!value) return ""
  const date = typeof value === "string" ? new Date(value) : value
  const ts = date.getTime()
  if (!Number.isFinite(ts)) return ""
  const diffMs  = Date.now() - ts
  const diffMin = Math.max(0, Math.floor(diffMs / 60_000))
  if (diffMin < 1)  return "刚刚"
  if (diffMin < 60) return `${diffMin}m前`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}h前`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 7)  return `${diffDay}d前`
  const d = typeof value === "string" ? new Date(value) : value
  return `${d.getMonth() + 1}/${d.getDate()}`
}

interface ClientRelativeTimeProps {
  value?: string | Date | null
  className?: string
  fallback?: string
}

export function ClientRelativeTime({ value, className, fallback = "" }: ClientRelativeTimeProps) {
  const [label, setLabel] = useState(fallback)

  useEffect(() => {
    const update = () => setLabel(formatRelativeTimeClient(value) || fallback)
    update()
    const timer = window.setInterval(update, 60_000)
    return () => window.clearInterval(timer)
  }, [value, fallback])

  return (
    <span className={className} suppressHydrationWarning>
      {label}
    </span>
  )
}
