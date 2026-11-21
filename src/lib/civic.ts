import { randomInt, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { fallbackTriage, matchingIssue, translateRemarks, triage, verifyResolution } from './ai'
import { isOfficer, readSession } from './auth'
import { nearby } from './geo'
import { HttpError } from './http'
import {
  departments,
  jpeg,
  maskMobile,
  reportSchema,
  statuses,
  statusNames,
  urgency,
  type AuditEntry,
  type AuthSession,
  type CivicIssue,
  type IssueSummary,
} from './model'
import { commitReport, findByRef, getIssue, listIssues, mutateIssue } from './store'

export const newRefNo = (date = new Date()) => `AGR-${date.getFullYear()}-${randomInt(100000, 1000000)}`

export async function submitReport(input: unknown, session: AuthSession = { name: '', email: '', role: 'CITIZEN' }) {
  const report = reportSchema.parse(input)
  let triaged: ReturnType<typeof fallbackTriage>
  let aiPending = false
  try {
    triaged = await triage(report)
  } catch (error) {
    // Never lose a citizen's report because the AI is busy: route by keywords and flag for re-triage.
    console.warn('Triage fell back to keyword routing', error instanceof Error ? error.message : error)
    triaged = fallbackTriage(report)
    aiPending = true
  }
  const { title, translatedDescription, detectedLanguage, transcript, ...aiTriage } = triaged
  if (!aiTriage.isValidCivicIssue)
    throw new HttpError(400, 'The photo and description must show a civic infrastructure issue.')
  const now = new Date()
  const citizen = session.mobile
    ? { name: report.citizen?.name || session.name, mobile: session.mobile }
    : report.citizen
      ? { name: report.citizen.name, ...(report.citizen.mobile ? { mobile: report.citizen.mobile } : {}) }
      : undefined
  const issue: CivicIssue = {
    id: randomUUID(),
    refNo: newRefNo(now),
    title,
    translatedDescription,
    detectedLanguage,
    originalDescription:
      [report.description, transcript && '🎤 ' + transcript].filter(Boolean).join('\n') ||
      '🎤 Voice complaint · transcription pending',
    imageBase64: report.imageBase64,
    corroboratingImages: [],
    location: report.location,
    aiTriage,
    ...(report.audio ? { voiceNote: report.audio } : {}),
    ...(aiPending ? { aiPending: true } : {}),
    ...(citizen ? { citizen } : {}),
    status: 'OPEN',
    assignedDepartment: aiTriage.department,
    upvotes: 0,
    duplicateMergeCount: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    audit: [
      {
        at: now.toISOString(),
        actor: 'CivicResolve AI',
        action: aiPending
          ? 'Received · routed by keyword rules (AI busy) to ' + aiTriage.department
          : `Received · AI triaged (severity ${aiTriage.severity}/5, ${Math.round(aiTriage.confidence * 100)}% confidence) and forwarded to ${aiTriage.department}`,
      },
    ],
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const open = await listIssues(issue.assignedDepartment, undefined, true, true)
    const candidates = aiPending ? [] : open.filter(candidate => nearby(candidate.location, issue.location))
    const match = candidates.length ? await matchingIssue(report, candidates).catch(() => undefined) : undefined
    const saved = await commitReport(issue, open, match)
    if (saved) {
      return {
        issue: redact(saved, session),
        merged: !!match,
        refNo: saved.refNo ?? saved.id,
        citizenReplyNative: aiTriage.citizenReplyNative,
        aiPending,
      }
    }
  }
  throw new HttpError(409, 'Nearby reports changed. Please try again.')
}

export function summary(issue: CivicIssue): IssueSummary {
  const {
    imageBase64: _before,
    resolutionImageBase64: _after,
    corroboratingImages: _evidence,
    voiceNote: _voice,
    ...metadata
  } = issue
  void [_before, _after, _evidence, _voice]
  return metadata
}

export const ownsIssue = (session: AuthSession, issue: IssueSummary) =>
  !!issue.citizen && !!session.mobile && issue.citizen.mobile === session.mobile

/** Officers and the filing citizen see contact details; everyone else sees a masked mobile. */
export function redact<T extends IssueSummary>(issue: T, session: AuthSession): T {
  if (!issue.citizen || isOfficer(session) || ownsIssue(session, issue)) return issue
  const { name } = issue.citizen
  return {
    ...issue,
    citizen: {
      name: name.slice(0, 1) + '***',
      ...(issue.citizen.mobile ? { mobile: maskMobile(issue.citizen.mobile) } : {}),
    },
  }
}
export const view = (issue: CivicIssue, session: AuthSession) => redact(summary(issue), session)

export async function visibleIssue(id: string, request: Request) {
  if (!/^[\w-]{1,100}$/.test(id)) throw new HttpError(404, 'Issue not found')
  const issue = await getIssue(id)
  if (!issue) throw new HttpError(404, 'Issue not found')
  const session = readSession(request)
  if (session.role === 'DEPT_STAFF' && issue.assignedDepartment !== session.department) {
    throw new HttpError(403, 'This issue belongs to another department')
  }
  const visible = redact(issue, session)
  if (visible.voiceNote && !isOfficer(session) && !ownsIssue(session, visible)) delete visible.voiceNote
  return visible
}

export async function trackByRef(refNo: string, request: Request) {
  const clean = refNo.trim().toUpperCase()
  const id = /^[\w-]{1,100}$/.test(clean)
    ? ((await findByRef(clean)) ?? ((await getIssue(refNo.trim())) ? refNo.trim() : undefined))
    : undefined
  if (!id) throw new HttpError(404, 'No grievance found with this registration number')
  return visibleIssue(id, request)
}

const patchSchema = z
  .object({
    upvote: z.literal(true).optional(),
    status: z.enum(statuses).optional(),
    resolutionImageBase64: jpeg.optional(),
    assignedDepartment: z.enum(departments).optional(),
    severity: z.number().int().min(1).max(5).optional(),
    estimatedSlaHours: z.number().int().min(1).max(8760).optional(),
    remarks: z.string().trim().min(1).max(1000).optional(),
    assignedOfficer: z.string().trim().min(1).max(100).optional(),
    reminder: z.literal(true).optional(),
    feedback: z
      .object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(500).optional() })
      .optional(),
    reopen: z.object({ reason: z.string().trim().min(3).max(500) }).optional(),
  })
  .strict()
  .refine(value => Object.keys(value).length > 0, 'Choose an update')

