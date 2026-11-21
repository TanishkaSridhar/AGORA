import { trackByRef } from '../../../lib/civic'
import { HttpError, route } from '../../../lib/http'

export const dynamic = 'force-dynamic'

export const GET = route(async (request: Request) => {
  const ref = new URL(request.url).searchParams.get('ref')
  if (!ref) throw new HttpError(400, 'Enter a registration number')
  return Response.json(await trackByRef(ref, request), { headers: { 'Cache-Control': 'no-store' } })
})
