import { NextResponse } from 'next/server'

// Platforms serve OpenGraph tags to different crawlers. Try a sequence so
// Instagram/Facebook respond to `facebookexternalhit`, X/Twitter to a real
// browser UA, etc. The first response that yields a usable cover wins.
const USER_AGENTS = [
  'Mozilla/5.0 (compatible; facebookexternalhit/1.1; +http://www.facebook.com/externalhit_uatext.php)',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (compatible; Twitterbot/1.0)',
  'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
  'TelegramBot (like TwitterBot)',
]

const MAX_HTML_BYTES = 1024 * 1024
const FETCH_TIMEOUT_MS = 12000

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h === '0.0.0.0') return true
  if (h.endsWith('.local') || h.endsWith('.localhost')) return true
  if (/^127\./.test(h)) return true
  if (/^10\./.test(h)) return true
  if (/^192\.168\./.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true
  if (/^169\.254\./.test(h)) return true
  if (/^::1$/.test(h)) return true
  if (/^fe80:/i.test(h)) return true
  return false
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
}

function extractMeta(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name|itemprop)\\s*=\\s*["']${escaped}["'][^>]*?content\\s*=\\s*["']([^"']+)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]*?(?:property|name|itemprop)\\s*=\\s*["']${escaped}["']`,
      'i',
    ),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m) return decodeHtmlEntities(m[1])
  }
  return null
}

// Plain <title> tag — last-resort name source. Google Drive file pages put the
// filename here ("filename.ext - Google Drive"); the client strips the suffix.
function extractTitleTag(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return m ? decodeHtmlEntities(m[1].trim()) || null : null
}

function findImageInJson(node: unknown): string | null {
  if (!node) return null
  if (typeof node === 'string' && /^https?:\/\/[^\s"']+\.(?:jpg|jpeg|png|webp|gif)/i.test(node))
    return node
  if (Array.isArray(node)) {
    for (const item of node) {
      const f = findImageInJson(item)
      if (f) return f
    }
    return null
  }
  if (typeof node === 'object') {
    const rec = node as Record<string, unknown>
    for (const key of ['thumbnail_url', 'thumbnailUrl', 'display_url', 'image']) {
      const v = rec[key]
      if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v
      if (v && typeof v === 'object') {
        const f = findImageInJson(v)
        if (f) return f
      }
    }
    if (rec.contentUrl && typeof rec.contentUrl === 'string')
      return rec.contentUrl
    if (rec['@graph']) {
      const f = findImageInJson(rec['@graph'])
      if (f) return f
    }
  }
  return null
}

function extractJsonLdImage(html: string): string | null {
  const blocks = html.match(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )
  if (!blocks) return null
  for (const block of blocks) {
    const inner = block.replace(/^[\s\S]*?>/, '').replace(/<\/script>\s*$/i, '')
    try {
      const data: unknown = JSON.parse(inner)
      const found = findImageInJson(data)
      if (found) return found
    } catch {
      // ignore malformed blocks
    }
  }
  return null
}

// Instagram's /embed/ HTML embeds the post JSON inside a <script>, but it is
// escaped — keys and values look like  \"display_url\":\"https:\/\/…\"  — so a
// regex expecting literal quotes finds nothing. Match the key with optional
// backslashes around the quotes, then JSON-unescape the captured URL.
function extractInlineJsonImage(html: string): string | null {
  const re = /\\?"(?:display_url|image_url|thumbnail_url|thumbnail_src)\\?"\s*:\s*\\?"([^"]+?)\\?"/i
  const m = html.match(re)
  if (!m) return null
  return m[1]
    .replace(/\\u([\da-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\/g, '')
}

function absoluteUrl(maybeRelative: string, base: URL): string | null {
  try {
    return new URL(maybeRelative, base).toString()
  } catch {
    return null
  }
}

interface OgResult {
  thumbnail_url: string | null
  video_url: string | null
  title: string | null
  og_type: string | null
  source: string
}

function extractYoutubeId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, '')
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0]
    return id || null
  }
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (url.pathname === '/watch') return url.searchParams.get('v')
    const m = url.pathname.match(/^\/(shorts|embed|live)\/([^/]+)/)
    if (m) return m[2]
  }
  return null
}

function youtubeFastPath(url: URL): OgResult | null {
  const id = extractYoutubeId(url)
  if (!id) return null
  return {
    thumbnail_url: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    video_url: null,
    title: null,
    og_type: 'video',
    source: 'youtube-id-pattern',
  }
}

// Many platforms expose an oEmbed endpoint that returns a JSON object with
// `thumbnail_url`. That's far more reliable than scraping HTML — providers
// keep oEmbed working even when they break OpenGraph for crawlers.
const OEMBED_ENDPOINTS: { host: RegExp; build: (url: string) => string }[] = [
  {
    host: /(^|\.)tiktok\.com$/,
    build: (u) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(u)}`,
  },
  {
    host: /(^|\.)vimeo\.com$/,
    build: (u) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(u)}`,
  },
  {
    host: /(^|\.)flickr\.com$/,
    build: (u) =>
      `https://www.flickr.com/services/oembed/?format=json&url=${encodeURIComponent(u)}`,
  },
  {
    host: /(^|\.)soundcloud\.com$/,
    build: (u) =>
      `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(u)}`,
  },
]

