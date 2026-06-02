import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import os from 'os'
import type { NewsItem, NewsCategory } from '@/lib/types'
import { getProviderApiKey } from '@/lib/ai-config'

const CACHE_FILE = path.join(os.tmpdir(), 'bentala-yt-cache.json')
const YT_TTL = 30 * 60 * 1000
const MAX_ITEMS = 300

function readFileCache(): { items: NewsItem[]; ts: number } | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))
  } catch { return null }
}

function writeFileCache(data: { items: NewsItem[]; ts: number }) {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(data)) } catch { /* ignore */ }
}

interface YTSnippet {
  title: string
  description: string
  channelTitle: string
  publishedAt: string
  thumbnails: { high?: { url: string }; medium?: { url: string } }
}

interface YTItem {
  id: { videoId: string }
  snippet: YTSnippet
}

const SEARCHES: { query: string; category: NewsCategory }[] = [
  { query: 'orang indonesia viral luar negeri kehidupan', category: 'diaspora' },
  { query: 'WNI diaspora indonesia abroad experience', category: 'diaspora' },
  { query: 'prestasi indonesia internasional juara dunia olimpiade', category: 'prestasi' },
  { query: 'mahasiswa indonesia beasiswa luar negeri oxford cambridge', category: 'prestasi' },
  { query: 'budaya seni musik indonesia mendunia diakui dunia', category: 'budaya' },
  { query: 'makanan kuliner indonesia restoran luar negeri chef', category: 'budaya' },
  { query: 'indonesia creator viral tiktok youtube dunia internasional', category: 'viral' },
]

function hashId(videoId: string): string {
  let h = 5381
  for (let i = 0; i < videoId.length; i++) h = ((h << 5) + h) ^ videoId.charCodeAt(i)
  return 'y' + (h >>> 0).toString(36)
}

async function searchYouTube(query: string, category: NewsCategory, apiKey: string): Promise<NewsItem[]> {
  const url = new URL('https://www.googleapis.com/youtube/v3/search')
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('q', query)
  url.searchParams.set('type', 'video')
  url.searchParams.set('maxResults', '6')
  url.searchParams.set('order', 'date')
  url.searchParams.set('key', apiKey)

  const res = await fetch(url.toString(), {
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return []

  const data = await res.json()
  const now = new Date().toISOString()

  return (data.items ?? []).map((item: YTItem): NewsItem => ({
    id: hashId(item.id.videoId),
    source: 'youtube',
    source_type: 'social',
    category,
    title: item.snippet.title,
    summary: (item.snippet.description ?? '').slice(0, 400),
    url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    published_at: item.snippet.publishedAt ?? now,
    fetched_at: now,
    relevance_score: null,
    video_id: item.id.videoId,
    channel_title: item.snippet.channelTitle,
  }))
}

export async function GET(req: Request) {
  const apiKey = await getProviderApiKey('youtube')
  if (!apiKey) {
    return NextResponse.json({ error: 'YouTube API key tidak terkonfigurasi. Atur di Settings → AI Integrations.' }, { status: 503 })
  }

  const forceRefresh = new URL(req.url).searchParams.get('refresh') === '1'
  const existing = readFileCache()

  // Only use cache if it actually has items (empty cache = quota was exhausted when written)
  if (!forceRefresh && existing && existing.items.length > 0 && Date.now() - existing.ts < YT_TTL) {
    return NextResponse.json({ items: existing.items, cached_at: existing.ts })
  }

  try {
    const results = await Promise.allSettled(
      SEARCHES.map(s => searchYouTube(s.query, s.category, apiKey))
    )

    const newItems: NewsItem[] = []
    results.forEach(r => {
      if (r.status !== 'fulfilled') return
      r.value.forEach(item => { if (item.video_id) newItems.push(item) })
    })

    // If API returned nothing (quota exhausted / network error), serve existing cache
    if (newItems.length === 0) {
      if (existing && existing.items.length > 0) {
        return NextResponse.json({ items: existing.items, cached_at: existing.ts })
      }
      return NextResponse.json({ items: [], cached_at: Date.now() })
    }

    // Merge new videos with previous cache — old videos are never discarded
    const seen = new Set<string>()
    const merged: NewsItem[] = []

    for (const item of newItems) {
      if (!seen.has(item.video_id!)) { seen.add(item.video_id!); merged.push(item) }
    }
    for (const item of existing?.items ?? []) {
      if (item.video_id && !seen.has(item.video_id)) { seen.add(item.video_id); merged.push(item) }
    }

    merged.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())

    const items = merged.slice(0, MAX_ITEMS)
    const ts = Date.now()
    writeFileCache({ items, ts })
    return NextResponse.json({ items, cached_at: ts })
  } catch (err) {
    console.error('[/api/ai/youtube]', err)
    if (existing && existing.items.length > 0) {
      return NextResponse.json({ items: existing.items, cached_at: existing.ts })
    }
    return NextResponse.json({ error: 'Failed to fetch YouTube videos' }, { status: 500 })
  }
}
