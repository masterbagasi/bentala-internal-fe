// Shared constants for /ai/image (text-to-image) and /ai/templates pages.

export const STYLE_OPTIONS = [
  { key: 'fashion editorial photography', label: 'Fashion Editorial' },
  { key: 'flat lay product photography', label: 'Flat Lay Product' },
  { key: 'lifestyle photography', label: 'Lifestyle' },
  { key: 'cinematic portrait photography', label: 'Cinematic Portrait' },
  { key: 'minimalist graphic design', label: 'Minimalist Graphic' },
  { key: 'street photography', label: 'Street Style' },
] as const

// `key` is the aspect ratio (also sent to image-gen lib). `size` is the WxH
// for providers that need pixel dims (Leonardo / DALL-E / Stability).
// Higgsfield uses aspect_ratio directly.
export const RATIO_OPTIONS = [
  { key: '1:1',  size: '1024x1024', label: '1:1 — Square',        mj: '--ar 1:1' },
  { key: '4:5',  size: '1024x1792', label: '4:5 — Feed IG',       mj: '--ar 4:5' },
  { key: '9:16', size: '1024x1792', label: '9:16 — Story/Reels',  mj: '--ar 9:16' },
  { key: '16:9', size: '1792x1024', label: '16:9 — YouTube',      mj: '--ar 16:9' },
] as const

export type BrandKey = 'bpi' | 'bsi' | 'custom'

export interface ServerTemplate {
  id: string
  brand: BrandKey
  name: string
  description: string
  prompt: string
  ratio: string
  style: string
  image_dataurl?: string | null
  created_at: string
}

