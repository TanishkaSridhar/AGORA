'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  BadgeCheck,
  Bot,
  Building2,
  Cloud,
  Database,
  HardHat,
  KeyRound,
  Landmark,
  Languages,
  Loader2,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react'
import { message, request } from '@/components/client'
import { usePortal } from '@/components/providers'
import { Breadcrumb, Panel } from '@/components/ui'

const roles = [
  {
    id: 'admin',
    title: 'Municipal Commissioner',
    text: 'Super admin: all departments, reassign, priorities, notices, AI brief',
    Icon: Landmark,
  },
  {
    id: 'roads',
    title: 'Roads Field Engineer',
    text: 'Department staff: sees and acts only on Roads grievances',
    Icon: HardHat,
  },
  { id: 'water', title: 'Water Field Engineer', text: 'Department staff: Water Supply & Drainage only', Icon: HardHat },
]

const walkthrough: [string, string, string][] = [
  [
    'Lodge a grievance as a citizen',
    '/lodge',
    'Continue as guest (or verify a mobile with the on-screen demo OTP), attach any photo of a road/drain/garbage problem, describe it in any Indian language or by voice, submit. Gemini triages it and you get an acknowledgement slip with a registration number.',
  ],
  [
    'Track it',
    '/track',
    'Paste the registration number. See the 4-stage status bar, SLA deadline, AI work order, safety advisory and action history.',
  ],
  [
    'Open the Officer Console as the Commissioner',
    '/admin',
    'Use the Commissioner button above. Explore Overview (AI daily brief, needs-attention list), Grievance register (filters, bulk actions, CSV export), SLA & escalations, Map, AI insights, Department performance, Public notices, Audit log.',
  ],
  [
    'Act on a case',
    '/admin?tab=register',
    'Click any row: assign a field officer, "Draft with AI" remarks (auto-translated to the citizen\'s language), Start work, then upload an After photo. Gemini compares before/after and only disposes the case if the fix is visible.',
  ],
  [
    'See role-based access',
    '/login?tab=officer',
    'Log out and sign in as the Roads Field Engineer: only Roads grievances are visible and Commissioner controls are gone. The API returns 403 for anything else.',
  ],
  [
    'Ask the AI helpdesk',
    '/',
    'Click "Ask Sahayak" (bottom right) and ask in Hindi, Tamil or English, e.g. "What is the status of AGR-2026-412946?"',
  ],
]

