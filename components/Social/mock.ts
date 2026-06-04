// ── PREVIEW-ONLY mock data for the Social Media tab ──
// Replaced by live Composio + Supabase data in the implementation phase.
// See docs/superpowers/specs/2026-06-03-social-media-tab-design.md

export type Platform = 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'x' | 'linkedin'
export type SubjectType = 'owned' | 'prospect'
export type ConnStatus = 'connected' | 'pending' | 'error' | 'public'

export const PLATFORM_META: Record<Platform, { label: string; color: string; short: string }> = {
  instagram: { label: 'Instagram', color: '#c4365a', short: 'IG' },
  tiktok:    { label: 'TikTok',    color: '#2c85ad', short: 'TT' },
  youtube:   { label: 'YouTube',   color: '#c4393a', short: 'YT' },
  facebook:  { label: 'Facebook',  color: '#1f5dca', short: 'FB' },
  x:         { label: 'X',         color: '#5a5a60', short: 'X'  },
  linkedin:  { label: 'LinkedIn',  color: '#2c85ad', short: 'IN' },
}

export interface Connection {
  platform: Platform
  handle: string
  status: ConnStatus
  followers: number
}

export interface Subject {
  id: string
  name: string
  type: SubjectType
  connections: Connection[]
}

export const SUBJECTS: Subject[] = [
  {
    id: 'bentala',
    name: 'Bentala Creative',
    type: 'owned',
    connections: [
      { platform: 'instagram', handle: '@bentala.id',     status: 'connected', followers: 48200 },
      { platform: 'tiktok',    handle: '@bentala',         status: 'connected', followers: 31700 },
      { platform: 'youtube',   handle: 'Bentala Creative', status: 'connected', followers: 12400 },
      { platform: 'x',         handle: '@bentala',         status: 'connected', followers: 5600 },
      { platform: 'linkedin',  handle: 'Bentala Creative', status: 'pending',   followers: 0 },
    ],
  },
  {
    id: 'kopi-nusantara',
    name: 'Kopi Nusantara (Client)',
    type: 'owned',
    connections: [
      { platform: 'instagram', handle: '@kopinusantara', status: 'connected', followers: 21850 },
      { platform: 'tiktok',    handle: '@kopinusantara', status: 'connected', followers: 18300 },
      { platform: 'facebook',  handle: 'Kopi Nusantara', status: 'error',     followers: 9600 },
    ],
  },
  {
    id: 'glow-skincare',
    name: 'Glow Skincare (Prospect)',
    type: 'prospect',
    connections: [
      { platform: 'instagram', handle: '@glow.skincare', status: 'public', followers: 64500 },
      { platform: 'tiktok',    handle: '@glowskincare',  status: 'public', followers: 102000 },
    ],
  },
]

// 12-week trend series for the analytics preview
export const WEEKS = Array.from({ length: 12 }, (_, i) => `W${i + 1}`)

export const FOLLOWER_TREND = [
  41200, 42050, 42600, 43400, 44100, 44950, 45600, 46300, 46950, 47400, 47850, 48200,
]

export const ENGAGEMENT_TREND = [
  3.8, 4.1, 3.9, 4.4, 4.6, 4.2, 4.8, 5.1, 4.9, 5.3, 5.0, 5.4,
]

export const REACH_BY_PLATFORM = {
  labels: ['Instagram', 'TikTok', 'YouTube'],
  data: [128000, 264000, 41000],
}

// Per-platform 12-week trends (followers + engagement %), so selecting a
// platform updates the charts. 'all' is aggregated in the component.
export const PLATFORM_TRENDS: Partial<Record<Platform, { followers: number[]; engagement: number[] }>> = {
  instagram: {
    followers:  [41000, 41900, 42600, 43500, 44200, 45000, 45700, 46400, 47000, 47500, 47900, 48200],
    engagement: [3.8, 4.1, 3.9, 4.4, 4.6, 4.2, 4.8, 5.1, 4.9, 5.3, 5.0, 5.4],
  },
  tiktok: {
    followers:  [26000, 26900, 27600, 28400, 29000, 29600, 30100, 30600, 31000, 31300, 31550, 31700],
    engagement: [5.2, 5.6, 5.4, 6.1, 6.5, 6.2, 7.0, 7.4, 7.1, 7.6, 7.3, 7.8],
  },
  youtube: {
    followers:  [9800, 10100, 10400, 10700, 11000, 11250, 11500, 11750, 11950, 12100, 12270, 12400],
    engagement: [3.0, 3.2, 3.1, 3.5, 3.7, 3.6, 4.0, 4.2, 4.1, 4.4, 4.3, 4.6],
  },
  facebook: {
    followers:  [8800, 8850, 8950, 9050, 9150, 9250, 9350, 9420, 9480, 9530, 9570, 9600],
    engagement: [2.0, 2.2, 2.1, 2.4, 2.5, 2.4, 2.7, 2.9, 2.8, 3.0, 2.9, 3.1],
  },
  x: {
    followers:  [4200, 4350, 4480, 4620, 4760, 4880, 5000, 5140, 5260, 5380, 5500, 5600],
    engagement: [2.4, 2.6, 2.5, 2.9, 3.0, 2.8, 3.2, 3.4, 3.3, 3.5, 3.4, 3.6],
  },
}

