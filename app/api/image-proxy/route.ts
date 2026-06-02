import { NextResponse } from 'next/server'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// Basic SSRF protection — block private/local addresses
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h === '0.0.0.0') return true
  if (h.endsWith('.local') || h.endsWith('.localhost')) return true
  if (/^127\./.test(h)) return true
  if (/^10\./.test(h)) return true
  if (/^192\.168\./.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true
  if (/^169\.254\./.test(h)) return true // link-local
  if (/^::1$/.test(h)) return true
  if (/^fe80:/i.test(h)) return true
  return false
}

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

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: {
        'User-Agent': UA,
        'Accept': 'image/*,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    })

    if (!upstream.ok) {
      return new NextResponse(`upstream ${upstream.status}`, { status: upstream.status })
    }

    const contentType = upstream.headers.get('content-type') ?? ''
    if (!contentType.startsWith('image/')) {
      return new NextResponse('not an image', { status: 415 })
    }

    const buffer = await upstream.arrayBuffer()

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'Content-Length': String(buffer.byteLength),
      },
    })
  } catch (err) {
    console.error('[image-proxy]', target, err)
    return new NextResponse('proxy error', { status: 502 })
  }
}
