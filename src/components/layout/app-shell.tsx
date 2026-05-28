import { TopStatusBar } from "./top-status-bar"
import { SidebarNav } from "./sidebar-nav"
import { mockItems } from "@/config/mock-data"

interface AppShellProps {
  children: React.ReactNode
}

const topItem = [...mockItems].sort((a, b) => b.finalScore - a.finalScore)[0]

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <TopStatusBar
        topSignal={topItem ? {
          score: topItem.finalScore,
          title: topItem.title,
          category: topItem.category,
        } : undefined}
      />
      <SidebarNav />
      <main className="ml-[220px] mt-10 min-h-[calc(100vh-40px)]">
        {children}
      </main>
    </div>
  )
}
