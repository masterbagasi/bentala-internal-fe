import { NextRequest, NextResponse } from 'next/server'
import { generateText } from '@/lib/ai-text'

export async function POST(req: NextRequest) {
  try {
    const { idea, platform, format, tone, targetAudiens } = await req.json()
    if (!idea?.title) return NextResponse.json({ error: 'idea required' }, { status: 400 })

    const prompt = `Buat content brief lengkap dan detail untuk konten berikut:

Judul: ${idea.title}
Konsep: ${idea.concept}
Hook: ${idea.hook}
Angle: ${idea.angle}
Platform: ${platform || 'Instagram Reels / TikTok'}
Format: ${format || 'Short Video'}
Tone: ${tone || 'Fun & Energetic'}
${targetAudiens ? `Target Audiens: ${targetAudiens}` : ''}

Output JSON (ONLY):
{
  "judul": "Final judul konten yang sudah dipoles",
  "objective": "Tujuan utama konten ini (1-2 kalimat)",
  "target_audiens": "Profil detail target audiens (usia, minat, perilaku)",
  "platform": "Platform target dengan spesifikasi format",
  "format": "Format konten dan estimasi durasi",
  "talent": "Kebutuhan talent/presenter (jumlah, tipe, karakteristik)",
  "properti": ["Properti/alat 1", "Properti/alat 2", "Properti/alat 3"],
  "mood_board": "Deskripsi mood, estetika, warna dominan, pencahayaan, dan feel keseluruhan",
  "key_messages": ["Pesan kunci 1", "Pesan kunci 2", "Pesan kunci 3"],
  "cta": "Call-to-action yang diinginkan di akhir konten",
  "referensi_gaya": "Referensi visual, kreator, atau style yang bisa dijadikan inspirasi",
  "notes": "Catatan produksi penting atau hal khusus yang perlu diperhatikan"
}`

    const { text } = await generateText({ featureId: 'ai-content-brief', prompt, maxTokens: 2000 })
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const brief = JSON.parse(cleaned)
    return NextResponse.json(brief)
  } catch (err) {
    console.error('[/api/ai/content-brief]', err)
    const msg = err instanceof Error ? err.message : 'Failed to generate brief'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
