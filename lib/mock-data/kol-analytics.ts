// Mock data + types for the KOL Analytics feature (Marketing Tools).
// Local/mock-only for now — no Supabase persistence. Data generation
// for Discovery / My Creator / Reporting is filled in per build phase.

export type Platform = 'instagram' | 'tiktok' | 'youtube' | 'facebook'
export type Tier = 'nano' | 'micro' | 'mid' | 'macro' | 'mega'

export interface KOL {
  id: string
  username: string
  displayName: string
  avatar: string
  platform: Platform
  followers: number
  following: number
  posts: number
  engagementRate: number
  avgLikes: number
  avgComments: number
  avgViews: number
  avgShares: number
  category: string[]
  tier: Tier
  verified: boolean
  accountType: 'personal' | 'business' | 'creator'
  gender: 'male' | 'female'
  ageRange: string
  country: string
  city: string
  bio: string
  audienceDemographics: {
    gender: { male: number; female: number }
    age: Record<'13-17' | '18-24' | '25-34' | '35-44' | '45+', number>
    location: { city: string; percentage: number }[]
  }
  topContent: {
    id: string
    thumbnail: string
    caption: string
    likes: number
    comments: number
    views?: number
    url: string
  }[]
  growthData: { date: string; followers: number }[]
  cpe: number
  cpv: number
  isSaved: boolean
}

export interface Report {
  id: string
  name: string
  clientName: string
  clientLogo?: string
  periodStart: string
  periodEnd: string
  selectedKOLIds: string[]
  sections: string[]
  status: 'draft' | 'processing' | 'completed'
  createdAt: string
}

// Tier metadata (badge colours follow the spec mapping).
export const TIER_META: Record<Tier, { label: string; bg: string; color: string }> = {
  nano:  { label: 'Nano',  bg: '#2e3147', color: '#8b8fa8' },
  micro: { label: 'Micro', bg: '#1a2540', color: '#5b9bd5' },
  mid:   { label: 'Mid',   bg: '#1e1a40', color: '#aa91f5' },
  macro: { label: 'Macro', bg: '#2a1f10', color: '#ffc542' },
  mega:  { label: 'Mega',  bg: '#2a1028', color: '#ff6b6b' },
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  facebook: 'Facebook',
}

// ── Display helpers ─────────────────────────────────────────

/** 1234 → "1.2K", 45000 → "45K", 2000000 → "2M". */
export function formatCompact(n: number): string {
  if (n >= 1_000_000) {
    const v = n / 1_000_000
    return (v >= 10 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')) + 'M'
  }
  if (n >= 1_000) {
    const v = n / 1_000
    return (v >= 10 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')) + 'K'
  }
  return String(n)
}

/** Engagement-rate colour band: green >5%, amber 2–5%, grey <2%. */
export function erColor(er: number): string {
  if (er > 5) return 'var(--accent3)'
  if (er >= 2) return '#ffc542'
  return 'var(--text2)'
}

export function tierFromFollowers(f: number): Tier {
  if (f < 10_000) return 'nano'
  if (f < 100_000) return 'micro'
  if (f < 500_000) return 'mid'
  if (f < 1_000_000) return 'macro'
  return 'mega'
}

// ── Mock data generation (deterministic, seeded) ────────────

function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FIRST_NAMES = [
  'Putri', 'Dwi', 'Rizky', 'Bagus', 'Sari', 'Andre', 'Citra', 'Fajar', 'Indah', 'Reza',
  'Nadia', 'Yoga', 'Salsa', 'Dimas', 'Tiara', 'Bayu', 'Gita', 'Arif', 'Maya', 'Eko',
  'Vina', 'Hendra', 'Lala', 'Galih', 'Sinta', 'Rendi', 'Mega', 'Aldo', 'Dinda', 'Faisal',
  'Kirana', 'Bima', 'Sasa', 'Ilham', 'Nabila', 'Teguh',
]
const LAST_NAMES = [
  'Pratama', 'Wijaya', 'Lestari', 'Putra', 'Anggraini', 'Saputra', 'Maharani', 'Nugroho',
  'Permata', 'Santoso', 'Hidayat', 'Rahmawati', 'Kusuma', 'Halim', 'Setiawan', 'Ananda',
]
const CATEGORIES = ['beauty', 'food', 'travel', 'lifestyle', 'tech', 'fashion', 'gaming', 'parenting']
const CITIES = ['Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Semarang', 'Makassar', 'Yogyakarta', 'Denpasar', 'Palembang', 'Bekasi']
const PLATFORMS: Platform[] = ['instagram', 'tiktok', 'youtube', 'facebook']
const AGE_RANGES = ['18-24', '25-34', '35-44']
const CAPTIONS = [
  'Rekomendasi produk favorit bulan ini!',
  'Tutorial singkat buat kalian semua',
  'Behind the scenes shooting kemarin',
  'Spill barang yang lagi viral',
  'Daily vlog: a day in my life',
  'Tips hemat ala aku, cobain ya!',
  'Collab seru bareng brand kesayangan',
  'Unboxing paket dari kalian',
]

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}
function between(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min)
}

