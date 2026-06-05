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

// REAL cumulative follower count at end of each day (@bentalaprojectindonesia,
// reconstructed from the daily follower_count series via Composio 2026-06-05).
// Used so the Followers figure reflects the selected date range.
export const FOLLOWERS_BY_DAY: Record<string, number> = {
  '2026-04-20': 7678, '2026-04-21': 7706, '2026-04-22': 7731, '2026-04-23': 7754,
  '2026-04-24': 7778, '2026-04-25': 7805, '2026-04-26': 7868, '2026-04-27': 7916,
  '2026-04-28': 7956, '2026-04-29': 7996, '2026-04-30': 8021, '2026-05-01': 8062,
  '2026-05-02': 8112, '2026-05-03': 8177, '2026-05-04': 8233, '2026-05-05': 8279,
  '2026-05-06': 8332, '2026-05-07': 8376, '2026-05-08': 8422, '2026-05-09': 8463,
  '2026-05-10': 8498, '2026-05-11': 8534, '2026-05-12': 8560, '2026-05-13': 8578,
  '2026-05-14': 8592, '2026-05-15': 8614, '2026-05-16': 8631, '2026-05-17': 8647,
  '2026-05-18': 8668, '2026-05-19': 8695, '2026-05-20': 8735, '2026-05-21': 8772,
  '2026-05-22': 8804, '2026-05-23': 8827, '2026-05-24': 8848, '2026-05-25': 8867,
  '2026-05-26': 8878, '2026-05-27': 8896, '2026-05-28': 8915, '2026-05-29': 8943,
  '2026-05-30': 8967, '2026-05-31': 8990, '2026-06-01': 9005, '2026-06-02': 9018,
  '2026-06-03': 9047, '2026-06-04': 9047, '2026-06-05': 9047,
}

const FOLLOWER_DATES = Object.keys(FOLLOWERS_BY_DAY).sort()
export const CURRENT_FOLLOWERS = FOLLOWERS_BY_DAY[FOLLOWER_DATES[FOLLOWER_DATES.length - 1]]

/** Real follower count as of `dateIso` (latest day on/before it). Clamps to the
 *  series bounds. Only meaningful for @bentalaprojectindonesia. */
export function followersAsOf(dateIso: string): number {
  if (dateIso >= FOLLOWER_DATES[FOLLOWER_DATES.length - 1]) return CURRENT_FOLLOWERS
  if (dateIso < FOLLOWER_DATES[0]) return FOLLOWERS_BY_DAY[FOLLOWER_DATES[0]]
  let val = FOLLOWERS_BY_DAY[FOLLOWER_DATES[0]]
  for (const d of FOLLOWER_DATES) {
    if (d <= dateIso) val = FOLLOWERS_BY_DAY[d]
    else break
  }
  return val
}

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
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
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

