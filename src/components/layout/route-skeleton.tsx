import { AppShell } from "@/components/layout/app-shell"

function SkimBar({ w, h = 14 }: { w: number | string; h?: number }) {
  return (
    <div
      className="skel-line"
      style={{ width: w, height: h, borderRadius: 8 }}
    />
  )
}

function SkimCard({ h = 90 }: { h?: number }) {
  return <div className="skel-card" style={{ height: h }} />
}

/**
 * Instant navigation skeleton — renders before the page's server data loads.
 * Mirrors the two-column layout used by the dashboard and other main pages so
 * the transition from skeleton to real content is minimal.
 */
export function RouteSkeleton() {
  return (
    <AppShell>
      <div className="mx-auto max-w-[1240px] px-5 py-6 md:px-7">

        {/* Header area */}
        <div className="mb-7 space-y-2">
          <SkimBar w={80} h={10} />
          <SkimBar w={200} h={28} />
          <SkimBar w={320} h={14} />
        </div>

        {/* Tab strip */}
        <div className="mb-5 flex items-center gap-2">
          <SkimBar w={120} h={32} />
          <SkimBar w={200} h={14} />
        </div>

        {/* Two-column body */}
        <div className="flex gap-7 items-start">
          {/* Main column */}
          <div className="flex-1 min-w-0 space-y-3">
            <SkimBar w={160} h={12} />
            {[100, 90, 90, 85, 85, 80].map((h, i) => (
              <SkimCard key={i} h={h} />
            ))}
          </div>

          {/* Right sidebar (matches dashboard stats sidebar) */}
          <div className="w-[268px] shrink-0 space-y-3">
            <SkimCard h={148} />
            <SkimCard h={120} />
            <SkimCard h={90} />
          </div>
        </div>
      </div>
    </AppShell>
  )
}