export interface TopPost {
  platform: Platform
  caption: string
  reach: number
  engagement: number
  date: string
}

export const TOP_POSTS: TopPost[] = [
  { platform: 'tiktok',    caption: 'Behind the scenes — studio session',     reach: 84200, engagement: 9.1, date: '28 Mei' },
  { platform: 'instagram', caption: 'Carousel: 5 tips branding UMKM',          reach: 41800, engagement: 7.4, date: '24 Mei' },
  { platform: 'instagram', caption: 'Reel: transformasi logo klien',           reach: 38600, engagement: 6.9, date: '21 Mei' },
  { platform: 'youtube',   caption: 'Case study: rebranding Kopi Nusantara',   reach: 22400, engagement: 5.2, date: '18 Mei' },
  { platform: 'tiktok',    caption: 'Trend audio + quick brand tip',           reach: 19700, engagement: 4.8, date: '15 Mei' },
]

export interface PlanItem {
  day: number      // day of month
  platform: Platform
  title: string
  type: string
}

export const PLAN_ITEMS: PlanItem[] = [
  { day: 3,  platform: 'instagram', title: 'Carousel edukasi: branding 101', type: 'Edukasi' },
  { day: 5,  platform: 'tiktok',    title: 'Behind the scenes produksi',     type: 'Engagement' },
  { day: 8,  platform: 'youtube',   title: 'Long-form: studi kasus klien',   type: 'Authority' },
  { day: 11, platform: 'instagram', title: 'Reel: before/after desain',      type: 'Showcase' },
  { day: 14, platform: 'tiktok',    title: 'Trend audio + tip singkat',      type: 'Reach' },
  { day: 18, platform: 'instagram', title: 'UGC repost + testimoni',         type: 'Trust' },
  { day: 22, platform: 'facebook',  title: 'Promo paket branding UMKM',      type: 'Konversi' },
  { day: 26, platform: 'tiktok',    title: 'Q&A: tanya jawab branding',      type: 'Engagement' },
]

// ── Full content feed (for Analytics content display + custom date filter) ──
export type ContentFormat = 'reel' | 'carousel' | 'photo' | 'video' | 'short' | 'story'

export interface ContentPost {
  id: string
  platform: Platform
  format: ContentFormat
  caption: string
  date: string          // YYYY-MM-DD
  time?: string         // HH:mm upload time
  reach: number
  likes: number
  comments: number
  shares: number
  engagement: number    // %
  /**
   * Cover image. In production this is resolved by the connector:
   * videos without an explicit cover use a random frame; designs
   * (carousel/photo) use the first page/slide. Optional in preview —
   * a deterministic placeholder is used when absent.
   */
  cover?: string
}

export const FORMAT_LABEL: Record<ContentFormat, string> = {
  reel: 'Reel', carousel: 'Carousel', photo: 'Photo',
  video: 'Video', short: 'Short', story: 'Story',
}

