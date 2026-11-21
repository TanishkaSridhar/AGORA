import type { Metadata } from 'next'
import Link from 'next/link'
import { Landmark } from 'lucide-react'
import './globals.css'

export const metadata: Metadata = {
  title: 'AGORA',
  description: 'Report local infrastructure hazards and follow municipal action.',
}

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>
    <header className="site-header"><nav className="shell nav" aria-label="Main navigation">
      <Link className="brand" href="/"><span className="brand-icon"><Landmark size={21}/></span>AGORA</Link>
      <div className="nav-links"><Link href="/">Report an issue</Link><Link href="/dashboard">Dashboard</Link><Link href="/login">Staff access</Link></div>
    </nav></header>
    <main className="shell main">{children}</main>
  </body></html>
}
