'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { message, request } from '@/components/client'
import { GrievanceView } from '@/components/grievance'
import { usePortal } from '@/components/providers'
import { Breadcrumb } from '@/components/ui'
import type { CivicIssue } from '@/lib/model'

export default function IssueDetail() {
  const { id } = useParams<{ id: string }>()
  const { session } = usePortal()
  const [issue, setIssue] = useState<CivicIssue>()
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    request<CivicIssue>('/api/issues/' + encodeURIComponent(id))
      .then(result => {
        if (active) setIssue(result)
      })
      .catch(error => {
        if (active) setError(message(error))
      })
    return () => {
      active = false
    }
  }, [id])
  const officer = session && session.role !== 'CITIZEN'
  return (
    <div className="stack">
      <Breadcrumb
        items={
          officer
            ? [['Officer Console', '/admin'], ['Grievance register', '/admin?tab=register'], ['Grievance']]
            : [['Home', '/'], ['Public Dashboard', '/dashboard'], ['Grievance']]
        }
      />
      {error && (
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      )}
      {!issue && !error && <p role="status">Loading the grievance…</p>}
      {issue && <GrievanceView issue={issue} onChange={setIssue} />}
    </div>
  )
}
