'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AuthSession } from '../lib/model'
import { request } from './client'
import { dictionary, isLang, type Key, type Lang } from './i18n'

export type { Key, Lang }
export type Session = AuthSession & { demoEnabled: boolean; otpDisplay: boolean; googleEnabled: boolean }

const Context = createContext<{
  session?: Session; refresh: () => Promise<Session | undefined>; lang: Lang; setLang: (lang: Lang) => void; t: (key: Key) => string
}>({ refresh: async () => undefined, lang: 'en', setLang: () => {}, t: key => dictionary[key].en })

function store(name: string, value?: string) {
  try {
    if (value === undefined) return localStorage.getItem(name) ?? undefined
    localStorage.setItem(name, value)
  } catch { /* storage unavailable: preferences simply don't persist */ }
}

export function Providers({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>()
  const [lang, setLangState] = useState<Lang>('en')
  const refresh = useCallback(async () => {
    try { const next = await request<Session>('/api/auth/session'); setSession(next); return next } catch { return undefined }
  }, [])
  useEffect(() => {
    void refresh()
    const saved = store('agora-lang')
    if (isLang(saved)) { setLangState(saved); document.documentElement.lang = saved }
    const size = store('agora-font')
    if (size) document.documentElement.style.fontSize = size
    if (store('agora-contrast') === 'high') document.documentElement.dataset.contrast = 'high'
  }, [refresh])
  const setLang = (next: Lang) => { setLangState(next); store('agora-lang', next); document.documentElement.lang = next }
  const t = (key: Key) => dictionary[key][lang] || dictionary[key].en
  return <Context.Provider value={{ session, refresh, lang, setLang, t }}>{children}</Context.Provider>
}

export const usePortal = () => useContext(Context)

export function setFontSize(step: -1 | 0 | 1) {
  const sizes = ['14px', '16px', '18px']
  const current = sizes.indexOf(document.documentElement.style.fontSize || '16px')
  const next = step === 0 ? '16px' : sizes[Math.max(0, Math.min(2, (current < 0 ? 1 : current) + step))]
  document.documentElement.style.fontSize = next
  store('agora-font', next)
}

export function toggleContrast() {
  const root = document.documentElement
  const high = root.dataset.contrast !== 'high'
  if (high) root.dataset.contrast = 'high'
  else delete root.dataset.contrast
  store('agora-contrast', high ? 'high' : 'normal')
}
