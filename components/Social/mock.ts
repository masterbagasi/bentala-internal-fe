// ── Social Media tab data ──
// Bentala Project Indonesia (the first subject) holds a REAL snapshot pulled
// from Instagram via Composio on 2026-06-05 (@bentalaprojectindonesia):
// 9.047 followers, 169 posts, 28-day reach 52.981, plus the 12 latest reels
// with real reach/views/likes/comments and real follower demographics.
// Follower/engagement *trend* series remain illustrative (the IG API doesn't
// expose historical follower counts). The other two subjects are sample data.

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
    name: 'Bentala Project Indonesia',
    type: 'owned',
    connections: [
      // REAL — pulled via Composio 2026-06-05.
      { platform: 'instagram', handle: '@bentalaprojectindonesia', status: 'connected', followers: 9047 },
      // Belum tersambung (handle dari bio IG); follower terisi setelah di-connect.
      { platform: 'tiktok',    handle: '@bentalaprojectindonesia', status: 'pending',   followers: 0 },
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
    // Endpoint (9047) is the real current follower count; earlier weeks are
    // illustrative since IG doesn't expose historical follower counts.
    followers:  [7900, 8050, 8200, 8350, 8480, 8600, 8720, 8820, 8900, 8970, 9010, 9047],
    engagement: [2.4, 2.6, 2.5, 2.9, 3.0, 2.8, 3.2, 2.7, 3.0, 2.6, 2.8, 2.9],
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

// REAL — 12 latest Instagram reels of @bentalaprojectindonesia, pulled via
// Composio on 2026-06-05 (reach/views/likes/comments/shares are actual; times
// shown in WIB). engagement = (likes+comments+shares+saves) / reach.
export const CONTENT_POSTS: ContentPost[] = [
  { id: 'c1',  platform: 'instagram', format: 'reel', caption: "Indonesia 'negara paling mager'? Kreator WNA buktikan sendiri", date: '2026-06-05', time: '09:34', reach: 980,  likes: 31,  comments: 1, shares: 0, engagement: 3.4 },
  { id: 'c2',  platform: 'instagram', format: 'reel', caption: 'Slamet Santoso: dari kerja jadi pemain bola di Polandia',       date: '2026-06-04', time: '09:05', reach: 861,  likes: 27,  comments: 1, shares: 0, engagement: 3.3 },
  { id: 'c3',  platform: 'instagram', format: 'reel', caption: "Turis Inggris kaget kebiasaan panggil 'Pak/Bu' di Indonesia",  date: '2026-06-03', time: '20:01', reach: 1147, likes: 27,  comments: 0, shares: 1, engagement: 2.6 },
  { id: 'c4',  platform: 'instagram', format: 'reel', caption: '700rb tanda tangan dunia desak stop perdagangan daging anabul', date: '2026-06-02', time: '23:05', reach: 2347, likes: 45,  comments: 0, shares: 2, engagement: 2.1 },
  { id: 'c5',  platform: 'instagram', format: 'reel', caption: 'Bahasa Indonesia jembatani WN Jepang & Jordan di Petra',        date: '2026-06-02', time: '20:16', reach: 2707, likes: 164, comments: 8, shares: 2, engagement: 6.6 },
  { id: 'c6',  platform: 'instagram', format: 'reel', caption: 'Scam internasional digerebek di ruko Solo Baru',               date: '2026-05-31', time: '21:19', reach: 2222, likes: 30,  comments: 0, shares: 2, engagement: 1.4 },
  { id: 'c7',  platform: 'instagram', format: 'reel', caption: "Solo dev Indonesia 'Rizu' rilis game kereta, viral di dunia",  date: '2026-05-30', time: '21:52', reach: 886,  likes: 46,  comments: 0, shares: 2, engagement: 5.6 },
  { id: 'c8',  platform: 'instagram', format: 'reel', caption: 'WNI ketahuan pakai riset palsu di konferensi ilmiah dunia',     date: '2026-05-29', time: '19:22', reach: 3751, likes: 57,  comments: 2, shares: 1, engagement: 1.7 },
  { id: 'c9',  platform: 'instagram', format: 'reel', caption: "Label baru botol sirup ABC: 'jangan diminum langsung'",        date: '2026-05-28', time: '21:06', reach: 4478, likes: 151, comments: 0, shares: 5, engagement: 3.7 },
  { id: 'c10', platform: 'instagram', format: 'reel', caption: 'Culture shock WNI ketemu komunitas Hijra di India',            date: '2026-05-28', time: '10:21', reach: 2912, likes: 35,  comments: 0, shares: 0, engagement: 1.3 },
  { id: 'c11', platform: 'instagram', format: 'reel', caption: 'WNA kagum kereta cepat Indonesia yang bersih',                 date: '2026-05-27', time: '20:44', reach: 1295, likes: 24,  comments: 0, shares: 1, engagement: 2.1 },
  { id: 'c12', platform: 'instagram', format: 'reel', caption: 'WNI di Dubai tinggal di bed space Rp2,4 juta/bulan',           date: '2026-05-26', time: '19:32', reach: 7693, likes: 73,  comments: 0, shares: 6, engagement: 1.1 },
]

// ── Overview metrics (Instagram-Insights style) ──
// views / interactions / accountsReached are REAL (last 28 days, via Composio
// 2026-06-05). The remaining fields stay illustrative.
export const OVERVIEW = {
  views: 69428, viewsFollowersPct: 65.2,
  netFollowers: -39, follows: 37, unfollows: 76,
  interactions: 12176, interactionsFollowersPct: 87.1,
  shares: 312, sharesFollowersPct: 79.0,
  accountsReached: 52981,
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

// gender / ageRange / countries / cities are REAL follower demographics
// (@bentalaprojectindonesia via Composio 2026-06-05). Age buckets are split by
// the overall gender ratio (the API gives age and gender separately).
export const AUDIENCE = {
  gender: { women: 48.2, men: 51.8 },
  ageRange: [
    { range: '13-17', women: 1.4,  men: 1.5 },
    { range: '18-24', women: 5.3,  men: 5.7 },
    { range: '25-34', women: 13.4, men: 14.3 },
    { range: '35-44', women: 13.2, men: 14.1 },
    { range: '45-54', women: 8.7,  men: 9.3 },
    { range: '55-64', women: 4.5,  men: 4.8 },
    { range: '65+',   women: 1.8,  men: 1.9 },
  ] as AgeBucket[],
  countries: [
    { name: 'Indonesia',     pct: 92.9 },
    { name: 'Malaysia',      pct: 1.8 },
    { name: 'Japan',         pct: 0.6 },
    { name: 'Hong Kong',     pct: 0.4 },
    { name: 'United States', pct: 0.4 },
  ] as LocationRow[],
  cities: [
    { name: 'Jakarta',  pct: 13.0 },
    { name: 'Surabaya', pct: 2.8 },
    { name: 'Depok',    pct: 2.7 },
    { name: 'Bekasi',   pct: 2.6 },
    { name: 'Bandung',  pct: 2.4 },
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
  'Reels adalah format inti (28-hari: reach 52.981, views 69.428). Pertahankan kadens posting harian dan konsisten di tema "Indonesian Stories Beyond Borders".',
  'Konten yang memicu diskusi memberi engagement tertinggi — reel "Bahasa Indonesia di Petra" mencapai 6,6% (164 likes, 8 komentar). Perbanyak angle cerita diaspora & culture shock dengan ajakan komentar.',
  'Audiens 92,9% dari Indonesia (Jakarta 13%, lalu Surabaya/Depok/Bekasi/Bandung) dan didominasi umur 25–44. Jadwalkan posting di jam prime-time malam WIB untuk reach maksimal.',
  'TikTok @bentalaprojectindonesia belum tersambung — connect via Composio agar performa lintas-kanal (IG + TikTok) bisa dibandingkan dalam satu dashboard.',
]

export const REPORT_NARRATIVE = `Pada periode ini akun Instagram Bentala Project Indonesia (@bentalaprojectindonesia) memiliki 9.047 followers dari total 169 konten. Dalam 28 hari terakhir, akun menjangkau 52.981 akun (reach), mencatat 69.428 views dan 12.176 interaksi konten — angka yang sehat untuk basis audiens seukuran ini.

Format konten didominasi Reels bertema "Indonesian Stories Beyond Borders". Reel dengan performa terbaik di periode ini antara lain "WNI di Dubai tinggal di bed space" (reach 7.693) dan "Label baru botol sirup ABC" (reach 4.478), sementara reel "Bahasa Indonesia di Petra" mencatat engagement rate tertinggi (6,6%) berkat 164 likes dan 8 komentar.

Audiens sangat terpusat di Indonesia (92,9%) dengan kantong terbesar di Jakarta (13,0%), Surabaya, Depok, Bekasi, dan Bandung; secara umur didominasi rentang produktif 25–44 tahun. Rekomendasi: pertahankan ritme posting Reels harian, perbanyak angle yang memicu komentar (seperti cerita diaspora & culture shock), dan jadwalkan di jam prime-time malam saat audiens domestik paling aktif.`
