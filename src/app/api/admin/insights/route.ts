import { createHash } from 'node:crypto'
import { insights, rulesInsights, type Insights } from '../../../../lib/ai'
import { requireOfficer } from '../../../../lib/auth'
import { summary } from '../../../../lib/civic'
import { route } from '../../../../lib/http'
import { listIssues } from '../../../../lib/store'

export const dynamic = 'force-dynamic'
const state = globalThis as typeof globalThis & { agoraInsights?: Map<string, { key: string; at: number; value: Insights }> }
const cache = state.agoraInsights ??= new Map()

export const GET = route(async (request: Request) => {
  const session = requireOfficer(request)
  const scope = session.department ?? 'All departments'
  const issues = (await listIssues(session.department)).map(summary)
  const key = createHash('sha1').update(JSON.stringify(issues.map(issue => [issue.id, issue.status, issue.updatedAt, issue.aiTriage.severity]))).digest('hex')
  const cached = cache.get(scope)
  const refresh = new URL(request.url).searchParams.get('refresh') === '1'
  if (cached && cached.key === key && !refresh && Date.now() - cached.at < 15 * 60_000) return Response.json(cached.value)
  let value: Insights
  try {
    value = issues.length ? await insights(issues, scope) : rulesInsights(issues, scope)
  } catch (error) {
    console.warn('Insights fell back to rules', error instanceof Error ? error.message : error)
    value = rulesInsights(issues, scope)
  }
  cache.set(scope, { key, at: Date.now(), value })
  return Response.json(value, { headers: { 'Cache-Control': 'no-store' } })
})
