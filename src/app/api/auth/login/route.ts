import { z } from 'zod'
import { officerLogin, sessionCookie } from '@/lib/auth'
import { json, route } from '@/lib/http'

const credentials = z.object({
  email: z.string().max(250).optional(),
  password: z.string().max(500).optional(),
  demo: z.string().max(40).optional(),
  captchaToken: z.string().max(2000).optional(),
  captchaAnswer: z.string().max(20).optional(),
  challenge: z.string().max(2000).optional(),
  otp: z.string().max(10).optional(),
})

export const POST = route(async (request: Request) => {
  const result = officerLogin(credentials.parse(await json(request)))
  if (!('session' in result)) return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
  return Response.json(result.session, {
    headers: { 'Set-Cookie': sessionCookie(result.session), 'Cache-Control': 'no-store' },
  })
})
