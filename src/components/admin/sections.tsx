'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, Bell, Bot, Cpu, Database, Loader2, Megaphone, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { dueAt, escalationLevel, escalationNames, isOverdue, type IssueSummary, type Notice } from '@/lib/model'
import { byDepartment, dailyTrend, hoursLabel, percent, shortDept, stats, wardHotspots } from '@/lib/stats'
import { RankedBars, StackedBars, TrendLines, statusSeries } from '../charts'
import { dateLabel, dayLabel, message, request, slaText } from '../client'
import type { Session } from '../providers'
import { Empty, Flags, Panel, Severity, SlaBadge, StatusBadge } from '../ui'
import { priority } from './register'

const GrievanceMap = dynamic(() => import('../map'), {
  ssr: false,
  loading: () => <p className="muted small">Loading map…</p>,
})
const adminLink = (issue: IssueSummary) => '/issues/' + issue.id

type Insights = {
  headline: string
  summary: string
  hotspots: { area: string; issueCount: number; insight: string }[]
  systemicPatterns: string[]
  recommendedActions: { action: string; department: string; priority: 'Immediate' | 'This week' | 'Planned' }[]
  riskWatch: string
  generatedAt: string
  source: 'gemini' | 'rules'
  scope: string
}

function useInsights() {
  const [data, setData] = useState<Insights>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function load(refresh = false) {
    setBusy(true)
    setError('')
    try {
      setData(await request<Insights>('/api/admin/insights' + (refresh ? '?refresh=1' : '')))
    } catch (error) {
      setError(message(error))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    void load()
  }, [])
  return { data, busy, error, load }
}

function IssueLine({ issue, open }: { issue: IssueSummary; open: (id: string) => void }) {
  return (
    <li style={{ display: 'grid', gap: '.2rem', padding: '.55rem 0', borderBottom: '1px dashed var(--line)' }}>
      <div className="row between">
        <button className="btn-link small" style={{ textAlign: 'left' }} onClick={() => open(issue.id)}>
          {issue.title}
        </button>
        <SlaBadge issue={issue} />
      </div>
      <div className="row tiny muted">
        <span className="mono">{issue.refNo}</span>· {shortDept(issue.assignedDepartment)} ·{' '}
        {issue.location.ward ?? issue.location.address}
        <Severity value={issue.aiTriage.severity} />
      </div>
    </li>
  )
}

