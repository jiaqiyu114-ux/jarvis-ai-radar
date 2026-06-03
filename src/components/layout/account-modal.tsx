"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { X, LogOut } from "lucide-react"
import { ROLE_COOKIE } from "@/lib/auth"
import { LATEST_VERSION } from "@/lib/changelog"

const PRIMARY = "#C0603A"

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return m ? decodeURIComponent(m[1]) : null
}

// ── Identity card (inner) ─────────────────────────────────────────────────────

function IdentityCard({ role }: { role: string | null }) {
  const isAdmin   = role === "admin"
  const roleLabel = isAdmin ? "管理员" : "访客"
  const modeLabel = isAdmin ? "管理员模式" : "访客模式"
  const now       = new Date()
  const since     = `${now.toLocaleString("en-US", { month: "short" })} ${now.getFullYear()}`

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{
        background:   "#1a1a22",
        border:       "1px solid #2a2a36",
        padding:      "20px 24px 20px",
      }}
    >
      {/* ── Watermark ── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-end justify-center pb-4 select-none"
        style={{
          fontSize:    "72px",
          fontWeight:  900,
          letterSpacing: "0.2em",
          color:       "rgba(255,255,255,0.025)",
          lineHeight:  1,
          fontFamily:  "var(--font-mono)",
        }}
      >
        JARVIS
      </div>

      {/* ── Header row ── */}
      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-mono text-[14px] font-black text-white"
            style={{ background: `linear-gradient(150deg, ${PRIMARY}, #8C3820)` }}
          >
            JV
          </div>
          <div>
            <p className="text-[15px] font-bold tracking-[0.06em]" style={{ color: "#e8e8f0" }}>
              J.A.R.V.I.S
            </p>
            <p className="text-[10px] font-semibold tracking-[0.14em]" style={{ color: "#555568" }}>
              PERSONAL RADAR
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#3ab05a" }} />
          <span className="text-[11px] font-semibold tracking-[0.1em]" style={{ color: "#3ab05a" }}>
            ACTIVE
          </span>
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="my-5 h-px" style={{ background: "#2a2a36" }} />

      {/* ── Role / Holder ── */}
      <div className="text-center mb-5">
        <p className="mb-2 text-[10px] font-semibold tracking-[0.18em]" style={{ color: "#404054" }}>
          OPERATOR
        </p>
        <p
          className="text-[30px] font-bold tracking-[-0.01em]"
          style={{ color: "#f0f0f8", fontFamily: "var(--font-mono)" }}
        >
          {roleLabel}
        </p>
      </div>

      {/* ── Info rows ── */}
      <div className="space-y-2.5 mb-5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold tracking-[0.14em]" style={{ color: "#404054" }}>
            ACCESS
          </span>
          <span className="text-[13px]" style={{ color: "#c0c0d0" }}>{modeLabel}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold tracking-[0.14em]" style={{ color: "#404054" }}>
            BUILD
          </span>
          <span className="text-[13px] font-mono" style={{ color: "#c0c0d0" }}>{LATEST_VERSION}</span>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div
        className="grid grid-cols-3 gap-0 rounded-xl overflow-hidden mb-5"
        style={{ background: "#141418", border: "1px solid #222230" }}
      >
        {[
          { label: "SOURCES", value: "51", unit: "+" },
          { label: "PIPELINE", value: "6",  unit: "H" },
          { label: "MODE",    value: isAdmin ? "FULL" : "VIEW", unit: "" },
        ].map(({ label, value, unit }, i) => (
          <div
            key={label}
            className="flex flex-col items-center py-3"
            style={{
              borderRight: i < 2 ? "1px solid #222230" : undefined,
            }}
          >
            <p className="text-[9px] font-semibold tracking-[0.14em] mb-1.5" style={{ color: "#404054" }}>
              {label}
            </p>
            <p className="text-[18px] font-bold font-mono leading-none" style={{ color: "#d8d8e8" }}>
              {value}
              <span className="text-[11px] ml-0.5 font-normal" style={{ color: "#606072" }}>{unit}</span>
            </p>
          </div>
        ))}
      </div>

      {/* ── Footer ── */}
      <div className="relative flex items-end justify-between">
        <div>
          <p className="text-[9px] font-semibold tracking-[0.14em] mb-1" style={{ color: "#404054" }}>
            NODE Nº
          </p>
          <p className="text-[13px] font-mono font-bold" style={{ color: "#909098" }}>
            ALPHA-001
          </p>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-semibold tracking-[0.14em] mb-1" style={{ color: "#404054" }}>
            SINCE
          </p>
          <p className="text-[13px] font-mono" style={{ color: "#909098" }}>
            {since}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function AccountModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    const handler = () => {
      setRole(readCookie(ROLE_COOKIE))
      setOpen(true)
    }
    window.addEventListener("jarvis:open-account", handler)
    return () => window.removeEventListener("jarvis:open-account", handler)
  }, [])

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" })
    setOpen(false)
    router.push("/login")
    router.refresh()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.60)", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
    >
      <div
        className="relative w-full max-w-[400px] rounded-3xl"
        style={{
          background: "#111116",
          border:     "1px solid #1e1e28",
          boxShadow:  "0 40px 100px rgba(0,0,0,0.6)",
          padding:    "28px 28px 24px",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-[20px] font-bold" style={{ color: "#f0f0f8" }}>我的账号</h2>
            <p className="text-[11px] font-semibold tracking-[0.16em] mt-0.5" style={{ color: "#404054" }}>
              ACCOUNT
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-xl p-2 transition-colors hover:bg-white/[0.06]"
            style={{ color: "#505060" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Identity card ── */}
        <IdentityCard role={role} />

        {/* ── Actions ── */}
        <div
          className="mt-6 flex items-center justify-center gap-6 pt-5"
          style={{ borderTop: "1px solid #1a1a24" }}
        >
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 text-[14px] font-medium transition-opacity hover:opacity-80"
            style={{ color: PRIMARY }}
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </button>
        </div>
      </div>
    </div>
  )
}
