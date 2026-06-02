import { NextRequest, NextResponse } from 'next/server'
import { generateImage, type ImageProvider } from '@/lib/image-gen'
import { getFeatureConfig } from '@/lib/ai-features'

// Backwards-compat: callers pass `provider: 'dalle'` from old UIs. Map to 'openai'.
function normalizeProvider(p: string | undefined): ImageProvider | null {
  if (!p) return null
  if (p === 'dalle') return 'openai'
  if (p === 'leonardo' || p === 'openai' || p === 'stability' || p === 'higgsfield') return p
  return null
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, size, aspectRatio, provider, apiKey } = await req.json()
    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'prompt required' }, { status: 400 })
    }
    // Resolve provider: prefer explicit field (legacy callers), else read from
    // ai-image feature settings (which is what /settings/ai → AI Integrations
    // → Gambar configures). This makes the image generator UI dumb-and-simple
    // and centralizes routing in AI Integrations.
    let resolvedProvider = normalizeProvider(provider)
    if (!resolvedProvider) {
      const cfg = await getFeatureConfig('ai-image')
      resolvedProvider = (cfg.provider as ImageProvider) ?? 'leonardo'
    }
    const { url } = await generateImage({
      provider: resolvedProvider,
      prompt: prompt.trim(),
      size: size ?? '1024x1024',
      aspectRatio: aspectRatio as '1:1' | '4:5' | '9:16' | '16:9' | undefined,
      apiKey,
    })
    return NextResponse.json({ url, provider: resolvedProvider })
  } catch (err) {
    console.error('[POST /api/ai/generate-image]', err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Failed to generate image',
    }, { status: 500 })
  }
}