export default function Judges() {
  const router = useRouter()
  const { session, refresh } = usePortal()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  async function enter(id: string) {
    setBusy(id)
    setError('')
    try {
      await request('/api/auth/login', 'POST', { demo: id })
      await refresh()
      router.push('/admin')
    } catch (error) {
      setError(message(error))
    } finally {
      setBusy('')
    }
  }
  return (
    <div className="stack">
      <Breadcrumb items={[['Home', '/'], ['For judges']]} />
      <div className="page-head">
        <div>
          <h1>Evaluator guide</h1>
          <p>
            CivicResolve is an AI-powered, multilingual public grievance redressal portal for Indian municipalities,
            built on Google Gemini and Firebase. Everything below works on this live deployment; no account or password
            is needed.
          </p>
        </div>
      </div>

      <Panel title="1 · One-click access (no password)">
        {session && !session.demoEnabled && (
          <p className="alert alert-warn">Demo access is disabled on this deployment.</p>
        )}
        <div className="grid g3">
          {roles.map(({ id, title, text, Icon }) => (
            <button
              key={id}
              className="btn-ghost"
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '.8rem' }}
              disabled={!!busy}
              onClick={() => void enter(id)}
            >
              {busy === id ? <Loader2 size={20} className="spin" /> : <Icon size={20} />}
              <span>
                <strong>{title}</strong>
                <span className="tiny muted" style={{ display: 'block', fontWeight: 400 }}>
                  {text}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="row small">
          <Link className="button btn-saffron" href="/lodge">
            <User size={16} />
            Try as a citizen
          </Link>
          <span className="muted">
            Citizen mobile login: any 10-digit number starting 6–9; the OTP is shown on screen (demo SMS gateway).{' '}
            <span className="mono">9000000000</span> already owns a sample grievance.
          </span>
        </div>
        {error && (
          <p role="alert" className="alert alert-danger">
            {error}
          </p>
        )}
      </Panel>

      <Panel title="2 · Five-minute walkthrough">
        <ol className="timeline">
          {walkthrough.map(([title, href, text]) => (
            <li key={title}>
              <div className="what">
                <Link href={href}>{title}</Link>
              </div>
              <div className="small muted">{text}</div>
            </li>
          ))}
        </ol>
      </Panel>

      <div className="grid g2">
        <Panel
          title={
            <>
              <Sparkles size={16} />
              Where Gemini is used
            </>
          }
        >
          <ul className="small" style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '.4rem' }}>
            <li>
              <strong>Multimodal triage:</strong> reads the photo + text, rejects spam, detects language, routes to 1 of
              5 departments, sets severity (1–5), SLA and a formal English work order, replies to the citizen in their
              language.
            </li>
            <li>
              <strong>Geo-semantic de-duplication:</strong> reports within 100 m are compared visually; the same hazard
              is merged and its priority boosted.
            </li>
            <li>
              <strong>Before/after verification:</strong> a case cannot be disposed unless Gemini confirms the After
              photo shows the same place, fixed.
            </li>
            <li>
              <strong>Cascading risk alerts:</strong> e.g. open drain near a school during monsoon.
            </li>
            <li>
              <strong>Commissioner&apos;s AI brief:</strong> hotspots, systemic patterns and prioritised actions from
              the live register.
            </li>
            <li>
              <strong>Officer assist:</strong> drafts action-taken remarks and translates them into the citizen&apos;s
              language.
            </li>
            <li>
              <strong>Escalation letters</strong> in 8 languages once an SLA is breached, and the{' '}
              <strong>Sahayak helpdesk</strong> chatbot grounded on live ticket data.
            </li>
          </ul>
        </Panel>
        <Panel
          title={
            <>
              <ShieldCheck size={16} />
              Engineering highlights
            </>
          }
        >
          <ul className="small" style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '.4rem' }}>
            <li>
              <Bot size={13} style={{ display: 'inline' }} /> <strong>AI resilience:</strong> model failover chain with
              timeouts and cooldowns; if every model is down, reports are still accepted via keyword routing and queued
              for AI re-triage. Live status under Console → AI insights.
            </li>
            <li>
              <KeyRound size={13} style={{ display: 'inline' }} /> <strong>Security:</strong> 3-tier RBAC enforced
              server-side, signed HTTP-only sessions, captcha + OTP second factor + account lockout for officers, Google
              sign-in via Firebase Auth, citizen PII masked on public pages, CSV formula-injection protection.
            </li>
            <li>
              <Languages size={13} style={{ display: 'inline' }} /> <strong>Inclusion:</strong> 8 Indian languages with
              voice input, English/हिन्दी interface, text-size and high-contrast controls, chart table views.
            </li>
            <li>
              <BadgeCheck size={13} style={{ display: 'inline' }} /> <strong>Accountability:</strong> SLA timers,
              automatic L1→L3 escalation, citizen rating and reopen, full audit log.
            </li>
          </ul>
        </Panel>
      </div>

      <Panel title="Google technologies">
        <div className="grid g4">
          {[
            { Icon: Sparkles, name: 'Gemini API', text: '@google/genai, structured JSON output, multimodal' },
            { Icon: KeyRound, name: 'Firebase Authentication', text: 'Google sign-in, ID token verified server-side' },
            { Icon: Database, name: 'Cloud Firestore', text: 'Transactional grievance store (asia-south1)' },
            { Icon: Cloud, name: 'Firebase App Hosting', text: 'Cloud Run + Secret Manager' },
          ].map(({ Icon, name, text }) => (
            <div key={name} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <span className="tile-icon" style={{ flex: 'none' }}>
                <Icon size={20} />
              </span>
              <div>
                <strong className="small">{name}</strong>
                <p className="tiny muted">{text}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="tiny muted">
          <Building2 size={12} style={{ display: 'inline' }} /> Sample grievances are synthetic demo data. CivicResolve
          is a hackathon prototype, not an official government website.
        </p>
      </Panel>
    </div>
  )
}
