import { NextRequest, NextResponse } from 'next/server'
import { generateText } from '@/lib/ai-text'

export async function POST(req: NextRequest) {
  try {
    const { mode, topik, script, durasi, styleNarasi, bahasa } = await req.json()
    const input = mode === 'topic' ? topik?.trim() : script?.trim()
    if (!input) return NextResponse.json({ error: 'input required' }, { status: 400 })

    const prompt = `Buat script narasi audio yang lengkap dan siap direkam untuk:

${mode === 'topic' ? `Topik: "${input}"` : `Script mentah:\n${input}`}
Target Durasi: ${durasi || '60 detik'}
Style Narasi: ${styleNarasi || 'Natural & Conversational'}
Bahasa: ${bahasa || 'Bahasa Indonesia'}

Output JSON (ONLY):
{
  "judul": "Judul konten audio",
  "estimated_duration": "XX detik",
  "script_narasi": "Full narration script lengkap yang siap direkam, dengan jeda [...] dan penekanan [TEGAS] marked",
  "timing_guide": [
    {
      "section": "INTRO",
      "duration": "0-8 detik",
      "text": "Teks narasi untuk section ini",
      "tone_guidance": "Panduan tone, kecepatan, dan ekspresi suara"
    }
  ],
  "recording_tips": [
    "Tip rekaman 1 yang spesifik",
    "Tip rekaman 2",
    "Tip editing audio"
  ],
  "recommended_bgm": "Saran genre dan mood background music yang cocok",
  "voice_character": "Karakter dan karakteristik suara yang ideal untuk konten ini"
}

Buat 4-6 section dalam timing_guide.
Script harus natural, engaging, dan mudah diucapkan.
Output ONLY the JSON object.`

    const { text } = await generateText({ featureId: 'ai-audio', prompt, maxTokens: 3000 })
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const result = JSON.parse(cleaned)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/ai/audio]', err)
    const msg = err instanceof Error ? err.message : 'Failed to generate audio script'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