export interface StarterTemplate {
  id: string
  brand: Exclude<BrandKey, 'custom'>
  emoji: string
  label: string
  description: string
  ratio: string
  style: string
  prompt: string
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  // ── BPI — Bentala Project Indonesia ──
  {
    id: 'bpi-cover-diaspora', brand: 'bpi',
    emoji: '🌏', label: 'Cover Diaspora WNI',
    description: 'Foto editorial WNI di luar negeri untuk feed IG',
    ratio: '4:5', style: 'cinematic portrait photography',
    prompt: 'Cover Bentala Project Indonesia untuk Instagram dengan headline "[ISI HEADLINE BERITA]". Foto editorial: WNI di [NEGARA/KOTA], [DESKRIPSI EKSPRESI/SCENE], natural lighting, news photography style, hyper realistic',
  },
  {
    id: 'bpi-cover-prestasi', brand: 'bpi',
    emoji: '🏆', label: 'Cover Prestasi Internasional',
    description: 'Cover untuk pencapaian Indonesia di kancah global',
    ratio: '4:5', style: 'cinematic portrait photography',
    prompt: 'Cover Bentala Project Indonesia: orang Indonesia [NAMA/SUBJEK] memenangkan [PRESTASI] di [LOKASI/EVENT], ekspresi kemenangan, dramatic lighting, photo journalism style, bendera Indonesia samar di background',
  },
  {
    id: 'bpi-cover-budaya', brand: 'bpi',
    emoji: '🎭', label: 'Cover Budaya Mendunia',
    description: 'Indonesian culture (kuliner/tarian/seni) yang dirayakan dunia',
    ratio: '4:5', style: 'lifestyle photography',
    prompt: 'Cover Bentala Project Indonesia: [JENIS BUDAYA: kuliner Padang / batik / tarian / dll.] di [LOKASI INTERNASIONAL], orang asing menikmati/mengapresiasi, vibrant colors, cultural celebration, warm natural lighting',
  },
  {
    id: 'bpi-clickbait-hook', brand: 'bpi',
    emoji: '🔥', label: 'Cover Clickbait Hook',
    description: 'Cover dramatis berita viral (gaya tabloid editorial)',
    ratio: '4:5', style: 'cinematic portrait photography',
    prompt: 'Cover Bentala Project Indonesia: [DESKRIPSI ADEGAN VIRAL], dramatic moody lighting, ekspresi kuat di subject, kontras warna tinggi, tabloid editorial photo style, hook visual yang bikin penasaran',
  },
  {
    id: 'bpi-story-update', brand: 'bpi',
    emoji: '📱', label: 'IG Story / Reels',
    description: 'Visual vertikal untuk story Bentala Project',
    ratio: '9:16', style: 'lifestyle photography',
    prompt: 'IG Story Bentala Project Indonesia: [TOPIK BERITA], komposisi vertikal, dramatic lighting, ada ruang di atas untuk overlay teks, news/journalism aesthetic',
  },
  {
    id: 'bpi-yt-thumb', brand: 'bpi',
    emoji: '▶️', label: 'YouTube Thumbnail',
    description: 'Thumbnail YouTube horizontal dengan hook visual kuat',
    ratio: '16:9', style: 'cinematic portrait photography',
    prompt: 'YouTube thumbnail: orang Indonesia [SUBJEK] dengan ekspresi [DRAMATIC/SHOCKED/TRIUMPHANT], background [LOKASI], bold high-contrast lighting, dynamic composition, ada ruang kosong di kanan/kiri untuk text overlay',
  },
  // ── BSI — Bentala Studio Indonesia ──
  {
    id: 'bsi-fashion-editorial', brand: 'bsi',
    emoji: '👗', label: 'Fashion Editorial Cover',
    description: 'Editorial fashion shot untuk feed brand fashion',
    ratio: '4:5', style: 'fashion editorial photography',
    prompt: 'Fashion editorial photography: model wanita/pria Indonesia memakai [PRODUK/OUTFIT] di [SETTING], [MOOD: chic / minimalist / dramatic], professional studio lighting, magazine cover quality, soft skin tones',
  },
  {
    id: 'bsi-product-flatlay', brand: 'bsi',
    emoji: '📦', label: 'Product Flat Lay',
    description: 'Top-down product shot dengan props minimalis',
    ratio: '1:1', style: 'flat lay product photography',
    prompt: 'Top-down flat lay: [PRODUK UTAMA] dikelilingi [AKSESORIS/PROPS], background [WARNA/TEKSTUR], soft natural lighting from window, minimalist composition, plenty of negative space, lifestyle aesthetic',
  },
  {
    id: 'bsi-lifestyle-reels', brand: 'bsi',
    emoji: '✨', label: 'Lifestyle Reels Frame',
    description: 'Frame vertikal untuk reels lifestyle/behind the scenes',
    ratio: '9:16', style: 'lifestyle photography',
    prompt: 'Lifestyle vertical frame: [AKTIVITAS/SCENE], candid moment, warm natural light, aesthetic Indonesian millennial vibe, depth of field, cinematic color grading',
  },
  {
    id: 'bsi-cinematic-story', brand: 'bsi',
    emoji: '🎬', label: 'Cinematic Brand Story',
    description: 'Visual cerita brand dengan nuansa film',
    ratio: '4:5', style: 'cinematic portrait photography',
    prompt: 'Cinematic brand storytelling moment: [SUBJEK] dalam [SCENE], [EMOSI], dramatic side lighting, color graded teal-orange atau muted earth tones, narrative composition, film-still quality',
  },
  {
    id: 'bsi-minimalist-quote', brand: 'bsi',
    emoji: '✍️', label: 'Minimalist Quote BG',
    description: 'Background untuk overlay quote (clean & spacious)',
    ratio: '1:1', style: 'minimalist graphic design',
    prompt: 'Minimalist background design for quote overlay: [WARNA UTAMA] gradient, plenty of clean negative space at center, subtle [TEKSTUR: paper / linen / dll.], modern aesthetic, ada ruang luas untuk teks',
  },
  {
    id: 'bsi-street-style', brand: 'bsi',
    emoji: '🏙️', label: 'Street Style',
    description: 'Foto street photography urban Indonesia',
    ratio: '4:5', style: 'street photography',
    prompt: 'Street photography: anak muda Indonesia stylish memakai [OUTFIT/BRAND], di [LOKASI: Senopati / Kemang / Bandung dst.], golden hour lighting, candid pose, urban background',
  },
]

export interface ProviderBadge {
  provider: string
  label: string
  hasKey: boolean
}

// Fetch which provider is configured for ai-image feature. Used by both pages.
export async function fetchAiImageProviderBadge(): Promise<ProviderBadge | null> {
  try {
    const res = await fetch('/api/settings/features')
    if (!res.ok) return null
    const data = await res.json() as {
      features?: Array<{ id: string; provider: string; supportedProviders: string[] }>
      providers?: Array<{ provider: string; label: string; hasDbKey: boolean; hasEnvKey: boolean }>
    }
    if (!data.features || !data.providers) return null
    const aiImage = data.features.find(f => f.id === 'ai-image')
    if (!aiImage) return null
    const ps = data.providers.find(p => p.provider === aiImage.provider)
    return {
      provider: aiImage.provider,
      label: ps?.label ?? aiImage.provider,
      hasKey: ps ? (ps.hasDbKey || ps.hasEnvKey) : false,
    }
  } catch {
    return null
  }
}
