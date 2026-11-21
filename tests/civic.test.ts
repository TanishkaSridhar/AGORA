import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as login } from '../src/app/api/auth/login/route'
import { GET as session } from '../src/app/api/auth/session/route'
import { GET as issueList } from '../src/app/api/issues/route'
import { GET as issueDetail, PATCH as patch } from '../src/app/api/issues/[id]/route'
import { POST as escalation } from '../src/app/api/issues/[id]/escalation/route'
import { POST as triage } from '../src/app/api/triage/route'
import { POST as seed } from '../src/app/api/issues/seed/route'
import { haversineMeters, nearby } from '../src/lib/geo'
import { departments, type CivicIssue } from '../src/lib/model'
import { clearMemory, listIssues, mutateIssue } from '../src/lib/store'
import { resetAiHealth } from '../src/lib/ai'
import { clearLockouts } from '../src/lib/auth'

const generate = vi.hoisted(() => vi.fn())
vi.mock('@google/genai', async importOriginal => {
  const actual = await importOriginal<typeof import('@google/genai')>()
  return { ...actual, GoogleGenAI: class { models = { generateContent: generate } } }
})

const image = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
const latitude = 13.04
const home = { address: 'Ward 4, Chennai', lat: latitude, lng: 80.23 }
const report = { imageBase64: image, description: 'பெரிய பள்ளம் உள்ளது.', preferredLanguage: 'Tamil', location: home }
const response = {
  title: 'Pothole near bus stop', translatedDescription: 'A large pothole is present.', detectedLanguage: 'Tamil',
  category: 'Pothole', department: departments[0], severity: 4, urgencyLabel: 'High', confidence: 0.93,
  hazardSummary: 'Open pothole in a busy roadway', recommendedAction: 'Barricade the pothole and repair the road surface.',
  citizenReplyNative: 'புகார் பதிவு செய்யப்பட்டது. பள்ளத்திலிருந்து விலகி இருங்கள்.',
  estimatedSlaHours: 24, isValidCivicIssue: true, cascadingRiskAlert: 'Water could obscure the pothole during rain.',
}

