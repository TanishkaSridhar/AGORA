import { requireOfficer } from '@/lib/auth'
import { HttpError, route } from '@/lib/http'
import { deleteNotice } from '@/lib/store'

export const DELETE = route(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  requireOfficer(request, true)
  const { id } = await params
  if (!/^[\w-]{1,100}$/.test(id)) throw new HttpError(404, 'Notice not found')
  await deleteNotice(id)
  return Response.json({ ok: true })
})
