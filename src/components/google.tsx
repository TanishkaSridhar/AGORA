'use client'

import { useState } from 'react'
import type { AuthSession } from '@/lib/model'
import { message, request } from './client'

/** Google sign-in through Firebase Authentication. Rendered only when the Firebase web config is set. */
export function GoogleButton({
  onSignedIn,
  label = 'Sign in with Google',
}: {
  onSignedIn: (session: AuthSession) => void
  label?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function signIn() {
    setBusy(true)
    setError('')
    try {
      const [{ initializeApp, getApps }, { getAuth, GoogleAuthProvider, signInWithPopup }] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
      ])
      const app =
        getApps()[0] ??
        initializeApp({
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
        })
      const credential = await signInWithPopup(getAuth(app), new GoogleAuthProvider())
      const session = await request<AuthSession>('/api/auth/google', 'POST', {
        idToken: await credential.user.getIdToken(),
      })
      onSignedIn(session)
    } catch (error) {
      setError(message(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="stack-sm">
      <button
        type="button"
        className="btn-ghost"
        onClick={() => void signIn()}
        disabled={busy}
        style={{ width: '100%' }}
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
          <path
            fill="#FFC107"
            d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
          />
          <path
            fill="#FF3D00"
            d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
          />
          <path
            fill="#4CAF50"
            d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
          />
          <path
            fill="#1976D2"
            d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
          />
        </svg>
        {busy ? 'Connecting to Google…' : label}
      </button>
      {error && (
        <p role="alert" className="alert alert-danger small">
          {error}
        </p>
      )}
    </div>
  )
}
