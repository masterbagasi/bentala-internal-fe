import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  isEffectiveSuperAdmin,
  sectionForPath,
  firstAllowedLanding,
  normaliseSections,
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

  // ── Per-account menu access gate ──────────────────────────────
  // The super admin (lib/access.ts) bypasses everything. Every other account
  // may only enter routes whose section is in their `menu_access` row. Default
  // is DENY: an account with no row sees nothing. Disallowed routes redirect to
  // the account's first allowed section, or /no-access if they have none.
  if (user && !isPublic && !isEffectiveSuperAdmin(user.email, user.app_metadata?.role)) {
    // /no-access is the dead-end for access-less accounts — always reachable so
    // we don't bounce them in a loop.
    if (pathname === '/no-access') {
      return response
    }

    // Read the account's allowed sections. RLS restricts this to their own row.
    let allowed: string[] = []
    let readFailed = false
    try {
      const { data, error } = await supabase
        .from('menu_access')
        .select('sections')
        .limit(1)
        .maybeSingle()
      if (error) readFailed = true
      else allowed = normaliseSections((data as { sections?: unknown } | null)?.sections)
    } catch {
      readFailed = true
    }

    const redirectTo = (target: string) => {
      const url = request.nextUrl.clone()
      url.search = ''
      url.pathname = target
      return NextResponse.redirect(url)
    }

    // The access-management page is super-admin only — never reachable here.
    if (pathname === '/settings/access' || pathname.startsWith('/settings/access/')) {
      return redirectTo(firstAllowedLanding(allowed) ?? '/no-access')
    }

    // Fail CLOSED on a read error so a DB blip can't open access.
    if (readFailed) {
      return redirectTo('/no-access')
    }

    const section = sectionForPath(pathname)
    if (section !== null && !allowed.includes(section)) {
      const target = firstAllowedLanding(allowed) ?? '/no-access'
      // Guard against redirecting a path to itself (no-op → loop).
      if (target !== pathname) return redirectTo(target)
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
