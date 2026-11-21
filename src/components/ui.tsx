'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { BadgeCheck, Bot, Clock } from 'lucide-react'
import { dueAt, escalationLevel, isOverdue, statusNames, type IssueStatus, type IssueSummary } from '@/lib/model'
import { dateLabel, slaText } from './client'

export function Breadcrumb({ items }: { items: [string, string?][] }) {
  return (
    <nav className="breadcrumb no-print" aria-label="Breadcrumb">
      {items.map(([label, href], index) => (
        <span key={label} className="row" style={{ gap: '.35rem' }}>
          {index > 0 && <span aria-hidden>›</span>}
          {href ? <Link href={href}>{label}</Link> : <span aria-current="page">{label}</span>}
        </span>
      ))}
    </nav>
  )
}

export function Panel({
  title,
  actions,
  children,
  className = '',
  bodyClass = '',
}: {
  title: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClass?: string
}) {
  return (
    <section className={'panel ' + className}>
      <div className="panel-head">
        <h2>{title}</h2>
        {actions && <div className="row">{actions}</div>}
      </div>
      <div className={'panel-body ' + bodyClass}>{children}</div>
    </section>
  )
}

const statusClass: Record<IssueStatus, string> = { OPEN: 'b-open', IN_PROGRESS: 'b-progress', RESOLVED: 'b-resolved' }
export function StatusBadge({ status }: { status: IssueStatus }) {
  return <span className={'badge ' + statusClass[status]}>{statusNames[status]}</span>
}

export function Severity({ value }: { value: number }) {
  return (
    <span
      className={'sev' + (value >= 4 ? ' hi' : '')}
      title={`Severity ${value} of 5`}
      aria-label={`Severity ${value} of 5`}
    >
      {[1, 2, 3, 4, 5].map(step => (
        <i key={step} className={step <= value ? 'on' : ''} />
      ))}
      <span className="tiny" style={{ marginLeft: 4, fontWeight: 700 }}>
        {value}/5
      </span>
    </span>
  )
}

export function SlaBadge({ issue }: { issue: IssueSummary }) {
  if (issue.status === 'RESOLVED')
    return (
      <span className="badge b-resolved">
        <BadgeCheck size={12} />
        Closed
      </span>
    )
  const level = escalationLevel(issue)
  return (
    <span
      className={'badge ' + (isOverdue(issue) ? 'b-danger' : 'b-neutral')}
      title={'Due ' + dateLabel(new Date(dueAt(issue)).toISOString())}
    >
      <Clock size={12} />
      {slaText(dueAt(issue))}
      {level ? ` · L${level}` : ''}
    </span>
  )
}

export function Flags({ issue }: { issue: IssueSummary }) {
  return (
    <>
      {issue.resolutionVerification?.verified && (
        <span className="badge b-resolved">
          <BadgeCheck size={12} />
          AI verified fix
        </span>
      )}
      {issue.aiPending && (
        <span className="badge b-ai">
          <Bot size={12} />
          AI review pending
        </span>
      )}
      {issue.duplicateMergeCount > 0 && <span className="badge b-neutral">+{issue.duplicateMergeCount} merged</span>}
      {(issue.reopenCount ?? 0) > 0 && <span className="badge b-danger">Reopened ×{issue.reopenCount}</span>}
    </>
  )
}

/** Four-stage progress bar used on the track page and acknowledgement slip. */
export function StatusTrack({ status }: { status: IssueStatus }) {
  const current = { OPEN: 1, IN_PROGRESS: 2, RESOLVED: 3 }[status]
  const names = ['Received', 'Forwarded to department', 'Action in progress', 'Disposed']
  return (
    <div className="status-track" aria-label={'Current stage: ' + statusNames[status]}>
      {names.map((name, index) => (
        <div key={name} className={index < current || status === 'RESOLVED' ? 'done' : index === current ? 'now' : ''}>
          {name}
        </div>
      ))}
    </div>
  )
}

export function Timeline({ issue, native = true }: { issue: IssueSummary; native?: boolean }) {
  const entries = issue.audit?.length
    ? issue.audit
    : [{ at: issue.createdAt, actor: 'CivicResolve', action: 'Grievance received' }]
  return (
    <ol className="timeline">
      {[...entries].reverse().map((entry, index) => {
        const tone = /Disposed|verified|rated (4|5)/i.test(entry.action)
          ? 'ok'
          : /rejected|Reopened|rated (1|2)/i.test(entry.action)
            ? 'bad'
            : /Reminder|Escalat|keyword/i.test(entry.action)
              ? 'warn'
              : ''
        return (
          <li key={index} className={tone}>
            <div className="when">
              {dateLabel(entry.at)} · {entry.actor.replace(/^AGORA(?= AI$|$)/, 'CivicResolve')}
            </div>
            <div className="what">{entry.action}</div>
            {entry.remarks && (
              <div className="remarks">
                <strong className="tiny">Remarks: </strong>
                {entry.remarks}
                {native && entry.remarksNative && (
                  <div dir="auto" style={{ marginTop: 4 }} className="muted">
                    {entry.remarksNative}
                  </div>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="muted small" style={{ padding: '1.5rem', textAlign: 'center' }}>
      {children}
    </div>
  )
}
