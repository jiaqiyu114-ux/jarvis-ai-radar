"use client"

import { Sun, Moon, Monitor } from "lucide-react"
import { cn } from "@/lib/utils"
import { useJarvisTheme, type ThemeMode } from "./theme-provider"

const themes: Array<{ value: ThemeMode; icon: typeof Sun; label: string }> = [
  { value: "light",  icon: Sun,     label: "浅色" },
  { value: "dark",   icon: Moon,    label: "深色" },
  { value: "system", icon: Monitor, label: "系统" },
]

interface ThemeToggleProps {
  className?: string
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, setTheme } = useJarvisTheme()
  // theme defaults to "light" on SSR — same as server render → no hydration mismatch.
  // After mount, ThemeProvider reads localStorage and updates theme state.

  return (
    <div className={cn(
      "inline-flex items-center gap-0.5 p-1 rounded-lg bg-muted border border-border",
      className
    )}>
      {themes.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
            theme === value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
          title={label}
        >
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
