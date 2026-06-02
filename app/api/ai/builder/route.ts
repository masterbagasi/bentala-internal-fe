import { NextRequest, NextResponse } from 'next/server'
import { generateText } from '@/lib/ai-text'

export async function POST(req: NextRequest) {
  try {
    const { input_text, platform } = await req.json()
    if (!input_text?.trim()) {
      return NextResponse.json({ error: 'input_text required' }, { status: 400 })
    }

    const prompt = `Buat konten lengkap untuk platform ${platform} dari ide berikut: "${input_text}".

Output JSON dengan format berikut:
{
  "caption": "Caption lengkap untuk postingan (2-4 paragraf, engaging, call-to-action di akhir)",
  "hashtags": "#hashtag1 #hashtag2 #hashtag3 (15-20 hashtag relevan)",
  "script": "Script video lengkap dengan opening hook, isi konten, dan closing CTA (untuk video 30-60 detik)",
  "posting_time": "Saran waktu terbaik untuk posting (contoh: Selasa-Kamis, pukul 18.00-20.00 WIB)"
}

Gunakan Bahasa Indonesia yang natural dan sesuai target audiens muda Indonesia. Output ONLY the JSON object, no other text.`

    const { text } = await generateText({ featureId: 'ai-builder', prompt, maxTokens: 3000 })
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const result = JSON.parse(cleaned) as {
      caption: string
      hashtags: string
      script: string
      posting_time: string
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/ai/builder]', err)
    const msg = err instanceof Error ? err.message : 'Failed to generate content'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
