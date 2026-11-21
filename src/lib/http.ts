import { z } from 'zod'

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra: object = {}) { super(message) }
}

export function route<T extends unknown[]>(handler: (...args: T) => Promise<Response>) {
  return async (...args: T) => {
    try {
      return await handler(...args)
    } catch (error) {
      if (error instanceof HttpError) return Response.json({ ...error.extra, error: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } })
      if (error instanceof z.ZodError) return Response.json({ error: error.issues.map(issue => issue.message).join('. ') }, { status: 400 })
      console.error('CivicResolve request failed', error instanceof Error ? error.message : 'Unknown error')
      return Response.json({ error: 'The request could not be completed. Please try again.' }, { status: 500 })
    }
  }
}

export async function json(request: Request) {
  const maxBytes = 770_000
  if (Number(request.headers.get('content-length')) > maxBytes) throw new HttpError(413, 'Request is too large')
  if (!request.body) throw new HttpError(400, 'A JSON request body is required')
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let body = ''
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => {})
        throw new HttpError(413, 'Request is too large')
      }
      body += decoder.decode(chunk.value, { stream: true })
    }
    return JSON.parse(body + decoder.decode()) as unknown
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(400, 'Invalid JSON request')
  } finally {
    reader.releaseLock()
  }
}
