import { NextResponse } from 'next/server'
import { XMLParser } from 'fast-xml-parser'
import fs from 'fs'
import path from 'path'
import os from 'os'
import type { NewsItem, NewsCategory } from '@/lib/types'

const CACHE_FILE = path.join(os.tmpdir(), 'bentala-news-cache.json')
const NEWS_TTL = 15 * 60 * 1000
const MAX_ITEMS = 600

function readFileCache(): { items: NewsItem[]; ts: number } | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))
  } catch { return null }
}

function writeFileCache(data: { items: NewsItem[]; ts: number }) {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(data)) } catch { /* ignore */ }
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function extractYouTubeId(url: string): string | undefined {
  const patterns = [
    /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return undefined
}

const SOURCES: { key: string; type: NewsItem['source_type']; category: NewsCategory; url: string; filterIndonesia?: boolean }[] = [
  {
    key: 'gnews_diaspora',
    type: 'indonesia', category: 'diaspora',
    url: 'https://news.google.com/rss/search?q=orang+indonesia+luar+negeri+OR+wni+luar+negeri+OR+diaspora+indonesia&hl=id&gl=ID&ceid=ID:id',
  },
  {
    key: 'gnews_mendunia',
    type: 'indonesia', category: 'prestasi',
    url: 'https://news.google.com/rss/search?q=indonesia+mendunia+OR+bangga+indonesia+OR+wakili+indonesia+internasional+OR+juara+dunia+indonesia&hl=id&gl=ID&ceid=ID:id',
  },
  {
    key: 'gnews_prestasi',
    type: 'indonesia', category: 'prestasi',
    url: 'https://news.google.com/rss/search?q=mahasiswa+indonesia+oxford+harvard+cambridge+beasiswa+luar+negeri&hl=id&gl=ID&ceid=ID:id',
  },
  {
    key: 'gnews_budaya',
    type: 'indonesia', category: 'budaya',
    url: 'https://news.google.com/rss/search?q=budaya+seni+musik+indonesia+internasional+OR+mendunia+OR+diakui+dunia&hl=id&gl=ID&ceid=ID:id',
  },
  {
    key: 'gnews_kuliner',
    type: 'indonesia', category: 'budaya',
    url: 'https://news.google.com/rss/search?q=makanan+kuliner+indonesia+mendunia+OR+warung+indonesia+luar+negeri+OR+chef+indonesia+internasional&hl=id&gl=ID&ceid=ID:id',
  },
  {
    key: 'gnews_viral',
    type: 'social', category: 'viral',
    url: 'https://news.google.com/rss/search?q=viral+indonesia+tiktok+OR+instagram+OR+youtube+luar+negeri+OR+dunia&hl=id&gl=ID&ceid=ID:id',
  },
  {
    key: 'youtube_creator',
    type: 'social', category: 'viral',
    url: 'https://news.google.com/rss/search?q=konten+creator+indonesia+viral+youtube+OR+tiktok+luar+negeri+internasional&hl=id&gl=ID&ceid=ID:id',
  },
  {
    key: 'youtube_video_indo',
    type: 'social', category: 'viral',
    url: 'https://news.google.com/rss/search?q=video+indonesia+mendunia+youtube+viral+OR+ditonton+jutaan&hl=id&gl=ID&ceid=ID:id',
  },
  {
    key: 'bbc_asia',
    type: 'international', category: 'internasional',
    url: 'https://feeds.bbci.co.uk/news/world/asia/rss.xml',
    filterIndonesia: true,
  },
  {
    key: 'aljazeera',
    type: 'international', category: 'internasional',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    filterIndonesia: true,
  },
  {
    key: 'cna_asia',
    type: 'international', category: 'internasional',
    url: 'https://www.channelnewsasia.com/rssfeeds/8395986',
    filterIndonesia: true,
  },
  {
    key: 'reuters_world',
    type: 'international', category: 'internasional',
    url: 'https://feeds.reuters.com/reuters/worldNews',
    filterIndonesia: true,
  },
  {
    key: 'gnews_intl',
    type: 'international', category: 'internasional',
    url: 'https://news.google.com/rss/search?q=indonesia&hl=en&gl=US&ceid=US:en',
    filterIndonesia: false,
  },
]

const INDONESIA_KEYWORDS = /\b(indonesia|indonesian|jakarta|bali|java|javanese|balinese|sumatra|papua|jawa|batik|gamelan|wayang|rendang|nasi goreng|mie goreng|jokowi|prabowo)\b/i

function hashId(source: string, url: string): string {
  const s = source + url
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i)
  return 'n' + (h >>> 0).toString(36)
}

async function fetchSource(src: typeof SOURCES[0]): Promise<NewsItem[]> {
  const signal = AbortSignal.timeout(7000)
  const res = await fetch(src.url, { signal, cache: 'no-store', headers: { 'User-Agent': UA } })
  const xml = await res.text()
  if (!xml || xml.length < 50) return []

  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false })
  const parsed = parser.parse(xml)
  const rawItems = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? []
  const items: Record<string, unknown>[] = Array.isArray(rawItems) ? rawItems : [rawItems]
  const now = new Date().toISOString()

  return items
    .slice(0, 20)
    .map(item => {
      const url = String(item.link ?? item.id ?? item.url ?? '').trim()
      const title = String(item.title ?? '').replace(/<[^>]+>/g, '').trim()
      const summary = String(item.description ?? item.summary ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 400)
      const video_id = extractYouTubeId(url)
      return {
        id: hashId(src.key, url),
        source: src.key,
        source_type: src.type,
        category: src.category,
        title,
        summary,
        url,
        published_at: item.pubDate ? new Date(String(item.pubDate)).toISOString() : now,
        fetched_at: now,
        relevance_score: null,
        ...(video_id ? { video_id } : {}),
      } satisfies NewsItem
    })
    .filter(it => {
      if (it.title.length < 5 || !it.url) return false
      if (src.filterIndonesia) {
        return INDONESIA_KEYWORDS.test(it.title) || INDONESIA_KEYWORDS.test(it.summary)
      }
      return true
    })
}

export async function GET(req: Request) {
  const forceRefresh = new URL(req.url).searchParams.get('refresh') === '1'
  const existing = readFileCache()

  // Only use cache if it has items (empty cache = sources were down when written)
  if (!forceRefresh && existing && existing.items.length > 0 && Date.now() - existing.ts < NEWS_TTL) {
    return NextResponse.json({ items: existing.items, cached_at: existing.ts })
  }

  const results = await Promise.allSettled(SOURCES.map(fetchSource))
  const newItems: NewsItem[] = []
  results.forEach(r => {
    if (r.status !== 'fulfilled') return
    r.value.forEach(item => newItems.push(item))
  })

  // If all sources failed, serve existing cache without updating timestamp
  if (newItems.length === 0 && existing && existing.items.length > 0) {
    return NextResponse.json({ items: existing.items, cached_at: existing.ts })
  }

  // Merge new items with previous cache — old articles are never discarded
  const seen = new Set<string>()
  const merged: NewsItem[] = []

  for (const item of newItems) {
    const key = item.url.replace(/[?#].*$/, '').toLowerCase()
    if (key && !seen.has(key)) { seen.add(key); merged.push(item) }
  }
  for (const item of existing?.items ?? []) {
    const key = item.url.replace(/[?#].*$/, '').toLowerCase()
    if (key && !seen.has(key)) { seen.add(key); merged.push(item) }
  }

  merged.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())

  const items = merged.slice(0, MAX_ITEMS)
  const ts = Date.now()
  if (items.length > 0) writeFileCache({ items, ts })
  return NextResponse.json({ items, cached_at: ts })
}
