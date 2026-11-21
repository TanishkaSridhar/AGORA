'use client'

import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'
import { AlertTriangle, BadgeCheck, Clock, LockKeyhole, MapPin, ThumbsUp } from 'lucide-react'
import Escalation from '../../components/escalation'
import { compress, dateLabel, message, request } from '../../components/client'
import { departments, isOverdue, statuses, type AuthSession, type IssueSummary } from '../../lib/model'

type Session = AuthSession & { demoEnabled: boolean }
const statusNames = { OPEN: 'Open', IN_PROGRESS: 'In progress', RESOLVED: 'Resolved' }

function Ticket({ issue, session, refresh }: { issue: IssueSummary; session: Session; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [voted, setVoted] = useState(false)
  const admin = session.role === 'SUPER_ADMIN'
  const edit = admin || session.role === 'DEPT_STAFF' && session.department === issue.assignedDepartment
  const path = '/api/issues/' + issue.id

  async function perform(action: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { await action(); await refresh() }
    catch (error) { setError(message(error)) }
    finally { setBusy(false) }
  }

  function override(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    void perform(() => request(path, 'PATCH', {
      assignedDepartment: data.get('department'), severity: Number(data.get('severity')), estimatedSlaHours: Number(data.get('sla')),
    }))
  }

  function resolve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const file = data.get('after')
    if (!(file instanceof File) || !file.size) return
    void perform(async () => request(path, 'PATCH', { status: 'RESOLVED', resolutionImageBase64: await compress(file) }))
  }

  return <article className={'card ticket stack' + (issue.aiTriage.severity >= 4 ? ' high' : '')}>
    <div className="row justify-between">
      <span className="badge">{statusNames[issue.status]}</span>
      <span className="small muted">{issue.assignedDepartment}</span>
    </div>
    <div><h3><Link href={'/issues/' + issue.id}>{issue.title}</Link></h3>
      <p className="row muted small"><MapPin size={15}/>{issue.location.address} <span>· {dateLabel(issue.createdAt)}</span></p></div>
    <p>{issue.aiTriage.hazardSummary}</p>
    <div className="row small">
      <span className="badge">Severity {issue.aiTriage.severity}/5</span>
      <span className="row"><Clock size={16}/>{issue.aiTriage.estimatedSlaHours}h SLA</span>
      {isOverdue(issue) && <span className="badge">SLA breached</span>}
      {issue.resolutionVerification?.verified && <span className="badge"><BadgeCheck size={16}/>AI Verified Fix</span>}
    </div>
    {issue.aiTriage.cascadingRiskAlert && <p className="alert"><AlertTriangle className="inline mr-2" size={17}/>{issue.aiTriage.cascadingRiskAlert}</p>}
    {issue.resolutionVerification && !issue.resolutionVerification.verified && <p className="alert">After photo requires another review. {issue.resolutionVerification.notes}</p>}
    <div className="row">
      <button className="secondary" disabled={busy || voted} onClick={() => void perform(async () => { await request(path, 'PATCH', { upvote: true }); setVoted(true) })}><ThumbsUp size={16}/>{issue.upvotes} {voted ? '· Voted' : '· Upvote'}</button>
      {isOverdue(issue) && <Escalation id={issue.id} preferred={issue.detectedLanguage}/>}
      {edit && issue.status === 'OPEN' && <button disabled={busy} onClick={() => void perform(() => request(path, 'PATCH', { status: 'IN_PROGRESS' }))}>Start work</button>}
      {!edit && session.role === 'DEPT_STAFF' && <span className="badge"><LockKeyhole size={15}/>Department restricted</span>}
    </div>
    {edit && issue.status === 'IN_PROGRESS' && <form className="stack" onSubmit={resolve}>
      <label>After photo<input type="file" name="after" accept="image/*" capture="environment" required/></label>
      <button disabled={busy}>{busy ? 'Working…' : 'Verify and resolve'}</button>
    </form>}
    {admin && <form className="grid two" onSubmit={override} key={issue.assignedDepartment + issue.aiTriage.severity + ':' + issue.aiTriage.estimatedSlaHours}>
      <label>Reassign department<select name="department" defaultValue={issue.assignedDepartment}>{departments.map(item => <option key={item}>{item}</option>)}</select></label>
      <label>Override severity<input name="severity" type="number" min={1} max={5} required defaultValue={issue.aiTriage.severity}/></label>
      <label>Response SLA (hours)<input name="sla" type="number" min={1} max={8760} required defaultValue={issue.aiTriage.estimatedSlaHours}/></label>
      <button className="self-end" disabled={busy}>Save priorities</button>
    </form>}
    {error && <p role="alert" className="alert error">{error}</p>}
  </article>
}

