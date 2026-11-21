import { z } from 'zod'
import { googleLogin, sessionCookie } from '../../../../lib/auth'
import { json, route } from '../../../../lib/http'

export const POST = route(async (request: Request) => {
  const { idToken } = z.object({ idToken: z.string().min(20).max(5000) }).parse(await json(request))
  const session = await googleLogin(idToken)
  return Response.json(session, { headers: { 'Set-Cookie': sessionCookie(session), 'Cache-Control': 'no-store' } })
})
