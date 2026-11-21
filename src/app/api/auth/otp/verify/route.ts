import { z } from 'zod'
import { sessionCookie, verifyCitizenOtp } from '@/lib/auth'
import { json, route } from '@/lib/http'

export const POST = route(async (request: Request) => {
  const { challenge, otp } = z
    .object({ challenge: z.string().max(2000), otp: z.string().max(10) })
    .parse(await json(request))
  const session = verifyCitizenOtp(challenge, otp)
  return Response.json(session, { headers: { 'Set-Cookie': sessionCookie(session), 'Cache-Control': 'no-store' } })
})