// Spread across Apr–Jun 2026 so the custom date filter visibly works.
export const CONTENT_POSTS: ContentPost[] = [
  { id: 'c1',  platform: 'tiktok',    format: 'video',    caption: 'Behind the scenes — studio session',        date: '2026-05-28', time: '19:15', reach: 84200, likes: 7100, comments: 412, shares: 980, engagement: 9.1 },
  { id: 'c2',  platform: 'instagram', format: 'carousel', caption: '5 tips branding untuk UMKM',                 date: '2026-05-24', time: '12:30', reach: 41800, likes: 3050, comments: 188, shares: 240, engagement: 7.4 },
  { id: 'c3',  platform: 'instagram', format: 'reel',     caption: 'Transformasi logo klien — before/after',     date: '2026-05-21', time: '20:00', reach: 38600, likes: 2660, comments: 154, shares: 310, engagement: 6.9 },
  { id: 'c4',  platform: 'youtube',   format: 'video',    caption: 'Case study: rebranding Kopi Nusantara',      date: '2026-05-18', time: '18:45', reach: 22400, likes: 1180, comments: 96,  shares: 70,  engagement: 5.2 },
  { id: 'c5',  platform: 'tiktok',    format: 'video',    caption: 'Trend audio + quick brand tip',              date: '2026-05-15', time: '21:10', reach: 19700, likes: 1540, comments: 88,  shares: 150, engagement: 4.8 },
  { id: 'c6',  platform: 'instagram', format: 'photo',    caption: 'Quote of the day — desain minimalis',        date: '2026-05-11', time: '08:30', reach: 16200, likes: 1320, comments: 64,  shares: 40,  engagement: 4.3 },
  { id: 'c7',  platform: 'instagram', format: 'reel',     caption: 'Proses desain dari sketsa ke final',         date: '2026-05-07', time: '19:40', reach: 29800, likes: 2110, comments: 132, shares: 205, engagement: 6.1 },
  { id: 'c8',  platform: 'tiktok',    format: 'video',    caption: 'POV: meeting kickoff dengan klien baru',     date: '2026-05-03', time: '13:20', reach: 25400, likes: 1980, comments: 110, shares: 175, engagement: 5.5 },
  { id: 'c9',  platform: 'youtube',   format: 'short',    caption: 'Short: 3 kesalahan branding UMKM',           date: '2026-04-28', time: '17:05', reach: 14100, likes: 720,  comments: 52,  shares: 38,  engagement: 4.0 },
  { id: 'c10', platform: 'instagram', format: 'carousel', caption: 'Studi warna: palet brand 2026',              date: '2026-04-23', time: '11:15', reach: 21300, likes: 1640, comments: 91,  shares: 120, engagement: 5.0 },
  { id: 'c11', platform: 'tiktok',    format: 'video',    caption: 'Reaksi tim ke desain pertama',               date: '2026-04-18', time: '20:30', reach: 31200, likes: 2480, comments: 143, shares: 260, engagement: 6.4 },
  { id: 'c12', platform: 'instagram', format: 'reel',     caption: 'Tutorial: pilih font untuk brand',           date: '2026-04-14', time: '18:00', reach: 27600, likes: 1990, comments: 121, shares: 198, engagement: 5.8 },
  { id: 'c13', platform: 'facebook',  format: 'photo',    caption: 'Promo paket branding bulan ini',             date: '2026-04-09', time: '10:45', reach: 9800,  likes: 410,  comments: 33,  shares: 25,  engagement: 3.1 },
  { id: 'c14', platform: 'youtube',   format: 'video',    caption: 'Vlog: sehari di studio Bentala',             date: '2026-04-04', time: '16:20', reach: 18700, likes: 980,  comments: 74,  shares: 55,  engagement: 4.6 },
  { id: 'c15', platform: 'x',         format: 'photo',    caption: 'Thread: prinsip desain brand yang kuat',     date: '2026-05-20', time: '09:50', reach: 12300, likes: 540,  comments: 47,  shares: 210, engagement: 3.5 },
  { id: 'c16', platform: 'x',         format: 'photo',    caption: 'Hot take: tren visual 2026',                 date: '2026-04-26', time: '14:35', reach: 8900,  likes: 380,  comments: 62,  shares: 145, engagement: 3.1 },
]

// ── Overview metrics (Instagram-Insights style) ──
export const OVERVIEW = {
  views: 31787, viewsFollowersPct: 65.2,
  netFollowers: -39, follows: 37, unfollows: 76,
  interactions: 426, interactionsFollowersPct: 87.1,
  shares: 312, sharesFollowersPct: 79.0,
  accountsReached: 6182,
  profileVisits: 677, externalLinkTaps: 12, bioLinkTaps: 0,
}

export interface TypeBreakdown { type: string; total: number; followersPct: number }

export const VIEWS_BY_TYPE: TypeBreakdown[] = [
  { type: 'Stories',     total: 21000, followersPct: 62 },
  { type: 'Reels',       total: 7300,  followersPct: 38 },
  { type: 'Posts',       total: 3000,  followersPct: 72 },
  { type: 'Live videos', total: 0,     followersPct: 0 },
]