export async function updateIssue(id: string, request: Request, input: unknown) {
  if (!/^[\w-]{1,100}$/.test(id)) throw new HttpError(404, 'Issue not found')
  const session = readSession(request)
  const update = patchSchema.parse(input)
  const adminChange =
    update.assignedDepartment !== undefined ||
    update.severity !== undefined ||
    update.estimatedSlaHours !== undefined ||
    !!update.reminder
  const staffChange =
    update.status !== undefined ||
    update.resolutionImageBase64 !== undefined ||
    !!update.remarks ||
    !!update.assignedOfficer
  const citizenChange = !!update.feedback || !!update.reopen
  function check(issue?: CivicIssue): asserts issue is CivicIssue {
    if (!issue) throw new HttpError(404, 'Issue not found')
    if (
      (adminChange && session.role !== 'SUPER_ADMIN') ||
      (staffChange &&
        session.role !== 'SUPER_ADMIN' &&
        !(session.role === 'DEPT_STAFF' && session.department === issue.assignedDepartment))
    ) {
      throw new HttpError(403, 'Your role cannot make this change')
    }
    if (citizenChange) {
      if (!ownsIssue(session, issue))
        throw new HttpError(
          403,
          'Only the citizen who lodged this grievance can rate or reopen it. Sign in with the same mobile number.',
        )
      if (issue.status !== 'RESOLVED')
        throw new HttpError(409, 'Feedback and reopening are available after the grievance is disposed')
      if (update.status || staffChange || adminChange)
        throw new HttpError(400, 'Submit feedback separately from other changes')
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
  const verification = update.resolutionImageBase64
    ? await verifyResolution(current, update.resolutionImageBase64)
    : undefined
  const remarksNative = update.remarks
    ? await translateRemarks(update.remarks, current.detectedLanguage).catch(() => undefined)
    : undefined
  const saved = await mutateIssue(
    id,
    issue => {
      check(issue)
      const at = new Date().toISOString()
      const action = [
        update.status &&
          (verification?.verified === false
            ? 'Resolution photo rejected by AI'
            : 'Status → ' + statusNames[update.status]),
        verification?.verified && `AI verified the fix (${Math.round(verification.confidence * 100)}%)`,
        update.assignedDepartment &&
          update.assignedDepartment !== issue.assignedDepartment &&
          'Forwarded to ' + update.assignedDepartment,
        update.severity && update.severity !== issue.aiTriage.severity && 'Severity set to ' + update.severity,
        update.estimatedSlaHours &&
          update.estimatedSlaHours !== issue.aiTriage.estimatedSlaHours &&
          'SLA set to ' + update.estimatedSlaHours + ' hours',
        update.assignedOfficer && 'Assigned to ' + update.assignedOfficer,
        update.reminder && 'Reminder sent to ' + issue.assignedDepartment,
        update.remarks && !update.status && 'Action taken report updated',
        update.feedback && `Citizen rated the resolution ${update.feedback.rating}/5`,
        update.reopen && 'Reopened by citizen',
      ]
        .filter(Boolean)
        .join(' · ')
      const remarks = update.remarks ?? update.reopen?.reason ?? update.feedback?.comment
      const entry: AuditEntry | undefined = action
        ? {
            at,
            actor: citizenChange ? 'Citizen' : session.email || 'Public',
            action,
            ...(remarks ? { remarks } : {}),
            ...(remarksNative ? { remarksNative } : {}),
          }
        : undefined
      const officerAction = !!entry && !citizenChange && !update.upvote
      return {
        ...issue,
        status: update.reopen
          ? 'IN_PROGRESS'
          : verification?.verified === false
            ? issue.status
            : (update.status ?? issue.status),
        assignedDepartment: update.assignedDepartment ?? issue.assignedDepartment,
        ...(update.assignedOfficer ? { assignedOfficer: update.assignedOfficer } : {}),
        ...(update.assignedDepartment && update.assignedDepartment !== issue.assignedDepartment
          ? { assignedOfficer: undefined }
          : {}),
        aiTriage: {
          ...issue.aiTriage,
          ...(update.severity ? { severity: update.severity, urgencyLabel: urgency(update.severity) } : {}),
          ...(update.estimatedSlaHours ? { estimatedSlaHours: update.estimatedSlaHours } : {}),
        },
        ...(verification ? { resolutionVerification: verification } : {}),
        ...(update.feedback ? { feedback: { ...update.feedback, at } } : {}),
        ...(update.reopen ? { reopenCount: (issue.reopenCount ?? 0) + 1, feedback: undefined } : {}),
        ...(update.reminder ? { remindersSent: (issue.remindersSent ?? 0) + 1 } : {}),
        ...(officerAction ? { handledBy: session.email } : {}),
        ...(entry ? { audit: [...(issue.audit ?? []), entry].slice(-50) } : {}),
        upvotes: issue.upvotes + Number(!!update.upvote),
        updatedAt: at,
      }
    },
    update.resolutionImageBase64 ? { id: 'after', image: update.resolutionImageBase64 } : undefined,
  )
  return view(saved, session)
}

/** Re-runs Gemini triage on a ticket that was routed by keyword rules during an AI outage. */
export async function retriage(id: string, request: Request) {
  const session = readSession(request)
  const current = await getIssue(id)
  if (!current) throw new HttpError(404, 'Issue not found')
  if (
    !(
      session.role === 'SUPER_ADMIN' ||
      (session.role === 'DEPT_STAFF' && session.department === current.assignedDepartment)
    )
  ) {
    throw new HttpError(403, 'Your role cannot make this change')
  }
  if (!current.imageBase64) throw new HttpError(400, 'This ticket has no photo to analyse')
  const typed = current.originalDescription.startsWith('🎤 Voice complaint') ? '' : current.originalDescription
  const result = await triage({
    imageBase64: current.imageBase64,
    description: typed,
    preferredLanguage: 'English',
    location: current.location,
    ...(current.voiceNote ? { audio: current.voiceNote } : {}),
  }).catch(() => {
    throw new HttpError(503, 'The AI service is still busy. Please try again in a minute.')
  })
  const { title, translatedDescription, detectedLanguage, transcript, ...aiTriage } = result
  const saved = await mutateIssue(id, issue => {
    if (!issue) throw new HttpError(404, 'Issue not found')
    const at = new Date().toISOString()
    const move = issue.status === 'OPEN' && aiTriage.department !== issue.assignedDepartment
    return {
      ...issue,
      title,
      translatedDescription,
      detectedLanguage,
      aiTriage,
      aiPending: false,
      updatedAt: at,
      ...(transcript && issue.originalDescription.startsWith('🎤 Voice complaint')
        ? { originalDescription: '🎤 ' + transcript }
        : {}),
      ...(move ? { assignedDepartment: aiTriage.department } : {}),
      audit: [
        ...(issue.audit ?? []),
        {
          at,
          actor: session.email,
          action:
            `AI re-triage completed (severity ${aiTriage.severity}/5)` +
            (move ? ' · forwarded to ' + aiTriage.department : ''),
        },
      ].slice(-50),
    }
  })
  return view(saved, session)
}

export async function citizenIssues(session: AuthSession) {
  if (!session.mobile) throw new HttpError(401, 'Sign in with your mobile number to see your grievances')
  return (await listIssues())
    .filter(issue => issue.citizen?.mobile === session.mobile)
    .map(issue => view(issue, session))
}
