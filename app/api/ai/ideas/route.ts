import { NextRequest, NextResponse } from 'next/server'
import { generateText } from '@/lib/ai-text'

export async function POST(req: NextRequest) {
  try {
    const { keyword, platform, format, tone, targetAudiens, referensiAkun } = await req.json()
    if (!keyword?.trim()) return NextResponse.json({ error: 'keyword required' }, { status: 400 })

    const referensiStr = Array.isArray(referensiAkun) && referensiAkun.length > 0
      ? `\nReferensi akun/kreator: ${referensiAkun.join(', ')}`
      : ''
    const audiensStr = targetAudiens?.trim() ? `\nTarget audiens: ${targetAudiens.trim()}` : ''

    const prompt = `Buat 6 ide konten yang kreatif dan spesifik untuk:

Topik: "${keyword}"
Platform: ${platform || 'TikTok / Instagram Reels'}
Format: ${format || 'Short Video'}
Tone/Gaya: ${tone || 'Fun & Energetic'}${audiensStr}${referensiStr}

Output JSON array dengan tepat 6 objek:
[
  {
    "id": "idea_1",
    "title": "Judul konten yang catchy dan spesifik",
    "hook": "Hook pembuka yang kuat dan langsung menarik perhatian (1 kalimat)",
    "concept": "Penjelasan konsep konten secara detail (2-3 kalimat)",
    "angle": "Sudut pandang unik yang membedakan konten ini dari yang lain",
    "format_saran": "Format spesifik (contoh: Reels 30 detik, TikTok talking head)",
    "referensi_inspirasi": "Gaya kreator atau style yang bisa dijadikan referensi visual",
    "saved": false
  }
]

Gunakan Bahasa Indonesia. Buat ide yang beragam, segar, dan relevan untuk audiens Indonesia.
Output ONLY the JSON array, tanpa teks lain.`

    const { text } = await generateText({ featureId: 'ai-ideas', prompt, maxTokens: 3000 })
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const ideas = JSON.parse(cleaned)
    return NextResponse.json({ ideas })
  } catch (err) {
    console.error('[/api/ai/ideas]', err)
    const msg = err instanceof Error ? err.message : 'Failed to generate ideas'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
