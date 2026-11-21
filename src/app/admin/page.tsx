'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useState } from 'react'
import {
  Activity,
  AlarmClock,
  BarChart3,
  ClipboardList,
  Download,
  FileClock,
  LayoutDashboard,
  Loader2,
  Map as MapIcon,
  Megaphone,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { CaseDrawer } from '@/components/admin/actions'
import { Register, type RegisterFilter } from '@/components/admin/register'
import { Audit, Escalations, InsightsTab, MapTab, Notices, Overview, Performance } from '@/components/admin/sections'
import { dateLabel, message, request } from '@/components/client'
import { usePortal } from '@/components/providers'
import { Breadcrumb } from '@/components/ui'
import { isOverdue, type IssueSummary } from '@/lib/model'

const tabs = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'register', label: 'Grievance register', Icon: ClipboardList },
  { id: 'sla', label: 'SLA & escalations', Icon: AlarmClock },
  { id: 'map', label: 'Map & hotspots', Icon: MapIcon },
  { id: 'insights', label: 'AI insights', Icon: Sparkles },
  { id: 'performance', label: 'Department performance', Icon: BarChart3, admin: true },
  { id: 'notices', label: 'Public notices', Icon: Megaphone, admin: true },
  { id: 'audit', label: 'Audit log', Icon: FileClock },
]
const titles: Record<string, [string, string]> = {
  overview: ['Overview', 'Key indicators, AI daily brief and the grievances that need attention first.'],
  register: ['Grievance register', 'Search, filter and act on every grievance. Click a row to open the case.'],
  sla: ['SLA & escalations', 'Grievances that crossed or are about to cross their service level.'],
  map: ['Map & hotspots', 'Where grievances are concentrated, by location and ward.'],
  insights: ['AI insights', 'Gemini analysis of the live register: patterns, hotspots and recommended actions.'],
  performance: [
    'Department performance',
    'Disposal, SLA compliance and citizen satisfaction by department and officer.',
  ],
  notices: ['Public notices', 'Publish advisories and alerts to the portal ticker and home page.'],
  audit: ['Audit log', 'Every action taken on every grievance, newest first.'],
}

function Console() {
  const { session } = usePortal()
  const params = useSearchParams()
  const router = useRouter()
  const [issues, setIssues] = useState<IssueSummary[]>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [drawer, setDrawer] = useState<string>()
  const [filter, setFilter] = useState<RegisterFilter>({})
  const [loadedAt, setLoadedAt] = useState<string>()
  const admin = session?.role === 'SUPER_ADMIN'
  const officer = session && session.role !== 'CITIZEN'
  const requested = params.get('tab') ?? 'overview'
  const tab = tabs.some(item => item.id === requested && (!item.admin || admin)) ? requested : 'overview'

  const refresh = useCallback(async () => {
    try {
      setIssues(await request<IssueSummary[]>('/api/issues'))
      setLoadedAt(new Date().toISOString())
      setError('')
    } catch (error) {
      setError(message(error))
    }
  }, [])
  useEffect(() => {
    if (officer) void refresh()
  }, [officer, refresh])
  useEffect(() => {
    if (!officer) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [officer, refresh])

  const go = (next: string, nextFilter: RegisterFilter = {}) => {
    setFilter(nextFilter)
    router.push('/admin?tab=' + next)
  }
  const closeDrawer = useCallback(() => setDrawer(undefined), [])

  if (!session) return <p role="status">Loading…</p>
  if (!officer)
    return (
      <div className="stack">
        <Breadcrumb items={[['Home', '/'], ['Officer Console']]} />
        <div className="panel">
          <div className="panel-body">
            <h1>Officer sign-in required</h1>
            <p className="muted">The console is available to department staff and the Commissioner.</p>
            <div className="row">
              <Link className="button" href="/login?tab=officer">
                Go to officer login
              </Link>
            </div>
          </div>
        </div>
      </div>
    )

  const overdue = issues?.filter(issue => isOverdue(issue)).length ?? 0
  const [title, subtitle] = titles[tab]
  return (
    <div className="stack">
      <Breadcrumb items={[['Home', '/'], ['Officer Console', '/admin'], [title]]} />
      <div className="console">
        <aside className="sidenav">
          <div className="sidenav-user">
            <strong>{session.name}</strong>
            <span>{admin ? 'Super admin · all departments' : session.department}</span>
            <span>{session.email}</span>
            {session.signedInAt && (
              <span>
                Signed in {dateLabel(session.signedInAt)} ·{' '}
                {session.method === 'demo' ? 'demo access' : session.method === 'google' ? 'Google' : 'password + OTP'}
              </span>
            )}
          </div>
          <nav aria-label="Console sections">
            {tabs
              .filter(item => !item.admin || admin)
              .map(({ id, label, Icon }) => (
                <Link
                  key={id}
                  href={'/admin?tab=' + id}
                  className={tab === id ? 'active' : ''}
                  onClick={() => setFilter({})}
                >
                  <Icon size={16} />
                  {label}
                  {id === 'sla' && overdue > 0 && <span className="count">{overdue}</span>}
                </Link>
              ))}
          </nav>
        </aside>
        <div className="stack" style={{ minWidth: 0 }}>
          <div className="page-head" style={{ marginBottom: 0 }}>
            <div>
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>
            <div className="row">
              {loadedAt && (
                <span className="tiny muted row">
                  <Activity size={13} />
                  Live · updated {dateLabel(loadedAt)}
                </span>
              )}
              <button
                className="btn-ghost btn-sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  await refresh()
                  setBusy(false)
                }}
              >
                {busy ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}Refresh
              </button>
              {session.demoEnabled && admin && (
                <button
                  className="btn-ghost btn-sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      await request('/api/issues/seed', 'POST')
                      await refresh()
                    } catch (error) {
                      setError(message(error))
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  <Download size={14} />
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
          {!issues ? (
            <p role="status" className="row">
              <Loader2 size={16} className="spin" />
              Loading grievances…
            </p>
          ) : (
            <>
              {issues.length === 0 && tab !== 'notices' && (
                <div className="alert alert-info">
                  No grievances yet.
                  {session.demoEnabled && admin
                    ? ' Use “Load demo data” to add 16 sample grievances across departments.'
                    : ''}
                </div>
              )}
              {tab === 'overview' && <Overview issues={issues} session={session} open={setDrawer} go={go} />}
              {tab === 'register' && (
                <Register
                  key={JSON.stringify(filter)}
                  issues={issues}
                  session={session}
                  open={setDrawer}
                  refresh={refresh}
                  initial={filter}
                />
              )}
              {tab === 'sla' && <Escalations issues={issues} session={session} open={setDrawer} refresh={refresh} />}
              {tab === 'map' && <MapTab issues={issues} open={setDrawer} />}
              {tab === 'insights' && <InsightsTab issues={issues} open={setDrawer} go={go} />}
              {tab === 'performance' && <Performance issues={issues} />}
              {tab === 'notices' && <Notices />}
              {tab === 'audit' && <Audit issues={issues} open={setDrawer} />}
            </>
          )}
        </div>
      </div>
      {drawer && <CaseDrawer id={drawer} session={session} onClose={closeDrawer} onSaved={() => void refresh()} />}
    </div>
  )
}

export default function AdminPage() {
  return (
    <Suspense fallback={<p role="status">Loading…</p>}>
      <Console />
    </Suspense>
  )
}
