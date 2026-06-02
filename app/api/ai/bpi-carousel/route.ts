import { NextRequest, NextResponse } from 'next/server'
import { fetchVideoFullContext, type VideoContext } from '@/lib/youtube-context'
import { resolveTextProvider, callTextOnce, type ResolvedTextProvider } from '@/lib/ai-text'
import { getProviderApiKey } from '@/lib/ai-config'

const VALID_SLIDE_TYPES = ['cover', 'intro', 'quote', 'point', 'list', 'closing'] as const
type SlideType = typeof VALID_SLIDE_TYPES[number]

interface CoverSlide { type: 'cover'; title: string; title_lines: string[]; subtitle: string; title_highlight?: string; image_query: string }
interface IntroSlide { type: 'intro'; title: string; highlight: string; body: string; image_query: string }
interface QuoteSlide { type: 'quote'; quote: string; speaker_name: string; speaker_role: string; image_query: string }
interface PointSlide { type: 'point'; title: string; highlight: string; body: string; image_query: string }
interface ListSlide  { type: 'list';  title: string; items: string[]; image_query: string }
interface ClosingSlide { type: 'closing'; cta_text?: string; image_query?: string }

type Slide = CoverSlide | IntroSlide | QuoteSlide | PointSlide | ListSlide | ClosingSlide

interface CarouselInput {
  title: string
  summary: string
  source: string
  category?: string
  site_name?: string | null
  excerpt?: string | null
  is_video?: boolean
  channel_title?: string | null
  video_id?: string | null
  // Existing content from bpi-content step
  headline_lines: string[]
  caption: string
  country: string
}

