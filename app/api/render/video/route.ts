import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import os from 'os'
import { promises as fs } from 'fs'
import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'

// Force Node runtime — @remotion/renderer needs filesystem + headless chrome.
export const runtime = 'nodejs'
// Generous timeout: render of a 30-60s video can take a minute or more.
export const maxDuration = 300

interface RenderBody {
  compositionId: string
  inputProps: Record<string, unknown>
}

// Bundle is expensive (~10s first call) — cache the result so subsequent
// renders skip it. The bundle changes only when remotion/* source files change,
// which in a dev/server context happens rarely.
let cachedBundle: string | null = null
async function getBundle(): Promise<string> {
  if (cachedBundle) {
    try {
      await fs.access(cachedBundle)
      return cachedBundle
    } catch {
      cachedBundle = null
    }
  }
  const entry = path.join(process.cwd(), 'remotion', 'index.ts')
  const out = await bundle({
    entryPoint: entry,
    onProgress: () => { /* suppress */ },
  })
  cachedBundle = out
  return out
}

export async function POST(req: NextRequest) {
  let body: RenderBody
  try {
    body = await req.json() as RenderBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.compositionId) {
    return NextResponse.json({ error: 'compositionId required' }, { status: 400 })
  }

  try {
    const bundled = await getBundle()
    const composition = await selectComposition({
      serveUrl: bundled,
      id: body.compositionId,
      inputProps: body.inputProps ?? {},
    })

    // Render to a temp file, then read it back as the response. For larger
    // deployments you'd upload to S3/Supabase storage instead.
    const outDir = path.join(os.tmpdir(), 'bentala-renders')
    await fs.mkdir(outDir, { recursive: true })
    const filename = `${body.compositionId}-${Date.now()}.mp4`
    const outputLocation = path.join(outDir, filename)

    await renderMedia({
      serveUrl: bundled,
      composition,
      codec: 'h264',
      outputLocation,
      inputProps: body.inputProps ?? {},
      onProgress: () => { /* suppress */ },
    })

    // For now, return a URL the client can fetch via a download endpoint.
    const url = `/api/render/video/file/${encodeURIComponent(filename)}`
    return NextResponse.json({ url, filename })
  } catch (err) {
    console.error('[/api/render/video] POST', err)
    const msg = err instanceof Error ? err.message : 'Render gagal'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
