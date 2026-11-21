import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { matchingIssue, triage, verifyResolution } from './ai'
import { readSession } from './auth'
import { nearby } from './geo'
import { HttpError } from './http'
import { departments, jpeg, reportSchema, statuses, urgency, type CivicIssue, type IssueSummary } from './model'
import { commitReport, getIssue, listIssues, mutateIssue } from './store'

export async function submitReport(input: unknown) {
  const report = reportSchema.parse(input)
  const { title, translatedDescription, detectedLanguage, ...aiTriage } = await triage(report)
  if (!aiTriage.isValidCivicIssue) throw new HttpError(400, 'The photo and description must show a civic infrastructure issue.')
  const now = new Date().toISOString()
  const issue: CivicIssue = {
    id: randomUUID(), title, originalDescription: report.description, translatedDescription, detectedLanguage,
    imageBase64: report.imageBase64, corroboratingImages: [], location: report.location, aiTriage,
    status: 'OPEN', assignedDepartment: aiTriage.department, upvotes: 0, duplicateMergeCount: 0,
    createdAt: now, updatedAt: now,
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const open = await listIssues(issue.assignedDepartment, undefined, true)
    const candidates = open.filter(candidate => nearby(candidate.location, issue.location))
    const match = candidates.length ? await matchingIssue(report, candidates) : undefined
    const saved = await commitReport(issue, open, match)
    if (saved) return { issue: summary(saved), merged: !!match, citizenReplyNative: aiTriage.citizenReplyNative }
  }
  throw new HttpError(409, 'Nearby reports changed. Please try again.')
}

export function summary(issue: CivicIssue): IssueSummary {
  const { imageBase64: _before, resolutionImageBase64: _after, corroboratingImages: _evidence, ...metadata } = issue
  void [_before, _after, _evidence]
  return metadata
}

export async function visibleIssue(id: string, request: Request) {
  if (!/^[\w-]{1,100}$/.test(id)) throw new HttpError(404, 'Issue not found')
  const issue = await getIssue(id)
  if (!issue) throw new HttpError(404, 'Issue not found')
  const session = readSession(request)
  if (session.role === 'DEPT_STAFF' && issue.assignedDepartment !== session.department) {
    throw new HttpError(403, 'This issue belongs to another department')
  }
  return issue
}

const patchSchema = z.object({
  upvote: z.literal(true).optional(), status: z.enum(statuses).optional(),
  resolutionImageBase64: jpeg.optional(), assignedDepartment: z.enum(departments).optional(),
  severity: z.number().int().min(1).max(5).optional(),
  estimatedSlaHours: z.number().int().min(1).max(8760).optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'Choose an update')

export async function updateIssue(id: string, request: Request, input: unknown) {
  if (!/^[\w-]{1,100}$/.test(id)) throw new HttpError(404, 'Issue not found')
  const session = readSession(request)
  const update = patchSchema.parse(input)
  const adminChange = update.assignedDepartment !== undefined || update.severity !== undefined || update.estimatedSlaHours !== undefined
  const staffChange = update.status !== undefined || update.resolutionImageBase64 !== undefined
  function check(issue?: CivicIssue): asserts issue is CivicIssue {
    if (!issue) throw new HttpError(404, 'Issue not found')
    if ((adminChange && session.role !== 'SUPER_ADMIN') ||
      (staffChange && session.role !== 'SUPER_ADMIN' && !(session.role === 'DEPT_STAFF' && session.department === issue.assignedDepartment))) {
      throw new HttpError(403, 'Your role cannot make this change')
    }
    if (update.status && statuses.indexOf(update.status) !== statuses.indexOf(issue.status) + 1) {
      throw new HttpError(409, 'Move the ticket to the next status')
    }
    if ((update.status === 'RESOLVED') !== Boolean(update.resolutionImageBase64)) {
      throw new HttpError(400, 'An After photo is required when resolving a ticket')
    }
  }
  const current = await getIssue(id)
  check(current)
  if (update.resolutionImageBase64 && !current.imageBase64) throw new HttpError(400, 'This ticket has no Before photo')
  const verification = update.resolutionImageBase64 ? await verifyResolution(current, update.resolutionImageBase64) : undefined
  const saved = await mutateIssue(id, issue => {
    check(issue)
    const at = new Date().toISOString()
    const action = [
      update.status && (verification?.verified === false ? 'Resolution photo rejected by AI' : update.status),
      update.assignedDepartment && 'Reassigned to ' + update.assignedDepartment,
      update.severity && 'Severity set to ' + update.severity,
      update.estimatedSlaHours && 'SLA set to ' + update.estimatedSlaHours + ' hours',
    ].filter(Boolean).join(' · ')
    return {
      ...issue,
      status: verification?.verified === false ? issue.status : update.status ?? issue.status,
      assignedDepartment: update.assignedDepartment ?? issue.assignedDepartment,
      aiTriage: {
        ...issue.aiTriage,
        ...(update.severity ? { severity: update.severity, urgencyLabel: urgency(update.severity) } : {}),
        ...(update.estimatedSlaHours ? { estimatedSlaHours: update.estimatedSlaHours } : {}),
      },
      ...(verification ? { resolutionVerification: verification } : {}),
      ...(action ? { handledBy: session.email, audit: [...(issue.audit ?? []), { at, actor: session.email, action }].slice(-50) } : {}),
      upvotes: issue.upvotes + Number(!!update.upvote), updatedAt: at,
    }
  }, update.resolutionImageBase64 ? { id: 'after', image: update.resolutionImageBase64 } : undefined)
  return summary(saved)
}