export function Overview({
  issues,
  session,
  open,
  go,
}: {
  issues: IssueSummary[]
  session: Session
  open: (id: string) => void
  go: (tab: string, filter?: object) => void
}) {
  const s = stats(issues)
  const depts = useMemo(() => byDepartment(issues), [issues])
  const trend = useMemo(() => dailyTrend(issues), [issues])
  const attention = issues
    .filter(issue => issue.status !== 'RESOLVED')
    .sort((a, b) => priority(b) - priority(a))
    .slice(0, 6)
  const ai = useInsights()
  const admin = session.role === 'SUPER_ADMIN'
  return (
    <div className="stack">
      <section className="kpis" aria-label="Key indicators">
        <button
          className="kpi"
          onClick={() => go('register')}
          style={{ textAlign: 'left', color: 'inherit', background: '#fff' }}
        >
          <span>Total grievances</span>
          <strong>{s.total}</strong>
          <small>
            {s.reports} reports · {s.merged} merged
          </small>
        </button>
        <button
          className="kpi warn"
          onClick={() => go('register', { status: 'OPEN' })}
          style={{ textAlign: 'left', color: 'inherit', background: '#fff' }}
        >
          <span>Pending (not started)</span>
          <strong>{s.pending}</strong>
          <small>{s.inProgress} in progress</small>
        </button>
        <button
          className="kpi bad"
          onClick={() => go('sla')}
          style={{ textAlign: 'left', color: 'inherit', background: '#fff' }}
        >
          <span>Beyond SLA</span>
          <strong>{s.overdue}</strong>
          <small>
            L1 {s.escalated[0]} · L2 {s.escalated[1]} · L3 {s.escalated[2]}
          </small>
        </button>
        <button
          className="kpi bad"
          onClick={() => go('register', { severity: '4' })}
          style={{ textAlign: 'left', color: 'inherit', background: '#fff' }}
        >
          <span>Critical / high open</span>
          <strong>{s.critical}</strong>
          <small>severity 4–5</small>
        </button>
        <div className="kpi ok">
          <span>Disposed</span>
          <strong>{s.resolved}</strong>
          <small>
            {s.verified} AI-verified · {percent(s.slaCompliance)} in SLA
          </small>
        </div>
        <div className="kpi">
          <span>Avg. disposal time</span>
          <strong>{hoursLabel(s.avgResolutionHours)}</strong>
          <small>Citizen rating {s.avgRating ? s.avgRating.toFixed(1) + '/5' : '—'}</small>
        </div>
      </section>

      {s.aiPending > 0 && (
        <div className="alert alert-warn">
          <Bot size={16} />
          <div>
            {s.aiPending} grievance(s) were routed by keyword rules while AI was busy.{' '}
            <button className="btn-link small" onClick={() => go('register', { aiPending: true })}>
              Review and re-run AI triage →
            </button>
          </div>
        </div>
      )}

      <div className="grid g2">
        <Panel
          title={
            <>
              <Sparkles size={16} />
              AI daily brief
            </>
          }
          className="ai-card"
          actions={
            <button className="btn-ghost btn-sm" onClick={() => go('insights')}>
              Full analysis →
            </button>
          }
        >
          {ai.busy && !ai.data ? (
            <p className="row small">
              <Loader2 size={15} className="spin" />
              Gemini is analysing the register…
            </p>
          ) : ai.data ? (
            <>
              <strong>{ai.data.headline}</strong>
              <p className="small">{ai.data.summary}</p>
              {ai.data.recommendedActions.slice(0, 3).map((item, index) => (
                <div key={index} className="row small" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                  <span
                    className={
                      'badge ' +
                      (item.priority === 'Immediate'
                        ? 'b-danger'
                        : item.priority === 'This week'
                          ? 'b-open'
                          : 'b-neutral')
                    }
                  >
                    {item.priority}
                  </span>
                  <span>{item.action}</span>
                </div>
              ))}
              <span className="tiny muted">
                {ai.data.source === 'gemini' ? 'Generated by Gemini' : 'Rule-based summary (AI busy)'} ·{' '}
                {dateLabel(ai.data.generatedAt)}
              </span>
            </>
          ) : (
            <p className="small muted">{ai.error || 'No brief available.'}</p>
          )}
        </Panel>
        <Panel
          title="Needs attention now"
          actions={
            <button className="btn-ghost btn-sm" onClick={() => go('register')}>
              Open register →
            </button>
          }
        >
          {attention.length ? (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {attention.map(issue => (
                <IssueLine key={issue.id} issue={issue} open={open} />
              ))}
            </ul>
          ) : (
            <Empty>No pending grievances. 🎉</Empty>
          )}
        </Panel>
      </div>

      <div className="grid g2">
        {admin ? (
          <Panel title="Pendency by department">
            <StackedBars
              label="Grievances by department and status"
              series={statusSeries}
              rows={depts.map(item => ({ label: shortDept(item.department), values: item.values }))}
            />
          </Panel>
        ) : (
          <Panel title="Open grievances by severity">
            <RankedBars
              label="Open grievances"
              rows={[5, 4, 3, 2, 1].map(level => ({
                label: `Severity ${level}`,
                value: issues.filter(issue => issue.status !== 'RESOLVED' && issue.aiTriage.severity === level).length,
              }))}
            />
          </Panel>
        )}
        <Panel title="Received vs disposed · 14 days">
          <TrendLines
            label="Grievances received and disposed per day"
            series={[
              { key: 'received', label: 'Received', color: 'var(--series-1)' },
              { key: 'disposed', label: 'Disposed', color: 'var(--series-3)' },
            ]}
            points={trend.map(point => ({
              label: dayLabel(point.day),
              values: { received: point.received, disposed: point.disposed },
            }))}
          />
        </Panel>
      </div>
    </div>
  )
}

