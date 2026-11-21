import { readSession } from '../../../lib/auth'
import { submitReport } from '../../../lib/civic'
import { json, route } from '../../../lib/http'

export const POST = route(async (request: Request) => {
  const result = await submitReport(await json(request), readSession(request))
  return Response.json(result, { status: result.merged ? 200 : 201 })
})
