import { demoEnabled, readSession } from '../../../../lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return Response.json({ ...readSession(request), demoEnabled: demoEnabled() }, { headers: { 'Cache-Control': 'no-store' } })
}
