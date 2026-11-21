'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { HardHat, Landmark, ShieldCheck } from 'lucide-react'
import { message, request } from '../../components/client'
import type { AuthSession } from '../../lib/model'

const demos = [
  { id: 'admin', title: 'Municipal Commissioner', scope: 'All departments and priority controls', Icon: Landmark },
  { id: 'roads', title: 'Roads Field Engineer', scope: 'Roads & Infrastructure', Icon: HardHat },
  { id: 'sanitation', title: 'Sanitation Field Officer', scope: 'Sanitation & Solid Waste', Icon: ShieldCheck },
]

export default function Login() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [demo, setDemo] = useState(false)
  useEffect(() => {
    request<{ demoEnabled: boolean }>('/api/auth/session').then(result => setDemo(result.demoEnabled)).catch(error => setError(message(error)))
  }, [])

  async function login(body: object) {
    setBusy(true); setError('')
    try { await request<AuthSession>('/api/auth/login', 'POST', body); router.push('/dashboard') }
    catch (error) { setError(message(error)); setBusy(false) }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    void login({ email: data.get('email'), password: data.get('password') })
  }

  return <div className="grid split">
    <section className="intro"><h1>Municipal staff portal</h1><p>Review assigned reports, coordinate field work, and submit completion evidence.</p><Link className="underline" href="/dashboard">Open the public dashboard</Link></section>
    <div className="stack">
      <form className="card stack" onSubmit={submit}>
        <h2>Sign in</h2>
        <label>Municipal email<input name="email" type="email" autoComplete="username" maxLength={250} required/></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" maxLength={500} required/></label>
        <button disabled={busy}>Sign in</button>
        {error && <p role="alert" className="alert error">{error}</p>}
      </form>
      {demo && <section className="card stack"><h2>Judge demo access</h2>
        {demos.map(({ id, title, scope, Icon }) => <button className="secondary justify-start text-left" key={id} disabled={busy} onClick={() => void login({ demo: id })}>
          <Icon size={20}/><span>{title}<span className="block small muted font-normal">{scope}</span></span></button>)}
      </section>}
    </div>
  </div>
}
