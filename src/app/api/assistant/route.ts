import { z } from 'zod'
import { assistant } from '../../../lib/ai'
import { summary, trackByRef } from '../../../lib/civic'
import { json, route } from '../../../lib/http'
import { statusNames } from '../../../lib/model'

const body = z.object({
  message: z.string().trim().min(1).max(600),
  history: z.array(z.object({ role: z.enum(['user', 'model']), text: z.string().max(2000) })).max(12).default([]),
})

export const POST = route(async (request: Request) => {
  const { message, history } = body.parse(await json(request))
  const ref = message.match(/AGR-\d{4}-\d{6}/i)?.[0]
  const ticket = ref ? await trackByRef(ref, request).then(summary).catch(() => undefined) : undefined
  try {
    return Response.json({ reply: await assistant(message, history, ticket), ticketRef: ticket?.refNo })
  } catch {
    const reply = ticket
      ? `Grievance ${ticket.refNo} (${ticket.title}) is currently "${statusNames[ticket.status]}" with ${ticket.assignedDepartment}. Open Track Status for the full timeline.`
      : 'The assistant is busy right now. You can lodge a grievance from "Lodge Grievance", track it with your registration number under "Track Status", or call 112 in an emergency.'
    return Response.json({ reply, ticketRef: ticket?.refNo, degraded: true })
  }
})
