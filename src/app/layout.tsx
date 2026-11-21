import type { Metadata } from 'next'
import { Noto_Sans, Noto_Sans_Kannada, Noto_Sans_Malayalam, Noto_Sans_Tamil, Noto_Sans_Telugu } from 'next/font/google'
import 'leaflet/dist/leaflet.css'
import './globals.css'
import Assistant from '@/components/assistant'
import { Footer, MainNav, Masthead, Ticker, UtilityBar } from '@/components/chrome'
import { Providers } from '@/components/providers'

const sans = Noto_Sans({
  subsets: ['latin', 'devanagari'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
})
// Indic fonts download only when a page uses those scripts (unicode-range), so English pages stay light.
const tamil = Noto_Sans_Tamil({
  subsets: ['tamil'],
  weight: ['400', '700'],
  variable: '--font-ta',
  display: 'swap',
  preload: false,
})
const malayalam = Noto_Sans_Malayalam({
  subsets: ['malayalam'],
  weight: ['400', '700'],
  variable: '--font-ml',
  display: 'swap',
  preload: false,
})
const kannada = Noto_Sans_Kannada({
  subsets: ['kannada'],
  weight: ['400', '700'],
  variable: '--font-kn',
  display: 'swap',
  preload: false,
})
const telugu = Noto_Sans_Telugu({
  subsets: ['telugu'],
  weight: ['400', '700'],
  variable: '--font-te',
  display: 'swap',
  preload: false,
})

export const metadata: Metadata = {
  title: { default: 'CivicResolve · Citizen Grievance Redressal Portal', template: '%s · CivicResolve' },
  description:
    'Lodge, track and resolve municipal grievances in your language. AI-assisted routing, SLA tracking and verified resolutions.',
}

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={[sans, tamil, malayalam, kannada, telugu].map(font => font.variable).join(' ')}>
      <body>
        <Providers>
          <div className="tricolour" aria-hidden />
          <UtilityBar />
          <Masthead />
          <MainNav />
          <Ticker />
          <main id="main" className="shell main" tabIndex={-1}>
            {children}
          </main>
          <Footer />
          <Assistant />
        </Providers>
      </body>
    </html>
  )
}