function input(body?: unknown, cookie?: string, method = 'POST', path = '/') {
  return new Request('http://localhost' + path, {
    method, headers: { ...(cookie ? { Cookie: cookie } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}
function mockResult(data: unknown) { generate.mockResolvedValueOnce({ text: JSON.stringify(data) }) }
const context = (id: string) => ({ params: Promise.resolve({ id }) })

async function submit() {
  mockResult(response)
  const result = await triage(input(report))
  expect(result.status).toBe(201)
  return (await result.json()).issue as CivicIssue
}
async function signIn(demo: string) {
  const result = await login(input({ demo }))
  expect(result.status).toBe(200)
  const cookie = result.headers.get('set-cookie')!
  expect(cookie).toContain('HttpOnly')
  return cookie.split(';')[0]
}
async function update(id: string, body: object, cookie?: string) {
  return patch(input(body, cookie, 'PATCH'), context(id))
}

beforeEach(() => {
  clearMemory()
  resetAiHealth()
  clearLockouts()
  generate.mockReset()
  process.env.GEMINI_API_KEY = 'mock-key'
  process.env.CIVIC_DEMO_LOGIN = 'true'
})

describe('geospatial and semantic triage', () => {
  it('uses a 100m Haversine threshold and normalized address fallback', () => {
    const point = (meters: number) => ({ ...home, lat: latitude + meters / 6_371_000 * 180 / Math.PI })
    expect(haversineMeters(home, point(100))).toBeCloseTo(100, 7)
    expect(nearby(home, point(99))).toBe(true)
    expect(nearby(home, point(101))).toBe(false)
    expect(nearby(home, { address: ' WARD 4 - CHENNAI ' })).toBe(true)
  })

  it.each([
    ['Tamil', report.description, response.citizenReplyNative],
    ['Hindi', 'सड़क पर गड्ढा है।', 'शिकायत दर्ज है। गड्ढे से दूर रहें।'],
  ])('generates a validated English work order with a %s citizen reply', async (language, description, reply) => {
    mockResult({ ...response, detectedLanguage: language, citizenReplyNative: reply })
    const result = await triage(input({ ...report, description, preferredLanguage: language }))
    expect(result.status).toBe(201)
    const { issue } = await result.json()
    expect(issue.detectedLanguage).toBe(language)
    expect(issue.aiTriage.recommendedAction).toBe(response.recommendedAction)
    expect(issue.aiTriage.citizenReplyNative).toBe(reply)
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-3.8-flash',
      config: expect.objectContaining({ responseMimeType: 'application/json', responseSchema: expect.any(Object) }),
    }))
  })

  it('merges matching nearby reports and keeps their evidence', async () => {
    const original = await submit()
    mockResult(response)
    mockResult({ id: original.id })
    const result = await triage(input({ ...report, location: { ...home, lat: latitude + 0.0005 } }))
    expect(result.status).toBe(200)
    expect(await result.json()).toMatchObject({ merged: true, issue: { id: original.id, upvotes: 1, duplicateMergeCount: 1 } })
    const stored = await listIssues()
    expect(stored).toHaveLength(1)
    expect(stored[0].corroboratingImages).toEqual([image])
  })

  it('keeps nearby reports separate when the semantic match is absent', async () => {
    await submit()
    mockResult(response)
    mockResult({ id: '' })
    expect((await triage(input(report))).status).toBe(201)
    expect(await listIssues()).toHaveLength(2)
  })

  it('does not persist spam or malformed image input', async () => {
    mockResult({ ...response, isValidCivicIssue: false })
    expect((await triage(input(report))).status).toBe(400)
    expect((await triage(input({ ...report, imageBase64: 'invalid' }))).status).toBe(400)
    expect(await listIssues()).toHaveLength(0)
  })
})

describe('roles, verification and escalation', () => {
  it('scopes staff reads and updates, grants commissioner controls, and allows public votes', async () => {
    const ticket = await submit()
    const roads = await signIn('roads')
    const sanitation = await signIn('sanitation')
    const admin = await signIn('admin')
    await expect((await session(input(undefined, roads + 'x', 'GET'))).json()).resolves.toMatchObject({ role: 'CITIZEN' })
    expect(await (await issueList(input(undefined, sanitation, 'GET'))).json()).toEqual([])
    expect((await issueDetail(input(undefined, sanitation, 'GET'), context(ticket.id))).status).toBe(403)
    expect((await update(ticket.id, { status: 'IN_PROGRESS' })).status).toBe(403)
    expect((await update(ticket.id, { status: 'IN_PROGRESS' }, sanitation)).status).toBe(403)
    expect((await update(ticket.id, { assignedDepartment: departments[1] }, roads)).status).toBe(403)
    expect((await update(ticket.id, { severity: 5 }, roads)).status).toBe(403)
    expect((await update(ticket.id, { status: 'IN_PROGRESS' }, roads)).status).toBe(200)
    expect((await update(ticket.id, { upvote: true })).status).toBe(200)
    const updated = await update(ticket.id, { assignedDepartment: departments[1], severity: 5, estimatedSlaHours: 4 }, admin)
    expect(updated.status).toBe(200)
    expect(await updated.json()).toMatchObject({
      assignedDepartment: departments[1], upvotes: 1, aiTriage: { severity: 5, urgencyLabel: 'Critical', estimatedSlaHours: 4 },
    })
  })

  it('compares both photos and requires a verified fix to close a ticket', async () => {
    const ticket = await submit()
    const roads = await signIn('roads')
    const close = { status: 'RESOLVED', resolutionImageBase64: image }
    expect((await update(ticket.id, close, roads)).status).toBe(409)
    await update(ticket.id, { status: 'IN_PROGRESS' }, roads)
    expect((await update(ticket.id, { status: 'RESOLVED' }, roads)).status).toBe(400)
    mockResult({ verified: false, confidence: 0.87, notes: 'The hazard remains visible.' })
    expect(await (await update(ticket.id, close, roads)).json()).toMatchObject({
      status: 'IN_PROGRESS', resolutionVerification: { verified: false },
    })
    expect(generate.mock.lastCall?.[0].contents[0].parts.filter((part: object) => 'inlineData' in part)).toHaveLength(2)
    mockResult({ verified: true, confidence: 0.94, notes: 'The same roadway is visibly repaired.' })
    expect(await (await update(ticket.id, close, roads)).json()).toMatchObject({
      status: 'RESOLVED', resolutionVerification: { verified: true }, handledBy: 'roads@civicresolve.gov',
    })
    const detail = await issueDetail(input(undefined, undefined, 'GET'), context(ticket.id))
    expect(await detail.json()).toMatchObject({ resolutionImageBase64: image })
  })

  it('only drafts escalation letters for overdue issues', async () => {
    const ticket = await submit()
    expect((await escalation(input({ language: 'Tamil' }), context(ticket.id))).status).toBe(409)
    await mutateIssue(ticket.id, issue => ({ ...issue!, createdAt: '2020-01-01T00:00:00.000Z' }))
    mockResult({ letter: 'நகராட்சி புகார் கடிதம்' })
    expect(await (await escalation(input({ language: 'Tamil' }), context(ticket.id))).json()).toEqual({ letter: 'நகராட்சி புகார் கடிதம்' })
  })

  it('loads multilingual demo reports across every department without duplicating them', async () => {
    expect((await seed(input())).status).toBe(200)
    expect((await seed(input())).status).toBe(200)
    const issues = await listIssues(undefined, undefined, false, true)
    expect(issues).toHaveLength(16)
    expect(new Set(issues.map(issue => issue.detectedLanguage)).size).toBe(8)
    expect(new Set(issues.map(issue => issue.assignedDepartment)).size).toBe(departments.length)
    expect(new Set(issues.map(issue => issue.refNo)).size).toBe(16)
    expect(issues.every(issue => issue.imageBase64.startsWith('data:image/jpeg;'))).toBe(true)
  })
})
