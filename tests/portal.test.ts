import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as login } from '../src/app/api/auth/login/route'
import { GET as captcha } from '../src/app/api/auth/captcha/route'
import { POST as requestOtp } from '../src/app/api/auth/otp/route'
import { POST as verifyOtp } from '../src/app/api/auth/otp/verify/route'
import { GET as issueList } from '../src/app/api/issues/route'
import { PATCH as patch } from '../src/app/api/issues/[id]/route'
import { POST as retriage } from '../src/app/api/issues/[id]/retriage/route'
import { POST as triage } from '../src/app/api/triage/route'
import { GET as track } from '../src/app/api/track/route'
import { GET as mine } from '../src/app/api/my/route'
import { GET as notices, POST as postNotice } from '../src/app/api/notices/route'
import { GET as insights } from '../src/app/api/admin/insights/route'
import { GET as exportCsv } from '../src/app/api/admin/export/route'
import { POST as assistant } from '../src/app/api/assistant/route'
import { modelChain, resetAiHealth } from '../src/lib/ai'
import { clearLockouts } from '../src/lib/auth'
import { departments, escalationLevel, type IssueSummary } from '../src/lib/model'
import { clearMemory, mutateIssue } from '../src/lib/store'

const generate = vi.hoisted(() => vi.fn())
vi.mock('@google/genai', async importOriginal => {
  const actual = await importOriginal<typeof import('@google/genai')>()
  return { ...actual, GoogleGenAI: class { models = { generateContent: generate } } }
})

