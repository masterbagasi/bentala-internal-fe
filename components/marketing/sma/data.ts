// Mock data + dynamic logic for Social Media Analytics (Deep Analysis).
// Local/mock-only. Data aspects in Langkah 2 adapt to the objective +
// platform chosen in Langkah 1. The Langkah 4 result uses the demo mock
// (per spec) with a personalised header + competitor comparison.

export type Objective = 'tofu' | 'mofu' | 'content'
export type Platform = 'instagram' | 'tiktok'
export type Tier = 'umkm' | 'menengah' | 'besar' | 'personal'

export const OBJECTIVE_META: Record<Objective, { label: string; full: string; desc: string }> = {
  tofu: { label: 'TOFU', full: 'TOFU — Brand Awareness', desc: 'Brand awareness, jangkauan luas, followers baru' },
  mofu: { label: 'MOFU', full: 'MOFU — Engagement', desc: 'Kedekatan dengan audience, engagement tinggi, leads' },
  content: { label: 'Content Production Only', full: 'Content Production Only', desc: 'Konten aktif & estetik, tanpa fokus angka' },
}
export const TIER_META: Record<Tier, { label: string }> = {
  umkm: { label: 'Brand Kecil / UMKM' },
  menengah: { label: 'Brand Menengah' },
  besar: { label: 'Brand Besar' },
  personal: { label: 'Akun Personal' },
}
export const PLATFORM_META: Record<Platform, { label: string }> = {
  instagram: { label: 'Instagram' },
  tiktok: { label: 'TikTok' },
}
export const OBJECTIVES: Objective[] = ['tofu', 'mofu', 'content']
export const PLATFORMS: Platform[] = ['instagram', 'tiktok']
export const TIERS: Tier[] = ['umkm', 'menengah', 'besar', 'personal']

export const PIC_LIST = ['Trinaufa', 'Anggota Tim 1', 'Anggota Tim 2']
export const DURATION_OPTIONS = ['1 bulan', '3 bulan', '6 bulan']

export type AnalysisMode = 'A' | 'B'
// Mode A = audit dari luar (data publik) untuk calon klien.
// Mode B = analisa lengkap (sheet ekspor + manual) untuk klien aktif.
export const MODE_META: Record<AnalysisMode, { label: string; desc: string }> = {
  A: { label: 'Mode A — API + Input Manual (calon klien)', desc: 'Audit dari luar: data publik via lookup pihak ketiga + observasi manual. Cocok untuk pitching calon klien.' },
  B: { label: 'Mode B — Full Manual (klien aktif)', desc: 'Analisa lengkap: upload sheet ekspor Studio (data terukur) + input tim. Untuk klien aktif.' },
}

export interface DeepConfig {
  username: string
  platform: Platform | null // single platform per analysis
  tier: Tier | null
  objectives: Objective[]    // one or more objectives
  mode: AnalysisMode | null
}

