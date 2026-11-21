import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { HttpError } from './http'
import { departments, mobileSchema, type AuthSession } from './model'

const accounts = ['admin', 'roads', 'sanitation', 'water', 'electrical', 'safety']
const jobNames = [
  'Municipal Commissioner',
  'Roads Field Engineer',
  'Sanitation Field Officer',
  'Water Field Engineer',
  'Electrical Field Engineer',
  'Public Safety Field Officer',
]
export const officerDomain = '@civicresolve.gov'
export const citizen: AuthSession = { name: 'Public Citizen', email: '', role: 'CITIZEN' }
export const demoEnabled = () =>
  process.env.CIVIC_DEMO_LOGIN === 'true' ||
  (process.env.NODE_ENV !== 'production' && process.env.CIVIC_DEMO_LOGIN !== 'false')
/** OTPs are shown on screen (simulated SMS gateway) only in demo environments or when explicitly enabled. */
export const otpDisplay = () => demoEnabled() || process.env.CIVIC_OTP_DISPLAY === 'true'
export const googleEnabled = () =>
  Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN)
type Lockout = { fails: number[]; until?: number }
const localState = globalThis as typeof globalThis & { civicSessionKey?: Buffer; civicLockouts?: Map<string, Lockout> }
const localKey = (localState.civicSessionKey ??= randomBytes(32))
const lockouts = (localState.civicLockouts ??= new Map())
const lifetime = 8 * 60 * 60
const citizenLifetime = 7 * 24 * 60 * 60

function key() {
  const secret = process.env.CIVIC_SESSION_SECRET
  if (secret && secret.length >= 32) return secret
  if (process.env.NODE_ENV === 'production')
    throw new Error('Configure CIVIC_SESSION_SECRET with at least 32 characters')
  return localKey
}

function equal(a: string, b: string) {
  const digest = (input: string) => createHmac('sha256', key()).update(input).digest()
  return timingSafeEqual(digest(a), digest(b))
}

function sign(payload: string) {
  return createHmac('sha256', key()).update(payload).digest('base64url')
}
const hash = (purpose: string, value: string) =>
  createHmac('sha256', key())
    .update(purpose + ':' + value)
    .digest('base64url')

/** Signs a short-lived JSON token (captcha and OTP challenges). */
function seal(data: object) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url')
  return payload + '.' + sign(payload)
}
function unseal<T>(token: string | undefined): T | undefined {
  if (!token) return
  const [payload, signature, extra] = token.split('.')
  if (extra !== undefined || !payload || !signature || !equal(signature, sign(payload))) return
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as T & { exp: number }
    return data.exp > Date.now() ? data : undefined
  } catch {
    return
  }
}

function official(index: number, extra: Partial<AuthSession> = {}): AuthSession {
  return {
    email: accounts[index] + officerDomain,
    name: jobNames[index],
    role: index === 0 ? 'SUPER_ADMIN' : 'DEPT_STAFF',
    ...(index > 0 ? { department: departments[index - 1] } : {}),
    ...(extra.method ? { method: extra.method } : {}),
    ...(extra.signedInAt ? { signedInAt: extra.signedInAt } : {}),
  }
}
const accountIndex = (email?: string) =>
  accounts.findIndex(account => account + officerDomain === email?.trim().toLowerCase())
export const officerDirectory = accounts.map((_, index) => official(index))

// ---------------------------------------------------------------------------
// Captcha: server-rendered SVG with a signed, expiring answer hash.
// ---------------------------------------------------------------------------

const captchaAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function captcha() {
  const answer = Array.from({ length: 5 }, () => captchaAlphabet[randomInt(captchaAlphabet.length)]).join('')
  const noise = Array.from(
    { length: 6 },
    () =>
      `<path d="M${randomInt(150)} ${randomInt(46)} Q${randomInt(150)} ${randomInt(46)} ${randomInt(150)} ${randomInt(46)}" stroke="hsl(${randomInt(360)},45%,45%)" stroke-width="1.3" fill="none" opacity=".7"/>`,
  ).join('')
  const dots = Array.from(
    { length: 30 },
    () => `<circle cx="${randomInt(150)}" cy="${randomInt(46)}" r="1" fill="#556"/>`,
  ).join('')
  const glyphs = [...answer]
    .map(
      (char, index) =>
        `<text x="${14 + index * 26}" y="${31 + randomInt(7) - 3}" transform="rotate(${randomInt(31) - 15} ${20 + index * 26} 25)" font-family="Courier New,monospace" font-size="${24 + randomInt(5)}" font-weight="700" fill="hsl(${210 + randomInt(40)},55%,${25 + randomInt(15)}%)">${char}</text>`,
    )
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="46" viewBox="0 0 150 46"><rect width="150" height="46" fill="#eef2f7"/>${dots}${glyphs}${noise}</svg>`
  return {
    image: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'),
    token: seal({ h: hash('captcha', answer), exp: Date.now() + 5 * 60_000 }),
  }
}
function captchaValid(token?: string, answer?: string) {
  const data = unseal<{ h: string }>(token)
  return !!data && !!answer && equal(data.h, hash('captcha', answer.trim().toUpperCase()))
}

// ---------------------------------------------------------------------------
// Account lockout: 5 failed attempts within 15 minutes locks the account for 15 minutes.
// ---------------------------------------------------------------------------

const window15 = 15 * 60_000
function lockedFor(id: string) {
  const entry = lockouts.get(id)
  return entry?.until && entry.until > Date.now() ? Math.ceil((entry.until - Date.now()) / 60_000) : 0
}
function recordFailure(id: string) {
  const now = Date.now()
  const entry: Lockout = lockouts.get(id) ?? { fails: [] }
  entry.fails = [...entry.fails.filter(at => now - at < window15), now]
  if (entry.fails.length >= 5) {
    entry.until = now + window15
    entry.fails = []
  }
  lockouts.set(id, entry)
  return Math.max(0, 5 - entry.fails.length)
}
export function clearLockouts() {
  lockouts.clear()
}

// ---------------------------------------------------------------------------
// OTP challenges (officer second factor and citizen mobile sign-in).
// ---------------------------------------------------------------------------

type Challenge = { p: 'officer' | 'citizen'; sub: string; h: string; exp: number; n: string }
function otpChallenge(purpose: Challenge['p'], subject: string) {
  const otp = String(randomInt(100000, 1000000))
  const nonce = randomBytes(6).toString('base64url')
  const token = seal({ p: purpose, sub: subject, h: hash('otp:' + nonce, otp), exp: Date.now() + 5 * 60_000, n: nonce })
  return { challenge: token, ...(otpDisplay() ? { demoOtp: otp } : {}), expiresInSeconds: 300 }
}
function otpValid(token: string | undefined, otp: string | undefined, purpose: Challenge['p']) {
  const data = unseal<Challenge>(token)
  if (!data || data.p !== purpose || !otp || !/^\d{6}$/.test(otp)) return
  return equal(data.h, hash('otp:' + data.n, otp)) ? data.sub : undefined
}

export class AuthError extends HttpError {}

export type LoginBody = {
  email?: string
  password?: string
  demo?: string
  captchaToken?: string
  captchaAnswer?: string
  challenge?: string
  otp?: string
}
export type LoginResult =
  | { session: AuthSession }
  | { otpRequired: true; challenge: string; demoOtp?: string; maskedTo: string; expiresInSeconds: number }

/**
 * Officer sign-in.
 * 1. Demo cards (judge environment only) sign in directly.
 * 2. Email + password + captcha. When OTPs can be delivered (demo SMS display), a second
 *    step is required: the client re-posts the challenge with the 6-digit OTP.
 */
export function officerLogin(body: LoginBody): LoginResult {
  if (body.demo) {
    if (demoEnabled() && ['admin', 'roads', 'sanitation', 'water', 'electrical', 'safety'].includes(body.demo)) {
      return {
        session: official(accounts.indexOf(body.demo), { method: 'demo', signedInAt: new Date().toISOString() }),
      }
    }
    throw new AuthError(401, 'Demo access is disabled on this deployment')
  }
  if (body.challenge) {
    const email = otpValid(body.challenge, body.otp, 'officer')
    const index = accountIndex(email)
    if (index < 0) throw new AuthError(401, 'Incorrect or expired OTP. Request a new one.')
    return { session: official(index, { method: 'password', signedInAt: new Date().toISOString() }) }
  }
  if (!captchaValid(body.captchaToken, body.captchaAnswer))
    throw new AuthError(400, 'The captcha did not match. Please try the new image.', { captcha: true })
  const index = accountIndex(body.email)
  const id = (body.email ?? '').trim().toLowerCase()
  const locked = lockedFor(id)
  if (locked)
    throw new AuthError(
      429,
      `Account temporarily locked after repeated failed attempts. Try again in ${locked} minute(s).`,
    )
  const password = index >= 0 ? process.env['CIVIC_PASSWORD_' + accounts[index].toUpperCase()] : undefined
  if (index < 0 || !body.password || !password || !equal(password, body.password)) {
    const left = index >= 0 ? recordFailure(id) : 5
    throw new AuthError(
      401,
      'Invalid User ID or password.' +
        (index >= 0 && left < 5 ? ` ${left} attempt(s) left before the account is locked.` : ''),
    )
  }
  lockouts.delete(id)
  if (!otpDisplay()) return { session: official(index, { method: 'password', signedInAt: new Date().toISOString() }) }
  return {
    otpRequired: true,
    maskedTo: 'the mobile number registered for ' + accounts[index] + officerDomain,
    ...otpChallenge('officer', accounts[index] + officerDomain),
  }
}

/** Legacy helper retained for callers that only need a session or null. */
export function authenticate(body: LoginBody) {
  try {
    const result = officerLogin(body)
    return 'session' in result ? result.session : null
  } catch {
    return null
  }
}

export function requestCitizenOtp(mobile: unknown) {
  const number = mobileSchema.parse(mobile)
  if (!otpDisplay())
    throw new AuthError(
      503,
      'SMS OTP is not configured on this deployment. Please use Google sign-in or lodge as a guest.',
    )
  const id = 'otp:' + number
  if (lockedFor(id)) throw new AuthError(429, 'Too many OTP requests. Please try again later.')
  recordFailure(id) // also acts as a rate limit: 5 OTP requests per 15 minutes
  return otpChallenge('citizen', number)
}

export function verifyCitizenOtp(challenge?: string, otp?: string): AuthSession {
  const mobile = otpValid(challenge, otp, 'citizen')
  if (!mobile) throw new AuthError(401, 'Incorrect or expired OTP. Please request a new one.')
  return {
    ...citizen,
    name: 'Citizen ' + mobile.slice(-4),
    mobile,
    method: 'otp',
    signedInAt: new Date().toISOString(),
  }
}

/** Verifies a Firebase Google ID token. Allow-listed emails map to officer accounts; others are citizens. */
export async function googleLogin(idToken: string): Promise<AuthSession> {
  if (!googleEnabled()) throw new AuthError(503, 'Google sign-in is not configured')
  const { getApps, initializeApp } = await import('firebase-admin/app')
  const { getAuth } = await import('firebase-admin/auth')
  const app =
    getApps().find(item => item.name === 'agora-auth') ??
    initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'agora26' }, 'agora-auth')
  const decoded = await getAuth(app)
    .verifyIdToken(idToken)
    .catch(() => {
      throw new AuthError(401, 'Google sign-in could not be verified')
    })
  const email = decoded.email?.toLowerCase()
  if (!email || !decoded.email_verified) throw new AuthError(401, 'A verified Google email is required')
  const signedInAt = new Date().toISOString()
  for (const entry of (process.env.CIVIC_GOOGLE_OFFICERS ?? '').split(/[;,]/)) {
    const [allowed, account] = entry.split('=').map(part => part?.trim().toLowerCase())
    if (allowed === email && accounts.includes(account))
      return official(accounts.indexOf(account), { method: 'google', signedInAt })
  }
  return { ...citizen, name: decoded.name || email, email, method: 'google', signedInAt }
}

export function sessionCookie(session?: AuthSession, secure = process.env.NODE_ENV === 'production') {
  const age = session?.role === 'CITIZEN' ? citizenLifetime : lifetime
  const payload = session
    ? Buffer.from(JSON.stringify({ ...session, expires: Date.now() + age * 1000 })).toString('base64url')
    : ''
  const value = session ? payload + '.' + sign(payload) : ''
  return (
    'civic_session=' +
    value +
    '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' +
    (session ? age : 0) +
    (secure ? '; Secure' : '')
  )
}

export function readSession(request: Request): AuthSession {
  try {
    const token = request.headers.get('cookie')?.match(/(?:^|;\s*)civic_session=([^;]+)/)?.[1]
    if (!token) return citizen
    const [payload, signature, extra] = token.split('.')
    if (extra !== undefined || !signature || !equal(signature, sign(payload))) return citizen
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as AuthSession & { expires: number }
    if (!(data.expires > Date.now())) return citizen
    const index = accountIndex(data.email)
    if (index >= 0 && data.role !== 'CITIZEN') return official(index, data)
    if (data.role === 'CITIZEN' && (data.mobile ? mobileSchema.safeParse(data.mobile).success : data.email)) {
      return {
        ...citizen,
        name: String(data.name).slice(0, 100),
        email: data.email ?? '',
        ...(data.mobile ? { mobile: data.mobile } : {}),
        ...(data.method ? { method: data.method } : {}),
        ...(data.signedInAt ? { signedInAt: data.signedInAt } : {}),
      }
    }
  } catch {
    return citizen
  }
  return citizen
}

export const isOfficer = (session: AuthSession) => session.role === 'SUPER_ADMIN' || session.role === 'DEPT_STAFF'

/** Throws 401/403 unless the request carries an officer session (optionally the Commissioner). */
export function requireOfficer(request: Request, adminOnly = false) {
  const session = readSession(request)
  if (!isOfficer(session)) throw new HttpError(401, 'Officer sign-in required')
  if (adminOnly && session.role !== 'SUPER_ADMIN') throw new HttpError(403, 'Only the Commissioner can do this')
  return session
}
