'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState, type FormEvent } from 'react'
import { Loader2, Search } from 'lucide-react'
import { message, request } from '@/components/client'
import { GrievanceView } from '@/components/grievance'
import { Breadcrumb, Panel } from '@/components/ui'
import type { CivicIssue } from '@/lib/model'

function Track() {
  const params = useSearchParams()
  const router = useRouter()
  const ref = params.get('ref') ?? ''
  const [input, setInput] = useState(ref)
  const [issue, setIssue] = useState<CivicIssue>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setInput(ref)
    if (!ref) {
      setIssue(undefined)
      return
    }
    let active = true
    setBusy(true)
    setError('')
    request<CivicIssue>('/api/track?ref=' + encodeURIComponent(ref))
      .then(result => {
        if (active) setIssue(result)
      })
      .catch(error => {
        if (active) {
          setIssue(undefined)
          setError(message(error))
        }
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [ref])

  function search(event: FormEvent) {
    event.preventDefault()
    router.push('/track?ref=' + encodeURIComponent(input.trim().toUpperCase()))
  }

  return (
    <div className="stack">
      <Breadcrumb items={[['Home', '/'], ['Track Status']]} />
      <div className="page-head">
        <div>
          <h1>Track grievance status</h1>
          <p>Enter the registration number from your acknowledgement slip.</p>
        </div>
      </div>
      <Panel title="Search grievance">
        <form className="row" onSubmit={search} style={{ flexWrap: 'nowrap' }}>
          <input
            value={input}
            onChange={event => setInput(event.target.value)}
            placeholder="AGR-2026-123456"
            aria-label="Registration number"
            className="mono"
            maxLength={40}
            required
          />
          <button disabled={busy}>{busy ? <Loader2 size={16} className="spin" /> : <Search size={16} />}Search</button>
        </form>
        {error && (
          <p role="alert" className="alert alert-danger">
            {error}
          </p>
        )}
      </Panel>
      {issue && <GrievanceView issue={issue} onChange={setIssue} />}
    </div>
  )
}

export default function TrackPage() {
  return (
    <Suspense fallback={<p role="status">Loading…</p>}>
      <Track />
    </Suspense>
  )
}
