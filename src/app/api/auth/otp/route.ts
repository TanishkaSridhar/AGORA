import { z } from 'zod'
import { requestCitizenOtp } from '../../../../lib/auth'
import { json, route } from '../../../../lib/http'

export const POST = route(async (request: Request) => {
  const { mobile } = z.object({ mobile: z.string().max(20) }).parse(await json(request))
  const result = requestCitizenOtp(mobile)
  return Response.json({ ...result, maskedTo: '+91 ' + mobile.slice(0, 2) + '******' + mobile.slice(-2) }, { headers: { 'Cache-Control': 'no-store' } })
})