function makeAgeDist(rng: () => number): Record<'13-17' | '18-24' | '25-34' | '35-44' | '45+', number> {
  const raw = {
    '13-17': between(rng, 3, 12),
    '18-24': between(rng, 25, 45),
    '25-34': between(rng, 20, 40),
    '35-44': between(rng, 8, 20),
    '45+': between(rng, 2, 10),
  }
  const total = Object.values(raw).reduce((a, b) => a + b, 0)
  const norm = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Math.round((v / total) * 100)]),
  ) as Record<'13-17' | '18-24' | '25-34' | '35-44' | '45+', number>
  return norm
}

function generateKOL(i: number): KOL {
  const rng = mulberry32(i * 2654435761 + 12345)
  const first = pick(rng, FIRST_NAMES)
  const last = pick(rng, LAST_NAMES)
  const displayName = `${first} ${last}`
  const username = (first + last).toLowerCase().replace(/[^a-z]/g, '') + (i % 3 === 0 ? '.id' : i % 3 === 1 ? '_official' : '')
  const platform = pick(rng, PLATFORMS)
  const followers = Math.round(between(rng, 5_000, 2_000_000))
  const engagementRate = +between(rng, 0.5, 15).toFixed(2)
  const avgLikes = Math.round(followers * (engagementRate / 100) * between(rng, 0.7, 1.1))
  const avgComments = Math.round(avgLikes * between(rng, 0.01, 0.06))
  const avgViews = Math.round(followers * between(rng, 0.3, 1.6))
  const avgShares = Math.round(avgLikes * between(rng, 0.02, 0.08))
  const gender: 'male' | 'female' = rng() > 0.5 ? 'female' : 'male'
  const city = pick(rng, CITIES)
  const catCount = 1 + Math.floor(rng() * 2)
  const category = Array.from(new Set(Array.from({ length: catCount }, () => pick(rng, CATEGORIES))))
  const accountType = pick(rng, ['personal', 'business', 'creator'] as const)

  const femalePct = Math.round(between(rng, 25, 75))
  const topCities = [...CITIES]
    .sort(() => rng() - 0.5)
    .slice(0, 5)
    .map((c, idx) => ({ city: c, percentage: Math.round(between(rng, 5, 30) / (idx + 1)) }))
    .sort((a, b) => b.percentage - a.percentage)

  const topContent = Array.from({ length: 3 + Math.floor(rng() * 3) }, (_, c) => ({
    id: `${i}-c${c}`,
    thumbnail: `https://picsum.photos/seed/kol${i}c${c}/400/400`,
    caption: pick(rng, CAPTIONS),
    likes: Math.round(avgLikes * between(rng, 0.6, 1.8)),
    comments: Math.round(avgComments * between(rng, 0.6, 1.8)),
    views: platform === 'instagram' || platform === 'facebook' ? undefined : Math.round(avgViews * between(rng, 0.6, 1.8)),
    url: '#',
  }))

  const base = Math.round(followers * between(rng, 0.85, 0.95))
  const growthData = Array.from({ length: 30 }, (_, d) => {
    const date = new Date()
    date.setDate(date.getDate() - (29 - d))
    return {
      date: date.toISOString().slice(0, 10),
      followers: Math.round(base + (followers - base) * (d / 29) * between(rng, 0.9, 1.1)),
    }
  })

  const cpe = Math.round(between(rng, 500, 8_000))
  const cpv = Math.round(between(rng, 50, 1_500))

  return {
    id: `kol-${i}`,
    username,
    displayName,
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username)}`,
    platform,
    followers,
    following: Math.round(between(rng, 200, 3_000)),
    posts: Math.round(between(rng, 50, 1_500)),
    engagementRate,
    avgLikes,
    avgComments,
    avgViews,
    avgShares,
    category,
    tier: tierFromFollowers(followers),
    verified: rng() > 0.6,
    accountType,
    gender,
    ageRange: pick(rng, AGE_RANGES),
    country: 'Indonesia',
    city,
    bio: `${category.join(' • ')} creator asal ${city}. Kerja sama: DM atau email.`,
    audienceDemographics: {
      gender: { male: 100 - femalePct, female: femalePct },
      age: makeAgeDist(rng),
      location: topCities,
    },
    topContent,
    growthData,
    cpe,
    cpv,
    isSaved: false,
  }
}

export const MOCK_KOLS: KOL[] = Array.from({ length: 36 }, (_, i) => generateKOL(i + 1))

// "Saved" set seeds My Creator (built in a later phase).
export const MOCK_SAVED_KOLS: KOL[] = MOCK_KOLS.slice(0, 24).map((k) => ({ ...k, isSaved: true }))

// Report builder section options (key + label).
export const REPORT_SECTIONS: { key: string; label: string }[] = [
  { key: 'cover', label: 'Cover Page' },
  { key: 'summary', label: 'Executive Summary' },
  { key: 'overview', label: 'Metric Overview Kampanye' },
  { key: 'per-kol', label: 'Detail per Kreator' },
  { key: 'audience', label: 'Demografi Audiens' },
  { key: 'comparison', label: 'Perbandingan Performa' },
  { key: 'recommendation', label: 'Rekomendasi & Kesimpulan' },
]
export const DEFAULT_SECTION_KEYS = REPORT_SECTIONS.map((s) => s.key)

export const REPORT_STATUS_META: Record<Report['status'], { label: string; bg: string; color: string }> = {
  draft: { label: 'Draft', bg: '#2e3147', color: '#8b8fa8' },
  processing: { label: 'Diproses', bg: '#1a2540', color: '#5b9bd5' },
  completed: { label: 'Selesai', bg: '#1a3330', color: '#43d9a2' },
}

const savedIds = MOCK_SAVED_KOLS.map((k) => k.id)

export const MOCK_REPORTS: Report[] = [
  {
    id: 'rep-1',
    name: 'Kampanye Ramadan 2026',
    clientName: 'Wardah Beauty',
    periodStart: '2026-03-01',
    periodEnd: '2026-03-31',
    selectedKOLIds: savedIds.slice(0, 6),
    sections: DEFAULT_SECTION_KEYS,
    status: 'completed',
    createdAt: '2026-04-02',
  },
  {
    id: 'rep-2',
    name: 'Launch Produk Skincare X',
    clientName: 'Somethinc',
    periodStart: '2026-04-10',
    periodEnd: '2026-05-10',
    selectedKOLIds: savedIds.slice(2, 9),
    sections: DEFAULT_SECTION_KEYS,
    status: 'processing',
    createdAt: '2026-05-12',
  },
  {
    id: 'rep-3',
    name: 'Brand Awareness Q2',
    clientName: 'Tokopedia',
    periodStart: '2026-04-01',
    periodEnd: '2026-06-30',
    selectedKOLIds: savedIds.slice(0, 10),
    sections: DEFAULT_SECTION_KEYS,
    status: 'draft',
    createdAt: '2026-05-20',
  },
  {
    id: 'rep-4',
    name: 'Kolaborasi Kuliner Nusantara',
    clientName: 'GoFood',
    periodStart: '2026-02-01',
    periodEnd: '2026-02-28',
    selectedKOLIds: savedIds.slice(4, 12),
    sections: DEFAULT_SECTION_KEYS,
    status: 'completed',
    createdAt: '2026-03-05',
  },
  {
    id: 'rep-5',
    name: 'Travel Campaign Lebaran',
    clientName: 'Traveloka',
    periodStart: '2026-03-15',
    periodEnd: '2026-04-15',
    selectedKOLIds: savedIds.slice(1, 7),
    sections: DEFAULT_SECTION_KEYS,
    status: 'draft',
    createdAt: '2026-04-18',
  },
]
