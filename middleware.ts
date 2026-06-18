import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  isEffectiveSuperAdmin,
  sectionForPath,
  firstAllowedLanding,
  normaliseSections,
  chatRoomFromPath,
  canAccessChat,
} from '@/lib/access'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Public routes (no auth required)
  const publicRoutes = ['/login']
  const isPublic = publicRoutes.some((r) => pathname.startsWith(r))

  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // IMPORTANT: keep Supabase signup DISABLED (Dashboard → Authentication
  // → Settings → Sign Ups) so only accounts added via the Supabase UI can log
  // in. Otherwise anyone with a valid email could sign up and gain access.

  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // API routes are authenticated by getUser() above and self-gate their data via
  // RLS + per-route checks. The section gate below is for PAGE navigations only
  // (sectionForPath never matches /api), so skip its extra menu_access query on
  // every API call — a meaningful win since the dashboard fires many API calls.
  if (pathname.startsWith('/api/')) {
    return response
  }

  // ── Per-account menu access gate ──────────────────────────────
  // EVERY account (including super admins) may only enter routes whose section
  // is in their `menu_access` row — so the grants actually take effect. Two
  // safeties keep a super admin from ever locking themselves out:
  //   1. A super admin with NO row yet (unconfigured) bypasses the gate.
  //   2. A super admin can ALWAYS reach /settings/access (the escape hatch) to
  //      re-grant. Default for everyone else is DENY (no row → nothing).
  if (user && !isPublic) {
    // /no-access is the dead-end for access-less accounts — always reachable so
    // we don't bounce them in a loop.
    if (pathname === '/no-access') {
      return response
    }

    const isSuper = isEffectiveSuperAdmin(user.email, user.app_metadata?.role)
    const isAccessPage = pathname === '/settings/access' || pathname.startsWith('/settings/access/')

    // Escape hatch: a super admin can always open Manage Access (no DB read).
    if (isSuper && isAccessPage) {
      return response
    }

    // Read the account's allowed sections. RLS restricts this to their own row.
    let row: { sections?: unknown } | null = null
    let readFailed = false
    try {
      const { data, error } = await supabase
        .from('menu_access')
        .select('sections')
        .limit(1)
        .maybeSingle()
      if (error) readFailed = true
      else row = (data as { sections?: unknown } | null) ?? null
    } catch {
      readFailed = true
    }
    const allowed = normaliseSections(row?.sections)

    const redirectTo = (target: string) => {
      const url = request.nextUrl.clone()
      url.search = ''
      url.pathname = target
      return NextResponse.redirect(url)
    }

    // Fail CLOSED on a read error so a DB blip can't open access.
    if (readFailed) {
      return redirectTo('/no-access')
    }

    // Unconfigured super admin (no row) → full access until grants are saved.
    if (isSuper && row === null) {
      return response
    }

    // Manage Access is super-admin only — non-supers can never reach it.
    if (isAccessPage) {
      return redirectTo(firstAllowedLanding(allowed) ?? '/no-access')
    }

    const chatRoom = chatRoomFromPath(pathname)
    if (chatRoom !== null) {
      if (!canAccessChat(allowed, chatRoom)) {
        const target = firstAllowedLanding(allowed) ?? '/no-access'
        if (target !== pathname) return redirectTo(target)
      }
    } else {
      const section = sectionForPath(pathname)
      if (section !== null && !allowed.includes(section)) {
        const target = firstAllowedLanding(allowed) ?? '/no-access'
        // Guard against redirecting a path to itself (no-op → loop).
        if (target !== pathname) return redirectTo(target)
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
