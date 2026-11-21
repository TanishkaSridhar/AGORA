import { aiStatus } from '../../../../lib/ai'
import { requireOfficer } from '../../../../lib/auth'
import { route } from '../../../../lib/http'
import { storeMode } from '../../../../lib/store'

export const dynamic = 'force-dynamic'

export const GET = route(async (request: Request) => {
  requireOfficer(request)
  return Response.json({ ai: aiStatus(), store: storeMode() }, { headers: { 'Cache-Control': 'no-store' } })
})
