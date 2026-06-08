// ── Menu access control — single source of truth ──────────────
//
// Access is GRANULAR: one entry per leaf menu item (mirrors the sidebar), so a
// super admin can grant e.g. just "Socmed Management → Bentala Project → Social
// Media". Items are grouped (group / optional subgroup) for the admin UI.
//
// Imported by:
//   - middleware.ts          (server-side route enforcement)
//   - components/Sidebar.tsx  (hide items the user can't access)
//   - app/api/access/*        (admin management API)
//   - app/(dashboard)/settings/access/* (admin UI)
//
// Access is stored per-account in the `menu_access` Supabase table as an array
// of the granular `id`s below. Default is DENY. Legacy top-level ids (e.g.
// 'smm', 'website') stored by older rows are auto-expanded to their children
// (see LEGACY_ALIASES + normaliseSections) so existing grants keep working.

export const SUPER_ADMIN_EMAILS = ['dandirivaldi@masterbagasi.com'] as const

export interface AccessSection {
  /** Stable granular id stored in menu_access.sections. */
  id: string
  /** Leaf label shown in the admin UI (e.g. "Social Media"). */
  label: string
  /** Top-level heading in the admin UI (e.g. "Socmed Management"). */
  group: string
  /** Optional nested heading (e.g. "Bentala Project"). */
  subgroup?: string
  /** Route prefixes that belong to this item. Matched segment-aware (exact, or
   *  prefix followed by `/`). The root `/` matches only the exact root path. */
  routes: string[]
  /** Where to send a user who lands on a blocked route but DOES have this item. */
  landing: string
}

// Order matters only for picking a deterministic "first allowed landing".
export const ACCESS_SECTIONS: AccessSection[] = [
  { id: 'overview', label: 'Dashboard', group: 'Dashboard', routes: ['/'], landing: '/' },

  // Website
  { id: 'website.home',   label: 'Home Page',  group: 'Website', routes: ['/website/home'],   landing: '/website/home' },
  { id: 'website.about',  label: 'About Page', group: 'Website', routes: ['/website/about'],  landing: '/website/about' },
  { id: 'website.news',   label: 'News Page',  group: 'Website', routes: ['/website/news'],   landing: '/website/news' },
  { id: 'website.seo',    label: 'SEO',        group: 'Website', routes: ['/website/seo'],    landing: '/website/seo' },
  { id: 'website.navbar', label: 'Setting',    group: 'Website', routes: ['/website/navbar'], landing: '/website/navbar' },

  // Socmed Management
  { id: 'smm.bpi.social',   label: 'Social Media', group: 'Socmed Management', subgroup: 'Bentala Project', routes: ['/bpi/social'], landing: '/bpi/social' },
  { id: 'smm.bpi.projects', label: 'Projects',     group: 'Socmed Management', subgroup: 'Bentala Project', routes: ['/bpi'],        landing: '/bpi' },
  { id: 'smm.bsi.social',   label: 'Social Media', group: 'Socmed Management', subgroup: 'Bentala Studio',  routes: ['/bsi/social'], landing: '/bsi/social' },
  { id: 'smm.bsi.projects', label: 'Projects',     group: 'Socmed Management', subgroup: 'Bentala Studio',  routes: ['/bsi'],        landing: '/bsi' },

  // Social Media (standalone)
  { id: 'social.accounts',  label: 'Accounts',  group: 'Social Media', routes: ['/social/accounts'],  landing: '/social/accounts' },
  { id: 'social.analytics', label: 'Analytics', group: 'Social Media', routes: ['/social/analytics'], landing: '/social/analytics' },
  { id: 'social.reports',   label: 'Reports',   group: 'Social Media', routes: ['/social/reports'],   landing: '/social/reports' },
  { id: 'social.plan',      label: 'Plan',      group: 'Social Media', routes: ['/social/plan'],      landing: '/social/plan' },

  // Client
  { id: 'client.leads',    label: 'Leads',           group: 'Client', routes: ['/website/leads'], landing: '/website/leads' },
  { id: 'client.crm',      label: 'CRM Pipeline',    group: 'Client', routes: ['/clients'],       landing: '/clients' },
  { id: 'client.invoices', label: 'Invoice & Bayar', group: 'Client', routes: ['/invoices'],      landing: '/invoices' },

  // Projects
  { id: 'projects.all',   label: 'All Projects',     group: 'Projects', routes: ['/projects'],                   landing: '/projects' },
  { id: 'projects.tasks', label: 'Task Board',       group: 'Projects', routes: ['/tasks'],                      landing: '/tasks' },
  { id: 'projects.vp',    label: 'Video Production',  group: 'Projects', routes: ['/bpi-faizal', '/pipeline/vp'], landing: '/bpi-faizal' },
  { id: 'projects.ds',    label: 'Design Studio',     group: 'Projects', routes: ['/bpi-reinaldi', '/pipeline/ds'], landing: '/bpi-reinaldi' },

  // AI Studio
  { id: 'ai.chat',      label: 'Chat AI',          group: 'AI Studio', routes: ['/ai/chat'],         landing: '/ai/chat' },
  { id: 'ai.ideas',     label: 'Pencari Ide',      group: 'AI Studio', routes: ['/ai/ideas'],        landing: '/ai/ideas' },
  { id: 'ai.image',     label: 'Generator Gambar', group: 'AI Studio', routes: ['/ai/image'],        landing: '/ai/image' },
  { id: 'ai.templates', label: 'Template Gambar',  group: 'AI Studio', routes: ['/ai/templates'],    landing: '/ai/templates' },
  { id: 'ai.video',     label: 'Script Video',     group: 'AI Studio', routes: ['/ai/video'],        landing: '/ai/video' },
  { id: 'ai.render',    label: 'Video Render',     group: 'AI Studio', routes: ['/ai/video/render'], landing: '/ai/video/render' },
  { id: 'ai.audio',     label: 'Generator Audio',  group: 'AI Studio', routes: ['/ai/audio'],        landing: '/ai/audio' },
  { id: 'ai.bpi',       label: 'BPI Intelligence', group: 'AI Studio', routes: ['/ai/bpi'],          landing: '/ai/bpi' },

  // Team
  { id: 'team', label: 'Team & Roles', group: 'Team', routes: ['/team'], landing: '/team' },

  // Settings ( /settings/access is super-admin only and gated separately )
  { id: 'settings.ai', label: 'AI Integrations', group: 'Settings', routes: ['/settings/ai'], landing: '/settings/ai' },
]

