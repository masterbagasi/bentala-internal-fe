import { NextRequest, NextResponse } from 'next/server'
import { listTemplates, createTemplate } from '@/lib/image-templates-store'

export const runtime = 'nodejs'
// Allow large JSON bodies because templates carry inline base64 images.
export const maxDuration = 60

export async function GET() {
  try {
    const templates = await listTemplates()
    return NextResponse.json({ templates })
  } catch (err) {
    console.error('[/api/image-templates] GET', err)
    return NextResponse.json({ error: 'Failed to load templates' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      brand?: 'bpi' | 'bsi' | 'custom'
      name?: string
      description?: string
      prompt?: string
      ratio?: string
      style?: string
      image_dataurl?: string | null
    }
    const t = await createTemplate({
      brand: body.brand ?? 'custom',
      name: (body.name ?? '').trim(),
      description: (body.description ?? '').trim(),
      prompt: (body.prompt ?? '').trim(),
      ratio: body.ratio ?? '4:5',
      style: body.style ?? 'cinematic portrait photography',
      image_dataurl: body.image_dataurl ?? null,
    })
    return NextResponse.json({ template: t })
  } catch (err) {
    console.error('[/api/image-templates] POST', err)
    const msg = err instanceof Error ? err.message : 'Failed to create template'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
