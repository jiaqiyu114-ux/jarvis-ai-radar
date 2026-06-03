import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import "./globals.css"
import { ThemeProvider } from "@/components/theme/theme-provider"

// Geist (self-hosted by the `geist` package — no network fetch at build).
// Latin glyphs render in Geist; CJK falls back per-glyph to PingFang via the
// --font-sans stack in globals.css. Geist Mono carries scores / data.

export const metadata: Metadata = {
  title: "J.A.R.V.I.S. — 个人信息雷达",
  description: "Personal AI-era information radar system",
}

// Pre-paint theme: set the `.dark` class on <html> before React hydrates so the
// page never flashes the wrong palette. Defaults to dark; honours a saved
// preference and "system". Mirrors the logic in ThemeProvider.
const themeInitScript = `
(function(){try{
  var m=localStorage.getItem('jarvis-theme')||'dark';
  var dark=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark',dark);
}catch(e){document.documentElement.classList.add('dark');}})();
`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="zh-CN"
      className={`dark ${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
