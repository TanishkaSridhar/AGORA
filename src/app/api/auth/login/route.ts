import { z } from 'zod'
import { authenticate, sessionCookie } from '../../../../lib/auth'
import { HttpError, json, route } from '../../../../lib/http'

const credentials = z.object({
  email: z.string().max(250).optional(), password: z.string().max(500).optional(), demo: z.string().max(40).optional(),
})

export const POST = route(async (request: Request) => {
  const session = authenticate(credentials.parse(await json(request)))
  if (!session) throw new HttpError(401, 'Invalid municipal credentials or demo access is disabled')
  return Response.json(session, { headers: { 'Set-Cookie': sessionCookie(session), 'Cache-Control': 'no-store' } })
})