async function tryOEmbed(url: URL): Promise<OgResult | null> {
  const provider = OEMBED_ENDPOINTS.find((p) => p.host.test(url.hostname))
  if (!provider) return null
  try {
    const res = await fetch(provider.build(url.toString()), {
      headers: {
        'User-Agent': USER_AGENTS[1],
        Accept: 'application/json,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      thumbnail_url?: string
      title?: string
      type?: string
    }
    if (!data.thumbnail_url) return null
    return {
      thumbnail_url: data.thumbnail_url,
      video_url: null,
      title: data.title ?? null,
      og_type: data.type ?? null,
      source: `oembed:${url.hostname}`,
    }
  } catch {
    return null
  }
}

// Instagram routinely serves a login wall to scrapers but the public /embed/
// route returns a simpler HTML with og tags AND inline JSON containing the
// post's display image.
function instagramEmbedUrl(url: URL): string | null {
  if (!/(^|\.)(instagram\.com|instagr\.am)$/.test(url.hostname)) return null
  const m = url.pathname.match(/\/(p|reel|reels|tv)\/([^/]+)/)
  if (!m) return null
  return `https://www.instagram.com/${m[1]}/${m[2]}/embed/captioned/`
}

// Instagram's media redirect returns the post image straight from the CDN
// (GET /p/<id>/media/?size=l → 302 → ...fbcdn.net/...jpg). This survives the
// login wall far better than scraping the embed HTML — which datacenter IPs
// (e.g. the server this runs on) routinely get served instead of the post.
async function instagramMediaRedirect(url: URL): Promise<OgResult | null> {
  if (!/(^|\.)(instagram\.com|instagr\.am)$/.test(url.hostname)) return null
  const m = url.pathname.match(/\/(p|reel|reels|tv)\/([^/]+)/)
  if (!m) return null
  for (const size of ['l', 'm']) {
    const mediaUrl = `https://www.instagram.com/${m[1]}/${m[2]}/media/?size=${size}`
    try {
      const res = await fetch(mediaUrl, {
        headers: { 'User-Agent': USER_AGENTS[0] },
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      const loc = res.headers.get('location')
      if (loc && /(fbcdn\.net|cdninstagram\.com)/i.test(loc)) {
        return { thumbnail_url: loc, video_url: null, title: null, og_type: null, source: 'instagram-media-redirect' }
      }
    } catch {
      // try the next size / fall through to embed scraping
    }
  }
  return null
}

async function fetchHtml(target: string, ua: string): Promise<string | null> {
  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': ua,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!upstream.ok || !upstream.body) return null
    const reader = upstream.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let html = ''
    let total = 0
    while (total < MAX_HTML_BYTES) {
      const { value, done } = await reader.read()
      if (done) break
      total += value.byteLength
      html += decoder.decode(value, { stream: true })
    }
    try {
      await reader.cancel()
    } catch {
      // closing early is fine
    }
    return html
  } catch {
    return null
  }
}

function parseOg(html: string, base: URL): { thumbnail: string | null; video: string | null; title: string | null; type: string | null } {
  const ogImageRaw =
    extractMeta(html, 'og:image:secure_url') ||
    extractMeta(html, 'og:image:url') ||
    extractMeta(html, 'og:image') ||
    extractMeta(html, 'twitter:image') ||
    extractMeta(html, 'twitter:image:src') ||
    extractMeta(html, 'thumbnailUrl') ||
    extractJsonLdImage(html) ||
    extractInlineJsonImage(html)
  const ogVideoRaw =
    extractMeta(html, 'og:video:secure_url') ||
    extractMeta(html, 'og:video:url') ||
    extractMeta(html, 'og:video') ||
    extractMeta(html, 'twitter:player:stream')
  const ogTitle =
    extractMeta(html, 'og:title') ||
    extractMeta(html, 'twitter:title') ||
    extractTitleTag(html) ||
    null
  const ogType = extractMeta(html, 'og:type') || null
  return {
    thumbnail: ogImageRaw ? absoluteUrl(ogImageRaw, base) : null,
    video: ogVideoRaw ? absoluteUrl(ogVideoRaw, base) : null,
    title: ogTitle,
    type: ogType,
  }
}

async function scrapeWithRetries(targetUrl: URL): Promise<OgResult | null> {
  // Remember the first title-only hit. Some providers (notably Google Drive
  // files) expose no og:image but DO expose the filename as the title — we
  // still want to return that so the link can be labelled with its real name.
  let titleOnly: OgResult | null = null
  for (const ua of USER_AGENTS) {
    const html = await fetchHtml(targetUrl.toString(), ua)
    if (!html) continue
    const parsed = parseOg(html, targetUrl)
    if (parsed.thumbnail) {
      return {
        thumbnail_url: parsed.thumbnail,
        video_url: parsed.video,
        title: parsed.title,
        og_type: parsed.type,
        source: `scrape:${ua.split(' ')[0].replace(/[();]/g, '')}`,
      }
    }
    if (!titleOnly && parsed.title) {
      titleOnly = {
        thumbnail_url: null,
        video_url: parsed.video,
        title: parsed.title,
        og_type: parsed.type,
        source: `scrape-title:${ua.split(' ')[0].replace(/[();]/g, '')}`,
      }
    }
  }
  return titleOnly
}

export async function GET(req: Request) {
  const target = new URL(req.url).searchParams.get('url')
  if (!target) {
    return NextResponse.json({ error: 'url required' }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    return NextResponse.json({ error: 'invalid url' }, { status: 400 })
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return NextResponse.json({ error: 'protocol not allowed' }, { status: 400 })
  }

  if (isBlockedHost(parsed.hostname)) {
    return NextResponse.json({ error: 'host blocked' }, { status: 403 })
  }

  const tried: string[] = []

  // 1. YouTube — derive thumbnail from video ID, no fetch needed.
  const yt = youtubeFastPath(parsed)
  if (yt) return jsonOk(yt)
  tried.push('youtube-id-pattern')

  // 2. oEmbed provider — TikTok, Vimeo, Flickr, SoundCloud.
  const oembed = await tryOEmbed(parsed)
  if (oembed) return jsonOk(oembed)
  tried.push('oembed')

  // 3. Instagram media redirect — the post image straight from the CDN. Tried
  //    before HTML scraping because it survives the login wall datacenters hit.
  const igMedia = await instagramMediaRedirect(parsed)
  if (igMedia) return jsonOk(igMedia)
  tried.push('instagram-media-redirect')

  // 4. Instagram /embed/ — much friendlier to scrapers than the main URL.
  const igEmbed = instagramEmbedUrl(parsed)
  if (igEmbed) {
    const embedUrl = new URL(igEmbed)
    const igResult = await scrapeWithRetries(embedUrl)
    if (igResult)
      return jsonOk({ ...igResult, source: `instagram-embed:${igResult.source}` })
    tried.push('instagram-embed')
  }

  // 4. Generic HTML scrape with rotating UAs.
  const scraped = await scrapeWithRetries(parsed)
  if (scraped) return jsonOk(scraped)
  tried.push('generic-scrape')

  return NextResponse.json(
    {
      thumbnail_url: null,
      video_url: null,
      title: null,
      og_type: null,
      error:
        'no cover image found — the page may be private, require login, or render content client-side. Upload a cover manually below.',
      tried,
    },
    { status: 200 },
  )
}

function jsonOk(result: OgResult) {
  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}
