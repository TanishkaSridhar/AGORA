'use client'

import { useEffect, useState } from 'react'
import { KeyRound, Loader2, MessageSquareText, Smartphone } from 'lucide-react'
import type { AuthSession } from '../lib/model'
import { message, request } from './client'
import { usePortal } from './providers'

type Challenge = { challenge: string; demoOtp?: string; maskedTo: string; expiresInSeconds: number }

/** Citizen mobile verification: request OTP → enter 6 digits → signed-in citizen session. */
export function MobileOtp({ onVerified, initialMobile = '', compact = false }: { onVerified: (session: AuthSession) => void; initialMobile?: string; compact?: boolean }) {
  const { refresh, session } = usePortal()
  const [mobile, setMobile] = useState(initialMobile)
  const [sent, setSent] = useState<Challenge>()
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (!sent) return
    const started = Date.now()
    const timer = window.setInterval(() => setLeft(Math.max(0, sent.expiresInSeconds - Math.round((Date.now() - started) / 1000))), 1000)
    setLeft(sent.expiresInSeconds)
    return () => window.clearInterval(timer)
  }, [sent])

  if (session && !session.otpDisplay) {
    return <p className="alert alert-info small"><Smartphone size={16} />SMS OTP is not enabled on this deployment. {session.googleEnabled ? 'Use Google sign-in instead, or continue' : 'You can continue'} as a guest.</p>
  }

  async function send() {
    setBusy(true); setError('')
    try { setSent(await request<Challenge>('/api/auth/otp', 'POST', { mobile })); setOtp('') }
    catch (error) { setError(message(error)) } finally { setBusy(false) }
  }
  async function verify() {
    if (!sent) return
    setBusy(true); setError('')
    try {
      const verified = await request<AuthSession>('/api/auth/otp/verify', 'POST', { challenge: sent.challenge, otp })
      await refresh()
      onVerified(verified)
    } catch (error) { setError(message(error)) } finally { setBusy(false) }
  }

  return <div className="stack-sm">
    <label><span>Mobile number{!compact && <span className="req-mark" aria-hidden> *</span>}</span>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <span className="badge b-neutral" style={{ padding: '.55rem .5rem' }}>+91</span>
        <input inputMode="numeric" autoComplete="tel-national" maxLength={10} value={mobile} disabled={!!sent}
          onChange={event => setMobile(event.target.value.replace(/\D/g, ''))} placeholder="10-digit mobile number" aria-describedby="mobile-hint" />
        {!sent && <button type="button" onClick={() => void send()} disabled={busy || mobile.length !== 10} className="nowrap">
          {busy ? <Loader2 size={15} className="spin" /> : <MessageSquareText size={15} />}Send OTP</button>}
      </div>
      <span className="hint" id="mobile-hint">A one-time password is sent to verify your number.</span>
    </label>
    {sent && <>
      {sent.demoOtp && <div className="demo-sms" role="status">
        <div className="tiny muted">Demo SMS gateway · message to {sent.maskedTo}</div>
        Your CivicResolve verification code is <strong>{sent.demoOtp}</strong>. Valid for 5 minutes. Do not share it with anyone.
      </div>}
      <label>Enter 6-digit OTP
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, ''))}
            className="mono" style={{ letterSpacing: '.4em', fontSize: '1.1rem' }} autoFocus />
          <button type="button" onClick={() => void verify()} disabled={busy || otp.length !== 6 || left === 0} className="nowrap">
            {busy ? <Loader2 size={15} className="spin" /> : <KeyRound size={15} />}Verify</button>
        </div>
      </label>
      <div className="row between tiny muted">
        <span>{left > 0 ? `OTP expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'OTP expired.'}</span>
        <span className="row"><button type="button" className="btn-link tiny" onClick={() => { setSent(undefined); setOtp('') }}>Change number</button>
          <button type="button" className="btn-link tiny" disabled={busy} onClick={() => void send()}>Resend OTP</button></span>
      </div>
    </>}
    {error && <p role="alert" className="alert alert-danger">{error}</p>}
  </div>
}
