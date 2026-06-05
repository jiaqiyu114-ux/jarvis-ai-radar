"use client"

import { useState, useEffect, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff } from "lucide-react"

type Mode = "guest" | "admin"

const PRIMARY = "#C0603A"

export default function LoginPage() {
  const router = useRouter()

  const [mode,     setMode]     = useState<Mode>("guest")
  const [password, setPassword] = useState("")
  const [showPw,   setShowPw]   = useState(false)
  const [remember, setRemember] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [pwVisible, setPwVisible] = useState(false)  // controls render (for animation)

  // Animate password field in/out
  useEffect(() => {
    if (mode === "admin") {
      setPwVisible(true)
    } else {
      const t = setTimeout(() => setPwVisible(false), 200)
      return () => clearTimeout(t)
    }
  }, [mode])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (mode === "admin" && !password.trim()) { setError("请输入密码"); return }
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch("/api/auth/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ role: mode, password, remember }),
      })
      const data = await res.json() as { ok: boolean; error?: string }
      if (data.ok) { router.push("/dashboard"); router.refresh() }
      else setError(data.error ?? "进入失败，请重试")
    } catch {
      setError("网络错误，请重试")
    } finally {
      setLoading(false)
    }
  }

  function selectMode(m: Mode) {
    setMode(m)
    setError(null)
    setPassword("")
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center overflow-hidden"
      style={{ background: "#0a0a0b" }}
    >
      {/* Subtle ambient glow */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: `radial-gradient(ellipse 60% 50% at 65% 50%, ${PRIMARY}14, transparent 70%)`,
        }}
      />

      <div className="relative flex w-full max-w-[960px] items-center px-8 md:px-12 gap-0">

        {/* ════ LEFT: brand column ════ */}
        <div className="hidden md:flex flex-col flex-1 pr-14 py-12 gap-10">

          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: PRIMARY, boxShadow: `0 0 10px ${PRIMARY}` }}
              />
              <span className="text-[24px] font-bold tracking-[-0.02em] text-white">
                J.A.R.V.I.S
              </span>
              <span
                className="rounded-md px-2 py-0.5 text-[10.5px] font-semibold tracking-wider"
                style={{ background: `${PRIMARY}22`, color: PRIMARY, border: `1px solid ${PRIMARY}44` }}
              >
                v1.4.0
              </span>
            </div>
            <p className="text-[22px] font-bold leading-snug tracking-tight" style={{ color: "#d8d8e0" }}>
              AI 时代的个人<br />信息指挥中心
            </p>
            <p className="text-[14px] leading-relaxed" style={{ color: "#50505e" }}>
              从信号采集到内容决策，一站全搞定。
            </p>
          </div>

          {/* Features */}
          <div className="space-y-5">
            {[
              {
                title: "全源扫描",
                desc:  "覆盖 50+ AI 前沿信源，官方博客、顶级媒体、KOL，全自动抓取不遗漏",
              },
              {
                title: "10 维度评分",
                desc:  "每条信号自动打分，重要的浮上来，噪音沉下去，不再被信息淹没",
              },
              {
                title: "今日雷达",
                desc:  "今天最值一读的信号自动聚合，打开即看，无需逐一刷遍全网",
              },
              {
                title: "选题转化",
                desc:  "高价值信号一键存入选题池，信息直接变成内容资产和判断依据",
              },
            ].map(({ title, desc }) => (
              <div key={title} className="flex items-start gap-3">
                <span
                  className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: PRIMARY }}
                />
                <div>
                  <p className="text-[14px] font-semibold" style={{ color: "#d0d0da" }}>{title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed" style={{ color: "#48484e" }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Divider + quote */}
          <div>
            <div className="mb-4 h-px" style={{ background: "#1a1a22" }} />
            <p className="text-[13px] italic" style={{ color: "#38383e" }}>
              "别让信息把你淹没，让信息为你服务。"
            </p>
          </div>
        </div>

        {/* ════ RIGHT: form panel ════ */}
        <div
          className="w-full md:w-[400px] shrink-0 rounded-3xl px-9 py-10"
          style={{
            background: "#111115",
            border:     "1px solid #1e1e26",
            boxShadow:  "0 32px 80px rgba(0,0,0,0.5)",
          }}
        >
          {/* Title */}
          <h1
            className="mb-8 text-[30px] font-bold"
            style={{ color: "#f0f0f2", letterSpacing: "-0.025em" }}
          >
            欢迎回来
          </h1>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Mode selector — replaces phone/email field */}
            <div>
              <p className="mb-2.5 text-[13px]" style={{ color: "#606068" }}>模式</p>
              <div
                className="grid grid-cols-2 gap-1 rounded-2xl p-1.5"
                style={{ background: "#18181e" }}
              >
                {(["guest", "admin"] as Mode[]).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => selectMode(m)}
                    className="rounded-xl py-2.5 text-[14px] font-medium transition-all duration-200"
                    style={mode === m ? {
                      background: "#242430",
                      color:      "#f0f0f2",
                      boxShadow:  "0 1px 4px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
                    } : {
                      color:  "#48484e",
                    }}
                  >
                    {m === "guest" ? "访客模式" : "管理员模式"}
                  </button>
                ))}
              </div>
            </div>

            {/* Password — slides in for admin */}
            <div
              className="overflow-hidden transition-all duration-200"
              style={{
                maxHeight:  mode === "admin" ? 100 : 0,
                opacity:    mode === "admin" ? 1 : 0,
              }}
            >
              {pwVisible && (
                <div className="pt-1">
                  <p className="mb-2.5 text-[13px]" style={{ color: "#606068" }}>密码</p>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={e => { setPassword(e.target.value); setError(null) }}
                      placeholder="••••••••"
                      autoFocus={mode === "admin"}
                      className="w-full rounded-xl px-4 py-3 pr-12 text-[15px] outline-none transition-colors"
                      style={{
                        background:  "#18181e",
                        border:      `1px solid ${error ? "#C0603A88" : "#232330"}`,
                        color:       "#f0f0f2",
                        caretColor:  "#f0f0f2",
                      }}
                      onFocus={e => { (e.target as HTMLInputElement).style.borderColor = `${PRIMARY}88` }}
                      onBlur={e => { (e.target as HTMLInputElement).style.borderColor = error ? `${PRIMARY}88` : "#232330" }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(p => !p)}
                      tabIndex={-1}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2"
                      style={{ color: "#404048" }}
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <p className="text-[12.5px]" style={{ color: "#C0603A" }}>{error}</p>
            )}

            {/* Remember row */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex cursor-pointer items-center gap-2.5 select-none">
                <div
                  className="relative h-4 w-4 cursor-pointer rounded"
                  style={{
                    background: remember ? PRIMARY : "#18181e",
                    border:     `1px solid ${remember ? PRIMARY : "#303038"}`,
                    transition: "all 0.15s",
                  }}
                  onClick={() => setRemember(p => !p)}
                >
                  {remember && (
                    <svg viewBox="0 0 10 8" className="absolute inset-0 m-auto h-2.5 w-2.5 text-white">
                      <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="text-[13px]" style={{ color: "#505058" }}>记住我</span>
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl py-3.5 text-[15px] font-semibold transition-opacity disabled:opacity-60 mt-2"
              style={{
                background: PRIMARY,
                color:      "#fff",
                boxShadow:  `0 4px 20px ${PRIMARY}44`,
              }}
            >
              {loading ? "进入中…" : "进入"}
            </button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-4">
            <div className="flex-1 h-px" style={{ background: "#1a1a22" }} />
            <span className="text-[12px]" style={{ color: "#303038" }}>或</span>
            <div className="flex-1 h-px" style={{ background: "#1a1a22" }} />
          </div>

          {/* Quick guest link */}
          <button
            type="button"
            onClick={async () => {
              setLoading(true)
              try {
                const r = await fetch("/api/auth/login", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ role: "guest" }),
                })
                const d = await r.json() as { ok: boolean }
                if (d.ok) { router.push("/dashboard"); router.refresh() }
              } catch { /* ignore */ }
              setLoading(false)
            }}
            className="w-full rounded-2xl py-3 text-[14px] font-medium transition-colors"
            style={{
              background: "#18181e",
              border:     "1px solid #232330",
              color:      "#606068",
            }}
          >
            访客模式直接进入
          </button>

          <p className="mt-7 text-center text-[11px]" style={{ color: "#2a2a32" }}>
            Personal Radar · v1.4.0
          </p>
        </div>
      </div>
    </div>
  )
}
