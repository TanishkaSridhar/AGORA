import { citizen, sessionCookie } from '@/lib/auth'

export async function POST() {
  return Response.json(citizen, { headers: { 'Set-Cookie': sessionCookie(), 'Cache-Control': 'no-store' } })
}