function buildPrompt(input: CarouselInput, videoContext: VideoContext | null): string {
  const publisher = input.site_name?.trim() || input.source
  const sourceMediaType = input.is_video ? 'YouTube video' : 'artikel berita'

  const richSource = input.is_video && videoContext
    ? [
        videoContext.description?.slice(0, 2500),
        videoContext.transcript ? `\n— TRANSCRIPT VIDEO —\n${videoContext.transcript.slice(0, 5000)}` : '',
      ].filter(Boolean).join('\n\n')
    : (input.excerpt || input.summary || '(tidak ada ringkasan)')

  return `Kamu adalah content writer untuk carousel Instagram BPI (Bentala Project Indonesia). BPI fokus pada cerita Indonesia ke dunia (diaspora, prestasi, budaya, isu global). Audiens: orang Indonesia 16-35 tahun, sosmed-savvy.

Tugas: generate STRUKTUR CAROUSEL 4-6 SLIDE dari sumber berita berikut. Setiap slide punya tipe spesifik dan konten yang ngalir secara naratif.

═══════════════════════════════════════════════
SUMBER BERITA:
═══════════════════════════════════════════════
Tipe: ${sourceMediaType}
Publisher: ${publisher}${input.channel_title ? `\nChannel: ${input.channel_title}` : ''}
Judul: ${input.title}
Kategori: ${input.category || 'Koneksi Indonesia ke Dunia'}
Negara: ${input.country}

Konten/Ringkasan:
${richSource}

═══════════════════════════════════════════════
EXISTING CONTENT yang sudah dibuat (untuk referensi konsistensi):
═══════════════════════════════════════════════
Headline (untuk Cover): ${input.headline_lines.join(' / ')}
Caption: ${input.caption}

═══════════════════════════════════════════════
ATURAN UMUM TITLE — SANGAT PENTING:
═══════════════════════════════════════════════
- TITLE WAJIB kalimat utuh deskriptif **30-60 karakter**. JANGAN bikin title pendek seperti "Kedaulatan Data" (15 char) atau "Gimana menurutmu?" (16 char).
- TITLE harus berbentuk PERNYATAAN/HEADLINE (subject + predikat), BUKAN cuma kata kunci atau pertanyaan singkat.
- ❌ JELEK (terlalu pendek): "Gimana menurutmu?", "Kedaulatan Data", "selangkah lebih maju", "soal teknis IT"
- ✅ BAGUS (substantive): "Indonesia Dapat Perlakuan Spesial dari Uni Eropa", "Kebijakan baru ini bernama Visa Cascade", "WNI kini bisa mengajukan Visa Schengen Multy-entry", "Data warga Indonesia masih aman atau udah jadi milik siapa?"
- HIGHLIGHT = key phrase 1-4 kata di DALAM title (BUKAN seluruh title kecuali title-nya benar-benar pendek 25-35 char). Highlight punya KONTEKS dari kata sebelum/sesudahnya.
  - title: "Kebijakan baru ini bernama Visa Cascade" → highlight: "Visa Cascade" (2 kata, ada konteks "Kebijakan baru ini bernama" sebelumnya)
  - title: "WNI kini bisa mengajukan Visa Schengen Multy-entry" → highlight: "Visa Schengen Multy-entry" (key phrase) atau seluruh title kalau memang mau full-highlight
- Title harus terbaca natural sebagai ONE COMPLETE THOUGHT, bukan judul-koran-tabloid.

═══════════════════════════════════════════════
TIPE SLIDE & STRUKTUR:
═══════════════════════════════════════════════

SETIAP slide WAJIB output \`image_query\`: search query 4-8 kata bahasa Indonesia/Inggris untuk cari gambar yang KONTEKSTUAL untuk slide tersebut. Gambar akan di-cari via Google News, jadi query harus searchable. Contoh:
- Slide cover berita Prabowo-Ursula: "Prabowo Ursula handshake EU Brussels"
- Slide quote dari Ursula: "Ursula von der Leyen portrait"
- Slide intro press conference: "Prabowo Ursula konferensi pers Brussels"
- Slide point visa center: "kantor visa schengen indonesia"
- Slide list syarat passport: "paspor indonesia visa schengen"

Tiap slide HARUS punya image_query BERBEDA biar gambar tidak repeat antar slide.

1. **cover** — Slide 1, HOOK CLICKBAIT utama (paling penting!)
   Format: {
     "type": "cover",
     "title": "55-70 char headline clickbait (gabungan title_lines, dipisah spasi)",
     "title_lines": ["BARIS 1", "BARIS 2", "BARIS 3"],
     "title_highlight": "key phrase di dalam title (1-4 kata)",
     "subtitle": "60-90 char penjelasan tambahan",
     "image_query": "search query"
   }
   - **title WAJIB CLICKBAIT/HOOK MENARIK** — bikin orang HARUS swipe/baca lanjut. TOTAL panjang: 55-70 char.
   - **title_lines WAJIB array 3 string** — pecahan headline ke 3 baris natural. Tiap baris ~18-25 char (max 28). Jangan potong kata di tengah, pecah di word-boundary yang natural.
   - title (string) = title_lines.join(" ") — harus persis match.
   - Pola hook yang BAGUS (contoh dengan 3 baris):
     • Angka shock + konteks:
       title_lines: ["Di Australia, Mesin Cuci", "Harga Rp72 Juta Dibuang", "Begitu Saja"]
     • Kata superlatif/heran:
       title_lines: ["Saking Enaknya! Warung", "Padang Ini 'Dilarang Tutup'", "oleh Pejabat Singapura"]
     • Pertanyaan/teaser:
       title_lines: ["Kenapa WNI Kini Bisa", "Bebas Visa Schengen", "Multy-entry ke Eropa?"]
     • Reveal/twist:
       title_lines: ["Ternyata Indonesia Dapat", "Perlakuan Spesial dari", "Uni Eropa, Kok Bisa?"]
     • Curiosity gap:
       title_lines: ["Begini Cara Diaspora RI", "Bikin Kuliner Padang", "Mendunia di Singapura"]
   - HINDARI title datar/news anchor seperti "Indonesia Tandatangani Kerjasama dengan EU" — itu BUKAN hook.
   - title_highlight = KEY PHRASE di dalam title (1-4 kata yang punya impact paling kuat). Bukan kata sambung.
   - subtitle = kalimat tambahan yang menambah konteks (BUKAN paraphrase title).
   - image_query = gambar utama berita (subject inti)

2. **intro** — Set up konteks (slide ke-2 biasanya)
   Format: { "type": "intro", "title": "35-65 char pernyataan kunci", "highlight": "1-4 kata key phrase di dalam title", "body": "200-280 char body", "image_query": "search query" }
   - title = pernyataan kunci LENGKAP yang mengandung kata-kata "biasa" + key phrase (mis. "Kebijakan baru ini bernama Visa Cascade")
   - highlight = HANYA key phrase (mis. "Visa Cascade") — JANGAN seluruh title kecuali title sangat pendek
   - body = ekspansi konteks dengan **bold** untuk nama orang/tempat penting
   - image_query = konteks event/lokasi

3. **quote** — Kutipan dari narasumber (skip kalau tidak ada quote di sumber)
   Format: { "type": "quote", "quote": "100-300 char kutipan", "speaker_name": "nama lengkap", "speaker_role": "jabatan", "image_query": "search query" }
   - DILARANG mengarang quote. Kalau tidak ada quote di sumber → skip slide ini.
   - image_query = portrait speaker

4. **point** — Penjelasan poin tambahan
   Format: { "type": "point", "title": "35-65 char pernyataan poin", "highlight": "key phrase di title atau seluruh title", "body": "180-280 char penjelasan", "image_query": "search query" }
   - title = pernyataan poin spesifik LENGKAP (mis. "WNI kini bisa mengajukan Visa Schengen Multy-entry")
   - highlight = bisa key phrase atau full-line highlight kalau title cocok di-highlight semua
   - body = penjelasan substansi poin
   - image_query = ilustrasi konkret poin

5. **list** — Daftar/syarat/breakdown
   Format: { "type": "list", "title": "10-30 char label list", "items": ["item 60-130 char", ...], "image_query": "search query" }
   - title = label list pendek (mis. "Dengan Syarat:", "Poin Penting:", "5 Fakta Utama")
   - items = 3-4 item kalimat utuh padat (60-130 char masing-masing)
   - image_query = ilustrasi pendukung list

6. **closing** — Slide terakhir, CTA/penutup (WAJIB jadi slide terakhir)
   Format: { "type": "closing", "cta_text": "ajakan komentar/diskusi 30-60 char", "image_query": "search query" }
   - cta_text = ajakan natural ke audiens, mis. "Tulis pendapatmu di kolom komentar!", "Apa pendapat kamu? Bagikan di komentar.", "Kalau menurutmu, gimana?"
   - image_query = gambar yang relate ke topik (boleh sama dengan cover atau topic-related)

═══════════════════════════════════════════════
ATURAN SUSUNAN SLIDE:
═══════════════════════════════════════════════
- Slide 1 WAJIB cover
- Slide 2 WAJIB intro (set up konteks awal)
- Slide 3 sampai N-1: campur quote + point + list sesuai kebutuhan substansi (urutan natural mengikuti narasi)
- Slide TERAKHIR WAJIB closing (CTA penutup)
- Total slide: 5-7 (sweet spot 6, termasuk closing)
- JANGAN ulang konten yang sama persis antar slide
- Setiap slide harus contribute info BARU, bukan recap

═══════════════════════════════════════════════
ATURAN KONTEN:
═══════════════════════════════════════════════
- Bahasa Indonesia natural sosmed (BUKAN news anchor)
- DILARANG mengarang fakta — semua informasi harus bisa ditelusuri ke sumber
- Untuk **bold** emphasis di body, pakai markdown \`**word**\` untuk nama orang/jabatan/angka penting
- highlight di title harus 1-3 kata yang punya impact (keyword utama, bukan kata sambung)

═══════════════════════════════════════════════

Output JSON dengan format persis:
{
  "slides": [
    { "type": "cover", ... },
    { "type": "intro", ... },
    ...
  ]
}

Output ONLY the JSON object, no other text or markdown wrapper.`
}

