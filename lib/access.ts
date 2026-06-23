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

// ── Static sections (everything that is NOT a per-socmed-project item) ────────
export const STATIC_SECTIONS: AccessSection[] = [
  { id: 'overview', label: 'Dashboard', group: 'Dashboard', routes: ['/'], landing: '/' },

  // Website
  { id: 'website.home',     label: 'Home Page',  group: 'Website', routes: ['/website/home'],     landing: '/website/home' },
  { id: 'website.about',    label: 'About Page', group: 'Website', routes: ['/website/about'],     landing: '/website/about' },
  { id: 'website.news',     label: 'News Page',  group: 'Website', routes: ['/website/news'],      landing: '/website/news' },
  { id: 'website.seo',      label: 'SEO',        group: 'Website', routes: ['/website/seo'],       landing: '/website/seo' },
  { id: 'website.navbar',   label: 'Setting',    group: 'Website', routes: ['/website/navbar'],    landing: '/website/navbar' },
  { id: 'website.visitors', label: 'Visitors',   group: 'Website', routes: ['/website/visitors'],  landing: '/website/visitors' },

  // Socmed Management — combined board (project-specific items are generated)
  { id: 'smm.all', label: 'All Project', group: 'Socmed Management', routes: ['/projects-all'], landing: '/projects-all' },

  // Social Media (standalone)
  { id: 'social.accounts',  label: 'Accounts',  group: 'Social Media', routes: ['/social/accounts'],  landing: '/social/accounts' },
  { id: 'social.analytics', label: 'Analytics', group: 'Social Media', routes: ['/social/analytics'], landing: '/social/analytics' },
  { id: 'social.reports',   label: 'Reports',   group: 'Social Media', routes: ['/social/reports'],   landing: '/social/reports' },
  { id: 'social.plan',      label: 'Plan',      group: 'Social Media', routes: ['/social/plan'],      landing: '/social/plan' },

  // Client
  { id: 'client.leads',    label: 'Leads',           group: 'Client', routes: ['/website/leads'], landing: '/website/leads' },
  { id: 'client.crm',      label: 'CRM Pipeline',    group: 'Client', routes: ['/clients'],       landing: '/clients' },
  { id: 'client.invoices', label: 'Invoice & Bayar', group: 'Client', routes: ['/invoices'],      landing: '/invoices' },
  { id: 'client.report',   label: 'Laporan Sales',  group: 'Client', routes: ['/sales-report'],  landing: '/sales-report' },

  // Projects
  { id: 'projects.all',   label: 'All Projects',     group: 'Projects', routes: ['/projects'],                     landing: '/projects' },
  { id: 'projects.tasks', label: 'Task Board',       group: 'Projects', routes: ['/tasks'],                        landing: '/tasks' },
  { id: 'projects.vp',    label: 'Video Production',  group: 'Projects', routes: ['/bpi-faizal', '/pipeline/vp'],   landing: '/bpi-faizal' },
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
  { id: 'ai.builder',   label: 'Content Builder',  group: 'AI Studio', routes: ['/ai/builder'],      landing: '/ai/builder' },
  { id: 'ai.pipeline',  label: 'Pipeline Konten',  group: 'AI Studio', routes: ['/ai/pipeline'],     landing: '/ai/pipeline' },

  // Settings
  { id: 'settings.ai', label: 'AI Integrations', group: 'Settings', routes: ['/settings/ai'], landing: '/settings/ai' },
]

/** Generate the two access sections for each socmed project. */
export function socmedSections(
  projects: { slug: string; name: string }[],
): AccessSection[] {
  const out: AccessSection[] = []
  for (const p of projects) {
    out.push(
      { id: `smm.${p.slug}.social`,   label: 'Social Media', group: 'Socmed Management', subgroup: p.name, routes: [`/smm/${p.slug}/social`], landing: `/smm/${p.slug}/social` },
      { id: `smm.${p.slug}.projects`, label: 'Projects',     group: 'Socmed Management', subgroup: p.name, routes: [`/smm/${p.slug}`],        landing: `/smm/${p.slug}` },
    )
  }
  // Chat is its own group so an admin manages "who can chat in which group" in
  // one place — one toggle per Socmed Management project, labelled by name. It is
  // an INDEPENDENT grant (see canAccessChat): granting Social/Projects no longer
  // implies chat, so access can be given or withheld per account, per group.
  for (const p of projects) {
    out.push({ id: `smm.${p.slug}.chat`, label: p.name, group: 'Chat', routes: [`/smm/${p.slug}/chat`], landing: `/smm/${p.slug}/chat` })
  }
  return out
}

/** Full section list = static + per-project. Used by the access admin API/UI. */
export function buildAccessSections(
  projects: { slug: string; name: string }[],
): AccessSection[] {
  return [...STATIC_SECTIONS, ...socmedSections(projects)]
}

/** Static-only ids (super admin short-circuits, so dynamic ids aren't needed). */
export const ALL_SECTION_IDS: string[] = STATIC_SECTIONS.map(s => s.id)

// A dynamic socmed section id, e.g. "smm.bentala-x.projects".
const SMM_ID_RE = /^smm\.([a-z0-9-]+)\.(social|projects|chat)$/

/** Legacy top-level ids (older menu_access rows) → granular children. Lets old
 *  grants keep working after the move to per-item access. */
