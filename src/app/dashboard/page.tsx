'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { RankedBars, StackedBars, TrendLines, statusSeries } from '@/components/charts'
import { dateLabel, dayLabel, message, request } from '@/components/client'
import { usePortal } from '@/components/providers'
import { Breadcrumb, Empty, Flags, Panel, Severity, SlaBadge, StatusBadge } from '@/components/ui'
import { departments, statusNames, statuses, type IssueSummary } from '@/lib/model'
import { byDepartment, dailyTrend, hoursLabel, percent, shortDept, stats } from '@/lib/stats'

const GrievanceMap = dynamic(() => import('../../components/map'), {
  ssr: false,
  loading: () => <p className="muted small">Loading map…</p>,
})

export default function Dashboard() {
  const { session } = usePortal()
  const [issues, setIssues] = useState<IssueSummary[]>()
  const [error, setError] = useState('')
  const [department, setDepartment] = useState('')
  const [status, setStatus] = useState('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () =>
    request<IssueSummary[]>('/api/issues')
      .then(setIssues)
      .catch(error => setError(message(error)))
  useEffect(() => {
    void load()
  }, [])

  const s = issues && stats(issues)
  const depts = useMemo(() => (issues ? byDepartment(issues) : []), [issues])
  const trend = useMemo(() => (issues ? dailyTrend(issues) : []), [issues])
  const filtered = (issues ?? []).filter(
    issue =>
      (!department || issue.assignedDepartment === department) &&
      (!status || issue.status === status) &&
      (!query ||
        (issue.title + issue.location.address + (issue.refNo ?? '') + (issue.location.ward ?? ''))
          .toLowerCase()
          .includes(query.toLowerCase())),
  )

  return (
    <div className="stack">
      <Breadcrumb items={[['Home', '/'], ['Public Dashboard']]} />
      <div className="page-head">
        <div>
          <h1>CivicResolve dashboard</h1>
          <p>
            Live, open data on grievances received, pending and disposed across municipal departments. Citizen contact
            details are never shown publicly.
          </p>
        </div>
        <div className="row">
          <button
            className="btn-ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await load()
              setBusy(false)
            }}
          >
            <RefreshCw size={15} />
            Refresh
          </button>
          {session?.demoEnabled && session.role !== 'DEPT_STAFF' && (
            <button
              className="btn-ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await request('/api/issues/seed', 'POST')
                  await load()
                } catch (error) {
                  setError(message(error))
                } finally {
                  setBusy(false)
                }
              }}
            >
              <Download size={15} />
              Load demo data
            </button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      )}

      <section className="kpis" aria-label="Key figures">
        <div className="kpi">
          <span>Total received</span>
          <strong>{s?.reports ?? '…'}</strong>
          <small>{s ? `${s.total} unique · ${s.merged} merged duplicates` : ''}</small>
        </div>
        <div className="kpi warn">
          <span>Pending</span>
          <strong>{s?.open ?? '…'}</strong>
          <small>{s ? `${s.inProgress} with action in progress` : ''}</small>
        </div>
        <div className="kpi ok">
          <span>Disposed</span>
          <strong>{s?.resolved ?? '…'}</strong>
          <small>{s ? `${s.verified} AI-verified fixes` : ''}</small>
        </div>
        <div className="kpi bad">
          <span>Beyond SLA</span>
          <strong>{s?.overdue ?? '…'}</strong>
          <small>auto-escalated</small>
        </div>
        <div className="kpi">
          <span>Avg. disposal time</span>
          <strong>{s ? hoursLabel(s.avgResolutionHours) : '…'}</strong>
          <small>{s ? percent(s.slaCompliance) + ' within SLA' : ''}</small>
        </div>
        <div className="kpi">
          <span>Citizen rating</span>
          <strong>{s?.avgRating ? s.avgRating.toFixed(1) + ' / 5' : '—'}</strong>
          <small>{s ? s.languages + ' languages received' : ''}</small>
        </div>
      </section>

      {issues && issues.length > 0 && (
        <div className="grid g2">
          <Panel title="Department-wise status">
            <StackedBars
              label="Grievances by department and status"
              series={statusSeries}
              rows={depts.map(item => ({ label: shortDept(item.department), values: item.values }))}
            />
          </Panel>
          <Panel title="Received vs disposed · last 14 days">
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
          <Panel title="Disposed within SLA, by department">
            <RankedBars
              label="Disposed within SLA"
              max={1}
              format={percent}
              rows={depts
                .filter(item => item.resolved > 0)
                .map(item => ({
                  label: shortDept(item.department),
                  value: item.slaCompliance ?? 0,
                  detail: `${item.resolved} disposed`,
                }))
                .sort((a, b) => b.value - a.value)}
              note={<p className="tiny muted">Departments with no disposed grievances are not shown.</p>}
            />
          </Panel>
          <Panel title="Grievance map">
            <GrievanceMap issues={issues} height={300} />
          </Panel>
        </div>
      )}

      <Panel title={`Grievance register (${filtered.length})`}>
        <div className="filters">
          <label>
            Search
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Registration no., title, area"
            />
          </label>
          <label>
            Department
            <select value={department} onChange={event => setDepartment(event.target.value)}>
              <option value="">All departments</option>
              {departments.map(item => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={status} onChange={event => setStatus(event.target.value)}>
              <option value="">All statuses</option>
              {statuses.map(item => (
                <option value={item} key={item}>
                  {statusNames[item]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!issues ? (
          <p role="status">Loading…</p>
        ) : !filtered.length ? (
          <Empty>
            No grievances match these filters.
            {session?.demoEnabled ? ' Use "Load demo data" to add sample grievances.' : ''}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Registration no.</th>
                  <th>Subject</th>
                  <th>Area</th>
                  <th>Department</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Service level</th>
                  <th className="num">Support</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 50).map(issue => (
                  <tr key={issue.id}>
                    <td className="mono nowrap">
                      <Link href={'/track?ref=' + encodeURIComponent(issue.refNo ?? issue.id)}>
                        {issue.refNo ?? issue.id.slice(0, 8)}
                      </Link>
                      <div className="tiny muted">{dateLabel(issue.createdAt)}</div>
                    </td>
                    <td>
                      {issue.title}
                      <div className="row" style={{ marginTop: 4 }}>
                        <Flags issue={issue} />
                      </div>
                    </td>
                    <td className="small">{issue.location.ward ?? issue.location.address}</td>
                    <td className="small">{shortDept(issue.assignedDepartment)}</td>
                    <td>
                      <Severity value={issue.aiTriage.severity} />
                    </td>
                    <td>
                      <StatusBadge status={issue.status} />
                    </td>
                    <td>
                      <SlaBadge issue={issue} />
                    </td>
                    <td className="num">{issue.upvotes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