function validateSlide(s: unknown): s is Slide {
  if (!s || typeof s !== 'object') return false
  const slide = s as { type?: string }
  if (!slide.type || !VALID_SLIDE_TYPES.includes(slide.type as SlideType)) return false

  const obj = s as Record<string, unknown>
  switch (slide.type) {
    case 'cover':
      // Cover headline must be clickbait-length (50-80 char) and split into exactly 3 lines.
      return typeof obj.title === 'string' && obj.title.length >= 50 && obj.title.length <= 80
        && Array.isArray(obj.title_lines) && obj.title_lines.length === 3
        && obj.title_lines.every(l => typeof l === 'string' && l.length >= 6 && l.length <= 32)
        && typeof obj.subtitle === 'string' && obj.subtitle.length >= 30
    case 'intro':
    case 'point':
      return typeof obj.title === 'string' && obj.title.length >= 25
        && typeof obj.body === 'string' && obj.body.length >= 80
    case 'quote':
      return typeof obj.quote === 'string' && obj.quote.length >= 40
        && typeof obj.speaker_name === 'string'
    case 'list':
      return typeof obj.title === 'string'
        && Array.isArray(obj.items) && obj.items.length >= 2
        && obj.items.every(it => typeof it === 'string' && it.length >= 30)
    case 'closing':
      // closing is optional and lenient — cta_text optional, defaults will be used
      return true
  }
  return false
}

