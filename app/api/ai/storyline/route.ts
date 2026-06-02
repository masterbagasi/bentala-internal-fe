import { NextRequest, NextResponse } from 'next/server'
import { generateText } from '@/lib/ai-text'

export async function POST(req: NextRequest) {
  try {
    const { idea, platform, format, tone } = await req.json()
    if (!idea?.title) return NextResponse.json({ error: 'idea required' }, { status: 400 })

    const prompt = `Buat storyline/script detail scene-by-scene untuk konten berikut:

Judul: ${idea.title}
Konsep: ${idea.concept}
Hook: ${idea.hook}
Platform: ${platform || 'Instagram Reels / TikTok'}
Format: ${format || 'Short Video'}
Tone: ${tone || 'Fun & Energetic'}

Output JSON (ONLY):
{
  "total_durasi": "XX detik",
  "format": "Format dan platform",
  "scenes": [
    {
      "no": 1,
      "timecode": "00:00-00:05",
      "label": "HOOK",
      "visual": "Deskripsi visual, angle kamera, komposisi shot yang detail",
      "dialog": "Teks dialog atau narasi yang diucapkan secara word-for-word",
      "direction": "Arahan sutradara untuk talent: ekspresi, gerakan, blocking",
      "bgm": "Saran background music atau sound effect"
    }
  ]
}

Buat 5-7 scene sesuai durasi. Label scene bisa: HOOK, INTRO, ISI, KLIMAKS, CTA, OUTRO.
Dialog harus natural dan engaging dalam Bahasa Indonesia.
Output ONLY the JSON object.`

    const { text } = await generateText({ featureId: 'ai-video', prompt, maxTokens: 3000 })
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const storyline = JSON.parse(cleaned)
    return NextResponse.json(storyline)
  } catch (err) {
    console.error('[/api/ai/storyline]', err)
    const msg = err instanceof Error ? err.message : 'Failed to generate storyline'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
