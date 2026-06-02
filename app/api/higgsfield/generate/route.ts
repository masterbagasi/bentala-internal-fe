import { NextRequest, NextResponse } from 'next/server'
import { getHiggsfieldClient } from '@/lib/higgsfield-client'

// Generic submit-and-wait endpoint for any Higgsfield model. Accepts:
//   { modelId: 'higgsfield-ai/soul/standard', args: { prompt: '...', ... } }
// Returns the final HiggsfieldRequest (with images/video URLs on success).
export const runtime = 'nodejs'
export const maxDuration = 300

interface Body {
  modelId?: string
  args?: Record<string, unknown>
  /** If true, returns the queued request immediately without polling. */
  async?: boolean
}

export async function POST(req: NextRequest) {
  let body: Body
  try {
    body = await req.json() as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.modelId) {
    return NextResponse.json({ error: 'modelId required (e.g., "higgsfield-ai/soul/standard")' }, { status: 400 })
  }

  try {
    const client = await getHiggsfieldClient()
    if (body.async) {
      const submitted = await client.submit(body.modelId, body.args ?? {})
      return NextResponse.json(submitted)
    }
    const result = await client.subscribe(body.modelId, body.args ?? {}, {
      pollEveryMs: 3000,
      timeoutMs: 270_000, // 4.5 min, slightly under the runtime cap
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/higgsfield/generate] POST', err)
    const msg = err instanceof Error ? err.message : 'Higgsfield generation gagal'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