export default function Dashboard() {
  const [session, setSession] = useState<Session>()
  const [issues, setIssues] = useState<IssueSummary[]>([])
  const [department, setDepartment] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function refresh() { setIssues(await request<IssueSummary[]>('/api/issues')) }
  useEffect(() => {
    Promise.all([request<Session>('/api/auth/session'), request<IssueSummary[]>('/api/issues')])
      .then(([user, tickets]) => { setSession(user); setIssues(tickets) }).catch(error => setError(message(error)))
  }, [])

  async function perform(action: () => Promise<void>) {
    setBusy(true); setError('')
    try { await action() } catch (error) { setError(message(error)) } finally { setBusy(false) }
  }

  useEffect(() => {
    if (!session) return
    let active = true
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      request<IssueSummary[]>('/api/issues')
        .then(tickets => { if (active) setIssues(tickets) })
        .catch(() => { /* The manual refresh reports request errors. */ })
    }, 30_000)
    return () => { active = false; window.clearInterval(interval) }
  }, [session])

  const filtered = issues.filter(issue => (!department || issue.assignedDepartment === department) && (!status || issue.status === status))
  const metrics: [string, number][] = [
    ['Total civic reports', issues.reduce((sum, issue) => sum + 1 + issue.duplicateMergeCount, 0)],
    ['Duplicates prevented', issues.reduce((sum, issue) => sum + issue.duplicateMergeCount, 0)],
    ['High / critical open hazards', issues.filter(issue => issue.status !== 'RESOLVED' && issue.aiTriage.severity >= 4).length],
    ['AI-verified resolutions', issues.filter(issue => issue.resolutionVerification?.verified && issue.status === 'RESOLVED').length],
  ]

  return <div className="stack">
    <header className="stack"><div className="row justify-between">
      <span className="badge">{session?.role === 'SUPER_ADMIN' ? 'Super Admin · Municipal Commissioner' : session?.role === 'DEPT_STAFF' ? 'Department Staff · ' + session.department : 'Public Citizen View'}</span>
      <div className="row"><Link href="/login" className="underline">{session?.role && session.role !== 'CITIZEN' ? 'Switch role' : 'Staff sign-in'}</Link>
        {session && session.role !== 'CITIZEN' && <button className="secondary" disabled={busy} onClick={() => void perform(async () => {
          await request('/api/auth/logout', 'POST')
          setSession(await request<Session>('/api/auth/session')); setDepartment(''); await refresh()
        })}>Log out</button>}</div>
    </div><h1>AGORA dashboard</h1></header>
    {error && <p role="alert" className="alert error">{error}</p>}
    <section className="grid kpis" aria-label="Report statistics">{metrics.map(([label, value]) => <div className="card kpi" key={label}><strong>{value}</strong><span className="muted small">{label}</span></div>)}</section>
    <div className="card row justify-between">
      <div className="row">
        {session?.role !== 'DEPT_STAFF' && <label className="small">Department<select value={department} onChange={event => setDepartment(event.target.value)}><option value="">All departments</option>{departments.map(item => <option key={item}>{item}</option>)}</select></label>}
        <label className="small">Status<select value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map(item => <option value={item} key={item}>{statusNames[item]}</option>)}</select></label>
      </div>
      <div className="row">
        <button className="secondary" disabled={busy} onClick={() => void perform(refresh)}>Refresh</button>
        {session?.demoEnabled && session.role !== 'DEPT_STAFF' && <button className="secondary" disabled={busy} onClick={() => void perform(async () => { await request('/api/issues/seed', 'POST'); await refresh() })}>Load demo reports</button>}
      </div>
    </div>
    <section className="ticket-list" aria-label="Civic tickets">{session ? filtered.length ?
      filtered.map(issue => <Ticket issue={issue} key={issue.id} session={session} refresh={refresh}/>) :
      <p className="card">No reports match this view.</p> : !error && <p role="status">Loading reports…</p>}</section>
  </div>
}
