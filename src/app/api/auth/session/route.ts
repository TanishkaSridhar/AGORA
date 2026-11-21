import { demoEnabled, googleEnabled, otpDisplay, readSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return Response.json(
    { ...readSession(request), demoEnabled: demoEnabled(), otpDisplay: otpDisplay(), googleEnabled: googleEnabled() },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
