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
    <div className="min-h-screen bg-background">
      <TopStatusBar topSignal={topSignal} />
      <SidebarNav />
      <main className="ml-[220px] mt-10 min-h-[calc(100vh-40px)]">
        <ExperimentalNotice />
        {children}
      </main>
    </div>
  )
}
