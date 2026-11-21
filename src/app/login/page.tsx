'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useState, type FormEvent } from 'react'
import { Eye, EyeOff, HardHat, KeyRound, Landmark, Loader2, Lock, LogIn, RefreshCw, ShieldAlert, ShieldCheck, User } from 'lucide-react'
import { message, request } from '../../components/client'
import { GoogleButton } from '../../components/google'
import { MobileOtp } from '../../components/otp'
import { usePortal } from '../../components/providers'
import { Breadcrumb, Panel } from '../../components/ui'
import type { AuthSession } from '../../lib/model'

const demos = [
  { id: 'admin', title: 'Municipal Commissioner', scope: 'Super admin · all departments', Icon: Landmark },
  { id: 'roads', title: 'Roads Field Engineer', scope: 'Roads & Infrastructure', Icon: HardHat },
  { id: 'sanitation', title: 'Sanitation Field Officer', scope: 'Sanitation & Solid Waste', Icon: HardHat },
  { id: 'water', title: 'Water Field Engineer', scope: 'Water Supply & Drainage', Icon: HardHat },
  { id: 'electrical', title: 'Electrical Field Engineer', scope: 'Street Lighting & Electrical', Icon: HardHat },
  { id: 'safety', title: 'Public Safety Officer', scope: 'Public Safety & Parks', Icon: HardHat },
]
type Otp = { challenge: string; demoOtp?: string; maskedTo: string }

function OfficerLogin() {
  const router = useRouter()
  const { session, refresh } = usePortal()
  const [captcha, setCaptcha] = useState<{ image: string; token: string }>()
  const [show, setShow] = useState(false)
  const [otp, setOtp] = useState<Otp>()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const reload = useCallback(() => { request<{ image: string; token: string }>('/api/auth/captcha').then(setCaptcha).catch(() => {}) }, [])
  useEffect(reload, [reload])

  async function done() { await refresh(); router.push('/admin') }
  async function login(body: object) {
    setBusy(true); setError('')
    try {
      const result = await request<AuthSession | (Otp & { otpRequired: true })>('/api/auth/login', 'POST', body)
      if ('otpRequired' in result) { setOtp(result); setCode('') } else await done()
    } catch (error) {
      setError(message(error))
      reload()
    } finally { setBusy(false) }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    void login({ email: data.get('email'), password: data.get('password'), captchaToken: captcha?.token, captchaAnswer: data.get('captcha') })
  }

  if (otp) return <form className="stack" onSubmit={event => { event.preventDefault(); void login({ challenge: otp.challenge, otp: code }) }}>
    <div className="alert alert-info"><ShieldCheck size={18} /><div><strong>Two-step verification.</strong> Enter the OTP sent to {otp.maskedTo}.</div></div>
    {otp.demoOtp && <div className="demo-sms" role="status"><div className="tiny muted">Demo SMS gateway</div>AGORA officer login OTP: <strong>{otp.demoOtp}</strong>. Valid 5 minutes. Never share this code.</div>}
    <label>One-time password<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} className="mono" style={{ letterSpacing: '.4em', fontSize: '1.1rem' }} autoFocus /></label>
    {error && <p role="alert" className="alert alert-danger">{error}</p>}
    <div className="row between"><button type="button" className="btn-link" onClick={() => { setOtp(undefined); setError(''); reload() }}>← Back</button>
      <button disabled={busy || code.length !== 6}>{busy ? <Loader2 size={16} className="spin" /> : <KeyRound size={16} />}Verify & sign in</button></div>
  </form>

  return <div className="stack">
    <form className="stack" onSubmit={submit}>
      <label><span>User ID (official email)<span className="req-mark" aria-hidden> *</span></span><div className="row" style={{ flexWrap: 'nowrap' }}><User size={18} className="muted" />
        <input name="email" type="email" autoComplete="username" maxLength={250} required placeholder="e.g. roads@civicresolve.gov" /></div></label>
      <label><span>Password<span className="req-mark" aria-hidden> *</span></span><div className="row" style={{ flexWrap: 'nowrap' }}><Lock size={18} className="muted" />
        <input name="password" type={show ? 'text' : 'password'} autoComplete="current-password" maxLength={500} required />
        <button type="button" className="btn-ghost btn-sm" onClick={() => setShow(value => !value)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></label>
      <label><span>Enter the characters shown<span className="req-mark" aria-hidden> *</span></span><div className="captcha-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {captcha ? <img src={captcha.image} alt="Captcha image. Use the refresh button for a new one." /> : <span className="muted small">Loading…</span>}
          <button type="button" className="btn-ghost btn-sm" onClick={reload} aria-label="New captcha"><RefreshCw size={15} /></button>
          <input name="captcha" required maxLength={8} autoComplete="off" className="mono" style={{ textTransform: 'uppercase', maxWidth: 140 }} />
        </div>
      </label>
      {error && <p role="alert" className="alert alert-danger"><ShieldAlert size={16} />{error}</p>}
      <button disabled={busy}>{busy ? <Loader2 size={16} className="spin" /> : <LogIn size={16} />}Sign in</button>
      <p className="secure-note"><Lock size={14} />Captcha, OTP second factor, lockout after 5 failed attempts, 8-hour signed sessions. All officer actions are logged in the audit trail.</p>
    </form>
    {session?.googleEnabled && <><hr className="hr" /><GoogleButton label="Sign in with Google (authorised officers)" onSignedIn={() => void done()} /></>}
    {session?.demoEnabled && <section className="stack-sm">
      <hr className="hr" />
      <strong className="small">Judge demo access <span className="badge b-ai">Demo environment</span></strong>
      <p className="tiny muted">One-click sign-in for hackathon evaluation. Disabled on production deployments.</p>
      <div className="grid g2">
        {demos.map(({ id, title, scope, Icon }) => <button className="btn-ghost" key={id} disabled={busy} onClick={() => void login({ demo: id })} style={{ justifyContent: 'flex-start', textAlign: 'left' }}>
          <Icon size={18} /><span className="small">{title}<span className="tiny muted" style={{ display: 'block', fontWeight: 400 }}>{scope}</span></span></button>)}
      </div>
    </section>}
  </div>
}

