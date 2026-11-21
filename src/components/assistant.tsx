'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Bot, Loader2, MessageCircle, Send, X } from 'lucide-react'
import { message, request } from './client'

type Turn = { role: 'user' | 'model'; text: string }
const starters = [
  'How do I lodge a grievance?',
  'What happens after the SLA is breached?',
  'मेरी शिकायत की स्थिति कैसे देखें?',
]

/** CivicResolve Sahayak: Gemini-powered helpdesk, grounded on the citizen charter and live ticket status. */
export default function Assistant() {
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([
    {
      role: 'model',
      text: 'Namaste! I am CivicResolve Sahayak. Ask me how to lodge or track a grievance, in any language. Include your registration number (AGR-YYYY-NNNNNN) for a status update.',
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const log = useRef<HTMLDivElement>(null)
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [turns, open])

  async function ask(text: string) {
    const question = text.trim()
    if (!question || busy) return
    const history = turns.slice(1)
    setTurns(list => [...list, { role: 'user', text: question }])
    setInput('')
    setBusy(true)
    try {
      const { reply } = await request<{ reply: string }>('/api/assistant', 'POST', { message: question, history })
      setTurns(list => [...list, { role: 'model', text: reply }])
    } catch (error) {
      setTurns(list => [...list, { role: 'model', text: message(error) }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {open && (
        <section className="chat" aria-label="CivicResolve Sahayak assistant">
          <div className="chat-head">
            <div className="row" style={{ gap: '.5rem' }}>
              <Bot size={22} />
              <div>
                <strong>CivicResolve Sahayak</strong>
                <span>AI helpdesk · Gemini</span>
              </div>
            </div>
            <button
              className="btn-sm"
              style={{ background: 'transparent', borderColor: '#ffffff55' }}
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
            >
              <X size={16} />
            </button>
          </div>
          <div className="chat-log" ref={log} aria-live="polite">
            {turns.map((turn, index) => (
              <div key={index} className={'msg ' + turn.role} dir="auto">
                {turn.text}
              </div>
            ))}
            {busy && (
              <div className="msg model">
                <Loader2 size={14} className="spin" style={{ display: 'inline' }} /> Thinking…
              </div>
            )}
            {turns.length === 1 && (
              <div className="chips">
                {starters.map(item => (
                  <button key={item} onClick={() => void ask(item)}>
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault()
              void ask(input)
            }}
          >
            <input
              value={input}
              onChange={event => setInput(event.target.value)}
              placeholder="Type your question…"
              maxLength={600}
              aria-label="Your question"
            />
            <button disabled={busy || !input.trim()} aria-label="Send">
              <Send size={16} />
            </button>
          </form>
        </section>
      )}
      <button className="chat-fab no-print" onClick={() => setOpen(value => !value)} aria-expanded={open}>
        <MessageCircle size={20} />
        {open ? 'Close' : 'Ask Sahayak'}
      </button>
    </>
  )
}
