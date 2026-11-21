'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Award,
  Building2,
  ClipboardList,
  FileSearch,
  HelpCircle,
  Home,
  Landmark,
  LayoutDashboard,
  LogIn,
  LogOut,
  Megaphone,
  ScrollText,
  ShieldCheck,
  User,
} from 'lucide-react'
import type { Notice } from '@/lib/model'
import { request } from './client'
import { uiLanguages, type Lang } from './i18n'
import { setFontSize, toggleContrast, usePortal } from './providers'

export function UtilityBar() {
  const { t, lang, setLang } = usePortal()
  return (
    <div className="utility" role="region" aria-label="Accessibility options">
      <div className="shell">
        <div className="group">
          <a href="#main">{t('skip')}</a>
          <span className="sep">|</span>
          <Link href="/help#accessibility">{t('screen')}</Link>
        </div>
        <div className="group">
          <button onClick={() => setFontSize(-1)} aria-label="Decrease text size">
            A-
          </button>
          <button onClick={() => setFontSize(0)} aria-label="Default text size">
            A
          </button>
          <button onClick={() => setFontSize(1)} aria-label="Increase text size">
            A+
          </button>
          <span className="sep">|</span>
          <button onClick={toggleContrast} aria-label="Toggle high contrast">
            ◐ Contrast
          </button>
          <span className="sep">|</span>
          <label
            className="row"
            style={{ display: 'flex', gap: '.3rem', fontWeight: 500, fontSize: 'inherit', color: 'inherit' }}
          >
            <span aria-hidden>🌐</span>
            <select
              className="lang-select"
              value={lang}
              onChange={event => setLang(event.target.value as Lang)}
              aria-label={t('language')}
            >
              {(Object.keys(uiLanguages) as Lang[]).map(code => (
                <option key={code} value={code} lang={code}>
                  {uiLanguages[code].native}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  )
}

export function Masthead() {
  const { t } = usePortal()
  return (
    <header className="masthead">
      <div className="shell">
        <Link href="/" className="brandmark" aria-label="CivicResolve home">
          <span className="emblem" aria-hidden>
            <Landmark size={28} />
          </span>
          <span className="brand-text">
            <small>{t('corp')}</small>
            <strong>CivicResolve · {t('portal')}</strong>
            <span lang="hi">नागरिक शिकायत निवारण पोर्टल · Report · Track · Resolve</span>
          </span>
        </Link>
        <div className="mast-right">
          <div className="helpline">
            <AlertTriangle size={20} color="#b42318" />
            <div>
              {t('emergency')}
              <strong>112</strong>
            </div>
          </div>
          <div className="helpline">
            <ShieldCheck size={20} color="#138808" />
            <div>
              AI-assisted<strong style={{ color: 'var(--navy-2)' }}>8 languages</strong>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

export function MainNav() {
  const { t, session, refresh } = usePortal()
  const path = usePathname()
  const router = useRouter()
  const officer = session && session.role !== 'CITIZEN'
  const citizen = session?.role === 'CITIZEN' && (session.mobile || session.email)
  const links = [
    { href: '/', label: t('home'), Icon: Home },
    { href: '/lodge', label: t('lodge'), Icon: ClipboardList },
    { href: '/track', label: t('track'), Icon: FileSearch },
    { href: '/dashboard', label: t('dashboard'), Icon: LayoutDashboard },
    { href: '/charter', label: t('charter'), Icon: ScrollText },
    { href: '/help', label: t('help'), Icon: HelpCircle },
    ...(session?.demoEnabled ? [{ href: '/judges', label: t('judges'), Icon: Award }] : []),
    ...(citizen ? [{ href: '/my', label: t('my'), Icon: User }] : []),
    ...(officer ? [{ href: '/admin', label: t('console'), Icon: Building2 }] : []),
  ]
  async function logout() {
    await request('/api/auth/logout', 'POST').catch(() => {})
    await refresh()
    router.push('/')
  }
  return (
    <nav className="mainnav" aria-label="Main navigation">
      <div className="shell">
        <div className="navlinks">
          {links.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className={(href === '/' ? path === '/' : path.startsWith(href)) ? 'active' : ''}
            >
              <Icon size={15} aria-hidden />
              {label}
            </Link>
          ))}
        </div>
        <div className="navcta">
          {officer || citizen ? (
            <button className="btn-ghost btn-sm" onClick={() => void logout()}>
              <LogOut size={14} />
              {t('logout')}
            </button>
          ) : (
            <Link className="button btn-saffron" href="/login">
              <LogIn size={15} />
              {t('login')}
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}

const standing: Omit<Notice, 'id' | 'createdAt' | 'author'>[] = [
  {
    kind: 'update',
    text: 'Lodge grievances in English, हिन्दी, தமிழ், తెలుగు, ಕನ್ನಡ, മലയാളം, বাংলা and मराठी — AI routes them to the right department instantly.',
  },
  {
    kind: 'advisory',
    text: 'Monsoon advisory: report open drains, waterlogging and exposed wiring immediately. Stay away from the hazard.',
  },
  { kind: 'update', text: 'Every disposed grievance is verified by AI before-and-after photo comparison.' },
]

export function Ticker() {
  const { t } = usePortal()
  const [notices, setNotices] = useState<Pick<Notice, 'kind' | 'text'>[]>(standing)
  useEffect(() => {
    request<Notice[]>('/api/notices')
      .then(list => setNotices([...list, ...standing]))
      .catch(() => {})
  }, [])
  return (
    <div className="ticker" role="region" aria-label={t('updates')}>
      <div className="shell">
        <span className="ticker-label">
          <Megaphone size={12} style={{ display: 'inline', marginRight: 4 }} />
          {t('updates')}
        </span>
        <div className="ticker-track">
          <div className="ticker-move">
            {notices.map((notice, index) => (
              <span key={index} className={'ticker-item ' + (notice.kind === 'alert' ? 'alert' : '')}>
                {notice.kind === 'alert' ? '⚠' : '◆'} {notice.text}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="shell cols">
        <div>
          <h4>About CivicResolve</h4>
          <p>
            An AI-assisted public grievance redressal system that routes citizen reports to municipal departments,
            tracks SLAs and verifies every fix.
          </p>
        </div>
        <div>
          <h4>Citizen services</h4>
          <ul>
            <li>
              <Link href="/lodge">Lodge a grievance</Link>
            </li>
            <li>
              <Link href="/track">Track grievance status</Link>
            </li>
            <li>
              <Link href="/dashboard">Public dashboard</Link>
            </li>
            <li>
              <Link href="/my">My grievances</Link>
            </li>
          </ul>
        </div>
        <div>
          <h4>Information</h4>
          <ul>
            <li>
              <Link href="/charter">Citizen charter & SLAs</Link>
            </li>
            <li>
              <Link href="/charter#escalation">Escalation matrix</Link>
            </li>
            <li>
              <Link href="/help">FAQs</Link>
            </li>
            <li>
              <Link href="/help#accessibility">Accessibility statement</Link>
            </li>
          </ul>
        </div>
        <div>
          <h4>Officials</h4>
          <ul>
            <li>
              <Link href="/login?tab=officer">Officer login</Link>
            </li>
            <li>
              <Link href="/admin">Officer console</Link>
            </li>
            <li>
              <Link href="/help#privacy">Privacy & data policy</Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="shell footer-bottom">
        <span>CivicResolve · prototype built for the GDG Hackathon · Not an official government website.</span>
        <span>Powered by Google Gemini · Firebase · Cloud Run</span>
      </div>
    </footer>
  )
}
