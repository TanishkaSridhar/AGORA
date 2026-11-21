import { requireOfficer } from '../../../../lib/auth'
import { route } from '../../../../lib/http'
import { escalationLevel, isOverdue, statusNames } from '../../../../lib/model'
import { listIssues } from '../../../../lib/store'

export const dynamic = 'force-dynamic'

function cell(value: unknown) {
  const text = String(value ?? '')
  // Prefix values that a spreadsheet would execute as a formula.
  const safe = /^[=+\-@\t\r]/.test(text) ? "'" + text : text
  return '"' + safe.replace(/"/g, '""') + '"'
}

export const GET = route(async (request: Request) => {
  const session = requireOfficer(request)
  const issues = await listIssues(session.department)
  const header = ['Registration No', 'Title', 'Department', 'Status', 'Severity', 'SLA (h)', 'Overdue', 'Escalation', 'Ward', 'Address',
    'Language', 'Officer', 'Upvotes', 'Merged', 'Rating', 'Lodged', 'Updated']
  const rows = issues.map(issue => [issue.refNo ?? issue.id, issue.title, issue.assignedDepartment, statusNames[issue.status],
    issue.aiTriage.severity, issue.aiTriage.estimatedSlaHours, isOverdue(issue) ? 'Yes' : 'No',
    escalationLevel(issue) ? 'L' + escalationLevel(issue) : '', issue.location.ward, issue.location.address, issue.detectedLanguage,
    issue.assignedOfficer, issue.upvotes, issue.duplicateMergeCount, issue.feedback?.rating, issue.createdAt, issue.updatedAt])
  const csv = '﻿' + [header, ...rows].map(row => row.map(cell).join(',')).join('\r\n')
  return new Response(csv, { headers: {
    'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="agora-grievances-${new Date().toISOString().slice(0, 10)}.csv"`,
  } })
})