export const INTERACTIONS_BY_TYPE: TypeBreakdown[] = [
  { type: 'Reels',       total: 204, followersPct: 78 },
  { type: 'Posts',       total: 128, followersPct: 85 },
  { type: 'Stories',     total: 94,  followersPct: 88 },
  { type: 'Live videos', total: 0,   followersPct: 0 },
]

// ── Audience ──
export interface AgeBucket { range: string; women: number; men: number }
export interface LocationRow { name: string; pct: number }

export const ACTIVE_HOURS = ['12a', '3a', '6a', '9a', '12p', '3p', '6p', '9p']

export const AUDIENCE = {
  gender: { women: 58.8, men: 41.2 },
  ageRange: [
    { range: '13-17', women: 0.1, men: 0.1 },
    { range: '18-24', women: 8.4, men: 5.1 },
    { range: '25-34', women: 44.8, men: 28.6 },
    { range: '35-44', women: 4.9, men: 4.3 },
    { range: '45-54', women: 1.2, men: 1.1 },
    { range: '55-64', women: 0.3, men: 0.3 },
    { range: '65+',   women: 0.4, men: 0.3 },
  ] as AgeBucket[],
  countries: [
    { name: 'Indonesia',     pct: 61.4 },
    { name: 'India',         pct: 13.7 },
    { name: 'Brazil',        pct: 4.0 },
    { name: 'United States', pct: 3.4 },
    { name: 'Malaysia',      pct: 2.7 },
  ] as LocationRow[],
  cities: [
    { name: 'Jakarta',  pct: 22.1 },
    { name: 'Surabaya', pct: 8.4 },
    { name: 'Bandung',  pct: 6.9 },
    { name: 'Bekasi',   pct: 4.2 },
    { name: 'Medan',    pct: 3.1 },
  ] as LocationRow[],
  // 8 buckets per day matching ACTIVE_HOURS (relative 0-100)
  activeTimes: {
    Su: [55, 38, 48, 78, 84, 90, 100, 86],
    M:  [42, 30, 44, 72, 80, 86, 96, 80],
    Tu: [40, 28, 46, 74, 82, 88, 98, 82],
    W:  [44, 32, 45, 70, 78, 84, 94, 79],
    Th: [46, 34, 47, 73, 81, 87, 97, 83],
    F:  [50, 40, 52, 76, 83, 89, 95, 88],
    Sa: [60, 46, 55, 80, 86, 92, 99, 90],
  } as Record<string, number[]>,
  topTimes: [
    { day: 'Minggu', time: '18.00 – 21.00' },
    { day: 'Senin',  time: '18.00 – 21.00' },
    { day: 'Selasa', time: '18.00 – 21.00' },
  ],
}

export const AI_RECOMMENDATIONS = [
  'TikTok jadi penyumbang reach terbesar (264k) — naikkan frekuensi posting jadi 4–5×/minggu, fokus format behind-the-scenes yang engagement-nya tertinggi (9.1%).',
  'Engagement rate Instagram naik konsisten 12 minggu (3.8% → 5.4%). Pertahankan format carousel edukasi; jadwalkan di jam 19.00–21.00 saat audiens paling aktif.',
  'YouTube masih underutilized (12.4k subs). Manfaatkan studi kasus klien sebagai long-form authority content, lalu potong jadi Shorts untuk cross-posting.',
  'Prospek Glow Skincare punya engagement TikTok tinggi — siapkan pitch deck berbasis benchmark performa mereka vs rata-rata industri.',
]

export const REPORT_NARRATIVE = `Sepanjang periode ini, performa sosial media Bentala Creative menunjukkan tren positif di seluruh kanal utama. Total followers tumbuh 17.0% (41.2k → 48.2k), didorong terutama oleh TikTok yang mencatat reach tertinggi (264k impresi) berkat konten behind-the-scenes. Engagement rate rata-rata naik dari 3.8% menjadi 5.4%, melampaui benchmark industri kreatif (~3.5%).

Instagram tetap menjadi kanal paling stabil dengan pertumbuhan engagement yang konsisten setiap minggu; format carousel edukasi dan reel transformasi desain memberikan kontribusi terbesar. YouTube, meski basis audiensnya paling kecil, menunjukkan potensi sebagai kanal authority lewat konten studi kasus.

Rekomendasi utama: tingkatkan kadens produksi TikTok, lanjutkan ritme konten edukasi Instagram di jam prime-time, dan kembangkan strategi long-form YouTube yang dipotong menjadi Shorts untuk memaksimalkan jangkauan lintas kanal.`
