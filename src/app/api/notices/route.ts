import { randomUUID } from 'node:crypto'
import { requireOfficer } from '../../../lib/auth'
import { json, route } from '../../../lib/http'
import { noticeSchema } from '../../../lib/model'
import { listNotices, saveNotice } from '../../../lib/store'

export const dynamic = 'force-dynamic'

export const GET = route(async () => Response.json(await listNotices(), { headers: { 'Cache-Control': 'no-store' } }))

export const POST = route(async (request: Request) => {
  const session = requireOfficer(request, true)
  const input = noticeSchema.parse(await json(request))
  return Response.json(await saveNotice({ id: randomUUID(), ...input, createdAt: new Date().toISOString(), author: session.name }), { status: 201 })
})
