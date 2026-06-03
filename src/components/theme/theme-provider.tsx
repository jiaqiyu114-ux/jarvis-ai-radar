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
  theme:         "dark",
  resolvedTheme: "dark",
  setTheme:      () => {},
  mounted:       false,
})

export function useJarvisTheme() {
  return useContext(ThemeContext)
}

/* ── Constants ── */
const STORAGE_KEY = "jarvis-theme"
const DEFAULT_MODE: ThemeMode = "dark"

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
}

function resolve(mode: ThemeMode, systemPreferenceVersion = 0): ResolvedTheme {
  void systemPreferenceVersion
  if (mode === "system") return systemPrefersDark() ? "dark" : "light"
  return mode
}

/** Apply the resolved theme to <html> by toggling the `.dark` class. */
function applyClass(resolved: ResolvedTheme) {
  const root = document.documentElement
  root.classList.toggle("dark", resolved === "dark")
}

/* ── Provider ── */
export function ThemeProvider({ children }: { children: ReactNode }) {
  // SSR + first client render both start at the default mode so markup matches.
  // The real preference is read from localStorage after mount; an inline script
  // in <head> (see layout.tsx) sets the class pre-paint to avoid a flash.
  const [theme,   setThemeState] = useState<ThemeMode>(DEFAULT_MODE)
  const [mounted, setMounted]    = useState(false)
  const [systemPreferenceVersion, setSystemPreferenceVersion] = useState(0)
  const resolvedTheme = mounted ? resolve(theme, systemPreferenceVersion) : "dark"

  /* 1. Mount: read saved preference, sync React state + <html> class. */
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null
    const initial: ThemeMode = saved ?? DEFAULT_MODE
    const r = resolve(initial)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(initial)
    applyClass(r)
    setMounted(true)
  }, [])

  /* 2. Persist + re-apply whenever the chosen mode changes. */
  useEffect(() => {
    if (!mounted) return
    const r = resolve(theme, systemPreferenceVersion)
    applyClass(r)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme, mounted, systemPreferenceVersion])

  /* 3. While on "system", follow OS changes live. */
  useEffect(() => {
    if (!mounted || theme !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => {
      setSystemPreferenceVersion(v => v + 1)
    }
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [theme, mounted])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme: setThemeState, mounted }}>
      {children}
    </ThemeContext.Provider>
  )
}
