import { z } from 'zod'
import { escalation } from '@/lib/ai'
import { visibleIssue } from '@/lib/civic'
import { HttpError, json, route } from '@/lib/http'
import { isOverdue, languages, type Language } from '@/lib/model'

const supported = Object.keys(languages) as [Language, ...Language[]]

export const POST = route(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { language } = z.object({ language: z.enum(supported) }).parse(await json(request))
  const issue = await visibleIssue((await params).id, request)
  if (!isOverdue(issue)) throw new HttpError(409, 'Escalation is available after the response SLA is breached')
  const date = new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeZone: 'Asia/Kolkata' }).format(new Date())
  return Response.json({ letter: await escalation(issue, language, date) })
})
