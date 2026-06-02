import { NextRequest, NextResponse } from 'next/server'
import { fetchVideoFullContext, formatDuration, type VideoContext } from '@/lib/youtube-context'
import { resolveTextProvider, callTextOnce, type ResolvedTextProvider } from '@/lib/ai-text'
import { getProviderApiKey } from '@/lib/ai-config'

const CATEGORY_LABELS: Record<string, string> = {
  diaspora: 'Diaspora & WNI di Luar Negeri',
  prestasi: 'Prestasi & Pencapaian Internasional',
  budaya: 'Budaya, Kuliner & Seni',
  viral: 'Viral di Media Sosial',
  internasional: 'Liputan Media Internasional',
}

const CATEGORY_GUIDANCE: Record<string, string> = {
  diaspora: 'Tonjolkan kisah perjuangan, nostalgia, dan kebanggaan menjadi WNI di luar negeri.',
  prestasi: 'Angkat rasa bangga nasional, inspirasi untuk generasi muda Indonesia.',
  budaya: 'Perlihatkan bagaimana Indonesia dikenal dan dicintai dunia lewat makanan/seni/budaya.',
  viral: 'Manfaatkan momentum viral untuk engagement tinggi, gunakan angle yang relatable.',
  internasional: 'Terjemahkan perspektif global tentang Indonesia untuk audiens lokal.',
}

const MAX_LINE_CHARS = 23
const MIN_TOTAL_CHARS = 55
const MAX_TOTAL_CHARS = 70

const VALID_CONTENT_CATEGORIES = [
  'global_context',
  'indonesian_people',
  'indonesian_culture',
  'local_go_global',
  'global_achievement',
] as const

type ContentCategoryKey = typeof VALID_CONTENT_CATEGORIES[number]

const CATEGORY_HASHTAG: Record<ContentCategoryKey, string> = {
  global_context: '#GlobalContext',
  indonesian_people: '#IndonesianPeople',
  indonesian_culture: '#IndonesianCulture',
  local_go_global: '#LocalGoGlobal',
  global_achievement: '#GlobalAchievement',
}

const FIXED_HASHTAGS = {
  brand: '#BentalaProject',
  tagline: '#IndonesianStoriesBeyondBorders',
  audience: '#WNI',
}

interface ContentOutput {
  headline_lines: string[]
  caption: string
  country: string
  content_category?: ContentCategoryKey
  content_category_reason?: string
}

// Sanitize country to PascalCase hashtag-safe form: "United States" → "UnitedStates"
function toCountryHashtag(raw: unknown): string {
  if (typeof raw !== 'string') return '#Indonesia'
  const cleaned = raw
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z\s]/g, ' ')
    .trim()
  if (!cleaned) return '#Indonesia'
  const pascal = cleaned
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('')
  return pascal ? `#${pascal}` : '#Indonesia'
}

function validateHeadline(lines: unknown): { ok: true } | { ok: false; reason: string } {
  if (!Array.isArray(lines) || lines.length !== 3) {
    return { ok: false, reason: `headline_lines harus array berisi tepat 3 string, bukan ${Array.isArray(lines) ? lines.length : typeof lines}` }
  }
  for (let i = 0; i < 3; i++) {
    const line = lines[i]
    if (typeof line !== 'string') return { ok: false, reason: `baris ${i + 1} bukan string` }
    if (line.length === 0) return { ok: false, reason: `baris ${i + 1} kosong` }
    if (line.length > MAX_LINE_CHARS) {
      return { ok: false, reason: `baris ${i + 1} = ${line.length} karakter (maksimal ${MAX_LINE_CHARS}). Teks: "${line}"` }
    }
  }
  const joined = (lines as string[]).join(' ')
  if (joined.length < MIN_TOTAL_CHARS) {
    return { ok: false, reason: `total ${joined.length} karakter (minimal ${MIN_TOTAL_CHARS}). Teks gabungan: "${joined}"` }
  }
  if (joined.length > MAX_TOTAL_CHARS) {
    return { ok: false, reason: `total ${joined.length} karakter (maksimal ${MAX_TOTAL_CHARS}). Teks gabungan: "${joined}"` }
  }
  return { ok: true }
}

interface ContentItem {
  title: string
  summary: string
  source: string
  category?: string
  site_name?: string | null
  excerpt?: string | null
  final_url?: string | null
  is_video?: boolean
  channel_title?: string | null
  video_id?: string | null
}

