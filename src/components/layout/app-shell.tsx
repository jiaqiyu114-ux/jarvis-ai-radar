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
    <div className="min-h-screen bg-background relative">
      {/* Ambient glow — fixed, zero performance cost, no images */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-1/3 -left-1/4 h-[600px] w-[600px] rounded-full bg-violet-900/[0.18] blur-[130px]" />
        <div className="absolute -bottom-1/4 right-0 h-[500px] w-[500px] rounded-full bg-sky-900/[0.12] blur-[110px]" />
      </div>
      <div className="relative z-10">
        <TopStatusBar topSignal={topSignal} />
        <SidebarNav />
        <main className="ml-[220px] mt-10 min-h-[calc(100vh-40px)]">
          <ExperimentalNotice />
          {children}
        </main>
      </div>
    </div>
  )
}