export async function POST(req: NextRequest) {
  let resolved: ResolvedTextProvider
  try {
    resolved = await resolveTextProvider('bpi-carousel')
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'AI provider tidak terkonfigurasi' }, { status: 500 })
  }

  try {
    const body = await req.json()
    const input = body.input as CarouselInput | undefined
    if (!input || !input.title) {
      return NextResponse.json({ error: 'input required' }, { status: 400 })
    }

    let videoContext: VideoContext | null = null
    const youtubeKey = await getProviderApiKey('youtube')
    if (input.is_video && input.video_id && youtubeKey) {
      try {
        videoContext = await fetchVideoFullContext(input.video_id, youtubeKey)
      } catch { /* fall back without transcript */ }
    }

    const tryGenerate = async (extraNote: string): Promise<{ slides: Slide[]; raw: string }> => {
      const prompt = extraNote
        ? `${buildPrompt(input!, videoContext)}\n\n⚠️ ATTEMPT SEBELUMNYA GAGAL: ${extraNote}\nKali ini WAJIB:\n- COVER title = 55-70 char CLICKBAIT/HOOK menarik (BUKAN news anchor datar)\n- Body slide title 30-60 char (kalimat utuh deskriptif), body 200-280 char\n- JANGAN title pendek/datar seperti "Kedaulatan Data" atau "Indonesia Tandatangani Kerjasama" — DITOLAK.`
        : buildPrompt(input!, videoContext)

      const text = await callTextOnce(resolved, prompt, 3500)
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
      let parsed: { slides?: unknown[] }
      try {
        parsed = JSON.parse(cleaned)
      } catch {
        return { slides: [], raw: text }
      }
      const slidesRaw = Array.isArray(parsed.slides) ? parsed.slides : []
      const valid = slidesRaw.filter(validateSlide)
      return { slides: valid, raw: text }
    }

    let result = await tryGenerate('')
    if (result.slides.length < 3) {
      console.warn(`[/api/ai/bpi-carousel] retry: only ${result.slides.length} valid slides on first attempt`)
      result = await tryGenerate(`Hanya ${result.slides.length} slide yang valid (butuh minimal 3). Banyak title terlalu pendek atau body terlalu pendek.`)
    }

    const slides = result.slides
    if (slides.length < 2) {
      console.error('[/api/ai/bpi-carousel] still too few valid slides after retry. Raw:', result.raw.slice(0, 800))
      return NextResponse.json({ error: 'Generated too few valid slides — title atau body terlalu pendek setelah 2 attempt' }, { status: 500 })
    }

    // Cap at 6 slides
    const finalSlides = slides.slice(0, 6)

    return NextResponse.json({
      slides: finalSlides,
      count: finalSlides.length,
    })
  } catch (err) {
    console.error('[/api/ai/bpi-carousel]', err)
    return NextResponse.json({ error: 'Failed to generate carousel' }, { status: 500 })
  }
}
