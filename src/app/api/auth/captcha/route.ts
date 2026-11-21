import { captcha } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json(captcha(), { headers: { 'Cache-Control': 'no-store' } })
}
