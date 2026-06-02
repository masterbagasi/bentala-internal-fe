import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import fs from 'fs'
import path from 'path'
import os from 'os'

const CACHE_FILE = path.join(os.tmpdir(), 'bentala-article-cache.json')
const TTL = 6 * 60 * 60 * 1000 // 6 hours
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

interface PreviewData {
  url: string
  final_url: string
  title: string
  image: string | null
  images: string[]  // all extractable images (og + body), capped 12, deduped
  site_name: string | null
  byline: string | null
  content_html: string
  excerpt: string
}

type Cache = Record<string, { data: PreviewData; ts: number }>

function readCache(): Cache {
  try {
    if (!fs.existsSync(CACHE_FILE)) return {}
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))
  } catch { return {} }
}

function writeCache(cache: Cache) {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(cache)) } catch { /* ignore */ }
}

function absoluteUrl(src: string | undefined, base: string): string | null {
  if (!src) return null
  try { return new URL(src, base).toString() } catch { return null }
}

// Google News /rss/articles/CBMi... URLs don't redirect via HTTP — the real URL
// is encoded and must be decoded via their batchexecute RPC endpoint.
async function resolveGoogleNewsRedirect(url: string): Promise<string> {
  if (!url.includes('news.google.com')) return url
  try {
    const pageRes = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8000),
    })
    const html = await pageRes.text()

    const sig = html.match(/data-n-a-sg="([^"]+)"/)?.[1]
    const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1]
    const id = html.match(/data-n-a-id="([^"]+)"/)?.[1]

    if (!sig || !ts || !id) {
      const canon = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1]
      if (canon && !canon.includes('news.google.com')) return canon
      return url
    }

    const innerReq = JSON.stringify([
      'garturlreq',
      [
        ['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1],
        'X', 'X', 1, [9, 1, 1], 1, 1, null, 0, 0, null, 0,
      ],
      id, Number(ts), sig,
    ])
    const fReq = JSON.stringify([[['Fbv4je', innerReq, null, 'generic']]])

    const decodeRes = await fetch(
      'https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je',
      {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: new URLSearchParams({ 'f.req': fReq }).toString(),
        signal: AbortSignal.timeout(8000),
      }
    )
    const text = await decodeRes.text()
    const jsonStart = text.indexOf('[')
    const body = jsonStart >= 0 ? text.slice(jsonStart) : text

    const matches = body.match(/https?:\/\/[^"\\\s]+/g) ?? []
    const external = matches.find(u => !u.includes('google.com') && !u.includes('gstatic.com'))
    return external ?? url
  } catch {
    return url
  }
}

function extractContent($: cheerio.CheerioAPI): string {
  // Try common article selectors in order of specificity
  const candidates = [
    'article',
    '[itemprop="articleBody"]',
    '[class*="article-body"]',
    '[class*="article-content"]',
    '[class*="story-body"]',
    '[class*="post-content"]',
    '[class*="entry-content"]',
    'main',
    '[role="main"]',
  ]

  let bestNode: cheerio.Cheerio<any> | null = null
  let bestLength = 0

  for (const sel of candidates) {
    $(sel).each((_, el) => {
      const $el = $(el)
      const text = $el.text().replace(/\s+/g, ' ').trim()
      if (text.length > bestLength) {
        bestLength = text.length
        bestNode = $el
      }
    })
    if (bestNode && bestLength > 300) break
  }

  if (!bestNode || bestLength < 200) {
    // Fallback: grab all <p> tags
    const paras: string[] = []
    $('p').each((_, el) => {
      const t = $(el).text().trim()
      if (t.length > 40) paras.push(`<p>${escapeHtml(t)}</p>`)
    })
    return paras.join('\n')
  }

  const $node = bestNode as cheerio.Cheerio<any>
  $node.find('script, style, iframe, noscript, button, form, nav, aside, header, footer, [class*="ads" i], [class*="related" i], [class*="newsletter" i], [class*="social" i], [class*="share" i], [id*="comment" i]').remove()
  $node.find('*').each((_, el) => {
    const $el = $(el)
    $el.removeAttr('class')
    $el.removeAttr('id')
    $el.removeAttr('style')
    $el.removeAttr('onclick')
    $el.removeAttr('data-testid')
  })
  return ($node.html() ?? '').trim()
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function sanitizeHtml(html: string, baseUrl: string): string {
  const $ = cheerio.load(`<div>${html}</div>`, null, false)

  // Rewrite relative URLs to absolute
  $('img').each((_, el) => {
    const $img = $(el)
    const src = $img.attr('src') ?? $img.attr('data-src') ?? $img.attr('data-lazy-src')
    const abs = absoluteUrl(src, baseUrl)
    if (abs) $img.attr('src', abs)
    else $img.remove()
    $img.removeAttr('srcset')
    $img.removeAttr('loading')
  })
  $('a').each((_, el) => {
    const $a = $(el)
    const href = $a.attr('href')
    const abs = absoluteUrl(href, baseUrl)
    if (abs) $a.attr('href', abs)
    $a.attr('target', '_blank')
    $a.attr('rel', 'noopener noreferrer')
  })

  // Strip dangerous tags just in case
  $('script, style, iframe, object, embed, form, input, button').remove()

  return $('div').first().html() ?? ''
}

function isBotChallenge(html: string, title: string): boolean {
  const titleLower = title.toLowerCase().trim()
  if (
    titleLower === 'just a moment...' ||
    titleLower === 'just a moment…' ||
    titleLower.startsWith('attention required') ||
    titleLower === 'access denied' ||
    titleLower === 'pardon our interruption' ||
    titleLower === 'please verify you are a human'
  ) return true

  const head = html.slice(0, 8000).toLowerCase()
  return (
    head.includes('cf-browser-verification') ||
    head.includes('challenge-platform') ||
    head.includes('cf_chl_opt') ||
    head.includes('cdn-cgi/challenge') ||
    head.includes('px-captcha') ||
    head.includes('datadome') ||
    head.includes('_incapsula_resource') ||
    /<title[^>]*>\s*just a moment/i.test(head)
  )
}

async function extractPreview(url: string): Promise<PreviewData> {
  const finalUrl = await resolveGoogleNewsRedirect(url)

  const res = await fetch(finalUrl, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Upgrade-Insecure-Requests': '1',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(10000),
  })
  const html = await res.text()
  const $ = cheerio.load(html)

  const meta = (name: string) =>
    $(`meta[property="${name}"]`).attr('content') ||
    $(`meta[name="${name}"]`).attr('content') ||
    null

  const title = meta('og:title') || $('title').first().text().trim() || ''

  if (isBotChallenge(html, title)) {
    const err = new Error('BOT_CHALLENGE')
    ;(err as Error & { code?: string }).code = 'BOT_CHALLENGE'
    throw err
  }

  const image = absoluteUrl(meta('og:image') ?? meta('twitter:image') ?? undefined, finalUrl)
  const siteName = meta('og:site_name') || null
  const byline = meta('author') || meta('article:author') || null
  const description = meta('og:description') || meta('description') || ''

  const images = extractAllImages($, finalUrl, image)

  const rawContent = extractContent($)
  const contentHtml = sanitizeHtml(rawContent, finalUrl)

  return {
    url,
    final_url: finalUrl,
    title,
    image,
    images,
    site_name: siteName,
    byline,
    content_html: contentHtml,
    excerpt: description.slice(0, 300),
  }
}

// Collect all extractable images from the page: og:image, twitter:image, and
// images inside the article body. Filter out icons/logos/avatars/trackers,
// dedupe, cap at 12.
function extractAllImages($: cheerio.CheerioAPI, baseUrl: string, primary: string | null): string[] {
  const out: string[] = []
  const seen = new Set<string>()

  function tryAdd(src: string | null | undefined) {
    if (!src) return
    const abs = absoluteUrl(src, baseUrl)
    if (!abs) return
    if (seen.has(abs)) return
    if (abs.startsWith('data:')) return
    // Filter common junk: icons, logos, sprites, avatars, ads, social, tracking
    if (/\b(favicon|sprite|icon|logo|avatar|tracking|pixel|ad[-_]|placeholder|loader)\b/i.test(abs)) return
    // Filter very-small dimension hints in URL
    if (/[?&](w|width)=[1-9]\d?(?:&|$)/i.test(abs)) return
    seen.add(abs)
    out.push(abs)
  }

  // Primary first
  tryAdd(primary)
  tryAdd($('meta[property="og:image"]').attr('content'))
  tryAdd($('meta[name="twitter:image"]').attr('content'))
  $('meta[property="og:image:secure_url"]').each((_, el) => tryAdd($(el).attr('content')))

  // Article body images — try common selectors in order
  const bodySelectors = [
    'article img',
    '[itemprop="articleBody"] img',
    '[class*="article-body"] img',
    '[class*="article-content"] img',
    '[class*="story-body"] img',
    '[class*="post-content"] img',
    'main img',
    'figure img',
  ]

  for (const sel of bodySelectors) {
    $(sel).each((_, el) => {
      const $el = $(el)
      const src = $el.attr('src') || $el.attr('data-src') || $el.attr('data-lazy-src') || $el.attr('data-original')
      tryAdd(src)
      // srcset best candidate
      const srcset = $el.attr('srcset')
      if (srcset) {
        const candidates = srcset.split(',').map(s => s.trim().split(/\s+/)[0])
        candidates.forEach(tryAdd)
      }
    })
    if (out.length >= 12) break
  }

  return out.slice(0, 12)
}

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })

  const cache = readCache()
  const cached = cache[url]
  if (cached && Date.now() - cached.ts < TTL) {
    return NextResponse.json(cached.data)
  }

  try {
    const data = await extractPreview(url)
    cache[url] = { data, ts: Date.now() }
    // Trim cache to latest 200 entries
    const entries = Object.entries(cache).sort((a, b) => b[1].ts - a[1].ts).slice(0, 200)
    writeCache(Object.fromEntries(entries))
    return NextResponse.json(data)
  } catch (err) {
    const code = (err as Error & { code?: string }).code
    console.error('[/api/ai/article-preview]', url, code ?? err)
    if (code === 'BOT_CHALLENGE') {
      return NextResponse.json(
        { error: 'BOT_CHALLENGE', message: 'Situs ini melindungi konten dengan deteksi bot (Cloudflare/DataDome). Buka di tab baru untuk membaca artikel.' },
        { status: 403 }
      )
    }
    return NextResponse.json({ error: 'Failed to extract article', url }, { status: 500 })
  }
}
