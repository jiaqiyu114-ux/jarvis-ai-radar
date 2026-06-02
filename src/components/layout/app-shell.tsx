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
      {/* Ambient glow — cyan upper-left, orange lower-right */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-[20%] -left-[10%] h-[520px] w-[520px] rounded-full blur-[140px]"
             style={{background:"rgba(57,214,208,0.055)"}} />
        <div className="absolute -bottom-[20%] -right-[5%] h-[480px] w-[480px] rounded-full blur-[120px]"
             style={{background:"rgba(232,93,61,0.07)"}} />
      </div>
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
