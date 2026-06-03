"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { CHANGELOG, LATEST_VERSION, type ChangelogEntry } from "@/lib/changelog"

const STORAGE_KEY = 'jarvis_seen_version'

const SECTION_COLOR: Record<string, string> = {
  'NEW FEATURE': '#C0603A',
  'IMPROVEMENT': '#888',
  'FIX':         '#888',
}

function ChangelogView({ entry, onClose }: { entry: ChangelogEntry; onClose: () => void }) {
  const [view, setView] = useState<'latest' | 'history'>('latest')
  const history = CHANGELOG.slice(1)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative w-full max-w-[720px] rounded-2xl"
        style={{
          background:   '#1e1e22',
          border:       '1px solid rgba(255,255,255,0.08)',
          padding:      '32px 36px 28px',
          maxHeight:    '85vh',
          overflowY:    'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Close ── */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 rounded-lg p-1 transition-colors hover:bg-white/[0.08]"
          style={{ color: '#666' }}
        >
          <X className="h-4 w-4" />
        </button>

        {view === 'latest' ? (
          <>
            {/* ── Header row ── */}
            <div className="flex items-center justify-between mb-4" style={{ marginRight: 32 }}>
              <span className="font-mono text-[13px]" style={{ color: '#666' }}>{entry.version}</span>
              <span className="font-mono text-[13px]" style={{ color: '#666' }}>{entry.date}</span>
            </div>

            {/* ── Title ── */}
            <h2
              className="mb-7"
              style={{
                fontFamily:  'Georgia, "Times New Roman", serif',
                fontStyle:   'italic',
                fontSize:    '28px',
                fontWeight:  400,
                lineHeight:  1.25,
                color:       '#f0f0f0',
                letterSpacing: '-0.01em',
              }}
            >
              {entry.title}
            </h2>

            {/* ── Sections ── */}
            <div className="space-y-6">
              {entry.sections.map(section => (
                <div key={section.type}>
                  <p
                    className="mb-3"
                    style={{
                      fontSize:      '11px',
                      fontWeight:    600,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color:         SECTION_COLOR[section.type] ?? '#888',
                    }}
                  >
                    {section.type}
                  </p>
                  <ul className="space-y-2.5">
                    {section.items.map((item, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span
                          className="mt-[2px] shrink-0 text-[14px] leading-[1.5]"
                          style={{ color: '#555' }}
                        >○</span>
                        <span style={{ fontSize: '14px', lineHeight: 1.6, color: '#ccc' }}>
                          {item}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* ── Footer ── */}
            <div
              className="mt-8 flex items-center justify-between pt-5"
              style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
            >
              <button
                type="button"
                onClick={() => setView('history')}
                className="text-[13px] transition-colors hover:opacity-80"
                style={{ color: '#888' }}
              >
                历史更新
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-6 py-2.5 text-[14px] font-medium transition-opacity hover:opacity-90"
                style={{ background: '#C0603A', color: '#fff' }}
              >
                我知道了
              </button>
            </div>
          </>
        ) : (
          <>
            {/* ── History view ── */}
            <div className="flex items-center gap-3 mb-6" style={{ marginRight: 32 }}>
              <button
                type="button"
                onClick={() => setView('latest')}
                className="text-[13px] transition-colors hover:opacity-80"
                style={{ color: '#888' }}
              >
                ← 返回
              </button>
              <span className="text-[13px]" style={{ color: '#555' }}>历史更新记录</span>
            </div>

            <div className="space-y-8">
              {history.map(h => (
                <div key={h.version}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-[13px]" style={{ color: '#666' }}>{h.version}</span>
                    <span className="font-mono text-[13px]" style={{ color: '#666' }}>{h.date}</span>
                  </div>
                  <h3
                    className="mb-4"
                    style={{
                      fontFamily: 'Georgia, "Times New Roman", serif',
                      fontStyle:  'italic',
                      fontSize:   '20px',
                      fontWeight: 400,
                      color:      '#d0d0d0',
                    }}
                  >
                    {h.title}
                  </h3>
                  {h.sections.map(section => (
                    <div key={section.type} className="mb-4">
                      <p
                        className="mb-2"
                        style={{
                          fontSize:      '11px',
                          fontWeight:    600,
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
                          color:         SECTION_COLOR[section.type] ?? '#888',
                        }}
                      >
                        {section.type}
                      </p>
                      <ul className="space-y-2">
                        {section.items.map((item, i) => (
                          <li key={i} className="flex items-start gap-3">
                            <span className="mt-[2px] shrink-0 text-[14px]" style={{ color: '#555' }}>○</span>
                            <span style={{ fontSize: '13px', lineHeight: 1.6, color: '#aaa' }}>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: 8 }} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function UpdateNotice() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Auto-show on new version
    const seen = localStorage.getItem(STORAGE_KEY)
    if (seen !== LATEST_VERSION) setShow(true)

    // Manual open via custom event (dispatched by sidebar "更新说明" button)
    const handler = () => setShow(true)
    window.addEventListener('jarvis:open-changelog', handler)
    return () => window.removeEventListener('jarvis:open-changelog', handler)
  }, [])

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, LATEST_VERSION)
    setShow(false)
  }

  if (!show) return null

  return <ChangelogView entry={CHANGELOG[0]} onClose={dismiss} />
}
