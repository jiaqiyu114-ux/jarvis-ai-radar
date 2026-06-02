"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

/* ── Types ── */
export type ThemeMode     = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

interface ThemeContextValue {
  theme:         ThemeMode
  resolvedTheme: ResolvedTheme
  setTheme:      (t: ThemeMode) => void
  mounted:       boolean
}

/* ── Context ── */
const ThemeContext = createContext<ThemeContextValue>({
  theme:         "light",
  resolvedTheme: "light",
  setTheme:      () => {},
  mounted:       false,
})

export function useJarvisTheme() {
  return useContext(ThemeContext)
}

/* ── Helpers (pure — no side effects) ── */
const STORAGE_KEY = "jarvis-theme"

/* ── Provider ── */
export function ThemeProvider({ children }: { children: ReactNode }) {
  /* SSR-safe: both server and initial client render start with "dark".
     No hydration mismatch — the class and state are updated only after mount.
     Default is "dark" (Dark Radar Console). */
  const [theme,   setThemeState] = useState<ThemeMode>("dark")
  const [mounted, setMounted]    = useState(false)

  /* 1. Mount: read saved preference and sync React state.
     This round FORCES dark mode — the .dark class is kept on <html> at all
     times so `dark:` utility variants never flip back to their light residue
     (which would reintroduce warm-paper category colors on a dark background).
     setState-in-effect is unavoidable here — we must read localStorage
     (a client-only API) and sync React state. Suppress the strict rule. */
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null
    const initial: ThemeMode = saved ?? "dark"
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(initial)
    document.documentElement.classList.add("dark")
    setMounted(true)
  }, [])

  /* 2. Theme change: persist preference. The .dark class stays on regardless
     (forced dark this round); only the stored preference changes. */
  useEffect(() => {
    if (!mounted) return
    document.documentElement.classList.add("dark")
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme, mounted])

  const resolvedTheme: ResolvedTheme = "dark"

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme: setThemeState, mounted }}>
      {children}
    </ThemeContext.Provider>
  )
}
