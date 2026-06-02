import { TopStatusBar } from "./top-status-bar"
import { SidebarNav } from "./sidebar-nav"
import { ExperimentalNotice } from "./experimental-notice"

export type TopSignalData = {
  score:    number
  title:    string
  category: string
}

interface AppShellProps {
  children:   React.ReactNode
  topSignal?: TopSignalData
}

export function AppShell({ children, topSignal }: AppShellProps) {
  return (
    <div className="min-h-screen relative">
      <div className="relative z-10">
        <SidebarNav />
        <div className="ml-[220px] flex flex-col min-h-screen">
          <TopStatusBar topSignal={topSignal} />
          <main className="flex-1 mt-10">
            <ExperimentalNotice />
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