const LEGACY_ALIASES: Record<string, string[]> = {
  website:  ['website.home', 'website.about', 'website.news', 'website.seo', 'website.navbar', 'website.visitors'],
  smm:      ['smm.all', 'smm.bpi.social', 'smm.bpi.projects', 'smm.bpi.chat', 'smm.bsi.social', 'smm.bsi.projects', 'smm.bsi.chat'],
  bpi:      ['smm.bpi.social', 'smm.bpi.projects', 'smm.bpi.chat'],
  bsi:      ['smm.bsi.social', 'smm.bsi.projects', 'smm.bsi.chat'],
  social:   ['social.accounts', 'social.analytics', 'social.reports', 'social.plan'],
  client:   ['client.leads', 'client.crm', 'client.invoices', 'client.report'],
  projects: ['projects.all', 'projects.tasks', 'projects.vp', 'projects.ds'],
  ai:       ['ai.chat', 'ai.ideas', 'ai.image', 'ai.templates', 'ai.video', 'ai.render', 'ai.audio', 'ai.bpi', 'ai.builder', 'ai.pipeline'],
  settings: ['settings.ai'],
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

/** Resolve the section a path belongs to. Dynamic /smm/<slug> paths (and the
 *  legacy /bpi,/bsi that redirect to them) are parsed by pattern so middleware
 *  needs no DB. Otherwise the longest matching static route wins. */
export function sectionForPath(pathname: string): string | null {
  // Chat rooms (/smm/<slug>/chat) are not a granular section — they inherit
  // project access via canAccessChat(). Exclude them so they don't get
  // mis-resolved to the project's "projects" section by the generic match below.
  if (/^\/smm\/[a-z0-9-]+\/chat(\/|$)/.test(pathname)) return null
  // Dynamic socmed routes (post-redirect canonical form).
  const smm = /^\/smm\/([a-z0-9-]+)(\/social)?(\/|$)/.exec(pathname)
  if (smm) return smm[2] ? `smm.${smm[1]}.social` : `smm.${smm[1]}.projects`
  // Legacy URLs that 308-redirect to /smm/<slug> — gate them on the first pass too.
  const legacy = /^\/(bpi|bsi)(\/social)?(\/|$)/.exec(pathname)
  if (legacy) return legacy[2] ? `smm.${legacy[1]}.social` : `smm.${legacy[1]}.projects`

  let bestId: string | null = null
  let bestLen = -1
  for (const section of STATIC_SECTIONS) {
    for (const route of section.routes) {
      if (pathMatchesRoute(pathname, route) && route.length > bestLen) {
        bestLen = route.length
        bestId = section.id
      }
    }
  }
  return bestId
}

/** Chat rooms live at /smm/<slug>/chat. Returns the slug, or null. */
export function chatRoomFromPath(pathname: string): string | null {
  const m = /^\/smm\/([a-z0-9-]+)\/chat(\/|$)/.exec(pathname)
  return m ? m[1] : null
}

/** Chat is an INDEPENDENT grant: a room is open only to accounts that hold the
 *  project's explicit Chat grant (smm.<slug>.chat). Social/Projects access no
 *  longer implies chat, so an admin can decide per account who may chat in each
 *  group (managed under the "Chat" group in the access page). Pass normalised
 *  sections. Super admins short-circuit this everywhere they're checked. */
export function canAccessChat(allowed: Set<string> | string[], slug: string): boolean {
  const has = (id: string) => (Array.isArray(allowed) ? allowed.includes(id) : allowed.has(id))
  return has(`smm.${effectiveChatSlug(slug)}.chat`)
}

/** A per-task chat lives in its own room keyed by the project slug AND post id:
 *  "task.<projectSlug>.<postId>". Embedding the slug lets access checks (here and
 *  in RLS) derive the owning project WITHOUT a posts lookup. */
export function taskChatRoom(projectSlug: string, postId: string): string {
  return `task.${projectSlug}.${postId}`
}

/** The project slug that governs access to a chat room. A task room
 *  ("task.<slug>.<postId>") inherits its project's grants; any other room IS the
 *  slug. Slugs and post ids never contain '.', so split is unambiguous. */
export function effectiveChatSlug(room: string): string {
  if (room.startsWith('task.')) return room.split('.')[1] || room
  return room
}

/** The post id encoded in a task chat room, or null for a normal room. */
export function taskIdFromChatRoom(room: string): string | null {
  if (!room.startsWith('task.')) return null
  const parts = room.split('.')
  return parts.length >= 3 ? parts.slice(2).join('.') : null
}

/** Landing path for the first item the user may enter, or null. Handles dynamic
 *  smm.<slug>.* ids by pattern so middleware needs no project list. */
export function firstAllowedLanding(allowed: string[]): string | null {
  if (!allowed || allowed.length === 0) return null
  const set = new Set(allowed)
  // Prefer a deterministic static order first.
  for (const section of STATIC_SECTIONS) {
    if (set.has(section.id)) return section.landing
  }
  // Otherwise the first dynamic socmed grant.
  for (const id of allowed) {
    const m = SMM_ID_RE.exec(id)
    if (m) return m[2] === 'social' ? `/smm/${m[1]}/social` : m[2] === 'chat' ? `/smm/${m[1]}/chat` : `/smm/${m[1]}`
  }
  return null
}

/** Sanitise stored sections into known ids. Static ids + legacy aliases expand
 *  as before; dynamic smm.<slug>.* ids are accepted by pattern (middleware has
 *  no project list, and these are safe, self-describing ids). */
export function normaliseSections(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const valid = new Set(ALL_SECTION_IDS)
  const out: string[] = []
  const push = (id: string) => { if (!out.includes(id)) out.push(id) }
  for (const v of input) {
    if (typeof v !== 'string') continue
    if (valid.has(v)) push(v)
    else if (SMM_ID_RE.test(v)) push(v)
    else if (LEGACY_ALIASES[v]) LEGACY_ALIASES[v].forEach(push)
  }
  return out
}
