import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { XMLParser } from 'fast-xml-parser'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { getFeatureConfig, hasUserConfiguredFeature } from '@/lib/ai-features'
import { generateImage, type ImageProvider } from '@/lib/image-gen'

const CACHE_FILE = path.join(os.tmpdir(), 'bentala-slide-image-cache.json')
const TTL = 24 * 60 * 60 * 1000
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

interface CacheEntry {
  results: { image: string; source: string; final_url: string }[]
  ts: number
}
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

async function resolveGoogleNewsRedirect(url: string): Promise<string> {
  if (!url.includes('news.google.com')) return url
  try {
    const pageRes = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) })
    const html = await pageRes.text()
    const sig = html.match(/data-n-a-sg="([^"]+)"/)?.[1]
    const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1]
    const id = html.match(/data-n-a-id="([^"]+)"/)?.[1]
    if (!sig || !ts || !id) return url

    const innerReq = JSON.stringify(['garturlreq', [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [9, 1, 1], 1, 1, null, 0, 0, null, 0], id, Number(ts), sig])
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

async function fetchOgImageWithSource(url: string): Promise<{ image: string; source: string; final_url: string } | null> {
  try {
    const finalUrl = await resolveGoogleNewsRedirect(url)
    const res = await fetch(finalUrl, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8' },
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
    const abs = absoluteUrl(ogImage, finalUrl)
    if (!abs) return null
    const siteName = $('meta[property="og:site_name"]').attr('content')
      || new URL(finalUrl).hostname.replace(/^www\./, '')
    return { image: abs, source: siteName, final_url: finalUrl }
  } catch {
    return null
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const query = url.searchParams.get('query')
  const exclude = (url.searchParams.get('exclude') ?? '').split(',').filter(Boolean)
  // ?force=news — caller can force Google News even if AI gen is configured
  const forceNews = url.searchParams.get('force') === 'news'

  if (!query || query.length < 3) {
    return NextResponse.json({ error: 'query required' }, { status: 400 })
  }

  // ─── AI generation path ───
  // If user has explicitly configured `bpi-carousel-images` to a provider with
  // a valid key, generate the slide image with that provider instead of
  // searching Google News. Falls back to news search on any error.
  if (!forceNews && await hasUserConfiguredFeature('bpi-carousel-images')) {
    try {
      const cfg = await getFeatureConfig('bpi-carousel-images')
      if (cfg.apiKey && (['leonardo', 'openai', 'stability', 'higgsfield'] as const).includes(cfg.provider as ImageProvider)) {
        const { url: imageUrl, provider } = await generateImage({
          provider: cfg.provider as ImageProvider,
          prompt: query,
          aspectRatio: '4:5',
          size: '1024x1024',
        })
        return NextResponse.json({
          image: imageUrl,
          source: `AI: ${provider}`,
          final_url: null,
          generated: true,
        })
      }
    } catch (err) {
      console.warn('[/api/ai/slide-image] AI gen failed, fallback to news search:', err)
      // Fall through to Google News search below
    }
  }

  const cacheKey = query.toLowerCase().trim()
  const cache = readCache()
  const cached = cache[cacheKey]
  let pool: CacheEntry['results'] = cached && Date.now() - cached.ts < TTL ? cached.results : []

  if (pool.length === 0) {
    try {
      const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=id&gl=ID&ceid=ID:id`
      const rssRes = await fetch(rssUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) })
      if (!rssRes.ok) {
        return NextResponse.json({ image: null, source: null })
      }
      const xml = await rssRes.text()
      const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false })
      const parsed = parser.parse(xml)
      const rawItems = parsed?.rss?.channel?.item ?? []
      const items: Array<Record<string, unknown>> = Array.isArray(rawItems) ? rawItems : [rawItems]
      const articleUrls = items.slice(0, 8).map(it => String(it.link ?? '').trim()).filter(u => u.startsWith('http'))

      const results = await Promise.allSettled(articleUrls.map(fetchOgImageWithSource))
      const seen = new Set<string>()
      pool = []
      for (const r of results) {
        if (r.status !== 'fulfilled' || !r.value) continue
        if (seen.has(r.value.image)) continue
        if (/\b(favicon|sprite|icon|placeholder|logo[-_])\b/i.test(r.value.image)) continue
        seen.add(r.value.image)
        pool.push(r.value)
      }

      cache[cacheKey] = { results: pool, ts: Date.now() }
      const entries = Object.entries(cache).sort((a, b) => b[1].ts - a[1].ts).slice(0, 200)
      writeCache(Object.fromEntries(entries))
    } catch {
      return NextResponse.json({ image: null, source: null })
    }
  }

  // Pick first result not in exclude list
  const excludeSet = new Set(exclude)
  const picked = pool.find(p => !excludeSet.has(p.image)) ?? pool[0] ?? null

  if (!picked) {
    return NextResponse.json({ image: null, source: null })
  }

  return NextResponse.json({
    image: picked.image,
    source: picked.source,
    final_url: picked.final_url,
  })
}
