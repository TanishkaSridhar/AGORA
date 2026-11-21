'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { AlertTriangle, BadgeCheck, MapPin, RotateCcw, Star, ThumbsUp, XCircle } from 'lucide-react'
import { dueAt, escalationLevel, escalationNames, isOverdue, type CivicIssue } from '../lib/model'
import { dateLabel, message, request } from './client'
import Escalation from './escalation'
import { usePortal } from './providers'
import { Flags, Panel, Severity, SlaBadge, StatusBadge, StatusTrack, Timeline } from './ui'

export function Feedback({ issue, onChange }: { issue: CivicIssue; onChange: (issue: CivicIssue) => void }) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [reason, setReason] = useState('')
  const [mode, setMode] = useState<'rate' | 'reopen'>('rate')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function send(body: object) {
    setBusy(true); setError('')
    try { const updated = await request<CivicIssue>('/api/issues/' + issue.id, 'PATCH', body); onChange({ ...issue, ...updated }) }
    catch (error) { setError(message(error)) } finally { setBusy(false) }
  }
  if (issue.feedback) return <div className="alert alert-ok"><Star size={16} />You rated this resolution {issue.feedback.rating}/5. Thank you for your feedback.</div>
  return <Panel title="Your feedback on the resolution">
    <div className="tabs" role="tablist">
      <button role="tab" aria-selected={mode === 'rate'} onClick={() => setMode('rate')}>Rate the work</button>
      <button role="tab" aria-selected={mode === 'reopen'} onClick={() => setMode('reopen')}>Not resolved? Reopen</button>
    </div>
    {mode === 'rate' ? <>
      <div className="stars" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map(value => <button key={value} role="radio" aria-checked={rating === value} className={value <= rating ? 'on' : ''} onClick={() => setRating(value)} aria-label={value + ' stars'}>
          <Star size={26} fill={value <= rating ? 'currentColor' : 'none'} /></button>)}
      </div>
      <label>Comments (optional)<textarea rows={2} maxLength={500} value={comment} onChange={event => setComment(event.target.value)} /></label>
      <div className="row"><button disabled={busy || !rating} onClick={() => void send({ feedback: { rating, ...(comment.trim() ? { comment: comment.trim() } : {}) } })}>Submit feedback</button></div>
    </> : <>
      <label><span>Why is the problem not resolved?<span className="req-mark" aria-hidden> *</span></span><textarea rows={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
      <div className="row"><button className="btn-danger" disabled={busy || reason.trim().length < 3} onClick={() => void send({ reopen: { reason: reason.trim() } })}><RotateCcw size={16} />Reopen grievance</button></div>
    </>}
    {error && <p role="alert" className="alert alert-danger">{error}</p>}
  </Panel>
}