export function Escalations({
  issues,
  session,
  open,
  refresh,
}: {
  issues: IssueSummary[]
  session: Session
  open: (id: string) => void
  refresh: () => Promise<void>
}) {
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const now = Date.now()
  const pending = issues.filter(issue => issue.status !== 'RESOLVED')
  const levels = [3, 2, 1].map(level => ({
    level,
    list: pending.filter(issue => escalationLevel(issue, now) === level).sort((a, b) => dueAt(a) - dueAt(b)),
  }))
  const dueSoon = pending
    .filter(issue => !isOverdue(issue, now) && dueAt(issue) - now < 86_400_000)
    .sort((a, b) => dueAt(a) - dueAt(b))
  async function remind(issue: IssueSummary) {
    setBusy(issue.id)
    setNote('')
    try {
      await request('/api/issues/' + issue.id, 'PATCH', { reminder: true })
      setNote('Reminder logged for ' + issue.refNo)
      await refresh()
    } catch (error) {
      setNote(message(error))
    } finally {
      setBusy('')
    }
  }
  return (
    <div className="stack">
      <p className="small muted">
        Grievances are escalated automatically: <strong>L1</strong> when the SLA is breached, <strong>L2</strong> at 50%
        overdue, <strong>L3</strong> (Commissioner) at 100% overdue.
      </p>
      {note && (
        <p role="status" className="alert alert-info">
          {note}
        </p>
      )}
      <div className="grid g3">
        {levels.map(({ level, list }) => (
          <Panel key={level} title={`${escalationNames[level]} (${list.length})`}>
            {list.length ? (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {list.map(issue => (
                  <li
                    key={issue.id}
                    style={{
                      padding: '.55rem 0',
                      borderBottom: '1px dashed var(--line)',
                      display: 'grid',
                      gap: '.25rem',
                    }}
                  >
                    <button className="btn-link small" style={{ textAlign: 'left' }} onClick={() => open(issue.id)}>
                      {issue.title}
                    </button>
                    <span className="tiny muted">
                      <span className="mono">{issue.refNo}</span> · {shortDept(issue.assignedDepartment)}
                    </span>
                    <div className="row between">
                      <span className="badge b-danger">{slaText(dueAt(issue), now)}</span>
                      {session.role === 'SUPER_ADMIN' && (
                        <button className="btn-ghost btn-sm" disabled={!!busy} onClick={() => void remind(issue)}>
                          {busy === issue.id ? <Loader2 size={13} className="spin" /> : <Bell size={13} />}Remind
                          {issue.remindersSent ? ` (${issue.remindersSent})` : ''}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>None at this level.</Empty>
            )}
          </Panel>
        ))}
      </div>
      <Panel title={`Due within 24 hours (${dueSoon.length})`}>
        {dueSoon.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Reg. no.</th>
                  <th>Subject</th>
                  <th>Department</th>
                  <th>Officer</th>
                  <th>Time left</th>
                </tr>
              </thead>
              <tbody>
                {dueSoon.map(issue => (
                  <tr key={issue.id} onClick={() => open(issue.id)} style={{ cursor: 'pointer' }}>
                    <td className="mono small">{issue.refNo}</td>
                    <td className="small">{issue.title}</td>
                    <td className="small">{shortDept(issue.assignedDepartment)}</td>
                    <td className="small">{issue.assignedOfficer ?? '—'}</td>
                    <td>
                      <SlaBadge issue={issue} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Nothing due in the next 24 hours.</Empty>
        )}
      </Panel>
    </div>
  )
}

export function MapTab({ issues, open }: { issues: IssueSummary[]; open: (id: string) => void }) {
  const [showResolved, setShowResolved] = useState(false)
  const hotspots = wardHotspots(issues).slice(0, 8)
  const shown = showResolved ? issues : issues.filter(issue => issue.status !== 'RESOLVED')
  return (
    <div className="grid side-main">
      <Panel
        title="Geo-tagged grievances"
        actions={
          <label className="check small">
            <input type="checkbox" checked={showResolved} onChange={event => setShowResolved(event.target.checked)} />
            Show disposed
          </label>
        }
      >
        <GrievanceMap issues={shown} link={adminLink} />
      </Panel>
      <Panel title="Ward hotspots (open grievances)">
        {hotspots.length ? (
          <ol style={{ margin: 0, paddingLeft: '1.2rem', display: 'grid', gap: '.6rem' }}>
            {hotspots.map(spot => (
              <li key={spot.ward}>
                <strong className="small">{spot.ward}</strong>{' '}
                <span className="badge b-neutral">{spot.list.length} open</span>
                <ul style={{ margin: '.2rem 0 0', paddingLeft: '1rem' }}>
                  {spot.list.slice(0, 3).map(issue => (
                    <li key={issue.id} className="tiny">
                      <button className="btn-link tiny" onClick={() => open(issue.id)}>
                        {issue.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        ) : (
          <Empty>No open grievances.</Empty>
        )}
      </Panel>
    </div>
  )
}

export function Performance({ issues }: { issues: IssueSummary[] }) {
  const depts = byDepartment(issues)
  const officers = new Map<string, IssueSummary[]>()
  for (const issue of issues)
    if (issue.assignedOfficer)
      officers.set(issue.assignedOfficer, [...(officers.get(issue.assignedOfficer) ?? []), issue])
  return (
    <div className="stack">
      <Panel title="Department scorecard">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Department</th>
                <th className="num">Received</th>
                <th className="num">Pending</th>
                <th className="num">In progress</th>
                <th className="num">Disposed</th>
                <th className="num">Beyond SLA</th>
                <th className="num">Within SLA</th>
                <th className="num">Avg. time</th>
                <th className="num">Rating</th>
                <th className="num">Reopened</th>
              </tr>
            </thead>
            <tbody>
              {depts.map(item => (
                <tr key={item.department}>
                  <td>
                    <strong className="small">{item.department}</strong>
                  </td>
                  <td className="num">{item.total}</td>
                  <td className="num">{item.pending}</td>
                  <td className="num">{item.inProgress}</td>
                  <td className="num">{item.resolved}</td>
                  <td className="num">{item.overdue ? <span className="badge b-danger">{item.overdue}</span> : 0}</td>
                  <td className="num">{percent(item.slaCompliance)}</td>
                  <td className="num">{hoursLabel(item.avgResolutionHours)}</td>
                  <td className="num">{item.avgRating ? item.avgRating.toFixed(1) : '—'}</td>
                  <td className="num">{item.list.reduce((sum, issue) => sum + (issue.reopenCount ?? 0), 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="grid g2">
        <Panel title="Pending grievances by department">
          <RankedBars
            label="Pending grievances"
            rows={depts
              .map(item => ({
                label: shortDept(item.department),
                value: item.open,
                detail: `${item.overdue} beyond SLA`,
              }))
              .sort((a, b) => b.value - a.value)}
          />
        </Panel>
        <Panel title="Field officer workload">
          {officers.size ? (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Officer / crew</th>
                    <th className="num">Active</th>
                    <th className="num">Disposed</th>
                    <th className="num">Beyond SLA</th>
                  </tr>
                </thead>
                <tbody>
                  {[...officers]
                    .sort((a, b) => b[1].length - a[1].length)
                    .map(([name, list]) => (
                      <tr key={name}>
                        <td className="small">{name}</td>
                        <td className="num">{list.filter(issue => issue.status !== 'RESOLVED').length}</td>
                        <td className="num">{list.filter(issue => issue.status === 'RESOLVED').length}</td>
                        <td className="num">{list.filter(issue => isOverdue(issue)).length}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No officers assigned yet. Assign officers from a grievance.</Empty>
          )}
        </Panel>
      </div>
    </div>
  )
}

type Health = {
  ai: {
    configured: boolean
    chain: { model: string; benchedForSeconds: number }[]
    last?: { model: string; ok: boolean; at: string; latencyMs?: number; error?: string }
    calls: number
    failures: number
  }
  store: string
}

export function InsightsTab({
  issues,
  open,
  go,
}: {
  issues: IssueSummary[]
  open: (id: string) => void
  go: (tab: string, filter?: object) => void
}) {
  const ai = useInsights()
  const [health, setHealth] = useState<Health>()
  useEffect(() => {
    request<Health>('/api/admin/health')
      .then(setHealth)
      .catch(() => {})
  }, [ai.data])
  const pending = issues.filter(issue => issue.aiPending)
  const lowRated = issues.filter(issue => issue.feedback && issue.feedback.rating <= 2)
  return (
    <div className="stack">
      <Panel
        title={
          <>
            <Sparkles size={16} />
            Commissioner&apos;s AI brief · {ai.data?.scope ?? ''}
          </>
        }
        className="ai-card"
        actions={
          <button className="btn-ghost btn-sm" disabled={ai.busy} onClick={() => void ai.load(true)}>
            {ai.busy ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}Regenerate
          </button>
        }
      >
        {ai.error && <p className="alert alert-danger">{ai.error}</p>}
        {!ai.data ? (
          <p className="row small">
            <Loader2 size={15} className="spin" />
            Gemini is analysing {issues.length} grievances…
          </p>
        ) : (
          <>
            <h3 style={{ fontSize: '1.15rem' }}>{ai.data.headline}</h3>
            <p>{ai.data.summary}</p>
            {ai.data.riskWatch && (
              <div className="alert alert-warn">
                <AlertTriangle size={16} />
                <div>
                  <strong>Risk watch: </strong>
                  {ai.data.riskWatch}
                </div>
              </div>
            )}
            <div className="grid g2">
              <div className="stack-sm">
                <strong className="small">Recommended actions</strong>
                {ai.data.recommendedActions.map((item, index) => (
                  <div key={index} className="row small" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                    <span
                      className={
                        'badge ' +
                        (item.priority === 'Immediate'
                          ? 'b-danger'
                          : item.priority === 'This week'
                            ? 'b-open'
                            : 'b-neutral')
                      }
                    >
                      {item.priority}
                    </span>
                    <span>
                      {item.action} <span className="tiny muted">· {item.department}</span>
                    </span>
                  </div>
                ))}
                {!ai.data.recommendedActions.length && <span className="small muted">No actions suggested.</span>}
              </div>
              <div className="stack-sm">
                <strong className="small">Geographic hotspots</strong>
                {ai.data.hotspots.map(spot => (
                  <div key={spot.area} className="small">
                    <strong>{spot.area}</strong> <span className="badge b-neutral">{spot.issueCount}</span>
                    <div className="tiny muted">{spot.insight}</div>
                  </div>
                ))}
                {ai.data.systemicPatterns.length > 0 && (
                  <>
                    <strong className="small" style={{ marginTop: '.4rem' }}>
                      Systemic patterns
                    </strong>
                    <ul className="small" style={{ margin: 0, paddingLeft: '1.1rem' }}>
                      {ai.data.systemicPatterns.map(item => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
            <span className="tiny muted">
              {ai.data.source === 'gemini'
                ? 'Generated by Google Gemini from live register data'
                : 'Rule-based summary shown because Gemini was busy'}{' '}
              · {dateLabel(ai.data.generatedAt)}
            </span>
          </>
        )}
      </Panel>
      <div className="grid g3">
        <Panel
          title={
            <>
              <Cpu size={16} />
              AI engine status
            </>
          }
        >
          {!health ? (
            <p className="small muted">Loading…</p>
          ) : (
            <div className="stack-sm small">
              <div className="row">
                <span
                  className={
                    'health-dot ' + (!health.ai.configured ? 'bad' : health.ai.last && !health.ai.last.ok ? 'warn' : '')
                  }
                />
                {health.ai.configured
                  ? health.ai.last
                    ? `Last call: ${health.ai.last.model} · ${health.ai.last.ok ? 'OK' : 'failed'}${health.ai.last.latencyMs ? ' · ' + (health.ai.last.latencyMs / 1000).toFixed(1) + ' s' : ''}`
                    : 'Ready, no calls yet'
                  : 'GEMINI_API_KEY not configured'}
              </div>
              <div>
                <strong>Model failover chain</strong>
                <ol style={{ margin: '.2rem 0 0', paddingLeft: '1.1rem' }}>
                  {health.ai.chain.map(item => (
                    <li key={item.model} className="mono tiny">
                      {item.model}
                      {item.benchedForSeconds ? ` · cooling down ${item.benchedForSeconds}s` : ''}
                    </li>
                  ))}
                </ol>
              </div>
              <div className="tiny muted">
                {health.ai.calls} calls · {health.ai.failures} retried since start
              </div>
              <div className="row tiny">
                <Database size={13} />
                Storage: {health.store === 'firestore' ? 'Cloud Firestore' : 'In-memory (local demo)'}
              </div>
            </div>
          )}
        </Panel>
        <Panel
          title={
            <>
              <Bot size={16} />
              AI review pending ({pending.length})
            </>
          }
        >
          {pending.length ? (
            <>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {pending.slice(0, 5).map(issue => (
                  <IssueLine key={issue.id} issue={issue} open={open} />
                ))}
              </ul>
              <button className="btn-ghost btn-sm" onClick={() => go('register', { aiPending: true })}>
                View all
              </button>
            </>
          ) : (
            <Empty>All grievances have been AI-triaged.</Empty>
          )}
        </Panel>
        <Panel title={`Low citizen ratings (${lowRated.length})`}>
          {lowRated.length ? (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {lowRated.map(issue => (
                <li key={issue.id} className="small" style={{ padding: '.4rem 0' }}>
                  <button className="btn-link small" onClick={() => open(issue.id)}>
                    {issue.title}
                  </button>{' '}
                  <span className="badge b-danger">{issue.feedback!.rating}★</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No ratings of 2★ or below.</Empty>
          )}
        </Panel>
      </div>
    </div>
  )
}

export function Notices() {
  const [notices, setNotices] = useState<Notice[]>()
  const [text, setText] = useState('')
  const [kind, setKind] = useState<Notice['kind']>('advisory')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () =>
    request<Notice[]>('/api/notices')
      .then(setNotices)
      .catch(error => setError(message(error)))
  useEffect(() => {
    void load()
  }, [])
  async function publish(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await request('/api/notices', 'POST', { text, kind })
      setText('')
      await load()
    } catch (error) {
      setError(message(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid g2">
      <Panel
        title={
          <>
            <Megaphone size={16} />
            Publish public notice
          </>
        }
      >
        <form className="stack" onSubmit={publish}>
          <label>
            Type
            <select value={kind} onChange={event => setKind(event.target.value as Notice['kind'])}>
              <option value="advisory">Advisory (e.g. monsoon safety)</option>
              <option value="alert">Alert (urgent, shown in red)</option>
              <option value="update">Service update</option>
            </select>
          </label>
          <label>
            <span>
              Notice text
              <span className="req-mark" aria-hidden>
                {' '}
                *
              </span>
            </span>
            <textarea
              rows={3}
              maxLength={300}
              value={text}
              onChange={event => setText(event.target.value)}
              required
              placeholder="E.g. Heavy rain expected tonight — avoid Andheri subway; pumps deployed."
            />
            <span className="hint">{text.length}/300 · Appears in the Latest Updates ticker and on the home page.</span>
          </label>
          {error && (
            <p role="alert" className="alert alert-danger">
              {error}
            </p>
          )}
          <button disabled={busy || text.trim().length < 3}>
            {busy ? <Loader2 size={15} className="spin" /> : <Megaphone size={15} />}Publish
          </button>
        </form>
      </Panel>
      <Panel title={`Published notices (${notices?.length ?? '…'})`}>
        {!notices ? (
          <p className="small muted">Loading…</p>
        ) : !notices.length ? (
          <Empty>No notices published.</Empty>
        ) : (
          <ul className="notice-list">
            {notices.map(notice => (
              <li key={notice.id}>
                <div className="row between" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                  <span>
                    <span
                      className={
                        'badge ' +
                        (notice.kind === 'alert' ? 'b-danger' : notice.kind === 'advisory' ? 'b-open' : 'b-neutral')
                      }
                    >
                      {notice.kind}
                    </span>{' '}
                    {notice.text}
                  </span>
                  <button
                    className="btn-danger btn-sm"
                    aria-label="Delete notice"
                    onClick={async () => {
                      await request('/api/notices/' + notice.id, 'DELETE').catch(error => setError(message(error)))
                      await load()
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <span className="tiny muted">
                  {dateLabel(notice.createdAt)} · {notice.author}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

export function Audit({ issues, open }: { issues: IssueSummary[]; open: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const [actor, setActor] = useState('')
  const entries = useMemo(
    () =>
      issues
        .flatMap(issue => (issue.audit ?? []).map(entry => ({ ...entry, issue })))
        .sort((a, b) => b.at.localeCompare(a.at)),
    [issues],
  )
  const actors = [...new Set(entries.map(entry => entry.actor))].sort()
  const shown = entries
    .filter(
      entry =>
        (!actor || entry.actor === actor) &&
        (!query ||
          (entry.action + (entry.remarks ?? '') + (entry.issue.refNo ?? '') + entry.issue.title)
            .toLowerCase()
            .includes(query.toLowerCase())),
    )
    .slice(0, 200)
  return (
    <Panel title={`Audit log (${entries.length} events)`}>
      <div className="filters">
        <label>
          Search
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Action, remarks, reg. no."
          />
        </label>
        <label>
          Actor
          <select value={actor} onChange={event => setActor(event.target.value)}>
            <option value="">All actors</option>
            {actors.map(item => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      {!shown.length ? (
        <Empty>No audit events.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Time (IST)</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Grievance</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((entry, index) => (
                <tr key={index}>
                  <td className="small nowrap">{dateLabel(entry.at)}</td>
                  <td className="small">{entry.actor}</td>
                  <td className="small">
                    {entry.action}
                    {entry.remarks && <div className="tiny muted">“{entry.remarks}”</div>}
                  </td>
                  <td className="small">
                    <button className="btn-link mono small" onClick={() => open(entry.issue.id)}>
                      {entry.issue.refNo ?? entry.issue.id.slice(0, 8)}
                    </button>
                    <div className="tiny muted">{entry.issue.title}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

export { Flags, StatusBadge }
