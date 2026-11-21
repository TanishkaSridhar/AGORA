import type { Metadata } from 'next'
import { Noto_Sans } from 'next/font/google'
import 'leaflet/dist/leaflet.css'
import './globals.css'
import Assistant from '../components/assistant'
import { Footer, MainNav, Masthead, Ticker, UtilityBar } from '../components/chrome'
import { Providers } from '../components/providers'

const sans = Noto_Sans({ subsets: ['latin', 'devanagari'], weight: ['400', '500', '600', '700', '800'], variable: '--font-sans', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'CivicResolve · Citizen Grievance Redressal Portal', template: '%s · CivicResolve' },
  description: 'Lodge, track and resolve municipal grievances in your language. AI-assisted routing, SLA tracking and verified resolutions.',
}

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={sans.variable}><body>
    <Providers>
      <div className="tricolour" aria-hidden />
      <UtilityBar />
      <Masthead />
      <MainNav />
      <Ticker />
      <main id="main" className="shell main" tabIndex={-1}>{children}</main>
      <Footer />
      <Assistant />
    </Providers>
  </body></html>
}
