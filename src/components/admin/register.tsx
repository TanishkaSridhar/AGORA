'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Download, Loader2, X } from 'lucide-react'
import { departments, dueAt, escalationLevel, isOverdue, languages, statusNames, statuses, type IssueSummary } from '../../lib/model'
import { shortDept } from '../../lib/stats'
import { dateLabel, message, request } from '../client'
import type { Session } from '../providers'
import { Empty, Flags, Severity, SlaBadge, StatusBadge } from '../ui'

type Sort = 'priority' | 'createdAt' | 'due' | 'severity' | 'upvotes'
export type RegisterFilter = { status?: string; sla?: string; aiPending?: boolean; severity?: string }
const pageSize = 15

/** Priority score used for default ordering: overdue and escalated first, then severity, then public support. */
export const priority = (issue: IssueSummary) => (issue.status === 'RESOLVED' ? -100 : 0) + escalationLevel(issue) * 20 + (isOverdue(issue) ? 15 : 0)
  + issue.aiTriage.severity * 5 + Math.min(issue.upvotes, 20) * 0.5

export function Register({ issues, session, open, refresh, initial = {} }: {
  issues: IssueSummary[]; session: Session; open: (id: string) => void; refresh: () => Promise<void>; initial?: RegisterFilter
}) {
  const admin = session.role === 'SUPER_ADMIN'
  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState('')
  const [status, setStatus] = useState(initial.status ?? '')
  const [severity, setSeverity] = useState(initial.severity ?? '')
  const [sla, setSla] = useState(initial.sla ?? '')
  const [language, setLanguage] = useState('')
  const [aiPending, setAiPending] = useState(!!initial.aiPending)
  const [sort, setSort] = useState<Sort>('priority')
  const [descending, setDescending] = useState(true)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulk, setBulk] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState('')

  const filtered = useMemo(() => {
    const now = Date.now()
    const text = query.trim().toLowerCase()
    const list = issues.filter(issue => (!text || [issue.refNo, issue.title, issue.location.address, issue.location.ward, issue.assignedOfficer, issue.citizen?.name, issue.citizen?.mobile]
      .some(value => value?.toLowerCase().includes(text)))
      && (!department || issue.assignedDepartment === department) && (!status || issue.status === status)
      && (!severity || issue.aiTriage.severity >= Number(severity)) && (!language || issue.detectedLanguage === language)
      && (!aiPending || issue.aiPending)
      && (!sla || (sla === 'overdue' ? isOverdue(issue, now) : sla === 'due24' ? issue.status !== 'RESOLVED' && !isOverdue(issue, now) && dueAt(issue) - now < 86_400_000
        : sla === 'escalated' ? escalationLevel(issue, now) > 0 : true)))
    const key: Record<Sort, (issue: IssueSummary) => number> = {
      priority, createdAt: issue => Date.parse(issue.createdAt), due: issue => -dueAt(issue), severity: issue => issue.aiTriage.severity, upvotes: issue => issue.upvotes,
    }
    return list.sort((a, b) => (key[sort](b) - key[sort](a)) * (descending ? 1 : -1))
  }, [issues, query, department, status, severity, language, aiPending, sla, sort, descending])
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const shown = filtered.slice(page * pageSize, page * pageSize + pageSize)
  const header = (label: string, key: Sort) => <button onClick={() => { if (sort === key) setDescending(value => !value); else { setSort(key); setDescending(true) } setPage(0) }}>
    {label}{sort === key && (descending ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}</button>

  async function applyBulk() {
    const ids = [...selected]
    if (!bulk || !ids.length) return
    const [kind, value] = bulk.split(':')
    const body = kind === 'dept' ? { assignedDepartment: value } : kind === 'sev' ? { severity: Number(value) } : { reminder: true }
    setBusy(true); setResult('')
    const outcomes = await Promise.allSettled(ids.map(id => request('/api/issues/' + id, 'PATCH', body)))
    const failed = outcomes.filter(outcome => outcome.status === 'rejected') as PromiseRejectedResult[]
    setResult(`${ids.length - failed.length} of ${ids.length} updated.` + (failed.length ? ' ' + message(failed[0].reason) : ''))
    setSelected(new Set()); setBulk('')
    await refresh(); setBusy(false)
  }

  const reset = () => { setQuery(''); setDepartment(''); setStatus(''); setSeverity(''); setSla(''); setLanguage(''); setAiPending(false); setPage(0) }
  const active = [query, department, status, severity, sla, language].some(Boolean) || aiPending

  return <div className="stack">
    <div className="panel"><div className="panel-body">
      <div className="filters">
        <label>Search<input value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} placeholder="Reg. no., title, ward, officer, mobile" /></label>
        {admin && <label>Department<select value={department} onChange={event => { setDepartment(event.target.value); setPage(0) }}><option value="">All</option>{departments.map(item => <option key={item}>{item}</option>)}</select></label>}
        <label>Status<select value={status} onChange={event => { setStatus(event.target.value); setPage(0) }}><option value="">All</option>{statuses.map(item => <option key={item} value={item}>{statusNames[item]}</option>)}</select></label>
        <label>Severity<select value={severity} onChange={event => { setSeverity(event.target.value); setPage(0) }}><option value="">Any</option><option value="4">High & critical (4+)</option><option value="5">Critical only</option><option value="3">3 and above</option></select></label>
        <label>Service level<select value={sla} onChange={event => { setSla(event.target.value); setPage(0) }}><option value="">Any</option><option value="overdue">Beyond SLA</option><option value="escalated">Escalated (L1–L3)</option><option value="due24">Due in 24 h</option></select></label>
        <label>Language<select value={language} onChange={event => { setLanguage(event.target.value); setPage(0) }}><option value="">Any</option>{Object.keys(languages).map(item => <option key={item}>{item}</option>)}</select></label>
      </div>
      <div className="row between">
        <div className="row small">
          <label className="check" style={{ fontSize: '.84rem' }}><input type="checkbox" checked={aiPending} onChange={event => { setAiPending(event.target.checked); setPage(0) }} />AI review pending only</label>
          {active && <button className="btn-link small" onClick={reset}><X size={13} />Clear filters</button>}
        </div>
        <div className="row"><span className="small muted">{filtered.length} of {issues.length} grievances</span>
          <a className="button btn-ghost btn-sm" href="/api/admin/export"><Download size={14} />Export CSV</a></div>
      </div>
    </div></div>

    {result && <p role="status" className="alert alert-info">{result}</p>}
    {!filtered.length ? <div className="panel"><Empty>No grievances match these filters.</Empty></div> : <div className="table-wrap">
      <table className="data">
        <thead><tr>
          {admin && <th><input type="checkbox" aria-label="Select all on page" checked={shown.every(issue => selected.has(issue.id))}
            onChange={event => setSelected(current => { const next = new Set(current); shown.forEach(issue => event.target.checked ? next.add(issue.id) : next.delete(issue.id)); return next })} /></th>}
          <th>{header('Reg. no. / lodged', 'createdAt')}</th><th>Subject & area</th>{admin && <th>Dept.</th>}
          <th>{header('Severity', 'severity')}</th><th>Status</th><th>{header('Service level', 'due')}</th><th>Officer</th><th className="num">{header('Support', 'upvotes')}</th>
        </tr></thead>
        <tbody>{shown.map(issue => <tr key={issue.id} className={selected.has(issue.id) ? 'selected' : ''} style={{ cursor: 'pointer' }} onClick={() => open(issue.id)}>
          {admin && <td onClick={event => event.stopPropagation()}><input type="checkbox" aria-label={'Select ' + (issue.refNo ?? issue.id)} checked={selected.has(issue.id)}
            onChange={event => setSelected(current => { const next = new Set(current); if (event.target.checked) next.add(issue.id); else next.delete(issue.id); return next })} /></td>}
          <td className="nowrap"><button className="btn-link mono small" onClick={event => { event.stopPropagation(); open(issue.id) }}>{issue.refNo ?? issue.id.slice(0, 8)}</button><div className="tiny muted">{dateLabel(issue.createdAt)}</div></td>
          <td style={{ minWidth: 180 }}><strong className="small">{issue.title}</strong><div className="tiny muted">{issue.location.ward ?? issue.location.address} · {issue.detectedLanguage}</div><div className="row" style={{ marginTop: 3, gap: '.3rem' }}><Flags issue={issue} /></div></td>
          {admin && <td className="small">{shortDept(issue.assignedDepartment)}</td>}
          <td><Severity value={issue.aiTriage.severity} /></td>
          <td><StatusBadge status={issue.status} /></td>
          <td><SlaBadge issue={issue} /></td>
          <td className="small">{issue.assignedOfficer ?? <span className="muted">—</span>}</td>
          <td className="num">{issue.upvotes}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    <div className="pager">
      <span>Page {page + 1} of {pages}</span>
      <div className="row"><button className="btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage(value => value - 1)}>‹ Previous</button>
        <button className="btn-ghost btn-sm" disabled={page >= pages - 1} onClick={() => setPage(value => value + 1)}>Next ›</button></div>
    </div>
    {admin && selected.size > 0 && <div className="bulkbar" role="region" aria-label="Bulk actions">
      <strong className="small">{selected.size} selected</strong>
      <select value={bulk} onChange={event => setBulk(event.target.value)} aria-label="Bulk action">
        <option value="">Choose bulk action…</option>
        <optgroup label="Forward to department">{departments.map(item => <option key={item} value={'dept:' + item}>{item}</option>)}</optgroup>
        <optgroup label="Set severity">{[5, 4, 3, 2, 1].map(value => <option key={value} value={'sev:' + value}>Severity {value}</option>)}</optgroup>
        <option value="remind:1">Send reminder to department</option>
      </select>
      <button className="btn-saffron btn-sm" disabled={!bulk || busy} onClick={() => void applyBulk()}>{busy && <Loader2 size={14} className="spin" />}Apply</button>
      <button className="btn-sm" style={{ background: 'transparent', borderColor: '#ffffff55' }} onClick={() => setSelected(new Set())}>Clear</button>
    </div>}
  </div>
}
