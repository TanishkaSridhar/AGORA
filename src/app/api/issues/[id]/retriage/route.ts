import { retriage } from '@/lib/civic'
import { route } from '@/lib/http'

export const POST = route(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  return Response.json(await retriage((await params).id, request))
})