// ── seeded helpers ───────────────────────────────────────────

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function rng(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export function formatCompact(n: number): string {
  if (n >= 1_000_000) { const v = n / 1_000_000; return (v >= 10 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')) + 'M' }
  if (n >= 1_000) { const v = n / 1_000; return (v >= 10 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')) + 'K' }
  return String(n)
}

// ── Langkah 2 — Blok 1: Data Performa (upload sheet) ─────────
// Performance metrics come from an exported sheet (Meta Business Suite /
// TikTok Studio), not typed by hand. The read is simulated (mock) — no
// parsing library — producing a realistic "read summary" per platform.

export type FieldSource = 'sheet' | 'manual' | 'api'
export type SheetType = 'csv' | 'xlsx' | 'pdf'

export interface SheetAnomaly { row: number; reason: string }
export interface SheetRead {
  fileName: string
  type: SheetType
  platform: Platform
  contentCount: number
  dateRange: string
  columns: string[]
  anomalies: SheetAnomaly[]
  available: Record<string, boolean> // expected metric → present in sheet
}

// Columns we expect in a healthy export, per platform.
const EXPECTED_COLUMNS: Record<Platform, string[]> = {
  instagram: ['Tanggal', 'Jenis Konten', 'Jangkauan', 'Tayangan', 'Suka', 'Komentar', 'Simpan', 'Dibagikan', 'Pertumbuhan Follower'],
  tiktok: ['Tanggal', 'Jenis', 'Tayangan', 'Waktu Tonton', 'Selesai Ditonton', 'Suka', 'Komentar', 'Dibagikan', 'Disimpan', 'Follower'],
}
// Columns most often missing from a basic export (used to simulate gaps).
const OFTEN_MISSING: Record<Platform, string[]> = {
  instagram: ['Simpan', 'Dibagikan'],
  tiktok: ['Disimpan', 'Selesai Ditonton'],
}
const ANOMALY_REASONS = [
  'Suka > Tayangan (tidak wajar)',
  'Jangkauan > Tayangan',
  'Sel kosong pada kolom Komentar',
  'Kolom tampak bergeser',
  'Tanggal tidak valid',
]

export function detectSheetType(fileName: string): SheetType {
  const f = fileName.toLowerCase()
  if (f.endsWith('.pdf')) return 'pdf'
  if (f.endsWith('.xlsx') || f.endsWith('.xls')) return 'xlsx'
  return 'csv'
}

/** Simulated sheet read — deterministic per (fileName, platform). */
export function readSheetMock(fileName: string, platform: Platform): SheetRead {
  const r = rng(hashStr(`${fileName}|${platform}`))
  const type = detectSheetType(fileName)
  const contentCount = Math.round(30 + r() * 150)

  // Drop 0–2 commonly-missing columns to simulate real-world gaps.
  const dropN = Math.floor(r() * 3)
  const drop = OFTEN_MISSING[platform].slice(0, dropN)
  const columns = EXPECTED_COLUMNS[platform].filter((c) => !drop.includes(c))
  const available: Record<string, boolean> = {}
  EXPECTED_COLUMNS[platform].forEach((c) => { available[c] = columns.includes(c) })

  // PDF reads are messier → a couple more anomalies.
  const baseAnoms = Math.floor(r() * 4) + (type === 'pdf' ? 2 : 0)
  const anomalies: SheetAnomaly[] = Array.from({ length: Math.min(baseAnoms, 6) }, () => ({
    row: Math.round(2 + r() * (contentCount - 1)),
    reason: ANOMALY_REASONS[Math.floor(r() * ANOMALY_REASONS.length)],
  })).sort((a, b) => a.row - b.row)

  return { fileName, type, platform, contentCount, dateRange: mockDateRange(contentCount), columns, anomalies, available }
}

function mockDateRange(days: number): string {
  const end = new Date('2026-06-04')
  const start = new Date(end)
  start.setDate(start.getDate() - Math.min(days, 90))
  const fmt = (d: Date) => { try { return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return d.toISOString().slice(0, 10) } }
  return `${fmt(start)} – ${fmt(end)}`
}

// ── Langkah 2 — Blok 2: Aspek Manual (dinamis per Tujuan) ────
// Only qualitative / private aspects that are NOT in the sheet.

export type ManualInputKind = 'value' | 'paragraph' | 'upload'
export interface ManualAspect {
  id: string
  label: string
  inputKind: ManualInputKind
  hint?: string
  onlyPlatform?: Platform // show only if this platform is selected
}
// Each manual aspect (and brand docs) holds optional text + attachments.
export interface FieldValue { value: string; files: string[]; source: FieldSource; platform: Platform }

const PRIVAT = 'Privat — sering tak ada di ekspor. Isi dari Insights internal klien bila ada.'
const ma = (id: string, label: string, inputKind: ManualInputKind = 'paragraph', hint?: string, onlyPlatform?: Platform): ManualAspect => ({ id, label, inputKind, hint, onlyPlatform })

export const MANUAL_ASPECTS: Record<Objective, ManualAspect[]> = {
  tofu: [
    ma('bio_positioning', 'Bio & positioning akun'),
    ma('reach_nonfollower', '% reach dari non-follower', 'value', PRIVAT),
    ma('hook_retention', 'Hook / retensi 3 detik pertama', 'paragraph', 'Sering tak ada di ekspor.'),
    ma('traffic_source', 'Sumber traffic (Explore / hashtag / audio / FYP)'),
    ma('target_topics', 'Tema/topik yang ditargetkan untuk audiens baru'),
    ma('searchability', 'Searchability: keyword caption, teks on-screen, audio', 'paragraph', undefined, 'tiktok'),
  ],
  mofu: [
    ma('bio_positioning', 'Bio & positioning akun'),
    ma('comment_quality', 'Kualitas komentar (contoh komentar bernilai)'),
    ma('dm_quality', 'Volume & kualitas DM masuk', 'paragraph', PRIVAT),
    ma('stories_interactivity', 'Stories interactivity (poll/quiz/reply)', 'paragraph', PRIVAT, 'instagram'),
    ma('link_clicks', 'Klik link bio / stiker link', 'value', PRIVAT),
    ma('visit_follow', 'Profil visit → follow rate', 'value', PRIVAT),
    ma('returning_viewers', 'Returning viewers', 'value', PRIVAT),
    ma('cta_path', 'Jalur ke aksi / CTA yang dipakai sekarang'),
  ],
  content: [
    ma('visual_assets', 'Aset visual untuk audit identitas (warna/font/layout/mood)', 'upload'),
    ma('caption_samples', 'Contoh caption untuk audit tone of voice'),
    ma('content_pillar', 'Content pillar: rencana vs realisasi'),
    ma('team_capacity', 'Kapasitas tim & workflow produksi'),
    ma('originality', 'Originalitas (cek repost / reuse / duet)'),
  ],
}

export function buildManualAspects(config: DeepConfig): ManualAspect[] {
  if (!config.objectives.length) return []
  const seen = new Set<string>()
  const out: ManualAspect[] = []
  for (const obj of config.objectives) {
    for (const a of MANUAL_ASPECTS[obj]) {
      if (a.onlyPlatform && config.platform !== a.onlyPlatform) continue
      if (seen.has(a.id)) continue
      seen.add(a.id)
      out.push(a)
    }
  }
  return out
}

// ── Mode A — Data Publik (lookup pihak ketiga, ESTIMASI) ─────
// Bukan API resmi platform; ini lookup data publik tanpa akses akun.

export interface PublicMetric { id: string; label: string; value: string }
const PUBLIC_FIELDS: Record<Platform, { id: string; label: string; gen: (r: () => number) => string }[]> = {
  instagram: [
    { id: 'est_er', label: 'Est. Engagement Rate', gen: (r) => `${(1 + r() * 7).toFixed(1)}%` },
    { id: 'freq', label: 'Frekuensi Posting', gen: (r) => `${(2 + r() * 6).toFixed(1)}x/mgg` },
    { id: 'format', label: 'Pola Format Dominan', gen: (r) => (r() > 0.5 ? 'Reels' : 'Carousel') },
    { id: 'growth', label: 'Pertumbuhan Follower (est)', gen: (r) => `+${formatCompact(Math.round(200 + r() * 6_000))}/bln` },
    { id: 'hook', label: 'Kualitas Hook (cover/caption)', gen: (r) => ['Lemah', 'Sedang', 'Kuat'][Math.floor(r() * 3)] },
  ],
  tiktok: [
    { id: 'est_er', label: 'Est. Engagement Rate', gen: (r) => `${(1 + r() * 8).toFixed(1)}%` },
    { id: 'freq', label: 'Frekuensi Posting', gen: (r) => `${(3 + r() * 7).toFixed(1)}x/mgg` },
    { id: 'format', label: 'Pola Format Dominan', gen: (r) => (r() > 0.5 ? 'Video pendek' : 'Seri konten') },
    { id: 'growth', label: 'Pertumbuhan Follower (est)', gen: (r) => `+${formatCompact(Math.round(300 + r() * 8_000))}/bln` },
    { id: 'hook', label: 'Kualitas Hook (3 detik)', gen: (r) => ['Lemah', 'Sedang', 'Kuat'][Math.floor(r() * 3)] },
  ],
}
export function buildPublicLookup(config: DeepConfig): PublicMetric[] {
  if (!config.platform) return []
  const r = rng(hashStr(`${config.username}|public|${config.platform}`))
  return PUBLIC_FIELDS[config.platform].map((f) => ({ id: f.id, label: f.label, value: f.gen(r) }))
}

// ── Langkah 4: analysis result (demo mock + personalised header) ──

// ── Langkah 4 model: chain PLATFORM→TUJUAN→ASPEK→HASIL→STRATEGI ──
// NOTE: angka & narasi di bawah masih PLACEHOLDER (wadah). ISI final
// diambil dari dokumen `rantai-analisa-per-tujuan.md` saat tersedia.

export type HealthStatus = 'perlu' | 'cukup' | 'bagus'
export type Signal = 'red' | 'yellow' | 'green'
export type Priority = 'kritis' | 'tinggi' | 'sedang'

export interface ExecMetric { label: string; value: string; benchmark: string; signal: Signal }
export interface Dimension { label: string; value: number } // 0..100, = aspek dari rantai
export interface StrategyStep { text: string; timeline: 'Hari-1' | 'Minggu-1' | 'Minggu-2' }

// Embedded chart per problem card (variasi visual).
export type ProblemChart =
  | { kind: 'funnel'; title: string; labels: string[]; values: number[]; colors?: string[] }
  | { kind: 'grouped'; title: string; labels: string[]; series: { name: string; color: string; values: number[] }[]; percent?: boolean }
  | { kind: 'donut'; title: string; labels: string[]; values: number[]; colors: string[] }
  | { kind: 'vbars'; title: string; labels: string[]; values: number[]; colors?: string[]; percent?: boolean }
  | { kind: 'heatmap'; title: string; rows: string[]; cols: string[]; values: number[][] }
  | { kind: 'radar'; title: string; axes: string[]; values: number[] }

export interface ProblemCard {
  n: number
  priority: Priority
  category: string
  title: string          // = HASIL dari rantai
  description: string
  chart?: ProblemChart
  rootCause: string      // merujuk ASPEK
  businessImpact: string
  theory: string         // landasan aspek
  strategy: { steps: StrategyStep[]; targetMetric: string; targetValue: string } // STRATEGI + TARGET
}
export interface VisualChart { title: string; kind: 'bar' | 'line'; labels: string[]; values: number[] }
export interface ObjectiveAnalysis {
  objective: Objective
  platform: Platform
  healthScore: number
  healthStatus: HealthStatus
  scoreTitle: string
  execSummary: string
  execMetrics: ExecMetric[]
  dimensions: Dimension[]
  visualA: VisualChart
  visualB: VisualChart
  problems: ProblemCard[]
  radar?: { axes: string[]; client: number[]; comps: { name: string; values: number[] }[] }
  realism: string[]
  closing: string
}
export interface AnalysisResult {
  username: string
  platform: Platform
  mode: AnalysisMode
  contentCount: number
  competitors: string[]
  byObjective: ObjectiveAnalysis[]
}

export const HEALTH_STATUS_META = {
  perlu: { label: 'Perlu Perbaikan', color: '#ECC94B' },
  cukup: { label: 'Cukup Baik', color: '#63B3ED' },
  bagus: { label: 'Bagus', color: '#48BB78' },
} as const

// Per-objective chain content (PLACEHOLDER wadah — ganti dari dokumen rantai).
interface ChainTemplate {
  scoreTitle: string
  dimensions: string[]
  execMetrics: { label: string; benchmark: string; gen: (r: () => number) => { value: string; signal: Signal } }[]
  visualA: { title: string; kind: 'bar' | 'line'; labels: string[] }
  visualB: { title: string; kind: 'bar' | 'line'; labels: string[] }
  radarAxes?: string[]
  problems: ProblemCard[]
  realism: string[]
  closing: string
}

const pctGen = (lo: number, hi: number) => (r: () => number) => {
  const v = +(lo + r() * (hi - lo)).toFixed(1)
  return { value: `${v}%`, signal: (v >= hi * 0.8 ? 'green' : v >= hi * 0.5 ? 'yellow' : 'red') as Signal }
}
const numGen = (lo: number, hi: number, suffix = '') => (r: () => number) => {
  const v = Math.round(lo + r() * (hi - lo))
  return { value: formatCompact(v) + suffix, signal: (r() > 0.6 ? 'green' : r() > 0.3 ? 'yellow' : 'red') as Signal }
}

const OBJ_CHAIN: Record<Objective, ChainTemplate> = {
  tofu: {
    scoreTitle: 'Skor Kesehatan TOFU · Penemuan Audiens Baru',
    dimensions: ['Hook 3 Detik', 'Reach Non-Follower', 'Konsistensi Tema', 'Distribusi (Explore/FYP)', 'Pertumbuhan Follower'],
    execMetrics: [
      { label: 'Reach', benchmark: 'benchmark 3–5× followers', gen: numGen(20_000, 300_000) },
      { label: 'Reach Non-Follower', benchmark: 'sehat > 50%', gen: pctGen(20, 70) },
      { label: 'Hook Rate 3 Detik', benchmark: 'sehat > 40%', gen: pctGen(15, 55) },
      { label: 'Follower Growth', benchmark: '30 hari terakhir', gen: numGen(200, 8_000) },
    ],
    visualA: { title: 'Reach per Tipe Konten', kind: 'bar', labels: ['Video', 'Carousel', 'Foto'] },
    visualB: { title: 'Tren Reach 6 Minggu', kind: 'line', labels: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'] },
    radarAxes: ['Reach', 'Hook', 'Konsistensi', 'Distribusi', 'Growth'],
    problems: [
      { n: 1, priority: 'kritis', category: 'Hook', title: 'Hook 3 detik lemah — penonton kabur sebelum kenal', description: 'Retensi 3 detik hanya ~30%. Mayoritas audiens baru pergi sebelum brand sempat dikenali.', chart: { kind: 'funnel', title: 'Corong retensi penonton', labels: ['Impresi', 'Tonton 3 dtk', 'Tonton 50%', 'Tonton selesai'], values: [100000, 38000, 12000, 5000], colors: ['#63B3ED', '#48BB78', '#ECC94B', '#FC8181'] }, rootCause: '3 detik pertama diisi intro/logo, bukan pemicu rasa ingin tahu.', businessImpact: 'Reach ke non-follower tertahan karena sinyal retensi awal rendah.', theory: 'Hook Psychology · Nir Eyal 2014', strategy: { steps: [{ text: 'Buka dengan pertanyaan/kontras di 3 detik pertama', timeline: 'Hari-1' }, { text: 'Hapus intro logo dari pembuka', timeline: 'Hari-1' }, { text: 'A/B test 2 hook tiap konten', timeline: 'Minggu-1' }], targetMetric: 'Retensi 3 detik', targetValue: '30% → 50%' } },
      { n: 2, priority: 'kritis', category: 'Reach Non-Follower', title: 'Jangkauan mentok di pengikut sendiri', description: 'Hanya 32% reach datang dari non-follower (sehat > 50%). Akun berputar di audiens lama, sulit menemukan yang baru.', chart: { kind: 'donut', title: 'Komposisi reach', labels: ['Follower', 'Non-follower'], values: [68, 32], colors: ['#63B3ED', '#FC8181'] }, rootCause: 'Konten belum dirancang untuk penemuan (hook + tema + distribusi).', businessImpact: 'Pertumbuhan audiens baru melambat.', theory: 'Reach Composition · Meta 2024', strategy: { steps: [{ text: 'Fokus format yang paling sering masuk Explore/FYP', timeline: 'Hari-1' }, { text: 'Perkuat hook + hashtag penemuan', timeline: 'Minggu-1' }], targetMetric: 'Reach non-follower', targetValue: '32% → 50%' } },
      { n: 3, priority: 'tinggi', category: 'Tema', title: 'Tema melompat-lompat, algoritma bingung', description: 'Topik berpindah-pindah sehingga niche tidak terbaca. Distribusi ke audiens relevan jadi acak.', chart: { kind: 'grouped', title: 'Proporsi tema: sekarang vs ideal', labels: ['Tema A', 'Tema B', 'Promo', 'Random'], series: [{ name: 'Sekarang', color: '#FC8181', values: [30, 25, 25, 20] }, { name: 'Ideal', color: '#9AE6B4', values: [55, 30, 15, 0] }], percent: true }, rootCause: 'Belum ada 3 tema inti yang dikunci.', businessImpact: 'Explore/FYP tidak stabil mengirim ke audiens yang tepat.', theory: 'Niche Clarity · Later 2023', strategy: { steps: [{ text: 'Kunci 3 tema inti', timeline: 'Hari-1' }, { text: 'Content calendar 3 tema', timeline: 'Minggu-1' }], targetMetric: 'Konsistensi tema', targetValue: '≥ 80%' } },
      { n: 4, priority: 'tinggi', category: 'Format', title: 'Format pemenang belum digandakan', description: 'Reels cerita jauh mengungguli format lain, tapi porsinya belum diperbesar.', chart: { kind: 'vbars', title: 'Rata-rata reach per format', labels: ['Reels', 'Carousel', 'Foto'], values: [14000, 6500, 800], colors: ['#48BB78', '#9AE6B4', '#FC8181'] }, rootCause: 'Slot masih banyak diisi format low-reach.', businessImpact: 'Potensi jangkauan terbesar belum dimaksimalkan.', theory: 'Content ROI · Koch 1998', strategy: { steps: [{ text: 'Perbesar porsi Reels jadi 4:1', timeline: 'Minggu-1' }, { text: 'Audit ulang format tiap 2 minggu', timeline: 'Minggu-2' }], targetMetric: 'Rata-rata reach/konten', targetValue: '+50%' } },
      { n: 5, priority: 'tinggi', category: 'Distribusi', title: 'Sumber penemuan belum dioptimasi', description: 'Mayoritas reach masih dari profil sendiri; jalur penemuan (Explore/hashtag/audio) belum digarap sengaja.', chart: { kind: 'vbars', title: 'Sumber reach (%)', labels: ['Explore', 'Hashtag', 'Audio', 'Profil'], values: [22, 18, 12, 48], colors: ['#48BB78', '#ECC94B', '#FC8181', '#63B3ED'], percent: true }, rootCause: 'Konten tidak dioptimasi untuk discovery.', businessImpact: 'Audiens baru sulit menemukan akun.', theory: 'Discoverability · Later 2023', strategy: { steps: [{ text: 'Audio sedang naik + hashtag berjenjang', timeline: 'Minggu-1' }, { text: 'Teks on-screen kaya keyword', timeline: 'Minggu-2' }], targetMetric: 'Reach dari Explore', targetValue: '+40%' } },
      { n: 6, priority: 'sedang', category: 'Audio/Trend', title: 'Belum menunggangi audio yang sedang naik', description: 'Hanya ~18% konten pakai audio trending — kehilangan dorongan distribusi gratis.', chart: { kind: 'vbars', title: 'Pemakaian audio', labels: ['Trending', 'Biasa'], values: [18, 82], colors: ['#FC8181', '#3a3f5c'], percent: true }, rootCause: 'Pemilihan audio tidak dipantau mingguan.', businessImpact: 'Konten kehilangan boost penemuan dari audio.', theory: 'Trend Riding · Meta 2024', strategy: { steps: [{ text: 'Pantau audio naik tiap minggu', timeline: 'Hari-1' }, { text: 'Tempel 1-2 audio trending/minggu', timeline: 'Minggu-1' }], targetMetric: 'Audio trending', targetValue: '> 50%' } },
      { n: 7, priority: 'sedang', category: 'Pertumbuhan Follower', title: 'Pertumbuhan follower datar', description: 'Penambahan follower bergerak datar, belum mencerminkan reach yang ada.', chart: { kind: 'vbars', title: 'Follower baru per minggu', labels: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8'], values: [300, 250, 400, 200, 600, 350, 500, 280], colors: ['#63B3ED'] }, rootCause: 'Konten viral tidak diarahkan ke ajakan follow.', businessImpact: 'Reach tinggi tidak terkonversi jadi audiens tetap.', theory: 'Audience Growth Loop · 2024', strategy: { steps: [{ text: 'Tambah ajakan follow di akhir konten viral', timeline: 'Hari-1' }, { text: 'Pinned konten perkenalan brand', timeline: 'Minggu-1' }], targetMetric: 'Follower growth', targetValue: '+50%' } },
      { n: 8, priority: 'sedang', category: 'Jam Posting', title: 'Posting belum pas dengan jam aktif audiens', description: 'Jam tayang belum selaras dengan puncak audiens — jam emas sering terlewat.', chart: { kind: 'heatmap', title: 'Peta jam aktif audiens', rows: ['06', '09', '12', '15', '18', '21'], cols: ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'], values: [[1, 1, 1, 1, 1, 2, 2], [2, 2, 2, 2, 2, 3, 3], [3, 3, 3, 3, 3, 4, 4], [3, 3, 3, 3, 4, 5, 5], [5, 5, 5, 5, 7, 8, 7], [7, 8, 8, 8, 9, 9, 8]] }, rootCause: 'Jadwal posting ikut jam kerja tim.', businessImpact: 'Jam pertama tayang (paling menentukan) terbuang.', theory: 'Best Time to Post · Sprout 2024', strategy: { steps: [{ text: 'Geser ke jam puncak audiens', timeline: 'Hari-1' }, { text: 'Cek ulang peta jam tiap 2 minggu', timeline: 'Minggu-2' }], targetMetric: 'Reach jam awal', targetValue: '+30%' } },
      { n: 9, priority: 'sedang', category: 'Hashtag', title: 'Hashtag terlalu umum — konten tenggelam', description: 'Hashtag generik membuat konten tenggelam; hashtag niche relevan belum dipakai.', chart: { kind: 'vbars', title: 'Jangkauan per jenis hashtag', labels: ['Generik', 'Mid-tier', 'Niche', 'Branded'], values: [400, 2600, 3900, 1500], colors: ['#FC8181', '#ECC94B', '#48BB78', '#63B3ED'] }, rootCause: 'Pilih hashtag populer, bukan relevan ke audiens spesifik.', businessImpact: 'Jalur penemuan komunitas relevan hilang.', theory: 'Hashtag Tiering · Later 2023', strategy: { steps: [{ text: 'Mix 30% besar, 50% mid, 20% niche/branded', timeline: 'Minggu-1' }, { text: 'Rotasi & pantau jangkauan', timeline: 'Minggu-2' }], targetMetric: 'Reach non-pengikut', targetValue: '+30%' } },
      { n: 10, priority: 'sedang', category: 'Branding', title: 'Identitas visual belum langsung dikenali', description: 'Saat muncul di feed orang asing, akun belum langsung dikenali sebagai brand yang sama.', chart: { kind: 'radar', title: 'Skor konsistensi visual', axes: ['Warna', 'Logo', 'Layout', 'Font', 'Konsistensi'], values: [70, 80, 55, 65, 50] }, rootCause: 'Elemen visual belum seragam antar konten.', businessImpact: 'Awareness sulit menempel di benak audiens baru.', theory: 'Brand Recognition · Aaker 1996', strategy: { steps: [{ text: 'Mini style guide (warna/font/layout)', timeline: 'Minggu-1' }, { text: 'Template visual seragam', timeline: 'Minggu-2' }], targetMetric: 'Skor konsistensi', targetValue: '60 → 85' } },
    ],
    realism: [
      'Reach non-follower butuh 4–8 minggu untuk naik stabil — algoritma perlu sinyal konsisten.',
      'Hook yang bagus pun tidak menjamin viral; eksekusi & timing tetap berpengaruh.',
      'Pertumbuhan follower organik bertahap, bukan lonjakan instan.',
      'Target angka adalah estimasi berbasis benchmark industri, bukan janji pasti.',
    ],
    closing: 'Inti TOFU: perkuat hook 3 detik dan kunci tema agar algoritma mendistribusikan ke audiens baru. Prioritas utama 30 hari: naikkan hook rate ke > 40% dan reach non-follower ke > 50%.',
  },
  mofu: {
    scoreTitle: 'Skor Kesehatan MOFU · Kedekatan & Gerak ke Konversi',
    dimensions: ['Engagement Rate', 'Save & Share', 'Kualitas Komentar', 'Jalur ke CTA', 'Returning Viewers'],
    execMetrics: [
      { label: 'Engagement Rate', benchmark: 'sehat > 4%', gen: pctGen(1.5, 8) },
      { label: 'Save Rate', benchmark: 'sinyal niat tinggi', gen: pctGen(1, 6) },
      { label: 'Share Rate', benchmark: 'amplifikasi', gen: pctGen(1, 5) },
      { label: 'CTA Click', benchmark: 'gerak ke aksi', gen: numGen(50, 5_000) },
    ],
    visualA: { title: 'Komposisi Engagement', kind: 'bar', labels: ['Like', 'Komentar', 'Save', 'Share'] },
    visualB: { title: 'Tren Engagement Rate 6 Minggu', kind: 'line', labels: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'] },
    radarAxes: ['Jangkauan', 'Engagement', 'Save rate', 'Konsistensi', 'Frekuensi', 'Kualitas cerita'],
    problems: [
      { n: 1, priority: 'kritis', category: 'Jalur ke Action', title: 'Menarik penonton, tapi tidak menangkap satu pun', description: 'Dari 27.500 penonton Reels tersukses, 0 klik link dan hanya 14 follow. Penonton datang, tersentuh, lalu pergi tanpa jejak — etalase ramai tapi pintu terkunci.', chart: { kind: 'funnel', title: 'Corong yang bocor di tiap tahap', labels: ['Menonton', 'Like', 'Simpan', 'Follow', 'Klik link'], values: [27500, 9000, 420, 140, 3], colors: ['#63B3ED', '#48BB78', '#ECC94B', '#ECC94B', '#FC8181'] }, rootCause: 'Caption berhenti di cerita, tak ada langkah berikutnya. Link bio lewat Linktree (1 klik ekstra pembunuh niat).', businessImpact: '±275 follower & ±137 calon pembeli menguap dari satu konten saja.', theory: 'AIDA Model (Lewis 1898) tahap Action gagal · Hook Model (Eyal 2014)', strategy: { steps: [{ text: 'Ganti link bio jadi deeplink app langsung + teks "Kirim rasa rumah ke keluarga di luar negeri ↓"', timeline: 'Hari-1' }, { text: 'Tambah penutup ajakan tiap caption: "Kamu juga lagi jauh dari rumah? Cerita di komen 👇"', timeline: 'Hari-1' }, { text: 'Re-share tiap Reels 5K+ ke Story dengan stiker link langsung ke app', timeline: 'Minggu-1' }], targetMetric: 'Klik link', targetValue: '0 → 20-50/konten viral' } },
      { n: 2, priority: 'kritis', category: 'Save & Share', title: 'Hampir tidak ada konten yang disimpan orang', description: 'Save rate cuma 0,1%, jauh di bawah benchmark 1-2%. Untuk MOFU, save adalah sinyal terkuat ke algoritma bahwa konten layak — dan akun ini nyaris tidak punya.', chart: { kind: 'grouped', title: 'Save rate per tipe konten vs benchmark', labels: ['Reels', 'Carousel', 'Foto'], series: [{ name: 'Akun ini', color: '#FC8181', values: [0.1, 0.3, 0.05] }, { name: 'Benchmark', color: '#3a3f5c', values: [1.5, 2, 1] }], percent: true }, rootCause: 'Konten emosional menyentuh tapi tidak praktis — tak ada alasan untuk disimpan dan dibuka lagi nanti.', businessImpact: 'Algoritma menurunkan distribusi karena tak ada sinyal "worth keeping". Jangkauan organik mentok.', theory: 'Save sebagai ranking signal · Meta Engagement Ranking 2024', strategy: { steps: [{ text: 'Bikin 1 carousel "save-bait" tiap minggu: "5 makanan Indonesia yang tahan dikirim ke luar negeri"', timeline: 'Minggu-1' }, { text: 'Tutup tiap cerita dengan "Simpan ini buat nanti pas kangen masakan rumah"', timeline: 'Minggu-1' }, { text: 'Buat seri tips cross-border berkala biar audiens nyimpan untuk referensi', timeline: 'Minggu-2' }], targetMetric: 'Save rate', targetValue: '0,1% → 0,8%' } },
      { n: 3, priority: 'kritis', category: 'Engagement', title: 'Interaksi dangkal — banyak like, sedikit percakapan', description: 'Interaksi didominasi like pasif. Komentar, save, dan share — sinyal kedekatan yang dihitung MOFU — porsinya kecil. Audiens nonton, suka, tapi tidak terlibat.', chart: { kind: 'donut', title: 'Komposisi interaksi saat ini', labels: ['Like', 'Komentar', 'Simpan', 'Share'], values: [82, 9, 5, 4], colors: ['#FC8181', '#48BB78', '#63B3ED', '#ECC94B'] }, rootCause: 'Konten tidak pernah mengajak ngobrol. Tidak ada pertanyaan, polling, atau pemicu diskusi.', businessImpact: 'Tanpa percakapan, tidak ada kedekatan. Tanpa kedekatan, audiens tidak jadi calon pembeli loyal.', theory: 'Engagement Pyramid · Sprout Social 2024', strategy: { steps: [{ text: 'Pasang pertanyaan terbuka di pinned comment tiap konten', timeline: 'Hari-1' }, { text: 'Sticker polling/kuis di tiap Story, balas tiap komentar dalam 1 jam pertama', timeline: 'Minggu-1' }, { text: 'Angkat komentar audiens jadi konten (UGC) biar memicu lebih banyak partisipasi', timeline: 'Minggu-2' }], targetMetric: 'Komentar', targetValue: '8 → 40+/konten' } },
      { n: 4, priority: 'tinggi', category: 'Tipe Konten', title: 'Akun punya tiga kepribadian yang membingungkan', description: 'Akun bergantian jadi pencerita, toko online, dan kalender hari besar. Gap 42x antara konten terbaik (27K) dan terburuk (646). Algoritma bingung harus kasih ke siapa.', chart: { kind: 'funnel', title: 'Penonton: konten terbaik vs terburuk', labels: ['Terbaik (Reels cerita)', 'Terburuk (foto template)'], values: [27500, 646], colors: ['#9AE6B4', '#FC8181'] }, rootCause: 'Tidak ada pilar konten yang dikunci. Semua jenis dicampur tanpa prioritas jelas.', businessImpact: 'Algoritma tak bisa mengenali audiens inti, distribusi jadi tidak menentu antar konten.', theory: 'Brand Identity Confusion · Aaker 1996', strategy: { steps: [{ text: 'Kunci 3 pilar: 60% cerita diaspora · 25% produk lewat cerita · 15% edukasi cross-border', timeline: 'Hari-1' }, { text: 'Hapus template hari besar generik dari jadwal', timeline: 'Hari-1' }, { text: 'Susun content calendar bulanan pakai 3 pilar ini sebagai patokan', timeline: 'Minggu-1' }], targetMetric: 'Rata-rata penonton', targetValue: '1,5K → 5K' } },
      { n: 5, priority: 'tinggi', category: 'Pola Konten', title: 'Slot posting banyak terbuang ke format yang selalu sepi', description: '67% konten paling sepi adalah foto template & promo langsung. Tiap slot itu peluang yang hilang — bisa diisi cerita yang terbukti tembus puluhan ribu.', chart: { kind: 'grouped', title: 'Proporsi tema: sekarang vs ideal', labels: ['Cerita diaspora', 'Produk+cerita', 'Edukasi', 'Template/promo'], series: [{ name: 'Sekarang', color: '#FC8181', values: [25, 15, 3, 57] }, { name: 'Ideal', color: '#9AE6B4', values: [60, 25, 15, 0] }], percent: true }, rootCause: 'Kebiasaan posting "yang penting ada", bukan "yang terbukti perform".', businessImpact: 'Estimasi ±54.000 penonton/bulan hilang dari slot yang salah isi.', theory: 'Content ROI / Pareto Principle · Koch 1998', strategy: { steps: [{ text: 'Stop total foto template hari besar', timeline: 'Minggu-1' }, { text: 'Realokasi slot itu ke Reels storytelling — rasio 4 Reels : 1 feed per minggu', timeline: 'Minggu-1' }, { text: 'Kalau wajib rayakan hari besar, kemas jadi cerita ("Lebaran pertama Rania di London")', timeline: 'Minggu-2' }], targetMetric: 'Total penonton/bulan', targetValue: '+160K' } },
      { n: 6, priority: 'tinggi', category: 'Kalimat Pembuka', title: 'Kalimat pembuka promo bikin orang langsung scroll', description: 'Hook deskriptif ("Rasa Indonesia hadir di Osaka") sepi di ~900 penonton. Hook penasaran ("Sayangnya, gak semua orang bisa lihat...") tembus 27K. Selisihnya sampai 26x.', chart: { kind: 'funnel', title: 'Hook penasaran vs hook promo (penonton)', labels: ['"Sayangnya, gak semua..."', '"Di negeri orang..."', '"Rasa Indonesia hadir..."', '"Beda dari yang lain..."'], values: [27000, 12000, 900, 800], colors: ['#9AE6B4', '#9AE6B4', '#FC8181', '#FC8181'] }, rootCause: '3 detik pertama dipakai untuk jualan/logo, bukan untuk memancing rasa ingin tahu.', businessImpact: 'Mayoritas penonton hilang di detik pertama sebelum pesan tersampaikan.', theory: 'Hook Psychology · Nir Eyal 2014 · Curiosity Gap · Loewenstein 1994', strategy: { steps: [{ text: 'Pakai 3 pola hook: pertanyaan, kontras, cerita gantung', timeline: 'Hari-1' }, { text: '3 detik pertama wajib hook emosional — bukan logo/promo', timeline: 'Hari-1' }, { text: 'A/B test 2 versi hook tiap konten utama, pakai yang menang', timeline: 'Minggu-1' }], targetMetric: 'Retensi 3 detik', targetValue: '30% → 65%' } },
      { n: 7, priority: 'sedang', category: 'Pola Posting', title: 'Frekuensi posting naik-turun tidak menentu', description: 'Ada minggu padat, ada minggu kosong total. Algoritma menyukai akun yang ritmenya bisa ditebak — jeda panjang menurunkan prioritas distribusi.', chart: { kind: 'vbars', title: 'Jumlah posting per minggu (12 minggu)', labels: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12'], values: [5, 1, 0, 6, 2, 0, 4, 1, 7, 0, 3, 1], colors: ['#ECC94B'] }, rootCause: 'Konten dibuat dadakan, tidak ada stok konten yang disiapkan di muka.', businessImpact: 'Momentum tiap kali naik selalu terputus oleh minggu sepi berikutnya.', theory: 'Posting Consistency · Hootsuite 2024', strategy: { steps: [{ text: 'Tetapkan ritme tetap: 3-4 konten per minggu, hari yang sama', timeline: 'Hari-1' }, { text: 'Siapkan stok konten 1 minggu di muka, jangan bikin di hari H', timeline: 'Minggu-1' }, { text: 'Pakai scheduler biar konten otomatis tayang sesuai jadwal', timeline: 'Minggu-2' }], targetMetric: 'Konsistensi', targetValue: '100% minggu terjadwal' } },
      { n: 8, priority: 'sedang', category: 'Jam Posting', title: 'Posting di jam yang bukan jam audiens aktif', description: 'Mayoritas posting siang WIB, padahal diaspora di luar negeri aktif malam WIB (pagi/siang waktu mereka). Konten tayang saat target sedang tidur.', chart: { kind: 'heatmap', title: 'Peta jam aktif audiens (makin terang makin ramai)', rows: ['06', '09', '12', '15', '18', '21', '00'], cols: ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'], values: [[1, 1, 1, 1, 1, 1, 1], [2, 2, 2, 2, 2, 2, 2], [3, 3, 3, 3, 3, 3, 3], [3, 3, 3, 3, 4, 4, 4], [4, 4, 4, 4, 7, 8, 7], [7, 8, 9, 8, 9, 9, 8], [4, 4, 4, 4, 7, 8, 5]] }, rootCause: 'Jadwal posting ikut jam kerja tim di Indonesia, bukan jam audiens diaspora.', businessImpact: 'Jam pertama tayang (paling menentukan) terbuang saat audiens tidak online.', theory: 'Best Time to Post · Sprout Social 2024', strategy: { steps: [{ text: 'Geser jam tayang utama ke 19.00-21.00 WIB (sore di Eropa/pagi di Asia Timur)', timeline: 'Hari-1' }, { text: 'Bedakan jam untuk audiens Eropa vs Asia Pasifik kalau perlu', timeline: 'Minggu-1' }, { text: 'Cek ulang peta jam aktif tiap 2 minggu, sesuaikan', timeline: 'Minggu-2' }], targetMetric: 'Jangkauan jam awal', targetValue: '+40%' } },
      { n: 9, priority: 'sedang', category: 'Hashtag', title: 'Hashtag terlalu umum — konten tenggelam', description: 'Hashtag generik (#food #indonesia) dipakai jutaan akun — konten MB langsung tenggelam. Hashtag komunitas diaspora yang lebih tepat belum dimanfaatkan.', chart: { kind: 'vbars', title: 'Jangkauan rata-rata per jenis hashtag', labels: ['Generik', 'Mid-tier', 'Niche diaspora', 'Branded'], values: [300, 2800, 4200, 1900], colors: ['#FC8181', '#ECC94B', '#48BB78', '#63B3ED'] }, rootCause: 'Pilih hashtag berdasar popularitas, bukan relevansi ke audiens spesifik.', businessImpact: 'Kehilangan jalur penemuan organik dari komunitas yang paling relevan.', theory: 'Hashtag Tiering / Discoverability · Later 2023', strategy: { steps: [{ text: 'Mix 30% hashtag besar, 50% mid-tier, 20% niche/branded', timeline: 'Minggu-1' }, { text: 'Riset 15 hashtag relevan per tema konten (diaspora, kirim, rasa rumah)', timeline: 'Minggu-1' }, { text: 'Rotasi set hashtag tiap tema, pantau mana yang bawa jangkauan', timeline: 'Minggu-2' }], targetMetric: 'Jangkauan non-pengikut', targetValue: '+30%' } },
      { n: 10, priority: 'sedang', category: 'Branding', title: 'Brand punya dua nada yang bertabrakan', description: 'Di Reels cerita: hangat, dekat, relate. Di konten promo: kaku, korporat. Audiens bertemu dua brand berbeda dalam satu akun — konsistensi suara & visual belum terjaga.', chart: { kind: 'radar', title: 'Skor konsistensi per elemen branding', axes: ['Warna', 'Font', 'Layout', 'Logo', 'Nada bicara', 'Pesan utama'], values: [78, 72, 60, 85, 45, 55] }, rootCause: 'Belum ada panduan nada & visual yang dipakai konsisten di semua jenis konten.', businessImpact: 'Brand sulit diingat karena kesannya berubah-ubah tergantung jenis konten.', theory: 'Brand Consistency · Aaker 1996 · Emotional Branding · Gobé 2001', strategy: { steps: [{ text: 'Buat panduan nada singkat: "hangat, dekat, kayak teman perantau" — berlaku semua konten', timeline: 'Minggu-1' }, { text: 'Konten promo wajib dibungkus cerita, bukan bahasa korporat', timeline: 'Minggu-1' }, { text: 'Template visual seragam: warna, font, layout konsisten di semua tipe', timeline: 'Minggu-2' }], targetMetric: 'Skor konsistensi', targetValue: '70 → 88' } },
    ],
    realism: [
      'Engagement rate tidak akan langsung ke benchmark 4-6% dalam 30 hari — perubahan perilaku audiens butuh 60-90 hari konsisten.',
      'Save rate naik bertahap, bukan instan — audiens perlu waktu belajar bahwa akun ini punya konten layak simpan.',
      'Klik ke app tidak akan ramai kalau landing page app-nya sendiri belum dioptimasi bersamaan dengan perbaikan konten.',
      'Viral tidak bisa dijamin — bahkan formula cerita terbaik bisa sepi kalau timing & eksekusi meleset.',
      'Target angka di atas adalah estimasi berbasis benchmark industri, bukan janji pasti.',
    ],
    closing: 'Akun ini menyimpan aset paling mahal yang belum disadari: formula konten yang sudah terbukti tembus puluhan ribu penonton organik. Tapi untuk MOFU, jangkauan bukan kemenangan — kedekatan & calon pembeli yang dihitung. 10 kebocoran menahan akun di posisi ini, dan hampir semua bisa diperbaiki tanpa biaya iklan. Prioritas tertajam: perbaiki jalur ke aksi (CTA) dan save rate lebih dulu.',
  },
  content: {
    scoreTitle: 'Skor Kesehatan Content Production · Mesin Konten',
    dimensions: ['Kepatuhan Jadwal', 'Distribusi Format', 'Konsistensi Identitas', 'Tone of Voice', 'Originalitas'],
    execMetrics: [
      { label: 'Posting / Minggu', benchmark: 'target ritme', gen: numGen(2, 9, 'x') },
      { label: 'Kepatuhan Jadwal', benchmark: 'sehat > 85%', gen: pctGen(50, 95) },
      { label: 'Konsistensi Identitas', benchmark: 'visual seragam', gen: pctGen(40, 90) },
      { label: 'Originalitas', benchmark: 'minim reuse', gen: pctGen(50, 95) },
    ],
    visualA: { title: 'Distribusi Format', kind: 'bar', labels: ['Video', 'Carousel', 'Story', 'Foto'] },
    visualB: { title: 'Kepatuhan Jadwal 6 Minggu', kind: 'line', labels: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'] },
    // radar sengaja dikosongkan — perbandingan kompetitor kurang relevan untuk Content Production.
    problems: [
      { n: 1, priority: 'kritis', category: 'Ritme', title: 'Kepatuhan jadwal posting rendah', description: 'Jadwal tayang tidak konsisten — banyak gap. Mesin konten belum berjalan rutin.', chart: { kind: 'vbars', title: 'Jumlah posting per minggu (12 minggu)', labels: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12'], values: [4, 1, 0, 5, 1, 0, 3, 0, 6, 1, 2, 0], colors: ['#ECC94B'] }, rootCause: 'Konten dibuat dadakan, tanpa stok di muka.', businessImpact: 'Momentum & kualitas turun karena selalu terburu-buru.', theory: 'Consistency / Habit Loop · Duhigg 2012', strategy: { steps: [{ text: 'Kunci content calendar mingguan', timeline: 'Hari-1' }, { text: 'Siapkan stok konten 2 minggu di depan', timeline: 'Minggu-1' }, { text: 'Tetapkan slot tayang tetap', timeline: 'Minggu-1' }], targetMetric: 'Kepatuhan jadwal', targetValue: '> 85%' } },
      { n: 2, priority: 'tinggi', category: 'Distribusi Format', title: 'Format tidak seimbang', description: 'Porsi format berat ke foto, padahal video & carousel lebih kuat. Output belum dialokasikan optimal.', chart: { kind: 'donut', title: 'Distribusi format saat ini', labels: ['Reels', 'Carousel', 'Story', 'Foto'], values: [20, 15, 25, 40], colors: ['#48BB78', '#63B3ED', '#ECC94B', '#FC8181'] }, rootCause: 'Alokasi format tanpa strategi.', businessImpact: 'Output kurang efektif per slot produksi.', theory: 'Format Mix · Meta 2024', strategy: { steps: [{ text: 'Target mix 40/25/20/15 (Reels/Carousel/Story/Foto)', timeline: 'Minggu-1' }, { text: 'Audit mix tiap bulan', timeline: 'Minggu-2' }], targetMetric: 'Rasio video', targetValue: '> 40%' } },
      { n: 3, priority: 'tinggi', category: 'Identitas Visual', title: 'Konsistensi visual belum seragam', description: 'Warna/font/layout bervariasi antar konten — identitas belum kokoh.', chart: { kind: 'radar', title: 'Skor konsistensi per elemen', axes: ['Warna', 'Font', 'Layout', 'Logo', 'Grid'], values: [70, 60, 55, 80, 50] }, rootCause: 'Belum ada style guide.', businessImpact: 'Brand recall melemah.', theory: 'Brand Consistency · Lucidpress 2021', strategy: { steps: [{ text: 'Susun style guide singkat', timeline: 'Minggu-1' }, { text: 'Buat 3 template visual reusable', timeline: 'Minggu-2' }], targetMetric: 'Konsistensi identitas', targetValue: '> 85%' } },
      { n: 4, priority: 'tinggi', category: 'Tone of Voice', title: 'Gaya bahasa berubah-ubah', description: 'Tone hangat di cerita, kaku di promo. Audiens menangkap dua suara berbeda.', chart: { kind: 'grouped', title: 'Tone per jenis konten', labels: ['Reels', 'Caption', 'Story', 'Promo'], series: [{ name: 'Hangat', color: '#48BB78', values: [80, 60, 70, 30] }, { name: 'Korporat', color: '#FC8181', values: [20, 40, 30, 70] }], percent: true }, rootCause: 'Belum ada panduan tone.', businessImpact: 'Pesan brand tidak menempel.', theory: 'Tone Consistency · Gobé 2001', strategy: { steps: [{ text: 'Panduan tone 1 halaman', timeline: 'Minggu-1' }, { text: 'Promo wajib dibungkus cerita', timeline: 'Minggu-1' }], targetMetric: 'Konsistensi tone', targetValue: '> 85%' } },
      { n: 5, priority: 'sedang', category: 'Originalitas', title: 'Terlalu banyak konten reuse/repost', description: 'Porsi konten orisinal < setengah; sisanya repost/duet/reuse.', chart: { kind: 'donut', title: 'Orisinal vs reuse', labels: ['Orisinal', 'Repost/Reuse'], values: [45, 55], colors: ['#48BB78', '#FC8181'] }, rootCause: 'Pipeline ide belum jalan.', businessImpact: 'Diferensiasi & otoritas brand lemah.', theory: 'Content Originality · HubSpot 2024', strategy: { steps: [{ text: 'Tetapkan rasio minimal orisinal', timeline: 'Minggu-1' }, { text: 'Bangun pipeline ide mingguan', timeline: 'Minggu-2' }], targetMetric: 'Rasio orisinal', targetValue: '> 70%' } },
      { n: 6, priority: 'sedang', category: 'Stok Konten', title: 'Tidak ada stok konten (selalu mepet)', description: '80% konten dibuat di hari tayang — rawan telat & turun kualitas.', chart: { kind: 'vbars', title: 'Waktu produksi konten', labels: ['Stok siap', 'Dibuat hari H'], values: [20, 80], colors: ['#48BB78', '#FC8181'], percent: true }, rootCause: 'Tidak ada batch production.', businessImpact: 'Jadwal mudah bolong saat tim sibuk.', theory: 'Batch Workflow · 2024', strategy: { steps: [{ text: 'Batch 1 hari produksi/minggu', timeline: 'Hari-1' }, { text: 'Bank konten 2 minggu', timeline: 'Minggu-1' }], targetMetric: 'Stok siap', targetValue: '> 70%' } },
      { n: 7, priority: 'sedang', category: 'Workflow', title: 'Workflow produksi belum terstruktur', description: 'Tahap review sering dilewati — kualitas tidak terjaga konsisten.', chart: { kind: 'vbars', title: 'Kepatuhan tiap tahap (%)', labels: ['Ide', 'Produksi', 'Review', 'Tayang'], values: [60, 40, 20, 70], colors: ['#63B3ED', '#ECC94B', '#FC8181', '#48BB78'], percent: true }, rootCause: 'Belum ada SOP produksi.', businessImpact: 'Output naik-turun kualitasnya.', theory: 'Content Ops · 2024', strategy: { steps: [{ text: 'Susun SOP 4 tahap', timeline: 'Minggu-1' }, { text: 'Checklist review wajib', timeline: 'Minggu-2' }], targetMetric: 'Kepatuhan SOP', targetValue: '> 80%' } },
      { n: 8, priority: 'sedang', category: 'Caption', title: 'Caption tidak punya pola', description: 'Caption sering tanpa hook/CTA — struktur tidak konsisten.', chart: { kind: 'vbars', title: 'Kelengkapan struktur caption (%)', labels: ['Hook', 'Isi', 'CTA'], values: [40, 90, 25], colors: ['#ECC94B', '#48BB78', '#FC8181'], percent: true }, rootCause: 'Belum ada template caption.', businessImpact: 'Konten kurang mengarahkan audiens.', theory: 'Copy Structure · 2024', strategy: { steps: [{ text: 'Template caption (hook-isi-CTA)', timeline: 'Minggu-1' }, { text: 'Bank hook & CTA', timeline: 'Minggu-2' }], targetMetric: 'Caption berpola', targetValue: '> 90%' } },
      { n: 9, priority: 'sedang', category: 'Pilar', title: 'Pilar konten belum dijadikan patokan', description: 'Realisasi pilar melenceng dari rencana — produk over, edukasi kurang.', chart: { kind: 'grouped', title: 'Pilar: realisasi vs rencana', labels: ['Edukasi', 'Cerita', 'Produk', 'Hiburan'], series: [{ name: 'Realisasi', color: '#FC8181', values: [15, 30, 40, 15] }, { name: 'Rencana', color: '#9AE6B4', values: [30, 30, 25, 15] }], percent: true }, rootCause: 'Pilar tidak dipantau saat eksekusi.', businessImpact: 'Nilai untuk audiens tidak seimbang.', theory: 'Content Pillar · 2024', strategy: { steps: [{ text: 'Patok rasio pilar', timeline: 'Minggu-1' }, { text: 'Review realisasi mingguan', timeline: 'Minggu-2' }], targetMetric: 'Kepatuhan pilar', targetValue: '> 80%' } },
      { n: 10, priority: 'sedang', category: 'Kualitas Craft', title: 'Kualitas visual belum konsisten naik', description: 'Kualitas craft naik-turun antar minggu, belum ada standar minimum.', chart: { kind: 'vbars', title: 'Skor craft 6 minggu (%)', labels: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'], values: [60, 65, 55, 70, 68, 72], colors: ['#48BB78'], percent: true }, rootCause: 'Tanpa quality bar minimum.', businessImpact: 'Persepsi brand fluktuatif.', theory: 'Craft Standard · 2024', strategy: { steps: [{ text: 'Tetapkan quality checklist', timeline: 'Minggu-1' }, { text: 'Review sampel mingguan', timeline: 'Minggu-2' }], targetMetric: 'Skor craft', targetValue: '> 80%' } },
    ],
    realism: [
      'Konsistensi adalah hasil sistem, bukan semangat sesaat — butuh 1–2 siklus untuk stabil.',
      'Target Content Production bersifat operasional (kepatuhan jadwal/konsistensi), bukan reach/leads.',
      'Audit identitas perlu aset dari tim; tanpa itu penilaian terbatas.',
      'Target angka adalah estimasi operasional, bukan janji hasil jangkauan.',
    ],
    closing: 'Inti Content Production: rapikan mesin konten. Prioritas 30 hari operasional: kepatuhan jadwal > 85% dan konsistensi identitas > 85% — bukan mengejar reach.',
  },
}

function buildAnalysis(username: string, objective: Objective, platform: Platform, competitors: string[]): ObjectiveAnalysis {
  const t = OBJ_CHAIN[objective]
  const r = rng(hashStr(`${username}|${objective}|${platform}`))
  const healthScore = Math.round(42 + r() * 45)
  const healthStatus: HealthStatus = healthScore < 55 ? 'perlu' : healthScore < 75 ? 'cukup' : 'bagus'
  const dimensions = t.dimensions.map((label) => ({ label, value: Math.round(20 + r() * 70) }))
  const execMetrics = t.execMetrics.map((m) => { const g = m.gen(r); return { label: m.label, value: g.value, benchmark: m.benchmark, signal: g.signal } })
  const mkVisual = (v: ChainTemplate['visualA']): VisualChart => ({ title: v.title, kind: v.kind, labels: v.labels, values: v.labels.map(() => Math.round(10 + r() * 90)) })

  let radar: ObjectiveAnalysis['radar']
  const comps = competitors.filter(Boolean).map((c) => c.replace(/^@/, ''))
  if (t.radarAxes && comps.length) {
    radar = {
      axes: t.radarAxes,
      client: t.radarAxes.map(() => Math.round(40 + r() * 55)),
      comps: comps.map((name) => { const cr = rng(hashStr(name + objective)); return { name, values: t.radarAxes!.map(() => Math.round(35 + cr() * 60)) } }),
    }
  }

  return {
    objective, platform, healthScore, healthStatus,
    scoreTitle: t.scoreTitle,
    execSummary: `Pada platform ${PLATFORM_META[platform].label}, akun @${username.replace(/^@/, '')} dinilai untuk tujuan ${OBJECTIVE_META[objective].label}. ${t.closing.split('.')[0]}. Beberapa aspek inti masih di bawah benchmark dan perlu diperbaiki berurutan sesuai prioritas di bawah.`,
    execMetrics,
    dimensions,
    visualA: mkVisual(t.visualA),
    visualB: mkVisual(t.visualB),
    problems: t.problems,
    radar,
    realism: t.realism,
    closing: t.closing,
  }
}

export function buildResult(config: DeepConfig, competitors: string[]): AnalysisResult {
  const platform = config.platform ?? 'instagram'
  const username = config.username
  const objectives = config.objectives.length ? config.objectives : (['tofu'] as Objective[])
  const contentCount = Math.round(120 + rng(hashStr(`${username}|count`))() * 900)
  return {
    username, platform,
    mode: config.mode ?? 'B',
    contentCount,
    competitors: competitors.filter(Boolean).map((c) => c.replace(/^@/, '')),
    byObjective: objectives.map((o) => buildAnalysis(username, o, platform, competitors)),
  }
}

// ── Riwayat analisa (mock) ───────────────────────────────────

export interface HistoryEntry {
  id: string
  username: string
  platform: Platform
  objective: Objective
  date: string
  deal: boolean
}
export const MOCK_HISTORY: HistoryEntry[] = [
  { id: 'h1', username: 'masterbagasi', platform: 'instagram', objective: 'tofu', date: '6 Jun 2026', deal: true },
  { id: 'h2', username: 'kylafood', platform: 'instagram', objective: 'mofu', date: '2 Jun 2026', deal: false },
  { id: 'h3', username: 'sariroti.id', platform: 'tiktok', objective: 'tofu', date: '28 Mei 2026', deal: false },
  { id: 'h4', username: 'brandkopi', platform: 'instagram', objective: 'content', date: '20 Mei 2026', deal: true },
]
