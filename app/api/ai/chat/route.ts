import { NextRequest, NextResponse } from 'next/server'
import { resolveTextProvider } from '@/lib/ai-text'

const SYSTEM_PROMPT = `Kamu adalah asisten kreatif untuk tim Bentala, sebuah agensi social media Indonesia yang mengelola konten untuk brand fashion dan lifestyle.

Tim kamu terdiri dari:
- Content strategist & manager
- Desainer grafis (Reinaldi)
- Videografer & editor (Faizal)

Kamu bisa membantu dengan:
- Ide konten untuk Instagram, TikTok, dan platform lainnya
- Penulisan caption yang engaging
- Strategi hashtag
- Brief desain dan video
- Analisis tren fashion & lifestyle Indonesia
- Saran editing dan produksi konten
- Copy dan copywriting

Gunakan Bahasa Indonesia yang natural, profesional, dan kreatif. Kalau konteksnya cocok untuk Bahasa Inggris (seperti prompt untuk Midjourney), gunakan Bahasa Inggris.`

interface ChatMessage { role: 'user' | 'assistant'; content: string }

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json() as { messages?: ChatMessage[] }
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 })
    }

    const resolved = await resolveTextProvider('ai-chat')
    let text = ''

    if (resolved.provider === 'anthropic' && resolved.anthropic) {
      const response = await resolved.anthropic.messages.create({
        model: resolved.model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages,
      })
      const block = response.content[0]
      text = block && 'text' in block ? block.text : ''
    } else if (resolved.provider === 'openai' && resolved.openai) {
      const completion = await resolved.openai.chat.completions.create({
        model: resolved.model,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages,
        ],
      })
      text = completion.choices[0]?.message?.content ?? ''
    }

    return NextResponse.json({ content: text })
  } catch (err) {
    console.error('[POST /api/ai/chat]', err)
    const msg = err instanceof Error ? err.message : 'Gagal mendapatkan respons'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