/** All valid granular ids — used to sanitise input from the admin API. */
export const ALL_SECTION_IDS: string[] = ACCESS_SECTIONS.map(s => s.id)

/** Legacy top-level ids (older menu_access rows) → granular children. Lets old
 *  grants keep working after the move to per-item access. */
const LEGACY_ALIASES: Record<string, string[]> = {
  website:  ['website.home', 'website.about', 'website.news', 'website.seo', 'website.navbar'],
  smm:      ['smm.bpi.social', 'smm.bpi.projects', 'smm.bsi.social', 'smm.bsi.projects'],
  // Pre-merge ids (Bentala Project / Studio were separate sections).
  bpi:      ['smm.bpi.social', 'smm.bpi.projects'],
  bsi:      ['smm.bsi.social', 'smm.bsi.projects'],
  social:   ['social.accounts', 'social.analytics', 'social.reports', 'social.plan'],
  client:   ['client.leads', 'client.crm', 'client.invoices'],
  projects: ['projects.all', 'projects.tasks', 'projects.vp', 'projects.ds'],
  ai:       ['ai.chat', 'ai.ideas', 'ai.image', 'ai.templates', 'ai.video', 'ai.render', 'ai.audio', 'ai.bpi'],
  settings: ['settings.ai'],
  // overview / team granular ids equal their legacy ids — no alias needed.
}

export type Role = 'super_admin' | 'admin' | 'user'

/** Hardcoded super admins (immutable — always super, can't be demoted). */
export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  const lower = email.toLowerCase()
  return SUPER_ADMIN_EMAILS.some(e => e.toLowerCase() === lower)
}

/** Effective super admin = hardcoded OR promoted via menu_access role. */
export function isEffectiveSuperAdmin(email: string | null | undefined, role: unknown): boolean {
  return isSuperAdmin(email) || role === 'super_admin'
}

function pathMatchesRoute(pathname: string, route: string): boolean {
  if (route === '/') return pathname === '/'
  return pathname === route || pathname.startsWith(route + '/')
}

/** Resolve the granular access item a path belongs to. Longest matching route
 *  wins. Returns null for paths that belong to no managed item (not gated). */
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

/** Landing path for the first item the user is allowed into, or null. */
export function firstAllowedLanding(allowed: string[]): string | null {
  if (!allowed || allowed.length === 0) return null
  const set = new Set(allowed)
  for (const section of ACCESS_SECTIONS) {
    if (set.has(section.id)) return section.landing
  }
  return null
}

/** Sanitise an arbitrary array into known granular ids. Legacy top-level ids
 *  are expanded to their children, so existing grants survive the migration. */
export function normaliseSections(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const valid = new Set(ALL_SECTION_IDS)
  const out: string[] = []
  const push = (id: string) => { if (valid.has(id) && !out.includes(id)) out.push(id) }
  for (const v of input) {
    if (typeof v !== 'string') continue
    if (valid.has(v)) push(v)
    else if (LEGACY_ALIASES[v]) LEGACY_ALIASES[v].forEach(push)
  }
  return out
}
