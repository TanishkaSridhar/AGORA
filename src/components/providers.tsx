'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AuthSession } from '../lib/model'
import { request } from './client'

export type Session = AuthSession & { demoEnabled: boolean; otpDisplay: boolean; googleEnabled: boolean }
type Lang = 'en' | 'hi'

const dictionary = {
  home: ['Home', 'मुख्य पृष्ठ'], lodge: ['Lodge Grievance', 'शिकायत दर्ज करें'], track: ['Track Status', 'स्थिति देखें'],
  dashboard: ['Public Dashboard', 'सार्वजनिक डैशबोर्ड'], charter: ['Citizen Charter', 'नागरिक चार्टर'], help: ['Help & FAQ', 'सहायता'],
  my: ['My Grievances', 'मेरी शिकायतें'], console: ['Officer Console', 'अधिकारी कंसोल'], login: ['Login', 'लॉगिन'], logout: ['Logout', 'लॉगआउट'],
  portal: ['Citizen Grievance Redressal Portal', 'नागरिक शिकायत निवारण पोर्टल'],
  corp: ['Municipal Corporation · Integrated Public Grievance System', 'नगर निगम · एकीकृत लोक शिकायत प्रणाली'],
  skip: ['Skip to main content', 'मुख्य सामग्री पर जाएं'], screen: ['Screen reader access', 'स्क्रीन रीडर'],
  updates: ['Latest updates', 'नवीनतम सूचना'], emergency: ['Emergency', 'आपातकाल'],
} as const
export type Key = keyof typeof dictionary

const Context = createContext<{
  session?: Session; refresh: () => Promise<Session | undefined>; lang: Lang; setLang: (lang: Lang) => void; t: (key: Key) => string
}>({ refresh: async () => undefined, lang: 'en', setLang: () => {}, t: key => dictionary[key][0] })

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
    if (saved === 'hi') setLangState('hi')
    const size = store('agora-font')
    if (size) document.documentElement.style.fontSize = size
    if (store('agora-contrast') === 'high') document.documentElement.dataset.contrast = 'high'
  }, [refresh])
  const setLang = (next: Lang) => { setLangState(next); store('agora-lang', next); document.documentElement.lang = next === 'hi' ? 'hi' : 'en' }
  const t = (key: Key) => dictionary[key][lang === 'hi' ? 1 : 0]
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