function CitizenLogin() {
  const router = useRouter()
  const { session } = usePortal()
  return <div className="stack">
    <p className="small muted">Sign in to see all your grievances, rate resolutions, and reopen cases. You don&apos;t need an account to lodge a grievance.</p>
    <MobileOtp onVerified={() => router.push('/my')} />
    {session?.googleEnabled && <><div className="row" style={{ justifyContent: 'center' }}><span className="tiny muted">or</span></div>
      <GoogleButton onSignedIn={() => router.push('/my')} /></>}
    {session?.demoEnabled && <p className="tiny muted">Demo tip: mobile <span className="mono">9000000000</span> owns a seeded grievance.</p>}
  </div>
}

function Login() {
  const params = useSearchParams()
  const [tab, setTab] = useState<'citizen' | 'officer'>(params.get('tab') === 'officer' ? 'officer' : 'citizen')
  return <div className="stack">
    <Breadcrumb items={[['Home', '/'], ['Login']]} />
    <div className="login-wrap">
      <section className="hero" style={{ minHeight: 360 }}>
        <div className="hero-body">
          <h1>{tab === 'officer' ? 'Officer & Commissioner portal' : 'Citizen sign-in'}</h1>
          <p>{tab === 'officer'
            ? 'Department staff see and act on grievances in their own department. The Commissioner can monitor all departments, reassign cases, set priorities and publish public advisories.'
            : 'Use your mobile number to see the status of everything you have reported, get remarks in your language, and give feedback when the work is done.'}</p>
          <ul className="stack-sm small" style={{ listStyle: 'none', padding: 0, color: '#d4def2' }}>
            <li className="row"><ShieldCheck size={16} />Role-based access: Citizen · Department staff · Commissioner</li>
            <li className="row"><Lock size={16} />Signed, HTTP-only session cookies that expire automatically</li>
            <li className="row"><KeyRound size={16} />OTP verification for citizens and officers</li>
          </ul>
        </div>
      </section>
      <section className="panel">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'citizen'} onClick={() => setTab('citizen')}><User size={16} />Citizen</button>
          <button role="tab" aria-selected={tab === 'officer'} onClick={() => setTab('officer')}><HardHat size={16} />Officer</button>
        </div>
        <div className="panel-body">{tab === 'officer' ? <OfficerLogin /> : <CitizenLogin />}</div>
      </section>
    </div>
    {tab === 'officer' && <Panel title="Notice"><p className="small muted">This portal is for authorised municipal personnel only. Unauthorised access attempts are logged. Contact the system administrator if your account is locked.</p></Panel>}
  </div>
}

export default function LoginPage() {
  return <Suspense fallback={<p role="status">Loading…</p>}><Login /></Suspense>
}
