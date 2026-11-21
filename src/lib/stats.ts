import { departments, escalationLevel, isOverdue, statuses, type Department, type IssueSummary } from './model'

const resolvedAt = (issue: IssueSummary) =>
  [...(issue.audit ?? [])].reverse().find(entry => /Disposed|RESOLVED/.test(entry.action))?.at ?? (issue.status === 'RESOLVED' ? issue.updatedAt : undefined)

export function stats(issues: IssueSummary[], now = Date.now()) {
  const open = issues.filter(issue => issue.status !== 'RESOLVED')
  const resolved = issues.filter(issue => issue.status === 'RESOLVED')
  const hours = resolved.map(issue => {
    const at = resolvedAt(issue)
    return at ? (Date.parse(at) - Date.parse(issue.createdAt)) / 3_600_000 : undefined
  }).filter((value): value is number => value !== undefined && value >= 0)
  const withinSla = resolved.filter(issue => {
    const at = resolvedAt(issue)
    return at && Date.parse(at) - Date.parse(issue.createdAt) <= issue.aiTriage.estimatedSlaHours * 3_600_000
  }).length
  const ratings = issues.map(issue => issue.feedback?.rating).filter((value): value is number => !!value)
  return {
    total: issues.length,
    reports: issues.reduce((sum, issue) => sum + 1 + issue.duplicateMergeCount, 0),
    merged: issues.reduce((sum, issue) => sum + issue.duplicateMergeCount, 0),
    open: open.length,
    inProgress: issues.filter(issue => issue.status === 'IN_PROGRESS').length,
    pending: issues.filter(issue => issue.status === 'OPEN').length,
    resolved: resolved.length,
    overdue: open.filter(issue => isOverdue(issue, now)).length,
    critical: open.filter(issue => issue.aiTriage.severity >= 4).length,
    escalated: [1, 2, 3].map(level => open.filter(issue => escalationLevel(issue, now) === level).length),
    verified: resolved.filter(issue => issue.resolutionVerification?.verified).length,
    aiPending: issues.filter(issue => issue.aiPending).length,
    avgResolutionHours: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : undefined,
    slaCompliance: resolved.length ? withinSla / resolved.length : undefined,
    avgRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : undefined,
    languages: new Set(issues.map(issue => issue.detectedLanguage)).size,
  }
}

export function byDepartment(issues: IssueSummary[], now = Date.now()) {
  return departments.map(department => {
    const list = issues.filter(issue => issue.assignedDepartment === department)
    const values = Object.fromEntries(statuses.map(status => [status, list.filter(issue => issue.status === status).length])) as Record<string, number>
    return { department, list, values, ...stats(list, now) }
  })
}

export function dailyTrend(issues: IssueSummary[], days = 14, now = Date.now()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return Array.from({ length: days }, (_, index) => {
    const from = start.getTime() - (days - 1 - index) * 86_400_000
    const to = from + 86_400_000
    const inRange = (value?: string) => !!value && Date.parse(value) >= from && Date.parse(value) < to
    return {
      day: from,
      received: issues.filter(issue => inRange(issue.createdAt)).length,
      disposed: issues.filter(issue => inRange(resolvedAt(issue))).length,
    }
  })
}

export function wardHotspots(issues: IssueSummary[]) {
  const map = new Map<string, IssueSummary[]>()
  for (const issue of issues.filter(item => item.status !== 'RESOLVED')) {
    const ward = issue.location.ward || issue.location.address.split(',').slice(-2).join(',').trim() || 'Unspecified'
    map.set(ward, [...(map.get(ward) ?? []), issue])
  }
  return [...map].map(([ward, list]) => ({ ward, list, score: list.reduce((sum, issue) => sum + issue.aiTriage.severity + issue.upvotes * 0.3, 0) }))
    .sort((a, b) => b.score - a.score)
}

export const shortDept = (department: Department | string) => String(department).split(' & ')[0]
export const hoursLabel = (hours?: number) => hours === undefined ? '—' : hours < 48 ? `${hours.toFixed(1)} h` : `${(hours / 24).toFixed(1)} days`
export const percent = (value?: number) => value === undefined ? '—' : Math.round(value * 100) + '%'