function formatNumberId(s: string): string {
  if (!s) return ''
  const n = Number(s)
  if (isNaN(n)) return s
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}jt`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}rb`
  return String(n)
}

function buildVideoSourceBlock(item: ContentItem, ctx: VideoContext): string {
  const lines: string[] = []
  lines.push(`Tipe sumber: YouTube video`)
  lines.push(`Channel: ${ctx.channel_title || item.channel_title || '(tidak diketahui)'}`)
  lines.push(`Judul: ${item.title}`)
  if (ctx.duration) lines.push(`Durasi: ${formatDuration(ctx.duration)}`)
  if (ctx.view_count) lines.push(`Views: ${formatNumberId(ctx.view_count)}`)
  if (ctx.published_at) lines.push(`Tanggal upload: ${ctx.published_at.slice(0, 10)}`)
  if (ctx.tags && ctx.tags.length > 0) lines.push(`Tags: ${ctx.tags.slice(0, 12).join(', ')}`)

  if (ctx.description?.trim()) {
    lines.push('')
    lines.push('— DESKRIPSI VIDEO LENGKAP —')
    lines.push(ctx.description.trim().slice(0, 3000))
  }

  if (ctx.transcript?.trim()) {
    lines.push('')
    lines.push(`— TRANSCRIPT VIDEO (${ctx.transcript_lang ?? 'auto'}) —`)
    // Cap transcript at 6000 chars to keep prompt size reasonable
    lines.push(ctx.transcript.trim().slice(0, 6000))
  } else {
    lines.push('')
    lines.push('— TRANSCRIPT TIDAK TERSEDIA — (caption tidak ada di video ini)')
  }

  return lines.join('\n')
}

