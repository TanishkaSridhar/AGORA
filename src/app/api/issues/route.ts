import { z } from 'zod'
import { readSession } from '../../../lib/auth'
import { view } from '../../../lib/civic'
import { route } from '../../../lib/http'
import { departments, statuses } from '../../../lib/model'
import { ensureDemoData } from '../../../lib/seed'
import { listIssues } from '../../../lib/store'
import { POST as submit } from '../triage/route'

export const dynamic = 'force-dynamic'
export const POST = submit
export const GET = route(async (request: Request) => {
  await ensureDemoData()
  const params = new URL(request.url).searchParams
  const session = readSession(request)
  const department = z.enum(departments).optional().parse(params.get('department') ?? undefined)
  const status = z.enum(statuses).optional().parse(params.get('status') ?? undefined)
  const scoped = session.role === 'DEPT_STAFF' ? session.department : department
  const issues = session.role === 'DEPT_STAFF' && department && department !== scoped ? [] : await listIssues(scoped, status)
  return Response.json(issues.map(issue => view(issue, session)), { headers: { 'Cache-Control': 'no-store' } })
})
