import { readSession } from '@/lib/auth'
import { citizenIssues } from '@/lib/civic'
import { route } from '@/lib/http'

export const dynamic = 'force-dynamic'

export const GET = route(async (request: Request) => {
  return Response.json(await citizenIssues(readSession(request)), { headers: { 'Cache-Control': 'no-store' } })
})
