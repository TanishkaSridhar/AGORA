import { describe, expect, it } from 'vitest'
import { fallbackTriage, modelChain, rulesInsights } from '../src/lib/ai'
import {
  escalationLevel,
  isOverdue,
  maskMobile,
  mobileSchema,
  reportSchema,
  urgency,
  type IssueSummary,
  type Report,
} from '../src/lib/model'
import { dailyTrend, hoursLabel, percent, shortDept, wardHotspots } from '../src/lib/stats'

const hour = 3_600_000
const now = Date.parse('2026-11-20T12:00:00Z')
const image = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
const location = { address: 'Ward 4, Chennai', lat: 13.04, lng: 80.23 }

function issue(overrides: Partial<IssueSummary> & { slaHours?: number; ageHours?: number; severity?: number } = {}) {
  const { slaHours = 24, ageHours = 1, severity = 3, ...rest } = overrides
  return {
    id: 'x',
    title: 'Pothole',
    status: 'OPEN',
    createdAt: new Date(now - ageHours * hour).toISOString(),
    assignedDepartment: 'Roads & Infrastructure',
    upvotes: 0,
    duplicateMergeCount: 0,
    location: { ...location },
    aiTriage: { severity, estimatedSlaHours: slaHours, hazardSummary: '', recommendedAction: '' },
    ...rest,
  } as unknown as IssueSummary
}

const report = (description: string, extra: Partial<Report> = {}) =>
  ({ imageBase64: image, description, preferredLanguage: 'English', location, ...extra }) as Report

describe('SLA and escalation', () => {
  it('is not overdue before the SLA and never once disposed', () => {
    expect(isOverdue(issue({ ageHours: 23 }), now)).toBe(false)
    expect(isOverdue(issue({ ageHours: 24 }), now)).toBe(true)
    expect(isOverdue(issue({ ageHours: 500, status: 'RESOLVED' }), now)).toBe(false)
  })

  it.each([
    [10, 0],
    [24, 1],
    [35, 1],
    [36, 2],
    [47, 2],
    [48, 3],
    [400, 3],
  ])('a 24h-SLA ticket aged %ih is at escalation level %i', (ageHours, level) => {
    expect(escalationLevel(issue({ ageHours }), now)).toBe(level)
  })
})

describe('model helpers', () => {
  it('maps severity to urgency labels', () => {
    expect([1, 2, 3, 4, 5].map(urgency)).toEqual(['Low', 'Moderate', 'High', 'High', 'Critical'])
  })

  it('masks citizen mobiles and handles missing values', () => {
    expect(maskMobile('9876543210')).toBe('98******10')
    expect(maskMobile(undefined)).toBeUndefined()
  })

  it('accepts only valid Indian mobile numbers', () => {
    expect(mobileSchema.safeParse('9876543210').success).toBe(true)
    for (const bad of ['1234567890', '98765', '98765432101', 'abcdefghij']) {
      expect(mobileSchema.safeParse(bad).success).toBe(false)
    }
  })

  it('requires a description or a voice note, and rejects unknown languages and categories', () => {
    const base = { imageBase64: image, location }
    expect(reportSchema.safeParse({ ...base, description: 'ok' }).success).toBe(false)
    expect(reportSchema.safeParse({ ...base, description: 'Broken streetlight' }).success).toBe(true)
    expect(reportSchema.safeParse({ ...base, audio: 'data:audio/wav;base64,UklGRg==' }).success).toBe(true)
    expect(reportSchema.safeParse({ ...base, audio: 'data:audio/mp3;base64,AAAA' }).success).toBe(false)
    expect(reportSchema.safeParse({ ...base, description: 'Pothole here', preferredLanguage: 'Klingon' }).success).toBe(
      false,
    )
    expect(reportSchema.safeParse({ ...base, description: 'Pothole here', category: 'rocket' }).success).toBe(false)
  })
})

describe('keyword fallback triage', () => {
  it.each([
    ['Sewage overflowing from the drain', 'Water Supply & Drainage'],
    ['सड़क पर बड़ा गड्ढा है', 'Roads & Infrastructure'],
    ['குப்பை குவிந்துள்ளது', 'Sanitation & Solid Waste'],
    ['Street lamp not working', 'Street Lighting & Electrical'],
    ['Fallen tree blocking the park', 'Public Safety & Parks'],
  ])('routes "%s" to %s', (description, department) => {
    expect(fallbackTriage(report(description)).department).toBe(department)
  })

  it('uses the tapped category when the text gives no clue, and raises severity near schools', () => {
    expect(fallbackTriage(report('', { category: 'light' })).department).toBe('Street Lighting & Electrical')
    const school = fallbackTriage(report('Big hole outside the school gate'))
    expect(school.severity).toBe(4)
    expect(school.estimatedSlaHours).toBe(24)
    expect(fallbackTriage(report('Big hole on the road')).estimatedSlaHours).toBe(72)
  })

  it('replies in the citizen language and flags the ticket for AI review', () => {
    const result = fallbackTriage(report('पानी लीक', { preferredLanguage: 'Hindi' }))
    expect(result.citizenReplyNative).toContain('शिकायत')
    expect(result.category).toBe('Pending AI review')
  })
})

describe('model chain', () => {
  it('deduplicates the primary model from the fallback list', () => {
    const saved = { ...process.env }
    process.env.GEMINI_MODEL = 'a'
    process.env.GEMINI_FALLBACK_MODELS = 'b, a ,c,'
    expect(modelChain()).toEqual(['a', 'b', 'c'])
    process.env = saved
  })
})

describe('dashboard statistics', () => {
  it('ranks open ward hotspots by severity and public support', () => {
    const ranked = wardHotspots([
      issue({ location: { ...location, ward: 'A' }, severity: 2 }),
      issue({ location: { ...location, ward: 'B' }, severity: 2, upvotes: 10 }),
      issue({ location: { ...location, ward: 'C' }, severity: 5, status: 'RESOLVED' }),
    ])
    expect(ranked.map(row => row.ward)).toEqual(['B', 'A'])
  })

  it('buckets received grievances into a daily trend', () => {
    const trend = dailyTrend([issue({ ageHours: 1 }), issue({ ageHours: 2 })], 7, now)
    expect(trend).toHaveLength(7)
    expect(trend.reduce((sum, day) => sum + day.received, 0)).toBe(2)
  })

  it('formats labels for the dashboard', () => {
    expect(hoursLabel(undefined)).toBe('—')
    expect(hoursLabel(5)).toBe('5.0 h')
    expect(hoursLabel(72)).toBe('3.0 days')
    expect(percent(0.876)).toBe('88%')
    expect(shortDept('Water Supply & Drainage')).toBe('Water Supply')
  })

  it('builds a rule-based brief that counts overdue items', () => {
    const brief = rulesInsights([issue({ ageHours: 30 }), issue({ ageHours: 1 })], 'All', now)
    expect(brief.headline).toBe('2 pending grievances · 1 beyond SLA')
    expect(brief.source).toBe('rules')
    expect(brief.recommendedActions).toHaveLength(1)
  })
})