function buildPrompt(item: ContentItem, videoContext: VideoContext | null, retryFeedback?: string): string {
  const categoryLabel = item.category ? CATEGORY_LABELS[item.category] ?? item.category : 'Koneksi Indonesia ke Dunia'
  const categoryGuide = item.category ? CATEGORY_GUIDANCE[item.category] ?? '' : ''

  // Pakai site_name (mis. "ANTARA News", "BBC", "Detik") kalau ada, fallback ke RSS source label
  const publisher = item.site_name?.trim() || item.source

  // For videos with rich context, build detailed source block; otherwise use article excerpt+summary
  const hasVideoContext = item.is_video && videoContext
  const richSummary = hasVideoContext
    ? buildVideoSourceBlock(item, videoContext)
    : [item.excerpt, item.summary].filter(Boolean).join('\n\n').trim() || '(tidak ada ringkasan)'

  const retryNote = retryFeedback
    ? `\n⚠️ ATTEMPT SEBELUMNYA GAGAL VALIDASI: ${retryFeedback}

WAJIB DIPATUHI KALI INI:
- HITUNG ULANG karakter setiap baris satu-per-satu sebelum output (huruf + angka + spasi + tanda baca).
- Kalau total terlalu PENDEK (<55), TAMBAHKAN kata penguat: superlatif ("habis-habisan", "auto", "bikin merinding"), bumper emosi ("Gila!", "Wow!", "Astaga!"), atau ekspansi konteks ("di Tengah...", "Saat...", "Tanpa Diduga...") TANPA melanggar 23-char/baris.
- Kalau ada baris yang LEBIH dari 23 char, pecah ke kata berikutnya — JANGAN potong di tengah kata.
- Headline HARUS punya 3 baris, masing-masing terisi (tidak boleh ada baris kosong).
`
    : ''

  const sourceMediaType = item.is_video ? 'YouTube video' : 'artikel berita'
  const sourceHeader = hasVideoContext
    ? `Kategori: ${categoryLabel}\n`
    : `Tipe sumber: ${sourceMediaType}\nPublisher/Sumber: ${publisher}\n${item.is_video && item.channel_title ? `Channel YouTube: ${item.channel_title}\n` : ''}${item.final_url ? `URL: ${item.final_url}\n` : ''}Judul: ${item.title}\nKategori: ${categoryLabel}\n`

  return `Kamu adalah content writer untuk akun Instagram dan TikTok BPI (Bentala Project Indonesia). BPI fokus pada cerita yang menghubungkan Indonesia dengan dunia — orang Indonesia di luar negeri, prestasi internasional, budaya/kuliner Indonesia mendunia, dan liputan media internasional tentang Indonesia.

Audiens BPI: orang Indonesia (16-35 tahun) yang aktif di sosmed, peduli dengan citra Indonesia di mata dunia, dan suka konten inspiratif/relatable.
${retryNote}
═══════════════════════════════════════════════
SUMBER YANG HARUS KAMU PROSES:
═══════════════════════════════════════════════
${sourceHeader}${richSummary}

═══════════════════════════════════════════════
ATURAN GROUNDING (KRITIS — JANGAN DILANGGAR):
═══════════════════════════════════════════════
1. Konten YANG KAMU BUAT HARUS BENAR-BENAR SESUAI dengan SUMBER di atas (judul + deskripsi + transcript kalau video).
2. JANGAN PERNAH membuat konten tentang topik LAIN — fokus 100% pada substansi yang ada di sumber ini.
3. DILARANG menyebut nama perusahaan, kota, lokasi, angka statistik, nama orang, atau fakta yang TIDAK ADA di sumber. Jangan mengarang.
4. ${hasVideoContext ? `Untuk VIDEO INI ada TRANSCRIPT lengkap di atas — BACA SAMPAI SELESAI sebelum nulis. Tarik:
   - Cerita inti yang dibahas di video
   - Nama orang, tempat, atau detail spesifik yang DISEBUT di transcript
   - Pesan/insight utama yang dibawakan creator
   - Quote menarik atau pernyataan kuat dari transcript (kalau ada, kutip pakai format "..." di caption)` : `Kalau judul/ringkasan THIN (sedikit info):
   → SELALU bekerja dari apa yang TERSURAT di judul. Tarik makna dari kata kunci judul.
   → Boleh ekspansi tematik ke isu/feel umum yang RELEVAN, tapi JANGAN buat fakta baru.`}
5. Setiap kalimat di caption harus bisa ditelusuri ke kata/konsep di sumber. Cek mental kamu: "Kalimat ini muncul karena info apa di sumber?"
6. Kalau caption mau referensi sumber: gunakan tipe sumber dengan tepat:
   - Video YouTube: "Dari channel ${item.channel_title || videoContext?.channel_title || '[YouTube]'}..." atau "Dalam video viral di channel..."
   - Artikel: "Dilansir dari ${publisher}..." atau "Menurut ${publisher}..."
${hasVideoContext ? `7. Kalau ada quote langsung dari narasumber/creator di transcript yang menarik, MASUKKAN ke caption dengan format kutipan: "..." kata [nama kalau disebut].` : ''}

${categoryGuide ? `Panduan kategori: ${categoryGuide}\n` : ''}
╔═══════════════════════════════════════════════╗
║   KLASIFIKASI KATEGORI KONTEN (KRITIS — WAJIB) ║
╚═══════════════════════════════════════════════╝

Pilih TEPAT SATU kategori dari 5 berikut. Baca DEFINISI + ✅ COCOK + ❌ EXCLUSION sampai selesai, JANGAN buru-buru.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 1. global_context
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEFINISI: Isu, tren, fenomena, atau pemberitaan yang membahas Indonesia dalam konteks global. Topik yang punya potensi diskusi publik, perdebatan, atau perbedaan sudut pandang. Skala MAKRO — bukan satu orang/produk/event spesifik.

✅ COCOK untuk:
- Tren statistik/fenomena makro yang melibatkan Indonesia (mis. minat studi luar negeri naik, brain drain, gelombang migrasi WNI, lonjakan turis Indonesia ke negara X)
- Isu kebijakan, politik, ekonomi, atau diplomasi Indonesia yang dibahas atau berimplikasi internasional
- Liputan media internasional ABOUT Indonesia (BBC, Reuters, AlJazeera, NYT bahas Indonesia)
- Perbedaan perspektif lokal vs internasional yang memicu diskusi
- Topik kontroversial / debat publik (pro-kontra)
- Laporan bisnis / ekspansi perusahaan asing yang masuk ke pasar Indonesia karena tren
- Hubungan bilateral, kerjasama internasional, perundingan
- Posisi Indonesia di ranking/index global (kecuali ranking kompetisi spesifik)

❌ JANGAN pakai untuk:
- Cerita personal 1 orang WNI (itu indonesian_people)
- Prestasi/juara individu atau tim (itu global_achievement)
- Produk Indonesia yang sukses di luar negeri (itu local_go_global)
- Konten murni budaya Indonesia (itu indonesian_culture)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 2. indonesian_people
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEFINISI: Cerita, pengalaman, atau perspektif PERSONAL satu individu, satu keluarga, atau satu kelompok kecil WNI di luar negeri. Insight dari sudut pandang MEREKA SENDIRI tentang kehidupan di luar Indonesia.

✅ COCOK untuk:
- Profile pieces 1 individu WNI (mahasiswa, pekerja, ibu rumah tangga, profesional)
- Vlog/cerita gaji UMP, biaya hidup, sewa apartemen di kota X dari sudut pandang individu
- Pengalaman struggle/adaptasi: culture shock, homesick, makanan halal, ibadah, dll.
- Observasi sehari-hari WNI tentang kebiasaan unik negara setempat
- Cerita pernikahan beda negara, mengasuh anak di luar negeri, hidup mandiri di rantau
- Kisah TKI/PRT/perawat dengan pengalaman kerja spesifik
- Komunitas WNI lokal yang gelar acara/event komunitas (halal bihalal, peringatan kemerdekaan)
- "How it feels..." stories tentang hidup di luar negeri

❌ JANGAN pakai untuk:
- Tren makro (jutaan orang, statistik, fenomena umum) — itu **global_context**
- Berita kebijakan / hukum / politik tentang WNI — itu **global_context**
- Prestasi/juara WNI — itu **global_achievement**
- Konten yang FOKUS ke isu/debat publik (meskipun WNI yang bicara) — itu **global_context**

KEY TEST: Apakah berita ini tentang SATU ORANG/KELOMPOK SPESIFIK menceritakan pengalaman pribadi mereka? YES → indonesian_people. Apakah ini tentang FENOMENA/ANGKA/ISU yang melibatkan banyak WNI? NO untuk kategori ini.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 3. indonesian_culture
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEFINISI: Budaya Indonesia (tradisi, kuliner, seni, kebiasaan, bahasa, identitas) yang dikenal, digunakan, atau mendapat perhatian di luar negeri. Fokus pada UNSUR BUDAYA, bukan orang atau produk.

✅ COCOK untuk:
- Kuliner Indonesia masuk daftar/diakui (rendang, nasi goreng, sate masuk Top 50 CNN/TasteAtlas)
- Tradisi/upacara Indonesia jadi sorotan (wayang, gamelan, batik, tari saman dipertunjukkan/diakui)
- Budaya Indonesia diadopsi/dipakai di luar (selebriti pakai batik, pernikahan adat oleh non-Indonesia)
- Festival budaya Indonesia digelar di luar negeri
- Bahasa Indonesia diajarkan di universitas asing
- Restoran Indonesia di luar negeri yang dilihat sebagai DUTA KULINER (bukan ekspansi bisnis)
- Pengakuan UNESCO, museum global, dokumentasi internasional tentang budaya Indonesia

❌ JANGAN pakai untuk:
- Produk komersial Indonesia yang sukses di luar (itu **local_go_global**, mis. brand fashion, aplikasi)
- Penghargaan untuk individu/karya (itu **global_achievement**)
- Cerita personal WNI yang menyajikan budaya (itu **indonesian_people** kalau fokus ke individu)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 4. local_go_global
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEFINISI: Produk, brand, karya kreatif, bisnis, atau inisiatif ASAL INDONESIA yang berhasil menembus pasar internasional atau mendapat pengakuan dari pasar/audiens luar negeri. Fokus pada KARYA / OUTPUT, bukan orang yang membuatnya.

✅ COCOK untuk:
- Brand fashion/sneaker/skincare/F&B Indonesia tembus toko/marketplace luar negeri
- Aplikasi/startup Indonesia diunduh atau ekspansi ke pasar asing
- Film Indonesia tayang di festival/bioskop internasional (Cannes, Berlinale, Netflix global)
- Album/lagu artist Indonesia masuk chart internasional (Billboard, Spotify global)
- Game/animasi/komik Indonesia rilis di platform internasional
- UMKM/kerajinan Indonesia masuk retailer global (Walmart, Target, IKEA)
- Buku Indonesia diterjemahkan ke bahasa asing dan dijual luas
- Kolaborasi brand Indonesia dengan brand global yang resmi
- Investasi/IPO perusahaan Indonesia di bursa asing

❌ JANGAN pakai untuk:
- Award/medali/juara individu (itu **global_achievement**)
- Restoran sebagai duta budaya (itu **indonesian_culture**)
- Tren bisnis/ekonomi tanpa karya spesifik Indonesia yang ditonjolkan (itu **global_context**)
- Karya yang dapat penghargaan formal (itu **global_achievement**, kecuali fokus utama berita ke market reach)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 5. global_achievement
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEFINISI: Pencapaian, prestasi, juara, atau penghargaan individu/kelompok asal Indonesia di tingkat internasional. Ada elemen MENANG, JUARA, RAIH, atau pengakuan formal.

✅ COCOK untuk:
- Juara olimpiade akademik (matematika, fisika, kimia, biologi, informatika)
- Medali Olimpiade, Asian Games, SEA Games, kejuaraan dunia olahraga
- Award seni/film/musik (Cannes Best, Grammy, Oscar, BAFTA, dll.)
- Penghargaan ilmiah (Nobel, fellowship, grant prestisius)
- Beasiswa elite (Rhodes, Fulbright, Chevening) — kalau berita fokus ke prestasi mendapatkan beasiswa tersebut
- Lulus cum laude / valedictorian dari universitas top dunia
- Tim Indonesia juara turnamen internasional (Gothia Cup, e-sports, debate)
- Konferensi internasional: Indonesia jadi keynote/dipilih panel
- Rekor dunia (Guinness, dll.)

❌ JANGAN pakai untuk:
- Hanya ikut serta tanpa juara/award (kalau fokus partisipasi: indonesian_people atau global_context)
- Karya yang dijual di pasar internasional tanpa award (itu **local_go_global**)
- Tren beasiswa/akademis secara umum (itu **global_context**)

╔═══════════════════════════════════════════════╗
║   PRIORITAS KEPUTUSAN (DECISION TREE)          ║
╚═══════════════════════════════════════════════╝

Cek pertanyaan ini BERURUTAN, ambil yang pertama YES:

1. Apakah ada **prestasi/juara/award/medali/penghargaan formal** sebagai SUBSTANSI utama? → **global_achievement**

2. Apakah berita SECARA SPESIFIK tentang **produk/brand/karya/bisnis Indonesia** yang menembus pasar/audiens luar negeri (TANPA award formal)? → **local_go_global**

3. Apakah berita SECARA SPESIFIK tentang **unsur budaya Indonesia** (kuliner, tradisi, seni, bahasa) yang dikenal/dipakai/dipuji di luar negeri? → **indonesian_culture**

4. Apakah berita ini **kisah personal 1 orang atau kelompok kecil WNI** di luar negeri yang berbagi pengalaman/observasi mereka sendiri? → **indonesian_people**

5. KALAU TIDAK ADA YANG MATCH DI ATAS — berita berisi tren makro, statistik, isu kebijakan, fenomena umum, liputan media internasional, atau perdebatan publik tentang Indonesia → **global_context**

═══════════════════════════════════════════════
30+ CONTOH KLASIFIKASI:
═══════════════════════════════════════════════

global_achievement:
- "Mahasiswa RI juara dunia matematika di Polandia" ✓
- "Atlet bulutangkis Indonesia raih emas All England" ✓
- "Akademi Persib Cimahi & Puteri Tangsel City wakili Indonesia di Gothia Cup" ✓
- "Tim e-sports Indonesia juara MPL Asia" ✓
- "Saintis Indonesia raih fellowship MIT" ✓
- "Film karya sutradara RI menang Best Director Cannes" ✓

local_go_global:
- "Brand sneaker lokal Indonesia tembus toko di Paris" ✓
- "Aplikasi RI diunduh 1 juta kali di App Store US" ✓
- "Album Joey Alexander masuk Billboard top 10" ✓ (karya menembus pasar)
- "Mie instan Indonesia laku keras di supermarket UK" ✓
- "Brand skincare RI ekspansi ke 5 negara ASEAN" ✓
- "Game indie Indonesia rilis di Steam, terjual 100rb copy" ✓

indonesian_culture:
- "Rendang masuk Top 50 makanan terenak versi CNN" ✓
- "Batik dipakai delegasi G20 oleh pemimpin asing" ✓
- "Wayang kulit Indonesia diakui UNESCO" ✓
- "Universitas Sydney buka jurusan studi Indonesia & bahasa" ✓
- "Festival kuliner Indonesia digelar di Tokyo, ribuan datang" ✓
- "Tari Saman dipertunjukkan di pembukaan Olimpiade" ✓

indonesian_people:
- "WNI di Jepang cerita pengalaman gaji UMP Tokyo" ✓ (personal)
- "Vlog 'Sehari di NYC sebagai mahasiswa Indonesia'" ✓ (personal)
- "TKI di Hong Kong bagikan kisah selama 10 tahun bekerja" ✓ (personal)
- "Komunitas Indonesia di Sydney gelar halal bihalal" ✓ (event komunitas WNI)
- "Keluarga Indonesia di Belanda berbagi cara membesarkan anak bilingual" ✓ (personal)
- "Perawat Indonesia di Jerman cerita beratnya proses adaptasi" ✓ (personal)

global_context:
- "Tren minat WNI studi ke luar negeri tumbuh, konsultan buka kantor di Surabaya" ✓ (tren makro)
- "Brain drain Indonesia: ribuan profesional pindah ke Singapura" ✓ (isu makro)
- "PM Australia kritik kebijakan Indonesia" ✓ (isu/debat bilateral)
- "Statistik: 50% pelajar RI minat kuliah di UK" ✓ (data tren)
- "BBC: kebijakan baru Indonesia memicu reaksi internasional" ✓ (liputan media intl)
- "Lonjakan turis Indonesia ke Korea Selatan capai 200%" ✓ (tren makro)
- "Indonesia naik peringkat di indeks daya saing global" ✓ (posisi di index)
- "Reuters: ekonomi Indonesia tahan resesi global" ✓ (liputan intl)
- "Diplomat Indonesia hadiri sidang PBB bahas isu X" ✓ (diplomasi)

═══════════════════════════════════════════════
ATURAN HEADLINE (KRITIS — WAJIB DIPATUHI):
═══════════════════════════════════════════════
1. Output SEBAGAI ARRAY 3 STRING (TEPAT 3 baris, untuk cover/thumbnail). Tidak boleh 2 baris atau 4 baris.
2. Tiap baris MAKSIMAL ${MAX_LINE_CHARS} karakter (huruf + angka + spasi + tanda baca).
3. Total 3 baris digabung dengan spasi WAJIB ${MIN_TOTAL_CHARS}-${MAX_TOTAL_CHARS} karakter — tidak boleh ${MIN_TOTAL_CHARS - 1} atau ${MAX_TOTAL_CHARS + 1}.
4. Pemecahan baris di batas kata — JANGAN potong kata di tengah.
5. WAJIB hook clickbait kuat: bikin penasaran, dramatis, mengundang emosi/debat.
6. Boleh tanda baca dramatis: "!" "?" "..." "—" untuk memperkuat hook.
7. Bahasa Indonesia natural ala viral sosmed (BUKAN bahasa resmi/news anchor).
8. HINDARI klise tipe "Anda tidak akan percaya..." atau "INI dia rahasia...".

STRATEGI MENCAPAI ${MIN_TOTAL_CHARS}-${MAX_TOTAL_CHARS} KARAKTER:
- Sebagian besar headline natural cuma 35-45 char — itu KURANG. Kamu HARUS aktif memperpanjang.
- Tambahkan **superlatif/intensifier**: "habis-habisan", "sampai...", "auto", "bikin merinding", "tak terduga".
- Tambahkan **bumper emosi**: "Gila!", "Wow!", "Astaga!", "Bangga!" sebagai pembuka atau penutup.
- Tambahkan **konteks lokasi/detail**: "di Tengah..., "Saat...", "di Hadapan...", "di Mata Dunia".
- Pakai **tanda baca dramatis**: "—" (em-dash), "..." (ellipsis), "!?" untuk menambah karakter sekaligus drama.
- Cek total dengan METHOD: count(line1) + 1 + count(line2) + 1 + count(line3). HARUS ≥${MIN_TOTAL_CHARS}.

CONTOH VALID:
["Bocah Indonesia Ini", "Bikin Profesor Harvard", "Diam 1000 Bahasa!"]
→ 19 + 22 + 17 = 58 chars konten + 2 spasi = 60 chars total. ✅

["Bule Hina Indonesia,", "Tukang Sapu Ini Balas", "Sampai Mayor Diam!"]
→ 20 + 21 + 18 = 59 chars konten + 2 spasi = 61 chars total. ✅

["Astaga! WNI Cetak", "Sejarah di Cambridge—", "Dunia Auto Tercengang"]
→ 17 + 21 + 21 = 59 + 2 = 61 chars total. ✅

CONTOH INVALID:
["Mahasiswa RI Bikin Cambridge", "Kaget", "Dunia Lihat!"]
→ baris 1 = 28 chars (LEBIH dari ${MAX_LINE_CHARS}). ❌

["Qari Kaltim Bungkam", "Dunia di Rusia—Juara", ""]
→ ada baris kosong, total cuma 39+1=40 chars. ❌ KURANG ${MIN_TOTAL_CHARS - 40} char lagi.
   Fix: ["Qari Kaltim Bungkam", "Dunia di Rusia—Auto", "Juara Bikin Bangga!"] → 19+19+19=57+2=59 ✅

["Indo Hebat", "Dunia Kaget", "Bangga!"]
→ total 30 chars. ❌ KURANG. Tambahkan konteks dramatis.

═══════════════════════════════════════════════
ATURAN CAPTION:
═══════════════════════════════════════════════
1. Bahasa Indonesia natural, gaya sosmed (BUKAN corporate/news anchor).
2. Total 80-150 kata.
3. Struktur: hook pembuka kuat → 2-3 paragraf storytelling → call-to-action di akhir.
4. Boleh emoji (max 5, ditempatkan dengan tepat).
5. JANGAN masukkan hashtag di dalam caption (hashtag akan ditambahkan otomatis di field terpisah).

WAJIB DI CAPTION:
6. SEBUT SUMBER BERITA dengan natural. Pilih satu pola:
   - Awal: "Dilansir dari ${publisher}, ..." atau "Menurut ${publisher}, ..."
   - Tengah: "...seperti dilaporkan ${publisher}..."
   - Akhir: "Source: ${publisher}" (paragraf terakhir, sebelum CTA)
7. JIKA dalam ringkasan/konten ada PERNYATAAN atau KUTIPAN dari narasumber (orang/pejabat/saksi), MASUKKAN kutipan tersebut ke dalam caption sebagai dialog.
   - Format: "..." kata [Nama], [jabatan/konteks].
   - Atau: Menurut [Nama]: "...".
   - JANGAN paraphrase berlebihan — pertahankan inti pernyataan.
   - Kalau tidak ada quote eksplisit di sumber, JANGAN BIKIN-BIKIN kutipan.

═══════════════════════════════════════════════

═══════════════════════════════════════════════
ATURAN COUNTRY (untuk hashtag negara):
═══════════════════════════════════════════════
Tentukan SATU negara yang paling relevan dengan substansi berita:
- Untuk berita WNI di luar negeri → negara TEMPAT WNI tersebut berada (mis. "Sweden", "Japan", "Netherlands").
- Untuk prestasi internasional → negara tempat acara/kompetisi (mis. "Sweden" untuk Gothia Cup).
- Untuk produk lokal go global → negara pasar utama yang disebut (mis. "France", "UnitedStates").
- Untuk budaya Indonesia diakui dunia → negara yang mengakui (mis. "UnitedStates" untuk CNN).
- Untuk media internasional bahas Indonesia → negara asal medianya (mis. "UnitedKingdom" untuk BBC).
- Kalau berita memang tentang Indonesia secara umum tanpa negara lain spesifik → output "Indonesia".

Format output: gunakan **English nama negara** dalam **PascalCase tanpa spasi**.
- "United States" → "UnitedStates"
- "United Kingdom" → "UnitedKingdom"
- "South Korea" → "SouthKorea"
- "Saudi Arabia" → "SaudiArabia"
- "Sweden", "Japan", "Indonesia", "Netherlands", "Germany", "Australia" → tetap satu kata

═══════════════════════════════════════════════

Output JSON dengan format persis seperti ini (TIDAK ADA komentar atau teks lain):
{
  "content_category": "global_context | indonesian_people | indonesian_culture | local_go_global | global_achievement",
  "content_category_reason": "1 kalimat singkat (≤25 kata) menjelaskan kenapa kategori ini dipilih.",
  "country": "Sweden | Japan | UnitedStates | Indonesia | dst — PascalCase, tanpa spasi, English",
  "headline_lines": ["baris 1 max 23 char", "baris 2 max 23 char", "baris 3 max 23 char"],
  "caption": "Caption lengkap (80-150 kata) yang sudah memuat sebut sumber berita + kutipan narasumber kalau ada di sumber."
}

Output ONLY the JSON object, no other text.`
}

