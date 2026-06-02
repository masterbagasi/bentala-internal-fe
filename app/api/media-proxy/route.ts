import { NextResponse } from 'next/server'

// Same-origin proxy for arbitrary image/video URLs. Lets the browser load a
// cross-origin video (e.g. Instagram / TikTok CDN) into a <video> element
// without tainting the canvas, so we can capture a poster frame for the
// portfolio cover. Mirrors image-proxy's SSRF protections but accepts video
// MIME types and forwards Range headers so seeking actually works.

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

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

const ALLOWED_PREFIXES = ['image/', 'video/', 'audio/', 'application/octet-stream']

export async function GET(req: Request) {
  const target = new URL(req.url).searchParams.get('url')
  if (!target) return new NextResponse('url required', { status: 400 })

  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    return new NextResponse('invalid url', { status: 400 })
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return new NextResponse('protocol not allowed', { status: 400 })
  }
  if (isBlockedHost(parsed.hostname)) {
    return new NextResponse('host blocked', { status: 403 })
  }

  const range = req.headers.get('range')
  const headers: Record<string, string> = {
    'User-Agent': UA,
    Accept: 'video/*,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  }
  if (range) headers.Range = range

  try {
    const upstream = await fetch(parsed.toString(), {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    })

    if (!upstream.ok && upstream.status !== 206) {
      return new NextResponse(`upstream ${upstream.status}`, {
        status: upstream.status,
      })
    }

    const contentType = upstream.headers.get('content-type') ?? ''
    if (!ALLOWED_PREFIXES.some((p) => contentType.startsWith(p))) {
      return new NextResponse(`unsupported content-type: ${contentType}`, {
        status: 415,
      })
    }

    const respHeaders: Record<string, string> = {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'Accept-Ranges': 'bytes',
    }
    const contentLength = upstream.headers.get('content-length')
    if (contentLength) respHeaders['Content-Length'] = contentLength
    const contentRange = upstream.headers.get('content-range')
    if (contentRange) respHeaders['Content-Range'] = contentRange

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    })
  } catch (err) {
    console.error('[media-proxy]', target, err)
    return new NextResponse('proxy error', { status: 502 })
  }
}
