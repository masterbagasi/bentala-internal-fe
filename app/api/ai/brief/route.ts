import { NextRequest, NextResponse } from 'next/server'
import { generateText } from '@/lib/ai-text'

export async function POST(req: NextRequest) {
  let cleaned = ''

  try {
    const { title, entity, platform, types, idea_text } = await req.json()
    if (!title || !entity || !platform || !types?.length) {
      return NextResponse.json({ error: 'title, entity, platform, types required' }, { status: 400 })
    }

    if (!Array.isArray(types) || !types.every((t: string) => ['design', 'video'].includes(t))) {
      return NextResponse.json({ error: 'types must be an array of "design" and/or "video"' }, { status: 400 })
    }
    const VALID_ENTITIES = ['bpi', 'bsi'] as const
    const VALID_PLATFORMS = ['ig', 'tiktok', 'keduanya'] as const
    if (!(VALID_ENTITIES as readonly string[]).includes(entity)) {
      return NextResponse.json({ error: 'entity must be bpi or bsi' }, { status: 400 })
    }
    if (!(VALID_PLATFORMS as readonly string[]).includes(platform)) {
      return NextResponse.json({ error: 'platform must be ig, tiktok, or keduanya' }, { status: 400 })
    }

    const safeTitle = title.trim().slice(0, 200)

    const entityLabel = entity === 'bpi' ? 'Bentala Project Indonesia' : 'Bentala Studio Indonesia'
    const platformLabel = platform === 'ig' ? 'Instagram' : platform === 'tiktok' ? 'TikTok' : 'Instagram & TikTok'
    const needsDesign = types.includes('design')
    const needsVideo = types.includes('video')

    const safeIdeaText = typeof idea_text === 'string' ? idea_text.trim().slice(0, 1000) : ''

    const prompt = `Kamu adalah creative director untuk ${entityLabel}, sebuah akun media sosial Indonesia.

Konten yang akan diproduksi: "${safeTitle}"
Platform: ${platformLabel}${safeIdeaText ? `\n\nKonteks tambahan dari tim:\n${safeIdeaText}` : ''}

Buat creative brief lengkap dalam Bahasa Indonesia. Output HANYA JSON object berikut, tanpa teks lain:

{
  ${needsDesign ? `"design": {
    "format": "nama format dan dimensi (contoh: Feed Instagram 1080×1350px)",
    "tone": "deskripsi tone visual (2-4 kata)",
    "palette": [
      { "name": "nama warna", "hex": "#XXXXXX" },
      { "name": "nama warna", "hex": "#XXXXXX" },
      { "name": "nama warna", "hex": "#XXXXXX" }
    ],
    "typography": {
      "headline": "style + ukuran + contoh teks headline",
      "subtext": "style + ukuran + contoh teks subtext",
      "cta": "style + ukuran + contoh teks CTA"
    },
    "composition": "deskripsi layout dan komposisi elemen (2-3 kalimat)",
    "midjourney_prompt": "prompt lengkap siap pakai untuk Midjourney (bahasa Inggris, sertakan --ar dan --v 6)",
    "dalle_prompt": "prompt untuk DALL-E 3 yang menghasilkan visual representatif konten ini (bahasa Inggris)"
  }` : ''}
  ${needsDesign && needsVideo ? ',' : ''}
  ${needsVideo ? `"video": {
    "duration": "durasi yang disarankan (contoh: 45 detik)",
    "format": "format video (contoh: TikTok 9:16)",
    "tone": "tone video (contoh: Fun, energetic, fast-cut)",
    "editing_style": "gaya editing spesifik (contoh: jump cuts tiap 2-3 detik, CapCut template energetic)",
    "script": [
      {
        "timecode": "00:00–00:05",
        "label": "HOOK",
        "dialog": "dialog atau narasi yang diucapkan",
        "direction": "arahan visual dan kamera",
        "talking_points": ["poin 1", "poin 2"]
      },
      {
        "timecode": "00:05–00:20",
        "label": "ISI",
        "dialog": "dialog atau narasi",
        "direction": "arahan visual",
        "talking_points": ["poin 1"]
      },
      {
        "timecode": "00:20–00:35",
        "label": "KONTEN",
        "dialog": "dialog atau narasi",
        "direction": "arahan visual",
        "talking_points": ["poin 1", "poin 2"]
      },
      {
        "timecode": "00:35–00:45",
        "label": "CTA",
        "dialog": "call-to-action",
        "direction": "arahan visual untuk penutup",
        "talking_points": ["poin 1"]
      }
    ],
    "storyboard_prompts": [
      "DALL-E prompt untuk scene HOOK (bahasa Inggris)",
      "DALL-E prompt untuk scene ISI (bahasa Inggris)",
      "DALL-E prompt untuk scene KONTEN (bahasa Inggris)",
      "DALL-E prompt untuk scene CTA (bahasa Inggris)"
    ]
  }` : ''}
}`

    const { text } = await generateText({ featureId: 'bpi-brief', prompt, maxTokens: 3000 })
    cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const result = JSON.parse(cleaned)

    return NextResponse.json(result)
  } catch (err) {
    console.error('[POST /api/ai/brief] raw output:', cleaned || 'unavailable')
    console.error('[POST /api/ai/brief]', err)
    const msg = err instanceof Error ? err.message : 'Failed to generate brief'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
