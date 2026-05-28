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

function getSystemResolved(): ResolvedTheme {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function resolve(mode: ThemeMode): ResolvedTheme {
  return mode === "system" ? getSystemResolved() : mode
}

/* ── Provider ── */
export function ThemeProvider({ children }: { children: ReactNode }) {
  /* SSR-safe: both server and initial client render start with "light".
     No hydration mismatch — the class and state are updated only after mount. */
  const [theme,   setThemeState] = useState<ThemeMode>("light")
  const [mounted, setMounted]    = useState(false)

  /* 1. Mount: read saved preference and apply to DOM.
     setState-in-effect is unavoidable here — we must read localStorage
     (a client-only API) and sync React state. Suppress the strict rule. */
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null
    const initial: ThemeMode = saved ?? "light"
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(initial)
    document.documentElement.classList.toggle("dark", resolve(initial) === "dark")
    setMounted(true)
  }, [])

  /* 2. Theme change: update DOM and persist. No setState — pure side-effect. */
  useEffect(() => {
    if (!mounted) return
    document.documentElement.classList.toggle("dark", resolve(theme) === "dark")
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme, mounted])

  /* 3. Track OS preference when theme === "system". */
  useEffect(() => {
    if (!mounted || theme !== "system") return
    const mq      = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = (e: MediaQueryListEvent) => {
      document.documentElement.classList.toggle("dark", e.matches)
    }
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [mounted, theme])

  const resolvedTheme: ResolvedTheme = mounted ? resolve(theme) : "light"

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme: setThemeState, mounted }}>
      {children}
    </ThemeContext.Provider>
  )
}