const image = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
const location = { address: 'Ward 4, Chennai', lat: 13.04, lng: 80.23 }
const triaged = {
  title: 'Open drain near school', translatedDescription: 'There is an open drain near the school.', detectedLanguage: 'English',
  category: 'Drain', department: departments[2], severity: 5, urgencyLabel: 'Critical', confidence: 0.9,
  hazardSummary: 'Uncovered drain', recommendedAction: 'Cover the drain.', citizenReplyNative: 'Registered.', estimatedSlaHours: 4, isValidCivicIssue: true,
}
const mockResult = (data: unknown) => generate.mockResolvedValueOnce({ text: JSON.stringify(data) })
const overloaded = () => generate.mockRejectedValueOnce(new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}'))
const allDown = () => modelChain().forEach(overloaded)
const context = (id: string) => ({ params: Promise.resolve({ id }) })
function input(body?: unknown, cookie?: string, method = 'POST', path = '/') {
  return new Request('http://localhost' + path, {
    method, headers: { ...(cookie ? { Cookie: cookie } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}
const cookieOf = (response: Response) => response.headers.get('set-cookie')!.split(';')[0]
async function demo(role: string) { return cookieOf(await login(input({ demo: role }))) }
async function citizen(mobile: string) {
  const sent = await (await requestOtp(input({ mobile }))).json()
  expect(sent.demoOtp).toMatch(/^\d{6}$/)
  const verified = await verifyOtp(input({ challenge: sent.challenge, otp: sent.demoOtp }))
  expect(verified.status).toBe(200)
  return cookieOf(verified)
}
async function captchaAnswer() {
  const { image: svg, token } = await (await captcha()).json()
  const markup = Buffer.from(svg.split(',')[1], 'base64').toString()
  return { token, answer: [...markup.matchAll(/<text[^>]*>(.)<\/text>/g)].map(match => match[1]).join('') }
}
async function lodge(cookie?: string, body: object = {}) {
  const response = await triage(input({ imageBase64: image, description: 'Open drain near the school gate', preferredLanguage: 'English', location, citizen: { name: 'Asha' }, ...body }, cookie))
  return { status: response.status, body: await response.json() }
}

beforeEach(() => {
  clearMemory()
  resetAiHealth()
  clearLockouts()
  generate.mockReset()
  process.env.GEMINI_API_KEY = 'mock-key'
  process.env.CIVIC_DEMO_LOGIN = 'true'
  process.env.CIVIC_PASSWORD_ROADS = 'correct-horse-battery'
  delete process.env.GEMINI_MODEL
  delete process.env.GEMINI_FALLBACK_MODELS
})

describe('resilient AI', () => {
  it('fails over to the next model when the primary is overloaded, then skips the benched model', async () => {
    overloaded()
    mockResult(triaged)
    expect((await lodge()).status).toBe(201)
    expect(generate.mock.calls.map(call => call[0].model)).toEqual(['gemini-3.8-flash', 'gemini-3.1-flash-lite'])
    mockResult(triaged)
    await lodge(undefined, { location: { address: 'Elsewhere', lat: 20, lng: 80 } })
    expect(generate.mock.calls.at(-1)![0].model).toBe('gemini-3.1-flash-lite')
  })

  it('accepts the report with keyword routing when every model is down, and re-triages later', async () => {
    allDown()
    const { status, body } = await lodge()
    expect(status).toBe(201)
    expect(body).toMatchObject({ aiPending: true, issue: { assignedDepartment: 'Water Supply & Drainage', aiPending: true } })
    expect(body.refNo).toMatch(/^AGR-\d{4}-\d{6}$/)
    const admin = await demo('admin')
    resetAiHealth()
    mockResult({ ...triaged, department: departments[0], title: 'Re-triaged drain' })
    const updated = await (await retriage(input(undefined, admin), context(body.issue.id))).json()
    expect(updated).toMatchObject({ aiPending: false, title: 'Re-triaged drain', assignedDepartment: departments[0] })
  })

  it('falls back to a rule-based commissioner brief when Gemini fails', async () => {
    mockResult(triaged)
    await lodge()
    const admin = await demo('admin')
    allDown()
    const brief = await (await insights(input(undefined, admin, 'GET', '/api/admin/insights'))).json()
    expect(brief).toMatchObject({ source: 'rules', scope: 'All departments' })
    expect(brief.headline).toContain('1 pending')
    expect((await insights(input(undefined, undefined, 'GET', '/api/admin/insights'))).status).toBe(401)
  })

  it('answers helpdesk questions with live ticket context and degrades gracefully', async () => {
    mockResult(triaged)
    const { body } = await lodge()
    mockResult({ reply: 'Your grievance is pending with Water Supply & Drainage.' })
    const answer = await (await assistant(input({ message: 'Status of ' + body.refNo + '?' }))).json()
    expect(answer).toMatchObject({ ticketRef: body.refNo, reply: expect.stringContaining('pending') })
    expect(JSON.stringify(generate.mock.lastCall![0].contents)).toContain(body.refNo)
    allDown()
    expect(await (await assistant(input({ message: 'Status of ' + body.refNo }))).json()).toMatchObject({ degraded: true, reply: expect.stringContaining(body.refNo) })
  })
})

describe('credible sign-in', () => {
  it('requires a valid captcha, then a second-factor OTP for officers', async () => {
    const wrong = await login(input({ email: 'roads@civicresolve.gov', password: 'correct-horse-battery', captchaToken: 'x.y', captchaAnswer: 'AAAAA' }))
    expect(wrong.status).toBe(400)
    const { token, answer } = await captchaAnswer()
    const first = await (await login(input({ email: 'roads@civicresolve.gov', password: 'correct-horse-battery', captchaToken: token, captchaAnswer: answer.toLowerCase() }))).json()
    expect(first).toMatchObject({ otpRequired: true, demoOtp: expect.stringMatching(/^\d{6}$/) })
    expect((await login(input({ challenge: first.challenge, otp: first.demoOtp === '000000' ? '111111' : '000000' }))).status).toBe(401)
    const done = await login(input({ challenge: first.challenge, otp: first.demoOtp }))
    expect(done.status).toBe(200)
    expect(await done.json()).toMatchObject({ role: 'DEPT_STAFF', department: departments[0], method: 'password' })
  })

  it('locks an officer account after five failed passwords', async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { token, answer } = await captchaAnswer()
      expect((await login(input({ email: 'roads@civicresolve.gov', password: 'wrong', captchaToken: token, captchaAnswer: answer }))).status).toBe(401)
    }
    const { token, answer } = await captchaAnswer()
    const locked = await login(input({ email: 'roads@civicresolve.gov', password: 'correct-horse-battery', captchaToken: token, captchaAnswer: answer }))
    expect(locked.status).toBe(429)
  })

  it('disables demo cards and on-screen OTPs outside demo environments', async () => {
    process.env.CIVIC_DEMO_LOGIN = 'false'
    expect((await login(input({ demo: 'admin' }))).status).toBe(401)
    expect((await requestOtp(input({ mobile: '9876543210' }))).status).toBe(503)
  })
})

describe('citizen journey', () => {
  it('links grievances to a verified mobile, masks contact details publicly, and tracks by registration number', async () => {
    const asha = await citizen('9876543210')
    mockResult(triaged)
    const { body } = await lodge(asha)
    expect(body.issue.citizen).toEqual({ name: 'Asha', mobile: '9876543210' })
    const mineList = await (await mine(input(undefined, asha, 'GET'))).json()
    expect(mineList.map((issue: IssueSummary) => issue.id)).toEqual([body.issue.id])
    const publicList = await (await issueList(input(undefined, undefined, 'GET'))).json()
    expect(publicList[0].citizen).toEqual({ name: 'A***', mobile: '98******10' })
    const tracked = await (await track(input(undefined, undefined, 'GET', '/api/track?ref=' + body.refNo.toLowerCase()))).json()
    expect(tracked).toMatchObject({ id: body.issue.id, citizen: { mobile: '98******10' } })
    expect((await track(input(undefined, undefined, 'GET', '/api/track?ref=AGR-2000-000000'))).status).toBe(404)
  })

  it('lets only the filing citizen rate or reopen a disposed grievance, with translated officer remarks', async () => {
    const asha = await citizen('9876543210')
    const other = await citizen('9123456780')
    mockResult({ ...triaged, detectedLanguage: 'Tamil' })
    const { body } = await lodge(asha)
    const water = await demo('water')
    mockResult({ text: 'வேலை தொடங்கியது.' })
    const started = await (await patch(input({ status: 'IN_PROGRESS', remarks: 'Work started.' }, water, 'PATCH'), context(body.issue.id))).json()
    expect(started.audit.at(-1)).toMatchObject({ remarks: 'Work started.', remarksNative: 'வேலை தொடங்கியது.' })
    expect((await patch(input({ feedback: { rating: 5 } }, asha, 'PATCH'), context(body.issue.id))).status).toBe(409)
    mockResult({ verified: true, confidence: 0.9, notes: 'Fixed.' })
    await patch(input({ status: 'RESOLVED', resolutionImageBase64: image }, water, 'PATCH'), context(body.issue.id))
    expect((await patch(input({ feedback: { rating: 5 } }, other, 'PATCH'), context(body.issue.id))).status).toBe(403)
    const reopened = await (await patch(input({ reopen: { reason: 'Still open' } }, asha, 'PATCH'), context(body.issue.id))).json()
    expect(reopened).toMatchObject({ status: 'IN_PROGRESS', reopenCount: 1 })
    expect(reopened.audit.at(-1)).toMatchObject({ actor: 'Citizen', action: 'Reopened by citizen', remarks: 'Still open' })
  })
})

describe('officer console', () => {
  it('restricts notices, CSV export, reminders and officer assignment by role', async () => {
    mockResult(triaged)
    const { body } = await lodge()
    const admin = await demo('admin')
    const roads = await demo('roads')
    const water = await demo('water')
    expect((await postNotice(input({ text: 'Monsoon alert', kind: 'alert' }, roads))).status).toBe(403)
    expect((await postNotice(input({ text: 'Monsoon alert', kind: 'alert' }, admin))).status).toBe(201)
    expect(await (await notices()).json()).toMatchObject([{ text: 'Monsoon alert', kind: 'alert' }])
    expect((await patch(input({ reminder: true }, water, 'PATCH'), context(body.issue.id))).status).toBe(403)
    expect(await (await patch(input({ reminder: true }, admin, 'PATCH'), context(body.issue.id))).json()).toMatchObject({ remindersSent: 1 })
    expect((await patch(input({ assignedOfficer: 'JE Rao' }, roads, 'PATCH'), context(body.issue.id))).status).toBe(403)
    expect(await (await patch(input({ assignedOfficer: 'JE Rao' }, water, 'PATCH'), context(body.issue.id))).json()).toMatchObject({ assignedOfficer: 'JE Rao', citizen: { name: 'Asha' } })
    expect((await exportCsv(input(undefined, undefined, 'GET'))).status).toBe(401)
    await mutateIssue(body.issue.id, issue => ({ ...issue!, title: '=HYPERLINK("x")' }))
    const csv = await (await exportCsv(input(undefined, water, 'GET'))).text()
    expect(csv).toContain(body.refNo)
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
  })

  it('escalates overdue grievances through three levels', async () => {
    const base = { status: 'OPEN', createdAt: new Date(0).toISOString(), aiTriage: { estimatedSlaHours: 10 } } as unknown as IssueSummary
    expect(escalationLevel(base, 9 * 3_600_000)).toBe(0)
    expect(escalationLevel(base, 10 * 3_600_000)).toBe(1)
    expect(escalationLevel(base, 15 * 3_600_000)).toBe(2)
    expect(escalationLevel(base, 20 * 3_600_000)).toBe(3)
    expect(escalationLevel({ ...base, status: 'RESOLVED' }, 20 * 3_600_000)).toBe(0)
  })
})
