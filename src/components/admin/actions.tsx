'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'
import { AlertTriangle, BadgeCheck, Bell, Bot, Camera, ExternalLink, Loader2, Play, Send, Sparkles, UserPlus, X, XCircle } from 'lucide-react'
import { departments, escalationLevel, escalationNames, type CivicIssue, type IssueSummary } from '../../lib/model'
import { compress, dateLabel, message, request } from '../client'
import type { Session } from '../providers'
import { Flags, Panel, Severity, SlaBadge, StatusBadge, Timeline } from '../ui'

export function canEdit(session: Session, issue: IssueSummary) {
  return session.role === 'SUPER_ADMIN' || (session.role === 'DEPT_STAFF' && session.department === issue.assignedDepartment)
}

function Remarks({ issue, status, value, onChange }: { issue: IssueSummary; status: string; value: string; onChange: (value: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <label>Action taken remarks <span className="hint">Shown to the citizen and auto-translated into {issue.detectedLanguage}.</span>
    <textarea rows={3} maxLength={1000} value={value} onChange={event => onChange(event.target.value)} placeholder="E.g. Site inspected, barricades placed, repair scheduled for tomorrow." />
    <span className="row">
      <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={async () => {
        setBusy(true); setError('')
        try { onChange((await request<{ remarks: string }>(`/api/issues/${issue.id}/suggest`, 'POST', { status })).remarks) }
        catch (error) { setError(message(error)) } finally { setBusy(false) }
      }}>{busy ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}Draft with AI</button>
      {error && <span className="tiny" style={{ color: 'var(--danger)' }}>{error}</span>}
    </span>
  </label>
}

export function CaseDrawer({ id, session, onClose, onSaved }: { id: string; session: Session; onClose: () => void; onSaved: () => void }) {
  const [issue, setIssue] = useState<CivicIssue>()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [remarks, setRemarks] = useState('')
  const [officer, setOfficer] = useState('')
  const admin = session.role === 'SUPER_ADMIN'

  useEffect(() => {
    let active = true
    request<CivicIssue>('/api/issues/' + id).then(result => { if (active) { setIssue(result); setOfficer(result.assignedOfficer ?? '') } }).catch(error => setError(message(error)))
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => { active = false; window.removeEventListener('keydown', close) }
  }, [id, onClose])

  async function act(label: string, body: object | (() => Promise<object>), success: string) {
    setBusy(label); setError(''); setNotice('')
    try {
      const payload = typeof body === 'function' ? await body() : body
      const updated = await request<IssueSummary>(label === 'retriage' ? `/api/issues/${id}/retriage` : '/api/issues/' + id, label === 'retriage' ? 'POST' : 'PATCH', label === 'retriage' ? undefined : payload)
      const full = await request<CivicIssue>('/api/issues/' + id).catch(() => ({ ...issue!, ...updated }))
      setIssue(full); setRemarks('')
      setNotice(updated.resolutionVerification && 'resolutionImageBase64' in payload
        ? updated.resolutionVerification.verified ? 'AI verified the fix. Grievance disposed.' : 'AI rejected the completion photo. The grievance stays in progress.'
        : success)
      onSaved()
    } catch (error) { setError(message(error)) } finally { setBusy('') }
  }

  function priorities(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    void act('priority', { assignedDepartment: data.get('department'), severity: Number(data.get('severity')), estimatedSlaHours: Number(data.get('sla')) }, 'Priorities updated.')
  }
  function resolve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const file = new FormData(event.currentTarget).get('after')
    if (!(file instanceof File) || !file.size) { setError('Attach the After photo.'); return }
    void act('resolve', async () => ({ status: 'RESOLVED', resolutionImageBase64: await compress(file), ...(remarks.trim() ? { remarks: remarks.trim() } : {}) }), 'Submitted for AI verification.')
  }

  const editable = issue && canEdit(session, issue)
  const level = issue ? escalationLevel(issue) : 0
  return <>
    <div className="drawer-backdrop" onClick={onClose} />
    <aside className="drawer" role="dialog" aria-modal="true" aria-label="Grievance details">
      <div className="drawer-head">
        <div><div className="tiny" style={{ color: '#c9d4ea' }}>Grievance</div><h2 className="mono">{issue?.refNo ?? id}</h2></div>
        <div className="row">
          <Link href={'/issues/' + id} className="button btn-sm btn-ghost" target="_blank"><ExternalLink size={14} />Full page</Link>
          <button className="btn-sm" style={{ background: 'transparent', borderColor: '#ffffff55' }} onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
      </div>
      <div className="drawer-body">
        {!issue && !error && <p role="status" className="row"><Loader2 size={16} className="spin" />Loading…</p>}
        {error && <p role="alert" className="alert alert-danger"><AlertTriangle size={16} />{error}</p>}
        {notice && <p role="status" className="alert alert-ok"><BadgeCheck size={16} />{notice}</p>}
        {issue && <>
          <section className="panel"><div className="panel-body">
            <div className="row"><StatusBadge status={issue.status} /><SlaBadge issue={issue} /><Flags issue={issue} />{level > 0 && <span className="badge b-danger">{escalationNames[level]}</span>}</div>
            <h3 style={{ fontSize: '1.1rem' }}>{issue.title}</h3>
            <div className="review"><dl>
              <dt>Department</dt><dd>{issue.assignedDepartment}</dd>
              <dt>Field officer</dt><dd>{issue.assignedOfficer ?? <span className="muted">Not assigned</span>}</dd>
              <dt>Severity</dt><dd><Severity value={issue.aiTriage.severity} /> · AI confidence {Math.round(issue.aiTriage.confidence * 100)}%</dd>
              <dt>Location</dt><dd>{issue.location.address}{issue.location.ward ? ' · ' + issue.location.ward : ''}{issue.location.lat !== undefined && <> · <a href={`https://www.google.com/maps?q=${issue.location.lat},${issue.location.lng}`} target="_blank" rel="noreferrer">Open in Google Maps</a></>}</dd>
              <dt>Complainant</dt><dd>{issue.citizen ? `${issue.citizen.name}${issue.citizen.mobile ? ' · +91 ' + issue.citizen.mobile : ''}` : <span className="muted">Anonymous</span>}</dd>
              <dt>Lodged</dt><dd>{dateLabel(issue.createdAt)} · {issue.detectedLanguage} · {issue.upvotes} supporters</dd>
            </dl></div>
            {issue.aiTriage.cascadingRiskAlert && <div className="alert alert-warn"><AlertTriangle size={16} />{issue.aiTriage.cascadingRiskAlert}</div>}
            <div className="grid g2">
              <div className="stack-sm"><strong className="small">Before</strong>{issue.imageBase64 ? <Image src={issue.imageBase64} alt="Before" width={300} height={200} className="photo" style={{ maxHeight: 180 }} /> : <span className="muted small">No photo</span>}</div>
              <div className="stack-sm"><strong className="small">After</strong>{issue.resolutionImageBase64 ? <Image src={issue.resolutionImageBase64} alt="After" width={300} height={200} className="photo" style={{ maxHeight: 180 }} /> : <span className="muted small">Not yet submitted</span>}</div>
            </div>
            {issue.resolutionVerification && <div className={'alert ' + (issue.resolutionVerification.verified ? 'alert-ok' : 'alert-danger')}>
              {issue.resolutionVerification.verified ? <BadgeCheck size={16} /> : <XCircle size={16} />}
              <div><strong>{issue.resolutionVerification.verified ? 'AI verified' : 'AI rejected'} ({Math.round(issue.resolutionVerification.confidence * 100)}%). </strong>{issue.resolutionVerification.notes}</div></div>}
            <details><summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>Complaint text & AI work order</summary>
              <div className="stack-sm small" style={{ marginTop: '.5rem' }}>
                <p dir="auto"><strong>Original ({issue.detectedLanguage}): </strong>{issue.originalDescription}</p>
                <p><strong>English: </strong>{issue.translatedDescription}</p>
                <p><strong>Work order: </strong>{issue.aiTriage.recommendedAction}</p>
              </div>
            </details>
            {issue.feedback && <p className="small"><strong>Citizen rating:</strong> {'★'.repeat(issue.feedback.rating)}{'☆'.repeat(5 - issue.feedback.rating)}{issue.feedback.comment ? ' · ' + issue.feedback.comment : ''}</p>}
          </div></section>

          {!editable && <p className="alert alert-info small">This grievance belongs to another department. You can view it but not act on it.</p>}

          {editable && issue.status !== 'RESOLVED' && <Panel title="Take action">
            <form className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }} onSubmit={event => { event.preventDefault(); if (officer.trim()) void act('officer', { assignedOfficer: officer.trim() }, 'Field officer assigned.') }}>
              <label style={{ flex: 1 }}>Assign field officer / crew<input value={officer} onChange={event => setOfficer(event.target.value)} maxLength={100} placeholder="E.g. JE Anil P. (Ward 62 crew)" /></label>
              <button className="btn-ghost" disabled={!!busy || !officer.trim() || officer === issue.assignedOfficer}><UserPlus size={15} />Assign</button>
            </form>
            <hr className="hr" />
            <Remarks issue={issue} status={issue.status === 'OPEN' ? 'IN_PROGRESS' : 'RESOLVED'} value={remarks} onChange={setRemarks} />
            {issue.status === 'OPEN' && <div className="row">
              <button disabled={!!busy} onClick={() => void act('start', { status: 'IN_PROGRESS', ...(remarks.trim() ? { remarks: remarks.trim() } : {}) }, 'Marked as action in progress.')}>
                {busy === 'start' ? <Loader2 size={15} className="spin" /> : <Play size={15} />}Start work</button>
              <button className="btn-ghost" disabled={!!busy || !remarks.trim()} onClick={() => void act('remarks', { remarks: remarks.trim() }, 'Remarks recorded.')}><Send size={15} />Save remarks only</button>
            </div>}
            {issue.status === 'IN_PROGRESS' && <form className="stack-sm" onSubmit={resolve}>
              <label className="upload" style={{ position: 'relative' }}><span className="row" style={{ justifyContent: 'center' }}><Camera size={18} />Completion (After) photo</span>
                <span className="hint">AI compares it with the original photo before the grievance can be disposed.</span>
                <input type="file" name="after" accept="image/*" capture="environment" /></label>
              <div className="row">
                <button className="btn-saffron" disabled={!!busy}>{busy === 'resolve' ? <Loader2 size={15} className="spin" /> : <BadgeCheck size={15} />}{busy === 'resolve' ? 'AI is verifying…' : 'Verify & dispose'}</button>
                <button type="button" className="btn-ghost" disabled={!!busy || !remarks.trim()} onClick={() => void act('remarks', { remarks: remarks.trim() }, 'Remarks recorded.')}><Send size={15} />Save remarks only</button>
              </div>
            </form>}
          </Panel>}

          {admin && <Panel title="Commissioner controls">
            <form className="grid g2" onSubmit={priorities} key={issue.assignedDepartment + issue.aiTriage.severity + issue.aiTriage.estimatedSlaHours}>
              <label>Forward to department<select name="department" defaultValue={issue.assignedDepartment}>{departments.map(item => <option key={item}>{item}</option>)}</select></label>
              <label>Severity (1–5)<select name="severity" defaultValue={issue.aiTriage.severity}>{[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
              <label>Service level (hours)<input name="sla" type="number" min={1} max={8760} required defaultValue={issue.aiTriage.estimatedSlaHours} /></label>
              <div className="row" style={{ alignSelf: 'end' }}><button className="btn-ghost" disabled={!!busy}>Save priorities</button></div>
            </form>
            <div className="row">
              {issue.status !== 'RESOLVED' && <button className="btn-ghost" disabled={!!busy} onClick={() => void act('reminder', { reminder: true }, 'Reminder sent to the department.')}><Bell size={15} />Send reminder{issue.remindersSent ? ` (${issue.remindersSent} sent)` : ''}</button>}
              {issue.aiPending && <button className="btn-ghost" disabled={!!busy} onClick={() => void act('retriage', {}, 'AI re-triage complete.')}>{busy === 'retriage' ? <Loader2 size={15} className="spin" /> : <Bot size={15} />}Re-run AI triage</button>}
            </div>
          </Panel>}
          {!admin && editable && issue.aiPending && <button className="btn-ghost" disabled={!!busy} onClick={() => void act('retriage', {}, 'AI re-triage complete.')}><Bot size={15} />Re-run AI triage</button>}

          <Panel title="Action history"><Timeline issue={issue} native={false} /></Panel>
        </>}
      </div>
    </aside>
  </>
}
