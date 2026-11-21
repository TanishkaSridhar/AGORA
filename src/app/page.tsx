'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { BadgeCheck, Building2, ClipboardList, Droplets, FileSearch, Languages, LayoutDashboard, Lightbulb, Route, ScrollText, ShieldCheck, Trash2, Trees, User } from 'lucide-react'
import { dateLabel, request } from '../components/client'
import { Panel, StatusBadge } from '../components/ui'
import { usePortal } from '../components/providers'
import { departments, type IssueSummary, type Notice } from '../lib/model'
import { hoursLabel, percent, stats } from '../lib/stats'

const deptIcons = [Route, Trash2, Droplets, Lightbulb, Trees]
const deptExamples = ['Potholes, footpaths, cave-ins', 'Garbage, missed collection, dumping', 'Drains, sewage, waterlogging, leaks', 'Street lights, exposed wiring', 'Parks, trees, stray cattle, unsafe spots']

export default function Home() {
  const { t, session } = usePortal()
  const [issues, setIssues] = useState<IssueSummary[]>()
  const [notices, setNotices] = useState<Notice[]>([])
  useEffect(() => {
    request<IssueSummary[]>('/api/issues').then(setIssues).catch(() => setIssues([]))
    request<Notice[]>('/api/notices').then(setNotices).catch(() => {})
  }, [])
  const s = issues && stats(issues)
  const recent = (issues ?? []).filter(issue => issue.status === 'RESOLVED').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4)

  return <div className="stack" style={{ gap: '1.25rem' }}>
    <section className="hero">
      <div className="hero-body">
        <span className="badge" style={{ background: '#ffffff1a', color: '#fff', borderColor: '#ffffff33', justifySelf: 'start' }}><ShieldCheck size={13} />Swift · Transparent · Accountable</span>
        <h1>Report a civic problem. Track it to resolution.</h1>
        <p>Lodge a grievance about roads, garbage, drainage, street lights or public safety with a photo, in your own language. AI routes it to the right department, sets a deadline, and verifies the fix before the case is closed.</p>
        <div className="row">
          <Link className="button btn-saffron" href="/lodge"><ClipboardList size={18} />{t('lodge')}</Link>
          <Link className="button btn-ghost" href="/track"><FileSearch size={18} />{t('track')}</Link>
        </div>
      </div>
    </section>

    <section className="tiles" aria-label="Citizen services">
      {[
        { href: '/lodge', Icon: ClipboardList, title: t('lodge'), text: 'Photo + voice/text in 8 languages' },
        { href: '/track', Icon: FileSearch, title: t('track'), text: 'Use your registration number' },
        { href: session?.mobile ? '/my' : '/login?tab=citizen', Icon: User, title: t('my'), text: 'Sign in with mobile OTP' },
        { href: '/dashboard', Icon: LayoutDashboard, title: t('dashboard'), text: 'Live pendency & disposal data' },
        { href: '/charter', Icon: ScrollText, title: t('charter'), text: 'Service timelines & escalation' },
        { href: '/login?tab=officer', Icon: Building2, title: 'Officer Login', text: 'Department & Commissioner console' },
      ].map(({ href, Icon, title, text }) => <Link key={title} href={href} className="tile">
        <span className="tile-icon"><Icon size={22} /></span><strong>{title}</strong><span>{text}</span>
      </Link>)}
    </section>

    <section className="statband" aria-label="Portal statistics" aria-busy={!s}>
      <div><strong>{s ? s.reports : '…'}</strong><span>Grievances received</span></div>
      <div><strong>{s ? s.resolved : '…'}</strong><span>Grievances disposed</span></div>
      <div><strong>{s ? hoursLabel(s.avgResolutionHours) : '…'}</strong><span>Average disposal time</span></div>
      <div><strong>{s ? percent(s.slaCompliance) : '…'}</strong><span>Disposed within SLA</span></div>
      <div><strong>{s ? s.merged : '…'}</strong><span>Duplicate reports merged</span></div>
      <div><strong>{s ? (s.avgRating?.toFixed(1) ?? '—') + ' ★' : '…'}</strong><span>Citizen satisfaction</span></div>
    </section>

    <div className="grid side-main">
      <div className="stack">
        <Panel title="How it works">
          <ol className="steps">
            <li><strong>Lodge</strong>Upload a photo, describe the problem by voice or text, and pin the location.</li>
            <li><strong>AI triage</strong>Gemini reads the photo and text, sets severity and an SLA, and forwards it to the right department.</li>
            <li><strong>Action</strong>Field officers update progress with remarks, translated into your language.</li>
            <li><strong>Verified disposal</strong>AI compares before and after photos. You rate the work or reopen the case.</li>
          </ol>
        </Panel>
        <Panel title="Departments & service levels" actions={<Link className="small" href="/charter">Full citizen charter →</Link>}>
          <div className="grid g2">
            {departments.map((department, index) => {
              const Icon = deptIcons[index]
              return <div key={department} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                <span className="tile-icon" style={{ flex: 'none' }}><Icon size={20} /></span>
                <div><strong className="small" style={{ color: 'var(--navy-2)' }}>{department}</strong><p className="tiny muted">{deptExamples[index]}</p></div>
              </div>
            })}
          </div>
        </Panel>
      </div>
      <div className="stack">
        <Panel title="What's new">
          <ul className="notice-list">
            {notices.slice(0, 4).map(notice => <li key={notice.id}><span>{notice.kind === 'alert' ? '⚠ ' : ''}{notice.text}<span className="new-tag">NEW</span></span><span className="tiny muted">{dateLabel(notice.createdAt)} · {notice.author}</span></li>)}
            <li><span><Languages size={14} style={{ display: 'inline', verticalAlign: -2 }} /> Grievances accepted in 8 Indian languages, with voice input.</span></li>
            <li><span><BadgeCheck size={14} style={{ display: 'inline', verticalAlign: -2 }} /> AI before/after verification is mandatory for every disposal.</span></li>
            <li><span>Ask <strong>AGORA Sahayak</strong> (bottom right) for help in any language.</span></li>
          </ul>
        </Panel>
        <Panel title="Recently disposed">
          {recent.length ? <ul className="notice-list">{recent.map(issue => <li key={issue.id}>
            <Link href={'/track?ref=' + encodeURIComponent(issue.refNo ?? issue.id)}>{issue.title}</Link>
            <span className="row tiny muted"><StatusBadge status={issue.status} />{issue.location.ward ?? issue.location.address}</span>
          </li>)}</ul> : <p className="small muted">{issues ? 'No grievances disposed yet.' : 'Loading…'}</p>}
        </Panel>
      </div>
    </div>
  </div>
}
