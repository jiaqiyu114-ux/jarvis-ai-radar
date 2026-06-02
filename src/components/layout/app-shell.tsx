import { TopStatusBar } from "./top-status-bar"
import { SidebarNav } from "./sidebar-nav"
import { ExperimentalNotice } from "./experimental-notice"

export type TopSignalData = {
  score:    number
  title:    string
  category: string
}

interface AppShellProps {
  children:       React.ReactNode
  topSignal?:     TopSignalData
  lastUpdated?:   string | null
  capturedCount?: number
}

/**
 * Reference layout — one big rounded dark "app panel" floating on a desaturated
 * navy-purple canvas. The panel holds a static tree sidebar on the left and a
 * content column (dense toolbar + internally-scrolling main) on the right.
 */
export function AppShell({ children, topSignal, lastUpdated, capturedCount }: AppShellProps) {
  return (
    <div className="rf-shell">
      <div className="rf-app-panel">
        <SidebarNav />
        <div className="rf-content">
          <TopStatusBar
            topSignal={topSignal}
            lastUpdated={lastUpdated}
            capturedCount={capturedCount}
          />
          <main className="rf-scroll">
            <ExperimentalNotice />
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
