import { updateIssue, visibleIssue } from '@/lib/civic'
import { json, route } from '@/lib/http'

type Context = { params: Promise<{ id: string }> }
export const dynamic = 'force-dynamic'

export const GET = route(async (request: Request, { params }: Context) => {
  const { id } = await params
  return Response.json(await visibleIssue(id, request), { headers: { 'Cache-Control': 'no-store' } })
})
export const PATCH = route(async (request: Request, { params }: Context) => {
  const { id } = await params
  return Response.json(await updateIssue(id, request, await json(request)))
})
