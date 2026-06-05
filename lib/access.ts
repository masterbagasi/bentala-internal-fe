// ── Menu access control — single source of truth ──────────────
//
// Defines which sidebar *sections* exist, how routes map to them, and the
// super-admin allowlist. Imported by:
//   - middleware.ts        (server-side route enforcement)
//   - components/Sidebar.tsx (hide sections the user can't access)
//   - app/api/access/*     (admin management API)
//   - app/(dashboard)/settings/access/* (admin UI)
//
// Access is stored per-account in the `menu_access` Supabase table as an array
// of the section `id`s below. Default is DENY: an account with no row (or an
// empty array) can access nothing until the super admin grants sections.

/**
 * Accounts that can access everything and are the only ones allowed to manage
 * access. Compared case-insensitively against the authenticated email.
 */
export const SUPER_ADMIN_EMAILS = ['dandirivaldi@masterbagasi.com'] as const

export interface AccessSection {
  /** Stable id — matches the section `id` in components/Sidebar.tsx and the
   *  values stored in `menu_access.sections`. */
  id: string
  /** Human label shown in the access-management UI. */
  label: string
  /** Route prefixes that belong to this section. Matched segment-aware
   *  (exact, or prefix followed by `/`) so e.g. `/bpi-faizal` does NOT match
   *  the `/bpi` route. The root `/` matches only the exact root path. */
  routes: string[]
  /** Where to send a user who lands on a blocked route but DOES have this
   *  section — also used to pick a post-login landing. */
  landing: string
}

// Order matters only for picking a deterministic "first allowed landing".
export const ACCESS_SECTIONS: AccessSection[] = [
  { id: 'overview', label: 'Dashboard',       routes: ['/'],                                                              landing: '/' },
  { id: 'website',  label: 'Website',         routes: ['/website/home', '/website/about', '/website/news', '/website/seo', '/website/navbar'], landing: '/website/home' },
  { id: 'smm',      label: 'Socmed Management', routes: ['/bpi', '/bsi'],                                                 landing: '/bpi' },
  { id: 'social',   label: 'Social Media',    routes: ['/social'],                                                        landing: '/social/accounts' },
  { id: 'client',   label: 'Client',          routes: ['/website/leads', '/clients', '/invoices'],                        landing: '/clients' },
  { id: 'projects', label: 'Projects',        routes: ['/projects', '/tasks', '/bpi-faizal', '/bpi-reinaldi', '/pipeline/vp', '/pipeline/ds'], landing: '/projects' },
  { id: 'ai',       label: 'AI Studio',       routes: ['/ai'],                                                            landing: '/ai/chat' },
  { id: 'team',     label: 'Team',            routes: ['/team'],                                                          landing: '/team' },
  { id: 'settings', label: 'Settings',        routes: ['/settings'],                                                      landing: '/settings/ai' },
]

/** All valid section ids — used to sanitise input from the admin API. */
export const ALL_SECTION_IDS: string[] = ACCESS_SECTIONS.map(s => s.id)

export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  const lower = email.toLowerCase()
  return SUPER_ADMIN_EMAILS.some(e => e.toLowerCase() === lower)
}

/** True when `pathname` is within `route`, treating `/` as a path boundary so
 *  `/bpi-faizal` does not match `/bpi`. The root `/` matches only itself. */
function pathMatchesRoute(pathname: string, route: string): boolean {
  if (route === '/') return pathname === '/'
  return pathname === route || pathname.startsWith(route + '/')
}

/**
 * Resolve the access section a given path belongs to. Longest matching route
 * wins so more specific entries (e.g. `/website/leads` → client) beat broader
 * ones. Returns `null` for paths that belong to no managed section — those are
 * not gated.
 */
export function sectionForPath(pathname: string): string | null {
  let bestId: string | null = null
  let bestLen = -1
  for (const section of ACCESS_SECTIONS) {
    for (const route of section.routes) {
      if (pathMatchesRoute(pathname, route) && route.length > bestLen) {
        bestLen = route.length
        bestId = section.id
      }
    }
  }
  return bestId
}

/** Landing path for the first section the user is allowed into, or null when
 *  they have no sections (caller should send them to /no-access). */
export function firstAllowedLanding(allowed: string[]): string | null {
  if (!allowed || allowed.length === 0) return null
  const set = new Set(allowed)
  for (const section of ACCESS_SECTIONS) {
    if (set.has(section.id)) return section.landing
  }
  return null
}

/** Sanitise an arbitrary array into known section ids (drops unknowns/dupes). */
export function normaliseSections(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const valid = new Set(ALL_SECTION_IDS)
  const out: string[] = []
  for (const v of input) {
    if (typeof v === 'string' && valid.has(v) && !out.includes(v)) out.push(v)
  }
  return out
}
