import { getHiggsfieldClient } from './higgsfield-client'
import { getProviderApiKey, type AIProvider } from './ai-config'

// Unified image-generation dispatcher. Used by both /api/ai/generate-image
// (manual gen for AI Studio's Generator Gambar tool) and /api/ai/slide-image
// (per-carousel-slide images when user configures an AI provider).
//
// Returns a public URL (or data: URL for Stability) — caller can render
// directly or proxy via /api/image-proxy.

export type ImageProvider = 'leonardo' | 'openai' | 'stability' | 'higgsfield'

export interface GenerateImageOpts {
  provider: ImageProvider
  prompt: string
  /** "1024x1024" | "1024x1792" | "1792x1024" — clamped per provider. */
  size?: string
  /** "16:9" | "9:16" | "1:1" — used by Higgsfield (which prefers aspect_ratio over WxH). */
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5'
  /** Override key (request-time). Default: read from ai_settings/env via getProviderApiKey. */
  apiKey?: string
}

const SIZE_MAP: Record<string, { width: number; height: number }> = {
  '1024x1024': { width: 1024, height: 1024 },
  '1024x1792': { width: 832, height: 1472 },
  '1792x1024': { width: 1472, height: 832 },
  '1080x1350': { width: 832, height: 1040 },
}

const LEONARDO_API = 'https://cloud.leonardo.ai/api/rest/v1'

export async function generateImage(opts: GenerateImageOpts): Promise<{ url: string; provider: ImageProvider }> {
  const prompt = opts.prompt.trim()
  if (!prompt) throw new Error('prompt required')

  let apiKey = opts.apiKey?.trim() || ''
  if (!apiKey && opts.provider !== 'higgsfield') {
    // Higgsfield client reads its own key inside getHiggsfieldClient()
    const providerName: AIProvider = opts.provider === 'openai' ? 'openai' : opts.provider
    apiKey = (await getProviderApiKey(providerName)) ?? ''
    if (!apiKey) {
      throw new Error(`API key untuk ${opts.provider} tidak terkonfigurasi. Atur di Settings → AI Integrations.`)
    }
  }

  const size = opts.size ?? '1024x1024'

  let url: string
  switch (opts.provider) {
    case 'leonardo':
      url = await generateLeonardo(prompt, size, apiKey)
      break
    case 'openai':
      url = await generateDalle(prompt, size, apiKey)
      break
    case 'stability':
      url = await generateStability(prompt, size, apiKey)
      break
    case 'higgsfield':
      // Higgsfield uses aspect_ratio, not WxH. If caller provided one, use it.
      // Otherwise derive from `size` (1024x1024 → 1:1, 1024x1792 → 4:5, 1792x1024 → 16:9).
      url = await generateHiggsfield(prompt, opts.aspectRatio ?? deriveAspectRatio(size))
      break
    default:
      throw new Error(`Unknown image provider: ${opts.provider}`)
  }

  return { url, provider: opts.provider }
}

async function generateLeonardo(prompt: string, size: string, apiKey: string): Promise<string> {
  const { width, height } = SIZE_MAP[size] ?? SIZE_MAP['1024x1024']

  const genRes = await fetch(`${LEONARDO_API}/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: prompt.slice(0, 1500),
      modelId: 'b24e16ff-06e3-43eb-8d33-4416c2d75876',
      width, height, num_images: 1, guidance_scale: 7,
    }),
  })
  const genData = await genRes.json()
  const generationId = genData.sdGenerationJob?.generationId
  if (!generationId) throw new Error('Failed to start Leonardo generation')

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000))
    const res = await fetch(`${LEONARDO_API}/generations/${generationId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const data = await res.json()
    const gen = data.generations_by_pk
    if (gen?.status === 'COMPLETE') {
      const url = gen.generated_images?.[0]?.url
      if (!url) throw new Error('No image in Leonardo response')
      return url
    }
    if (gen?.status === 'FAILED') throw new Error('Leonardo generation failed')
  }
  throw new Error('Leonardo generation timed out')
}

async function generateDalle(prompt: string, size: string, apiKey: string): Promise<string> {
  const VALID = ['1024x1024', '1792x1024', '1024x1792'] as const
  const resolvedSize = (VALID as readonly string[]).includes(size) ? size : '1024x1024'

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'dall-e-3', prompt: prompt.slice(0, 1000), n: 1, size: resolvedSize, quality: 'standard' }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message ?? 'DALL-E generation failed')
  const url = data.data?.[0]?.url
  if (!url) throw new Error('No image URL from DALL-E')
  return url
}

async function generateStability(prompt: string, size: string, apiKey: string): Promise<string> {
  const { width, height } = SIZE_MAP[size] ?? SIZE_MAP['1024x1024']
  const res = await fetch('https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      text_prompts: [{ text: prompt.slice(0, 2000), weight: 1 }],
      cfg_scale: 7,
      width: Math.min(width, 1024),
      height: Math.min(height, 1024),
      samples: 1,
      steps: 30,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message ?? 'Stability AI generation failed')
  const b64 = data.artifacts?.[0]?.base64
  if (!b64) throw new Error('No image from Stability AI')
  return `data:image/png;base64,${b64}`
}

function deriveAspectRatio(size: string): '1:1' | '4:5' | '16:9' | '9:16' {
  if (size === '1024x1024') return '1:1'
  if (size === '1792x1024') return '16:9'
  // 1024x1792 — could mean 9:16 (story/reels) or 4:5 (feed). Default to 4:5
  // since that's the most common social use case (Instagram feed, TikTok cover).
  return '4:5'
}

// Higgsfield Soul only accepts these literal aspect_ratio values (per their
// 422 error: "Input should be '9:16', '16:9', '4:3', '3:4', '1:1', '2:3' or '3:2'").
// Map common social aspects to the nearest Higgsfield-supported value.
const HIGGSFIELD_ASPECTS = ['9:16', '16:9', '4:3', '3:4', '1:1', '2:3', '3:2'] as const
type HiggsfieldAspect = typeof HIGGSFIELD_ASPECTS[number]

function mapToHiggsfieldAspect(aspect: string): HiggsfieldAspect {
  if ((HIGGSFIELD_ASPECTS as readonly string[]).includes(aspect)) {
    return aspect as HiggsfieldAspect
  }
  // 4:5 (Instagram feed) → 3:4 is the closest available (both portrait, ~0.75-0.8)
  if (aspect === '4:5') return '3:4'
  if (aspect === '5:4') return '4:3'
  return '1:1'
}

async function generateHiggsfield(prompt: string, aspectRatio: string): Promise<string> {
  const client = await getHiggsfieldClient()
  const safeAspect = mapToHiggsfieldAspect(aspectRatio)
  const result = await client.subscribe('higgsfield-ai/soul/standard', {
    prompt: prompt.slice(0, 2000),
    aspect_ratio: safeAspect,
    resolution: '720p',
  }, { pollEveryMs: 3000, timeoutMs: 180_000 })

  const imgUrl = result.images?.[0]?.url
  if (!imgUrl) throw new Error('Higgsfield Soul tidak mengembalikan URL gambar')
  return imgUrl
}
