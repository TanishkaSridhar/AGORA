'use client'

import { useRef, useState } from 'react'
import { Copy, FileText, Loader2, Printer, X } from 'lucide-react'
import { languages, type Language } from '../lib/model'
import { message, request } from './client'

/** AI-drafted SLA escalation / RTI-style grievance letter, available once the SLA is breached. */
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
    <button className="btn-danger" onClick={() => { dialog.current?.showModal(); if (!letter && !busy) void draft(language) }}><FileText size={16} />Draft escalation letter</button>
    <dialog className="dialog" ref={dialog} aria-label="Escalation letter">
      <div className="stack">
        <div className="row between"><h2>SLA escalation letter</h2><button className="btn-ghost btn-sm" onClick={() => dialog.current?.close()} aria-label="Close"><X size={16} /></button></div>
        <p className="small muted">Gemini drafts a formal letter you can send to the department or attach to an RTI application. Review it and fill in your details before sending.</p>
        <label>Letter language<select value={language} disabled={busy} onChange={event => { const next = event.target.value as Language; setLanguage(next); void draft(next) }}>
          {Object.keys(languages).map(item => <option key={item}>{item}</option>)}
        </select></label>
        {busy && <p role="status" className="row"><Loader2 size={16} className="spin" />Drafting letter…</p>}
        {error && <><p role="alert" className="alert alert-danger">{error}</p><button onClick={() => void draft(language)}>Retry</button></>}
        {letter && <><pre dir="auto">{letter}</pre><div className="row">
          <button onClick={async () => {
            try { await navigator.clipboard.writeText(letter); setCopied(true); setError('') }
            catch { setError('Clipboard access failed. Select the letter text to copy it manually.') }
          }}><Copy size={16} />{copied ? 'Copied' : 'Copy letter'}</button>
          <button className="btn-ghost" onClick={() => {
            const popup = window.open('', '_blank')
            if (!popup) return
            const pre = popup.document.createElement('pre')
            pre.style.cssText = 'white-space:pre-wrap;font:14px/1.6 serif;max-width:720px;margin:40px auto'
            pre.textContent = letter
            popup.document.body.append(pre)
            popup.print()
          }}><Printer size={16} />Print</button>
        </div></>}
      </div>
    </dialog>
  </>
}
