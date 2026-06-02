import fs from 'fs'
import path from 'path'
import os from 'os'

const CACHE_FILE = path.join(os.tmpdir(), 'bentala-yt-context-cache.json')
const TTL = 7 * 24 * 60 * 60 * 1000 // 7 days

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export interface VideoContext {
  description: string
  transcript: string | null
  transcript_lang: string | null
  channel_title: string
  view_count: string
  like_count: string
  duration: string
  published_at: string
  tags: string[]
}

interface CacheEntry { data: VideoContext; ts: number }
type Cache = Record<string, CacheEntry>

function readCache(): Cache {
  try {
    if (!fs.existsSync(CACHE_FILE)) return {}
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))
  } catch { return {} }
}

function writeCache(c: Cache) {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(c)) } catch { /* ignore */ }
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, ' ')
}

interface CaptionTrack {
  baseUrl?: string
  languageCode?: string
  kind?: string
  name?: { simpleText?: string }
}

// Fetch the YouTube watch page and extract auto-generated or manual captions.
// No API key needed — uses public timedtext endpoint.
async function fetchTranscript(videoId: string): Promise<{ text: string; lang: string } | null> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=id`, {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const html = await res.text()

    const match = html.match(/"captionTracks":(\[[^\]]+\])(?=,")/)
    if (!match) return null

    let tracks: CaptionTrack[]
    try {
      tracks = JSON.parse(match[1]) as CaptionTrack[]
    } catch {
      return null
    }
    if (!Array.isArray(tracks) || tracks.length === 0) return null

    // Priority: Indonesian manual → Indonesian auto → English manual → English auto → first available
    const pickTrack = (langs: string[], kind?: string) =>
      tracks.find(t => t.languageCode && langs.includes(t.languageCode) && (kind ? t.kind === kind : t.kind !== 'asr')) ||
      tracks.find(t => t.languageCode && langs.includes(t.languageCode))

    const track =
      pickTrack(['id'], undefined) ||
      pickTrack(['en'], undefined) ||
      tracks[0]

    if (!track?.baseUrl) return null

    const captionRes = await fetch(track.baseUrl, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(6000),
    })
    if (!captionRes.ok) return null
    const xml = await captionRes.text()

    const segments: string[] = []
    const segmentMatches = xml.split(/<text[^>]*>/).slice(1)
    for (const part of segmentMatches) {
      const closeIdx = part.indexOf('</text>')
      if (closeIdx === -1) continue
      const inner = part.slice(0, closeIdx)
      const cleaned = decodeHtmlEntities(inner)
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      if (cleaned) segments.push(cleaned)
    }

    if (segments.length === 0) return null

    // Dedupe consecutive identical segments (common with auto-captions)
    const deduped: string[] = []
    for (const s of segments) {
      if (deduped[deduped.length - 1] !== s) deduped.push(s)
    }

    const text = deduped.join(' ').trim()
    return text.length > 30 ? { text, lang: track.languageCode ?? 'unknown' } : null
  } catch {
    return null
  }
}

interface YTVideoSnippet {
  description?: string
  channelTitle?: string
  publishedAt?: string
  tags?: string[]
}

interface YTVideoStatistics {
  viewCount?: string
  likeCount?: string
}

interface YTVideoContentDetails {
  duration?: string
}

interface YTVideoItem {
  snippet?: YTVideoSnippet
  statistics?: YTVideoStatistics
  contentDetails?: YTVideoContentDetails
}

async function fetchVideoDetails(videoId: string, apiKey: string): Promise<Omit<VideoContext, 'transcript' | 'transcript_lang'> | null> {
  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos')
    url.searchParams.set('part', 'snippet,statistics,contentDetails')
    url.searchParams.set('id', videoId)
    url.searchParams.set('key', apiKey)

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const data = await res.json() as { items?: YTVideoItem[] }
    const item = data.items?.[0]
    if (!item) return null

    return {
      description: item.snippet?.description ?? '',
      channel_title: item.snippet?.channelTitle ?? '',
      view_count: item.statistics?.viewCount ?? '',
      like_count: item.statistics?.likeCount ?? '',
      duration: item.contentDetails?.duration ?? '',
      published_at: item.snippet?.publishedAt ?? '',
      tags: item.snippet?.tags ?? [],
    }
  } catch {
    return null
  }
}

// Format ISO 8601 duration (PT4M13S) to readable form (4m 13s)
export function formatDuration(iso: string): string {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return iso
  const [, h, mins, s] = m
  const parts = []
  if (h) parts.push(`${h}h`)
  if (mins) parts.push(`${mins}m`)
  if (s) parts.push(`${s}s`)
  return parts.join(' ') || '0s'
}

export async function fetchVideoFullContext(videoId: string, apiKey: string): Promise<VideoContext | null> {
  const cache = readCache()
  const cached = cache[videoId]
  if (cached && Date.now() - cached.ts < TTL) return cached.data

  const [details, transcript] = await Promise.all([
    fetchVideoDetails(videoId, apiKey),
    fetchTranscript(videoId),
  ])

  if (!details) return null

  const data: VideoContext = {
    ...details,
    transcript: transcript?.text ?? null,
    transcript_lang: transcript?.lang ?? null,
  }

  cache[videoId] = { data, ts: Date.now() }
  // Keep latest 100 entries
  const entries = Object.entries(cache).sort((a, b) => b[1].ts - a[1].ts).slice(0, 100)
  writeCache(Object.fromEntries(entries))

  return data
}
