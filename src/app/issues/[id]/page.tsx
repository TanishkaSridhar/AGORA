'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { BadgeCheck, MapPin } from 'lucide-react'
import Escalation from '../../../components/escalation'
import { dateLabel, message, request } from '../../../components/client'
import { isOverdue, type CivicIssue } from '../../../lib/model'

export default function IssueDetail() {
  const { id } = useParams<{ id: string }>()
  const [issue, setIssue] = useState<CivicIssue>()
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    request<CivicIssue>('/api/issues/' + encodeURIComponent(id))
      .then(result => { if (active) setIssue(result) })
      .catch(error => { if (active) setError(message(error)) })
    return () => { active = false }
  }, [id])

  if (error) return <div className="stack"><Link className="underline" href="/dashboard">Civic dashboard</Link><p role="alert" className="alert error">{error}</p></div>
  if (!issue || issue.id !== id) return <p role="status">Loading the report…</p>
  const verification = issue.resolutionVerification
  return <div className="stack">
    <Link className="underline" href="/dashboard">Civic dashboard</Link>
    <header className="stack">
      <div className="row"><span className="badge">{issue.status.replace('_', ' ')}</span><span className="badge">Severity {issue.aiTriage.severity}/5</span>
        {verification?.verified && <span className="badge"><BadgeCheck size={17}/>AI Verified Fix</span>}</div>
      <h1>{issue.title}</h1>
      <p className="row muted"><MapPin size={17}/>{issue.location.address} · {issue.assignedDepartment}</p>
      <p className="small muted">Ticket #{issue.id} · Reported {dateLabel(issue.createdAt)} · {issue.aiTriage.estimatedSlaHours}h SLA</p>
      {isOverdue(issue) && <div className="row"><Escalation id={id} preferred={issue.detectedLanguage}/></div>}
    </header>
    {issue.aiTriage.cascadingRiskAlert && <p className="alert">{issue.aiTriage.cascadingRiskAlert}</p>}
    <section className="card stack"><h2>Photo evidence</h2>
      <div className="grid two">
        <div className="stack"><h3>Before</h3>{issue.imageBase64 ? <Image className="photo" src={issue.imageBase64} width={640} height={400} alt="Original photo of the reported hazard"/> : <p className="muted">No original photo available.</p>}</div>
        <div className="stack"><h3>After</h3>{issue.resolutionImageBase64 ? <Image className="photo" src={issue.resolutionImageBase64} width={640} height={400} alt="Completion evidence submitted by municipal staff"/> : <p className="muted">Awaiting completion evidence.</p>}</div>
      </div>
      {verification && <p><strong>{verification.verified ? 'Verified' : 'Verification failed'} · {Math.round(verification.confidence * 100)}%</strong> {verification.notes}</p>}
      {issue.corroboratingImages.length > 0 && <><h3>Corroborating photos</h3><div className="grid two">
        {issue.corroboratingImages.map((photo, index) => <Image key={index} className="photo" src={photo} width={440} height={280} alt={'Corroborating evidence ' + (index + 1)}/>)}
      </div></>}
    </section>
    <div className="grid two">
      <section className="card stack"><h2>Citizen report</h2><span className="muted">{issue.detectedLanguage}</span><p dir="auto">{issue.originalDescription}</p><p dir="auto">{issue.aiTriage.citizenReplyNative}</p><p>{issue.upvotes} upvotes · {issue.duplicateMergeCount} merged reports</p></section>
      <section className="card stack"><h2>Municipal work order</h2><p>{issue.translatedDescription}</p><p>{issue.aiTriage.recommendedAction}</p></section>
    </div>
    <section className="card stack"><h2>Audit trail</h2>
      <p>Report filed · {dateLabel(issue.createdAt)}</p>
      {issue.audit?.map((entry, index) => <p key={index}>{entry.action} · {entry.actor} · {dateLabel(entry.at)}</p>)}
      {issue.handledBy && <p className="small muted">Last handled by {issue.handledBy}</p>}
    </section>
  </div>
}
