import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { XMLParser } from 'fast-xml-parser'
import fs from 'fs'
import path from 'path'
import os from 'os'

const CACHE_FILE = path.join(os.tmpdir(), 'bentala-related-images.json')
const TTL = 24 * 60 * 60 * 1000 // 24 hours
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

interface CacheEntry { images: string[]; ts: number }
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

function absoluteUrl(src: string | undefined, base: string): string | null {
  if (!src) return null
  try { return new URL(src, base).toString() } catch { return null }
}

// Decode Google News /rss/articles/CBMi... URL via batchexecute (same approach as article-preview)
async function resolveGoogleNewsRedirect(url: string): Promise<string> {
  if (!url.includes('news.google.com')) return url
  try {
    const pageRes = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(6000),
    })
    const html = await pageRes.text()
    const sig = html.match(/data-n-a-sg="([^"]+)"/)?.[1]
    const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1]
    const id = html.match(/data-n-a-id="([^"]+)"/)?.[1]

    if (!sig || !ts || !id) return url

    const innerReq = JSON.stringify([
      'garturlreq',
      [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [9, 1, 1], 1, 1, null, 0, 0, null, 0],
      id, Number(ts), sig,
    ])
    const fReq = JSON.stringify([[['Fbv4je', innerReq, null, 'generic']]])

    const decodeRes = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je', {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ 'f.req': fReq }).toString(),
      signal: AbortSignal.timeout(6000),
    })
    const text = await decodeRes.text()
    const jsonStart = text.indexOf('[')
    const body = jsonStart >= 0 ? text.slice(jsonStart) : text
    const matches = body.match(/https?:\/\/[^"\\\s]+/g) ?? []
    return matches.find(u => !u.includes('google.com') && !u.includes('gstatic.com')) ?? url
  } catch {
    return url
  }
}

async function fetchOgImage(url: string): Promise<string | null> {
  try {
    const finalUrl = await resolveGoogleNewsRedirect(url)
    const res = await fetch(finalUrl, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(7000),
    })
    if (!res.ok) return null
    const html = await res.text()
    const $ = cheerio.load(html)
    const ogImage = $('meta[property="og:image"]').attr('content')
      || $('meta[name="twitter:image"]').attr('content')
      || $('meta[property="og:image:secure_url"]').attr('content')
    if (!ogImage) return null
    return absoluteUrl(ogImage, finalUrl)
  } catch {
    return null
  }
}

export async function GET(req: Request) {
  const topic = new URL(req.url).searchParams.get('topic')
  if (!topic || topic.length < 3) {
    return NextResponse.json({ error: 'topic required (min 3 chars)' }, { status: 400 })
  }

  const cacheKey = topic.toLowerCase().trim()
  const cache = readCache()
  const cached = cache[cacheKey]
  if (cached && Date.now() - cached.ts < TTL) {
    return NextResponse.json({ images: cached.images, cached: true })
  }

  try {
    // Search Google News RSS in Indonesian locale
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=id&gl=ID&ceid=ID:id`
    const rssRes = await fetch(rssUrl, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8000),
    })
    if (!rssRes.ok) {
      return NextResponse.json({ images: [], error: 'rss fetch failed' })
    }

    const xml = await rssRes.text()
    const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false })
    const parsed = parser.parse(xml)
    const rawItems = parsed?.rss?.channel?.item ?? []
    const items: Array<Record<string, unknown>> = Array.isArray(rawItems) ? rawItems : [rawItems]

    const articleUrls = items
      .slice(0, 12)
      .map(it => String(it.link ?? it.id ?? '').trim())
      .filter(u => u.startsWith('http'))

    // Parallel fetch og:image for each article (timeout per request)
    const results = await Promise.allSettled(articleUrls.map(fetchOgImage))
    const images: string[] = []
    const seen = new Set<string>()
    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value) continue
      const img = r.value
      if (seen.has(img)) continue
      // Skip obvious placeholders / icons
      if (/\b(favicon|sprite|icon|logo|placeholder)\b/i.test(img)) continue
      if (img.startsWith('data:')) continue
      seen.add(img)
      images.push(img)
    }

    cache[cacheKey] = { images, ts: Date.now() }
    // Trim to latest 100 entries
    const entries = Object.entries(cache).sort((a, b) => b[1].ts - a[1].ts).slice(0, 100)
    writeCache(Object.fromEntries(entries))

    return NextResponse.json({ images, cached: false })
  } catch (err) {
    console.error('[/api/ai/related-images]', err)
    return NextResponse.json({ images: [], error: 'fetch error' }, { status: 500 })
  }
}