export function GrievanceView({ issue, onChange }: { issue: CivicIssue; onChange: (issue: CivicIssue) => void }) {
  const { session } = usePortal()
  const [voted, setVoted] = useState(false)
  const verification = issue.resolutionVerification
  const owner = !!session?.mobile && issue.citizen?.mobile === session.mobile
  const level = escalationLevel(issue)
  return <div className="stack">
    <section className="panel">
      <div className="panel-head">
        <div><div className="tiny muted">Registration number</div><div className="refno mono" style={{ fontSize: '1.3rem' }}>{issue.refNo ?? issue.id}</div></div>
        <div className="row"><StatusBadge status={issue.status} /><SlaBadge issue={issue} /><Flags issue={issue} /></div>
      </div>
      <div className="panel-body">
        <h1 style={{ fontSize: '1.4rem' }}>{issue.title}</h1>
        <StatusTrack status={issue.status} />
        <div className="review"><dl>
          <dt>Department</dt><dd>{issue.assignedDepartment}{issue.assignedOfficer ? ' · ' + issue.assignedOfficer : ''}</dd>
          <dt>Location</dt><dd><MapPin size={14} style={{ display: 'inline', verticalAlign: -2 }} /> {issue.location.address}{issue.location.ward ? ' · ' + issue.location.ward : ''}</dd>
          <dt>Lodged on</dt><dd>{dateLabel(issue.createdAt)}{issue.citizen ? ' by ' + issue.citizen.name : ''}</dd>
          <dt>Severity</dt><dd><Severity value={issue.aiTriage.severity} /> · {issue.aiTriage.urgencyLabel}</dd>
          <dt>Action due by</dt><dd>{dateLabel(new Date(dueAt(issue)).toISOString())} ({issue.aiTriage.estimatedSlaHours} h)</dd>
          {level > 0 && <><dt>Escalated to</dt><dd><span className="badge b-danger">{escalationNames[level]}</span></dd></>}
          <dt>Public support</dt><dd>{issue.upvotes} citizens affected · {issue.duplicateMergeCount} duplicate reports merged</dd>
        </dl></div>
        {issue.aiTriage.cascadingRiskAlert && <div className="alert alert-warn"><AlertTriangle size={16} /><div><strong>Safety advisory: </strong>{issue.aiTriage.cascadingRiskAlert}</div></div>}
        <div className="row no-print">
          {issue.status !== 'RESOLVED' && <button className="btn-ghost" disabled={voted} onClick={async () => {
            try { const updated = await request<CivicIssue>('/api/issues/' + issue.id, 'PATCH', { upvote: true }); setVoted(true); onChange({ ...issue, ...updated }) } catch { /* ignore */ }
          }}><ThumbsUp size={16} />{voted ? 'Support recorded' : 'I am also affected'}</button>}
          {isOverdue(issue) && <Escalation id={issue.id} preferred={issue.detectedLanguage} />}
        </div>
      </div>
    </section>

    {owner && issue.status === 'RESOLVED' && <Feedback issue={issue} onChange={onChange} />}

    <div className="grid g2">
      <Panel title="Grievance as lodged">
        <span className="badge b-neutral" style={{ justifySelf: 'start' }}>{issue.detectedLanguage}</span>
        <p dir="auto">{issue.originalDescription}</p>
        {issue.originalDescription !== issue.translatedDescription && <p className="small muted"><strong>English: </strong>{issue.translatedDescription}</p>}
        <div className="alert alert-info small" dir="auto">{issue.aiTriage.citizenReplyNative}</div>
      </Panel>
      <Panel title="Department work order">
        <p className="small"><strong>Category: </strong>{issue.aiTriage.category}</p>
        <p>{issue.aiTriage.recommendedAction}</p>
        <p className="small muted">{issue.aiTriage.hazardSummary}</p>
      </Panel>
    </div>

    <Panel title="Photo evidence">
      <div className="grid g2">
        <div className="stack-sm"><h3>Before</h3>{issue.imageBase64 ? <Image className="photo" src={issue.imageBase64} width={640} height={400} alt="Photo of the reported problem" /> : <p className="muted small">No photo available.</p>}</div>
        <div className="stack-sm"><h3>After</h3>{issue.resolutionImageBase64 ? <Image className="photo" src={issue.resolutionImageBase64} width={640} height={400} alt="Completion photo submitted by the department" /> : <p className="muted small">Awaiting completion photo.</p>}</div>
      </div>
      {verification && <div className={'alert ' + (verification.verified ? 'alert-ok' : 'alert-danger')}>
        {verification.verified ? <BadgeCheck size={18} /> : <XCircle size={18} />}
        <div><strong>{verification.verified ? 'AI verified the fix' : 'AI did not accept the completion photo'} · {Math.round(verification.confidence * 100)}% confidence. </strong>{verification.notes}</div>
      </div>}
      {issue.corroboratingImages.length > 0 && <><h3>Photos from other citizens ({issue.corroboratingImages.length})</h3><div className="grid g3">
        {issue.corroboratingImages.map((photo, index) => <Image key={index} className="photo" src={photo} width={440} height={280} alt={'Supporting photo ' + (index + 1)} />)}
      </div></>}
    </Panel>

    <Panel title="Action history">
      <Timeline issue={issue} />
      {issue.status !== 'RESOLVED' && !owner && session?.role === 'CITIZEN' && <p className="tiny muted">Lodged this grievance? <Link href="/login?tab=citizen">Sign in with the same mobile number</Link> to rate or reopen it after disposal.</p>}
    </Panel>
  </div>
}
