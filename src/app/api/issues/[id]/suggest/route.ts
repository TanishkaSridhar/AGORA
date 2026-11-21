import { z } from 'zod'
import { suggestRemarks } from '@/lib/ai'
import { requireOfficer } from '@/lib/auth'
import { visibleIssue } from '@/lib/civic'
import { HttpError, json, route } from '@/lib/http'
import { statusNames, statuses } from '@/lib/model'

export const POST = route(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  requireOfficer(request)
  const { status } = z.object({ status: z.enum(statuses) }).parse(await json(request))
  const issue = await visibleIssue((await params).id, request)
  const remarks = await suggestRemarks(issue, statusNames[status]).catch(() => {
    throw new HttpError(503, 'AI drafting is busy. Please write the remarks manually.')
  })
  return Response.json({ remarks })
})
