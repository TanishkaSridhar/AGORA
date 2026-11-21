import { demoEnabled, readSession } from '@/lib/auth'
import { summary } from '@/lib/civic'
import { HttpError, route } from '@/lib/http'
import { seedIssues } from '@/lib/seed'

export const POST = route(async (request: Request) => {
  if (!demoEnabled() || readSession(request).role === 'DEPT_STAFF')
    throw new HttpError(403, 'Demo seeding is unavailable')
  return Response.json((await seedIssues()).map(summary))
})