// REAL — 48 latest Instagram posts of @bentalaprojectindonesia, pulled via
// Composio on 2026-06-05 (24 Apr–5 Jun). reach/views/likes/comments/shares/saves
// are actual; times in WIB. engagement = (likes+comments+shares+saves) / reach.
export const CONTENT_POSTS: ContentPost[] = [
  { id: 'c1',  platform: 'instagram', format: 'reel',     caption: "Indonesia 'negara paling mager'? Kreator WNA buktikan sendiri", date: '2026-06-05', time: '09:34', reach: 980,   views: 1561,  likes: 31,  comments: 1,  shares: 0,   saves: 1,  engagement: 3.4, cover: '/social/c1.jpg' },
  { id: 'c2',  platform: 'instagram', format: 'reel',     caption: 'Slamet Santoso: dari kerja jadi pemain bola di Polandia',       date: '2026-06-04', time: '09:05', reach: 861,   views: 1920,  likes: 27,  comments: 1,  shares: 0,   saves: 0,  engagement: 3.3, cover: '/social/c2.jpg' },
  { id: 'c3',  platform: 'instagram', format: 'reel',     caption: "Turis Inggris kaget kebiasaan panggil 'Pak/Bu' di Indonesia",  date: '2026-06-03', time: '20:01', reach: 1147,  views: 1701,  likes: 27,  comments: 0,  shares: 1,   saves: 2,  engagement: 2.6, cover: '/social/c3.jpg' },
  { id: 'c4',  platform: 'instagram', format: 'reel',     caption: '700rb tanda tangan dunia desak stop perdagangan daging anabul', date: '2026-06-02', time: '23:05', reach: 2347,  views: 3286,  likes: 45,  comments: 0,  shares: 2,   saves: 3,  engagement: 2.1, cover: '/social/c4.jpg' },
  { id: 'c5',  platform: 'instagram', format: 'reel',     caption: 'Bahasa Indonesia jembatani WN Jepang & Jordan di Petra',        date: '2026-06-02', time: '20:16', reach: 2707,  views: 3442,  likes: 164, comments: 8,  shares: 2,   saves: 6,  engagement: 6.6, cover: '/social/c5.jpg' },
  { id: 'c6',  platform: 'instagram', format: 'reel',     caption: 'Scam internasional digerebek di ruko Solo Baru',               date: '2026-05-31', time: '21:19', reach: 2222,  views: 3492,  likes: 30,  comments: 0,  shares: 2,   saves: 0,  engagement: 1.4, cover: '/social/c6.jpg' },
  { id: 'c7',  platform: 'instagram', format: 'reel',     caption: "Solo dev Indonesia 'Rizu' rilis game kereta, viral di dunia",  date: '2026-05-30', time: '21:52', reach: 886,   views: 1195,  likes: 46,  comments: 0,  shares: 2,   saves: 2,  engagement: 5.6, cover: '/social/c7.jpg' },
  { id: 'c8',  platform: 'instagram', format: 'reel',     caption: 'WNI ketahuan pakai riset palsu di konferensi ilmiah dunia',     date: '2026-05-29', time: '19:22', reach: 3751,  views: 5456,  likes: 57,  comments: 2,  shares: 1,   saves: 4,  engagement: 1.7, cover: '/social/c8.jpg' },
  { id: 'c9',  platform: 'instagram', format: 'reel',     caption: "Label baru botol sirup ABC: 'jangan diminum langsung'",        date: '2026-05-28', time: '21:06', reach: 4478,  views: 7969,  likes: 151, comments: 0,  shares: 5,   saves: 11, engagement: 3.7, cover: '/social/c9.jpg' },
  { id: 'c10', platform: 'instagram', format: 'reel',     caption: 'Culture shock WNI ketemu komunitas Hijra di India',            date: '2026-05-28', time: '10:21', reach: 2912,  views: 4148,  likes: 35,  comments: 0,  shares: 0,   saves: 3,  engagement: 1.3, cover: '/social/c10.jpg' },
  { id: 'c11', platform: 'instagram', format: 'reel',     caption: 'WNA kagum kereta cepat Indonesia yang bersih',                 date: '2026-05-27', time: '20:44', reach: 1295,  views: 2179,  likes: 24,  comments: 0,  shares: 1,   saves: 2,  engagement: 2.1, cover: '/social/c11.jpg' },
  { id: 'c12', platform: 'instagram', format: 'reel',     caption: 'WNI di Dubai tinggal di bed space Rp2,4 juta/bulan',           date: '2026-05-26', time: '19:32', reach: 7693,  views: 9930,  likes: 73,  comments: 0,  shares: 6,   saves: 9,  engagement: 1.1, cover: '/social/c12.jpg' },
  { id: 'c13', platform: 'instagram', format: 'reel',     caption: 'Turis UK: kereta Jakarta lebih bagus dari Inggris',            date: '2026-05-25', time: '20:38', reach: 1825,  views: 2471,  likes: 51,  comments: 0,  shares: 3,   saves: 4,  engagement: 3.2, cover: '/social/c13.jpg' },
  { id: 'c14', platform: 'instagram', format: 'reel',     caption: 'WNA terpukau Tari Piring di atas pecahan kaca',               date: '2026-05-25', time: '10:09', reach: 6740,  views: 10404, likes: 198, comments: 2,  shares: 0,   saves: 2,  engagement: 3.0, cover: '/social/c14.jpg' },
  { id: 'c15', platform: 'instagram', format: 'reel',     caption: 'Siswi Al Azhar bawakan Tari Ratoh Jaroe di Paris',            date: '2026-05-24', time: '18:34', reach: 1559,  views: 1946,  likes: 62,  comments: 1,  shares: 1,   saves: 6,  engagement: 4.5, cover: '/social/c15.jpg' },
  { id: 'c16', platform: 'instagram', format: 'reel',     caption: 'Pria India ambilkan selendang WNI dari kolong rel',           date: '2026-05-23', time: '21:34', reach: 2077,  views: 3324,  likes: 19,  comments: 0,  shares: 1,   saves: 1,  engagement: 1.0, cover: '/social/c16.jpg' },
  { id: 'c17', platform: 'instagram', format: 'reel',     caption: 'Polisi Jepang gendong kakek kelelahan saat matsuri',         date: '2026-05-23', time: '17:57', reach: 1541,  views: 2406,  likes: 43,  comments: 0,  shares: 1,   saves: 1,  engagement: 2.9, cover: '/social/c17.jpg' },
  { id: 'c18', platform: 'instagram', format: 'reel',     caption: 'Pandawara Group raih 2 rekor Guinness World Records',         date: '2026-05-22', time: '23:11', reach: 932,   views: 1291,  likes: 29,  comments: 1,  shares: 0,   saves: 2,  engagement: 3.4, cover: '/social/c18.jpg' },
  { id: 'c19', platform: 'instagram', format: 'reel',     caption: '9 WNI relawan Sumud Flotilla bebas, tiba di Turki',          date: '2026-05-22', time: '13:58', reach: 1661,  views: 2207,  likes: 61,  comments: 2,  shares: 1,   saves: 0,  engagement: 3.9, cover: '/social/c19.jpg' },
  { id: 'c20', platform: 'instagram', format: 'reel',     caption: 'WNI korban sindikat timah ilegal di Malaysia',               date: '2026-05-21', time: '19:28', reach: 1704,  views: 2601,  likes: 15,  comments: 0,  shares: 4,   saves: 0,  engagement: 1.1, cover: '/social/c20.jpg' },
  { id: 'c21', platform: 'instagram', format: 'reel',     caption: "Plat mobil 'Geulis/Rendang/Bahagia' di Perth",               date: '2026-05-21', time: '09:05', reach: 1637,  views: 2500,  likes: 51,  comments: 2,  shares: 5,   saves: 6,  engagement: 3.9, cover: '/social/c21.jpg' },
  { id: 'c22', platform: 'instagram', format: 'carousel', caption: 'Dhea Natasya, perempuan RI pertama di World Longboard Tour',  date: '2026-05-20', time: '22:12', reach: 749,   views: 0,     likes: 12,  comments: 0,  shares: 0,   saves: 0,  engagement: 1.6, cover: '/social/c22.jpg' },
  { id: 'c23', platform: 'instagram', format: 'reel',     caption: 'Mahasiswi WNI ditangkap di Jepang terkait jasad bayi',       date: '2026-05-20', time: '19:23', reach: 25489, views: 32823, likes: 818, comments: 74, shares: 537, saves: 69, engagement: 5.9, cover: '/social/c23.jpg' },
  { id: 'c24', platform: 'instagram', format: 'reel',     caption: 'Member AAA Clan pecahkan 2 rekor Guinness',                  date: '2026-05-20', time: '09:04', reach: 23215, views: 33123, likes: 494, comments: 4,  shares: 6,   saves: 5,  engagement: 2.2, cover: '/social/c24.jpg' },
  { id: 'c25', platform: 'instagram', format: 'reel',     caption: '5 WNI relawan Sumud Flotilla ditangkap tentara Israel',      date: '2026-05-19', time: '21:48', reach: 628,   views: 907,   likes: 6,    comments: 0,   shares: 0,    saves: 0,   engagement: 1.0, cover: '/social/c25.jpg' },
  { id: 'c26', platform: 'instagram', format: 'reel',     caption: 'Kasus Nadiem Makarim disorot The New York Times',           date: '2026-05-18', time: '21:00', reach: 1318,  views: 1722,  likes: 44,   comments: 3,   shares: 0,    saves: 1,   engagement: 3.6, cover: '/social/c26.jpg' },
  { id: 'c27', platform: 'instagram', format: 'reel',     caption: 'Sekolah Indonesia di Malaysia hormat bendera dibentangkan', date: '2026-05-15', time: '14:05', reach: 1507,  views: 2327,  likes: 44,   comments: 1,   shares: 0,    saves: 0,   engagement: 3.0, cover: '/social/c27.jpg' },
  { id: 'c28', platform: 'instagram', format: 'reel',     caption: 'Siswa SMP Medan wakili RI di Olimpiade Biologi Rusia',      date: '2026-05-14', time: '22:38', reach: 1923,  views: 2564,  likes: 62,   comments: 1,   shares: 1,    saves: 0,   engagement: 3.3, cover: '/social/c28.jpg' },
  { id: 'c29', platform: 'instagram', format: 'reel',     caption: '232 WNI/PMI dipulangkan dari Malaysia via Batam',          date: '2026-05-13', time: '19:35', reach: 2135,  views: 3041,  likes: 14,   comments: 0,   shares: 0,    saves: 0,   engagement: 0.7, cover: '/social/c29.jpg' },
  { id: 'c30', platform: 'instagram', format: 'carousel', caption: "WNI temukan 'sound horeg versi Eropa' di Belanda",          date: '2026-05-13', time: '12:22', reach: 1122,  views: 0,     likes: 25,   comments: 0,   shares: 4,    saves: 5,   engagement: 3.0, cover: '/social/c30.jpg' },
  { id: 'c31', platform: 'instagram', format: 'carousel', caption: 'TKW diduga rekam konten pakai wajah lansia di Taiwan',       date: '2026-05-09', time: '13:32', reach: 2648,  views: 0,     likes: 30,   comments: 1,   shares: 8,    saves: 4,   engagement: 1.6, cover: '/social/c31.jpg' },
  { id: 'c32', platform: 'instagram', format: 'reel',     caption: 'Garuda Jalanan mundur dari Homeless World Cup 2026',        date: '2026-05-08', time: '21:58', reach: 942,   views: 1308,  likes: 12,   comments: 0,   shares: 0,    saves: 0,   engagement: 1.3, cover: '/social/c32.jpg' },
  { id: 'c33', platform: 'instagram', format: 'reel',     caption: 'Musisi Indonesia yang mendunia',                           date: '2026-05-07', time: '12:45', reach: 823,   views: 1033,  likes: 7,    comments: 0,   shares: 1,    saves: 0,   engagement: 1.0, cover: '/social/c33.jpg' },
  { id: 'c34', platform: 'instagram', format: 'reel',     caption: 'Atlet panjat tebing putri RI pecahkan rekor dunia',        date: '2026-05-05', time: '11:53', reach: 3578,  views: 4633,  likes: 151,  comments: 0,   shares: 0,    saves: 1,   engagement: 4.2, cover: '/social/c34.jpg' },
  { id: 'c35', platform: 'instagram', format: 'reel',     caption: 'Advokat Rusia bongkar celah hukum di Bali',                date: '2026-05-03', time: '19:03', reach: 2528,  views: 3146,  likes: 91,   comments: 2,   shares: 4,    saves: 14,  engagement: 4.4, cover: '/social/c35.jpg' },
  { id: 'c36', platform: 'instagram', format: 'carousel', caption: 'Qari muda Kaltim juara MTQ Internasional di Rusia',         date: '2026-05-02', time: '22:00', reach: 569,   views: 0,     likes: 15,   comments: 0,   shares: 0,    saves: 1,   engagement: 2.8, cover: '/social/c36.jpg' },
  { id: 'c37', platform: 'instagram', format: 'reel',     caption: 'Prajurit TNI AL raih perunggu Asian Rowing Cup Korea',     date: '2026-05-02', time: '18:13', reach: 1470,  views: 1873,  likes: 24,   comments: 0,   shares: 0,    saves: 0,   engagement: 1.6, cover: '/social/c37.jpg' },
  { id: 'c38', platform: 'instagram', format: 'reel',     caption: '3 WNI ditangkap di Mekkah terkait haji ilegal',            date: '2026-05-01', time: '21:43', reach: 6044,  views: 7534,  likes: 119,  comments: 6,   shares: 15,   saves: 5,   engagement: 2.4, cover: '/social/c38.jpg' },
  { id: 'c39', platform: 'instagram', format: 'reel',     caption: 'WNI hitung durasi palang pintu kereta di Jepang',          date: '2026-04-30', time: '21:11', reach: 38857, views: 52481, likes: 2593, comments: 86,  shares: 47,   saves: 78,  engagement: 7.2, cover: '/social/c39.jpg' },
  { id: 'c40', platform: 'instagram', format: 'reel',     caption: 'Media Jepang soroti kecelakaan kereta di Jakarta',         date: '2026-04-30', time: '08:56', reach: 1231,  views: 1709,  likes: 47,   comments: 1,   shares: 2,    saves: 1,   engagement: 4.1, cover: '/social/c40.jpg' },
  { id: 'c41', platform: 'instagram', format: 'reel',     caption: 'Kapal dengan 4 WNI dibajak perompak Somalia',              date: '2026-04-29', time: '21:47', reach: 1875,  views: 2766,  likes: 31,   comments: 2,   shares: 4,    saves: 2,   engagement: 2.1, cover: '/social/c41.jpg' },
  { id: 'c42', platform: 'instagram', format: 'reel',     caption: 'Produk Indonesia yang diakui dunia',                       date: '2026-04-28', time: '22:07', reach: 557,   views: 703,   likes: 5,    comments: 0,   shares: 0,    saves: 1,   engagement: 1.1, cover: '/social/c42.jpg' },
  { id: 'c43', platform: 'instagram', format: 'reel',     caption: 'Obrolan lintas bahasa: Jepang–Belanda–Indonesia',          date: '2026-04-28', time: '08:51', reach: 2113,  views: 2923,  likes: 90,   comments: 2,   shares: 1,    saves: 7,   engagement: 4.7, cover: '/social/c43.jpg' },
  { id: 'c44', platform: 'instagram', format: 'reel',     caption: 'WNA resmi jadi WNI setelah proses 2 tahun',                date: '2026-04-27', time: '17:34', reach: 1223,  views: 1653,  likes: 32,   comments: 0,   shares: 9,    saves: 0,   engagement: 3.4, cover: '/social/c44.jpg' },
  { id: 'c45', platform: 'instagram', format: 'carousel', caption: 'Mesin cuci Miele Rp72jt dibuang di Australia',             date: '2026-04-27', time: '09:09', reach: 1917,  views: 0,     likes: 28,   comments: 1,   shares: 9,    saves: 2,   engagement: 2.1, cover: '/social/c45.jpg' },
  { id: 'c46', platform: 'instagram', format: 'reel',     caption: 'Tunawisma berpenampilan rapi di Amerika',                 date: '2026-04-26', time: '23:11', reach: 4754,  views: 6382,  likes: 50,   comments: 0,   shares: 0,    saves: 3,   engagement: 1.1, cover: '/social/c46.jpg' },
  { id: 'c47', platform: 'instagram', format: 'carousel', caption: 'Food truck nasi goreng WNI raup Rp30jt/hari di AS',        date: '2026-04-25', time: '11:01', reach: 94484, views: 0,     likes: 1929, comments: 111, shares: 1147, saves: 254, engagement: 3.6, cover: '/social/c47.jpg' },
  { id: 'c48', platform: 'instagram', format: 'reel',     caption: 'Pengalaman daftar IMEI ponsel WNI setelah pulang',        date: '2026-04-24', time: '09:09', reach: 2884,  views: 3665,  likes: 78,   comments: 1,   shares: 16,   saves: 9,   engagement: 3.6, cover: '/social/c48.jpg' },
]

// ── Overview metrics (Instagram-Insights style) — REAL, last 28 days via
// Composio 2026-06-05. viewsFollowersPct = followers' share of views
// (2.162 / 69.528 ≈ 3,1%). netFollowers from follows_and_unfollows.
export const OVERVIEW = {
  views: 69528, viewsFollowersPct: 3.1,
  netFollowers: 460, follows: 671, unfollows: 211,
  interactions: 12188,
  likes: 10786, comments: 44, saves: 358,
  shares: 381,
  accountsReached: 53038,
  profileVisits: 0, externalLinkTaps: 0, bioLinkTaps: 0,
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
