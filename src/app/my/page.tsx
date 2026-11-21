'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { dateLabel, message, request } from '@/components/client'
import { MobileOtp } from '@/components/otp'
import { usePortal } from '@/components/providers'
import { Breadcrumb, Empty, Flags, Panel, SlaBadge, StatusBadge } from '@/components/ui'
import type { IssueSummary } from '@/lib/model'

export default function MyGrievances() {
  const { session } = usePortal()
  const [issues, setIssues] = useState<IssueSummary[]>()
  const [error, setError] = useState('')
  const signedIn = !!session?.mobile
  useEffect(() => {
    if (!signedIn) return
    request<IssueSummary[]>('/api/my')
      .then(setIssues)
      .catch(error => setError(message(error)))
  }, [signedIn])

  return (
    <div className="stack">
      <Breadcrumb items={[['Home', '/'], ['My Grievances']]} />
      <div className="page-head">
        <div>
          <h1>My grievances</h1>
          <p>
            {signedIn
              ? `Grievances lodged from +91 ${session!.mobile}`
              : 'Verify your mobile number to see the grievances you have lodged.'}
          </p>
        </div>
        <Link className="button btn-saffron" href="/lodge">
          <ClipboardList size={16} />
          Lodge new grievance
        </Link>
      </div>
      {!session ? (
        <p role="status">Loading…</p>
      ) : !signedIn ? (
        <Panel title="Verify mobile number">
          <div style={{ maxWidth: 460 }}>
            <MobileOtp onVerified={() => {}} />
          </div>
        </Panel>
      ) : (
        <Panel title={`Grievances (${issues?.length ?? '…'})`}>
          {error && (
            <p role="alert" className="alert alert-danger">
              {error}
            </p>
          )}
          {issues && !issues.length && (
            <Empty>
              No grievances found for this mobile number. Grievances lodged as a guest can be tracked with the
              registration number.
            </Empty>
          )}
          {issues && issues.length > 0 && (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Registration no.</th>
                    <th>Subject</th>
                    <th>Department</th>
                    <th>Lodged</th>
                    <th>Status</th>
                    <th>Service level</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map(issue => (
                    <tr key={issue.id}>
                      <td className="mono nowrap">
                        <Link href={'/track?ref=' + encodeURIComponent(issue.refNo ?? issue.id)}>
                          {issue.refNo ?? issue.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td>
                        {issue.title}
                        <div className="row" style={{ marginTop: 4 }}>
                          <Flags issue={issue} />
                          {issue.status === 'RESOLVED' && !issue.feedback && (
                            <span className="badge b-ai">Feedback awaited</span>
                          )}
                        </div>
                      </td>
                      <td className="small">{issue.assignedDepartment}</td>
                      <td className="small nowrap">{dateLabel(issue.createdAt)}</td>
                      <td>
                        <StatusBadge status={issue.status} />
                      </td>
                      <td>
                        <SlaBadge issue={issue} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}
