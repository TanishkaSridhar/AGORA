'use client'

import { useRef, useState } from 'react'
import { FileText } from 'lucide-react'
import { languages, type Language } from '../lib/model'
import { message, request } from './client'

export default function Escalation({ id, preferred }: { id: string; preferred?: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [language, setLanguage] = useState<Language>(preferred && Object.hasOwn(languages, preferred) ? preferred as Language : 'English')
  const [letter, setLetter] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  async function draft(selected: Language) {
    setBusy(true); setError(''); setLetter(''); setCopied(false)
    try { setLetter((await request<{ letter: string }>('/api/issues/' + id + '/escalation', 'POST', { language: selected })).letter) }
    catch (error) { setError(message(error)) }
    finally { setBusy(false) }
  }

  return <>
    <button className="secondary" onClick={() => { dialog.current?.showModal(); if (!letter && !busy) void draft(language) }}><FileText size={16}/>Draft SLA / RTI letter</button>
    <dialog className="dialog card" ref={dialog} aria-label="Municipal escalation letter">
      <div className="stack">
        <div className="row justify-between"><h2>Municipal escalation letter</h2><button className="secondary" onClick={() => dialog.current?.close()}>Close</button></div>
        <label>Letter language<select value={language} disabled={busy} onChange={event => { const next = event.target.value as Language; setLanguage(next); void draft(next) }}>
          {Object.keys(languages).map(item => <option key={item}>{item}</option>)}
        </select></label>
        {busy && <p role="status">Drafting letter…</p>}
        {error && <><p role="alert" className="alert error">{error}</p><button onClick={() => void draft(language)}>Retry</button></>}
        {letter && <><pre dir="auto">{letter}</pre><button onClick={async () => {
          try { await navigator.clipboard.writeText(letter); setCopied(true); setError('') }
          catch { setError('Clipboard access failed. Select the letter text to copy it manually.') }
        }}>{copied ? 'Copied' : 'Copy letter'}</button></>}
      </div>
    </dialog>
  </>
}
