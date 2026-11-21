import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { departments, type AuthSession } from './model'

const accounts = ['admin', 'roads', 'sanitation', 'water', 'electrical', 'safety']
const jobNames = ['Municipal Commissioner', 'Roads Field Engineer', 'Sanitation Field Officer', 'Water Field Engineer', 'Electrical Field Engineer', 'Public Safety Field Officer']
export const citizen: AuthSession = { name: 'Public Citizen', email: '', role: 'CITIZEN' }
export const demoEnabled = () => process.env.CIVIC_DEMO_LOGIN === 'true' || (process.env.NODE_ENV !== 'production' && process.env.CIVIC_DEMO_LOGIN !== 'false')
const localState = globalThis as typeof globalThis & { civicSessionKey?: Buffer }
const localKey = localState.civicSessionKey ??= randomBytes(32)
const lifetime = 8 * 60 * 60

function key() {
  const secret = process.env.CIVIC_SESSION_SECRET
  if (secret && secret.length >= 32) return secret
  if (process.env.NODE_ENV === 'production') throw new Error('Configure CIVIC_SESSION_SECRET with at least 32 characters')
  return localKey
}

function equal(a: string, b: string) {
  const digest = (input: string) => createHmac('sha256', key()).update(input).digest()
  return timingSafeEqual(digest(a), digest(b))
}

function official(index: number): AuthSession {
  return {
    email: accounts[index] + '@civicresolve.gov', name: jobNames[index],
    role: index === 0 ? 'SUPER_ADMIN' : 'DEPT_STAFF',
    ...(index > 0 ? { department: departments[index - 1] } : {}),
  }
}

export function authenticate(body: {email?: string; password?: string; demo?: string}) {
  if (demoEnabled() && body.demo && ['admin', 'roads', 'sanitation'].includes(body.demo)) {
    return official(accounts.indexOf(body.demo))
  }
  const index = accounts.findIndex(account => account + '@civicresolve.gov' === body.email?.trim().toLowerCase())
  if (index < 0 || !body.password) return null
  const password = process.env['CIVIC_PASSWORD_' + accounts[index].toUpperCase()]
  return password && equal(password, body.password) ? official(index) : null
}

function sign(payload: string) {
  return createHmac('sha256', key()).update(payload).digest('base64url')
}

export function sessionCookie(session?: AuthSession, secure = process.env.NODE_ENV === 'production') {
  const payload = session ? Buffer.from(JSON.stringify({ ...session, expires: Date.now() + lifetime * 1000 })).toString('base64url') : ''
  const value = session ? payload + '.' + sign(payload) : ''
  return 'civic_session=' + value + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + (session ? lifetime : 0) + (secure ? '; Secure' : '')
}

export function readSession(request: Request): AuthSession {
  try {
    const token = request.headers.get('cookie')?.match(/(?:^|;\s*)civic_session=([^;]+)/)?.[1]
    if (!token) return citizen
    const [payload, signature, extra] = token.split('.')
    if (extra !== undefined || !signature || !equal(signature, sign(payload))) return citizen
    const { email, expires } = JSON.parse(Buffer.from(payload, 'base64url').toString())
    const index = accounts.findIndex(account => account + '@civicresolve.gov' === email)
    if (index >= 0 && expires > Date.now()) return official(index)
  } catch {
    return citizen
  }
  return citizen
}