async function generateOnce(resolved: ResolvedTextProvider, prompt: string): Promise<{ raw: string; parsed: ContentOutput | null }> {
  const text = await callTextOnce(resolved, prompt, 2500)
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try {
    return { raw: text, parsed: JSON.parse(cleaned) as ContentOutput }
  } catch {
    return { raw: text, parsed: null }
  }
}

export async function POST(req: NextRequest) {
  let resolved: ResolvedTextProvider
  try {
    resolved = await resolveTextProvider('bpi-content')
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'AI provider tidak terkonfigurasi' }, { status: 500 })
  }

  try {
    const body = await req.json()
    const item = body.item as ContentItem | undefined
    if (!item || !item.title) {
      return NextResponse.json({ error: 'item required' }, { status: 400 })
    }

    // Fetch rich video context (full description + transcript) when item is a YouTube video
    let videoContext: VideoContext | null = null
    const youtubeKey = await getProviderApiKey('youtube')
    if (item.is_video && item.video_id && youtubeKey) {
      try {
        videoContext = await fetchVideoFullContext(item.video_id, youtubeKey)
      } catch (e) {
        console.warn('[/api/ai/bpi-content] video context fetch failed:', e)
      }
    }

    const MAX_ATTEMPTS = 3

    let attempt = await generateOnce(resolved, buildPrompt(item, videoContext))
    let validation = attempt.parsed ? validateHeadline(attempt.parsed.headline_lines) : { ok: false, reason: 'JSON parse gagal' } as const

    for (let i = 1; i < MAX_ATTEMPTS && !validation.ok; i++) {
      console.warn(`[/api/ai/bpi-content] retry ${i}/${MAX_ATTEMPTS - 1} karena:`, validation.reason)
      attempt = await generateOnce(resolved, buildPrompt(item, videoContext, validation.reason))
      validation = attempt.parsed
        ? validateHeadline(attempt.parsed.headline_lines)
        : { ok: false, reason: `JSON parse gagal pada retry ${i}` } as const
    }

    if (!attempt.parsed) {
      console.error('[/api/ai/bpi-content] parse failed, raw:', attempt.raw)
      return NextResponse.json({ error: 'Failed to parse AI output' }, { status: 500 })
    }

    const lines = attempt.parsed.headline_lines
    const headline = Array.isArray(lines) ? lines.join(' ') : ''

    const rawCategory = attempt.parsed.content_category
    const contentCategory: ContentCategoryKey | null =
      rawCategory && (VALID_CONTENT_CATEGORIES as readonly string[]).includes(rawCategory)
        ? (rawCategory as ContentCategoryKey)
        : null

    // Hashtags strict 5-tag template, server-built (deterministic)
    const categoryHashtag = contentCategory ? CATEGORY_HASHTAG[contentCategory] : '#Indonesia'
    const countryHashtag = toCountryHashtag(attempt.parsed.country)
    const hashtagParts = [
      FIXED_HASHTAGS.brand,
      FIXED_HASHTAGS.tagline,
      categoryHashtag,
      countryHashtag,
      FIXED_HASHTAGS.audience,
    ]
    const hashtags = hashtagParts.join(' ')

    return NextResponse.json({
      content: {
        headline,
        headline_lines: Array.isArray(lines) ? lines : [],
        caption: attempt.parsed.caption ?? '',
        hashtags,
        hashtag_parts: hashtagParts,
        content_category: contentCategory,
        content_category_reason: attempt.parsed.content_category_reason ?? null,
        country: countryHashtag.replace(/^#/, ''),
      },
      headline_meta: {
        valid: validation.ok,
        reason: validation.ok ? null : validation.reason,
        line_lengths: Array.isArray(lines) ? lines.map(l => typeof l === 'string' ? l.length : 0) : [],
        total_length: headline.length,
      },
    })
  } catch (err) {
    console.error('[/api/ai/bpi-content]', err)
    // Surface the underlying API error message (e.g. low credit balance,
    // rate limit, invalid key) instead of a generic "Failed to generate"
    // so the operator can act on it without checking server logs.
    const apiMsg =
      err instanceof Error && 'error' in err && typeof (err as { error?: { error?: { message?: string } } }).error?.error?.message === 'string'
        ? (err as { error: { error: { message: string } } }).error.error.message
        : err instanceof Error ? err.message : 'Failed to generate content'
    const status = err instanceof Error && 'status' in err && typeof (err as { status?: number }).status === 'number'
      ? (err as { status: number }).status
      : 500
    return NextResponse.json({ error: apiMsg }, { status })
  }
}
