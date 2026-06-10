# Dynamic Socmed Management Projects — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a super admin add / rename / archive Socmed Management projects at runtime (each gets a Projects board + Social Media tab), replacing the hardcoded `bpi`/`bsi` with a DB-backed registry.

**Architecture:** A `socmed_projects` table is the source of truth (seeded with `bpi`+`bsi`). Posts link via the existing `posts.entity` (= project slug). Routes become dynamic (`/smm/[project]`, `/smm/[project]/social`) with redirects from the old `/bpi`,`/bsi`. The sidebar, board card glyph, and access-control sections are generated from the project list. Middleware stays DB-free by deriving access sections from the URL pattern. Projects are managed from the All Project page (super admin).

**Tech stack:** Next.js 14 App Router, Supabase (Postgres + RLS + service role), Zustand store, TypeScript. **No test runner exists** — each task is verified with `npx tsc --noEmit` and manual checks on the running dev server (`npm run dev`, port 3000). Commit after each task (LOCAL ONLY — do not push until the user asks).

**Spec:** `docs/superpowers/specs/2026-06-10-dynamic-socmed-projects-design.md`

---

## File structure

**Create:**
- `lib/socmed-projects.ts` — client cache + `useSocmedProjects()` hook + `SocmedProject` type.
- `app/api/socmed-projects/route.ts` — GET (list, any authed), POST (create, super admin), PATCH (update/archive, super admin).
- `app/(dashboard)/smm/[project]/page.tsx` — Projects board for a project.
- `app/(dashboard)/smm/[project]/social/page.tsx` — Social Media tab for a project.
- `components/Socmed/ManageProjectsPanel.tsx` — CRUD panel rendered on the All Project page.

**Modify:**
- `lib/types.ts` — widen `PostEntity` to `string`; add `SocmedProject`.
- `lib/access.ts` — static vs generated sections; `socmedSections()`; pattern-based `sectionForPath`/`firstAllowedLanding`/`normaliseSections`.
- `app/api/access/route.ts` — merge generated socmed sections from the DB.
- `next.config.js` — redirects `/bpi`,`/bsi` → `/smm/...`.
- `components/Sidebar.tsx` — build SOCMED MANAGEMENT subgroups from the project list.
- `components/BPI/index.tsx` — `EntityGlyph` reads glyph/color from the project list.
- `app/(dashboard)/projects-all/page.tsx` — mount `ManageProjectsPanel`.

**Remove (Task 4):** `app/(dashboard)/bpi/page.tsx`, `app/(dashboard)/bpi/social/`, `app/(dashboard)/bsi/page.tsx`, `app/(dashboard)/bsi/social/` (replaced by redirects). Other `bpi/bsi` subfolders are audited in Task 4.

---

## Task 1: Create `socmed_projects` table + seed

**Files:** Supabase migration (applied via the Supabase MCP `apply_migration`, project `gbmqudkkuzpqykmyrkqc`). Requires the user's go-ahead at execution time (production DB).

- [ ] **Step 1: Apply the migration**

Apply this SQL as migration name `create_socmed_projects`:

```sql
create table if not exists public.socmed_projects (
  slug        text primary key,
  name        text not null,
  glyph       text not null default '',
  color       text not null default '#5a5a60',
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.socmed_projects enable row level security;

-- Any authenticated user may read (sidebar / board / access UI need it).
drop policy if exists "socmed_projects_read" on public.socmed_projects;
create policy "socmed_projects_read"
  on public.socmed_projects for select to authenticated using (true);

-- No insert/update/delete policies: writes happen only via the service role
-- (the admin API), never from the client.

insert into public.socmed_projects (slug, name, glyph, color, sort_order) values
  ('bpi', 'Bentala Project', 'bpi', '#c46e1f', 1),
  ('bsi', 'Bentala Studio',  'bsi', '#8845c0', 2)
on conflict (slug) do nothing;
```

- [ ] **Step 2: Verify**

Run `select slug, name, color, sort_order, active from public.socmed_projects order by sort_order;` (via MCP `execute_sql`).
Expected: two rows — `bpi` (Bentala Project, #c46e1f) and `bsi` (Bentala Studio, #8845c0), both active.

- [ ] **Step 3: Commit** (no app files changed; nothing to commit — record completion in the plan checkbox.)

---

## Task 2: Types, shared project source, GET API

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/socmed-projects.ts`
- Create: `app/api/socmed-projects/route.ts`

- [ ] **Step 1: Widen `PostEntity` + add `SocmedProject` in `lib/types.ts`**

Replace:
```ts
export type PostEntity = 'bpi' | 'bsi' | 'ws'
```
with:
```ts
// Project slug a post belongs to (e.g. 'bpi', 'bsi', or a custom one). 'ws' is
// the workspace pseudo-entity. Free-form string since projects are now dynamic.
export type PostEntity = string
```

Add this interface near the top-level types (after `PostPlatform`):
```ts
export interface SocmedProject {
  slug: string
  name: string
  glyph: string
  color: string
  sort_order: number
  active: boolean
  created_at?: string
}
```

- [ ] **Step 2: Create `lib/socmed-projects.ts`**

```ts
'use client'

import { useEffect, useState } from 'react'
import type { SocmedProject } from '@/lib/types'

// Cached client fetch for the socmed project registry. Mirrors the /api/accounts
// caching pattern so the sidebar, board cards and management panel share one
// request instead of each hitting the API.
let cache: { at: number; data: SocmedProject[] } | null = null
let inflight: Promise<SocmedProject[]> | null = null
const TTL_MS = 60_000

export async function fetchSocmedProjects(force = false): Promise<SocmedProject[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.data
  if (!force && inflight) return inflight
  inflight = fetch('/api/socmed-projects')
    .then(r => (r.ok ? r.json() : { projects: [] }))
    .then((d: { projects?: SocmedProject[] }) => {
      const data = d.projects ?? []
      cache = { at: Date.now(), data }
      return data
    })
    .catch(() => cache?.data ?? [])
    .finally(() => { inflight = null })
  return inflight
}

/** Drop the cache so the next fetch re-reads (call after create/edit/archive). */
export function invalidateSocmedProjects() { cache = null }

/** Hook returning the project list. `activeOnly` filters out archived ones. */
export function useSocmedProjects(activeOnly = true): SocmedProject[] {
  const [projects, setProjects] = useState<SocmedProject[]>(cache?.data ?? [])
  useEffect(() => {
    let cancelled = false
    fetchSocmedProjects().then(list => {
      if (!cancelled) setProjects(activeOnly ? list.filter(p => p.active) : list)
    })
    return () => { cancelled = true }
  }, [activeOnly])
  return projects
}
```

- [ ] **Step 3: Create `app/api/socmed-projects/route.ts` (GET only for now)**

```ts
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

// GET /api/socmed-projects — list every socmed project (active + archived).
// Readable by any authenticated user (sidebar / board / access UI rely on it).
// Writes (POST/PATCH) are added in a later task.
export async function GET() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('socmed_projects')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[/api/socmed-projects] GET', error)
    return NextResponse.json({ projects: [] })
  }
  return NextResponse.json({ projects: data ?? [] }, { headers: { 'Cache-Control': 'private, max-age=30' } })
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0 (PostEntity widening may surface errors in Task 7's call sites — if any appear here, note them; they're fixed in Task 7. If the only errors are pre-existing literal-entity switches, proceed; otherwise fix obvious ones now.)

- [ ] **Step 5: Manual verify**

With dev running, open `http://localhost:3000/api/socmed-projects` while logged in.
Expected: JSON `{ "projects": [ {slug:"bpi",...}, {slug:"bsi",...} ] }`.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/socmed-projects.ts app/api/socmed-projects/route.ts
git commit -m "feat(socmed): project registry type, cached client source, GET API"
```

---

## Task 3: Dynamic access control

**Files:**
- Modify: `lib/access.ts`
- Modify: `app/api/access/route.ts`

- [ ] **Step 1: Rewrite the section model in `lib/access.ts`**

Replace the whole `ACCESS_SECTIONS` array + `ALL_SECTION_IDS` + `LEGACY_ALIASES` + `sectionForPath` + `firstAllowedLanding` + `normaliseSections` block with the following. Keep `SUPER_ADMIN_EMAILS`, `AccessSection`, `Role`, `isSuperAdmin`, `isEffectiveSuperAdmin`, and `pathMatchesRoute` as they are.

```ts
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

  // Team
  { id: 'team', label: 'Team & Roles', group: 'Team', routes: ['/team'], landing: '/team' },

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
const SMM_ID_RE = /^smm\.([a-z0-9-]+)\.(social|projects)$/

const LEGACY_ALIASES: Record<string, string[]> = {
  website:  ['website.home', 'website.about', 'website.news', 'website.seo', 'website.navbar', 'website.visitors'],
  smm:      ['smm.all', 'smm.bpi.social', 'smm.bpi.projects', 'smm.bsi.social', 'smm.bsi.projects'],
  bpi:      ['smm.bpi.social', 'smm.bpi.projects'],
  bsi:      ['smm.bsi.social', 'smm.bsi.projects'],
  social:   ['social.accounts', 'social.analytics', 'social.reports', 'social.plan'],
  client:   ['client.leads', 'client.crm', 'client.invoices'],
  projects: ['projects.all', 'projects.tasks', 'projects.vp', 'projects.ds'],
  ai:       ['ai.chat', 'ai.ideas', 'ai.image', 'ai.templates', 'ai.video', 'ai.render', 'ai.audio', 'ai.bpi', 'ai.builder', 'ai.pipeline'],
  settings: ['settings.ai'],
}

/** Resolve the section a path belongs to. Dynamic /smm/<slug> paths (and the
 *  legacy /bpi,/bsi that redirect to them) are parsed by pattern so middleware
 *  needs no DB. Otherwise the longest matching static route wins. */
export function sectionForPath(pathname: string): string | null {
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
    if (m) return m[2] === 'social' ? `/smm/${m[1]}/social` : `/smm/${m[1]}`
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
```

- [ ] **Step 2: Update `app/api/access/route.ts` to merge dynamic sections**

At the top, change the import:
```ts
import { isSuperAdmin, isEffectiveSuperAdmin, normaliseSections, buildAccessSections } from '@/lib/access'
```

In `GET`, after creating `admin` and before the accounts loop, load the projects and build the section list:
```ts
const admin = createSupabaseAdmin()

// Full section list including per-project socmed sections (for the admin UI).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { data: projRows } = await (admin as any)
  .from('socmed_projects')
  .select('slug, name')
  .order('sort_order', { ascending: true })
const SECTIONS = buildAccessSections((projRows ?? []) as { slug: string; name: string }[])
```

Then replace the two `ACCESS_SECTIONS` references in the response builder:
- `sections: eff ? ACCESS_SECTIONS.map(s => s.id) : byEmail.get(...) ?? []`
  → `sections: eff ? SECTIONS.map(s => s.id) : byEmail.get(a.email.toLowerCase()) ?? []`
- the returned `sections: ACCESS_SECTIONS.map(s => ({ id, label, group, subgroup }))`
  → `sections: SECTIONS.map(s => ({ id: s.id, label: s.label, group: s.group, subgroup: s.subgroup }))`

In `POST`, replace `ACCESS_SECTIONS.map(s => s.id)` (the super-admin no-op branch) with a fresh build:
```ts
if (isSuperAdmin(email)) {
  const admin = createSupabaseAdmin()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: projRows } = await (admin as any).from('socmed_projects').select('slug, name').order('sort_order', { ascending: true })
  const ids = buildAccessSections((projRows ?? []) as { slug: string; name: string }[]).map(s => s.id)
  return NextResponse.json({ ok: true, email, sections: ids })
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0. (If any file still imports the removed `ACCESS_SECTIONS`, fix it: Sidebar imports only `ALL_SECTION_IDS`/`normaliseSections`/`sectionForPath` which still exist; the access route is updated above. Grep `grep -rn "ACCESS_SECTIONS" --include=*.ts --include=*.tsx .` and ensure no stragglers remain.)

- [ ] **Step 4: Manual verify**

With dev running, as super admin open Settings → Hak Akses → Atur Akses. Under **SOCMED MANAGEMENT** you should still see **All Project**, **Bentala Project → Social Media/Projects**, **Bentala Studio → Social Media/Projects** (now generated from the DB). Toggling/saving a non-super account still persists.

- [ ] **Step 5: Commit**

```bash
git add lib/access.ts app/api/access/route.ts
git commit -m "feat(socmed): generate access sections from the project registry"
```

---

## Task 4: Dynamic routes + redirects

**Files:**
- Create: `app/(dashboard)/smm/[project]/page.tsx`
- Create: `app/(dashboard)/smm/[project]/social/page.tsx`
- Modify: `next.config.js`
- Remove: `app/(dashboard)/bpi/page.tsx`, `app/(dashboard)/bpi/social/`, `app/(dashboard)/bsi/page.tsx`, `app/(dashboard)/bsi/social/`

- [ ] **Step 1: Audit the extra legacy subfolders**

Run: `ls "app/(dashboard)/bpi" "app/(dashboard)/bsi"` and `grep -rn "/bpi/analytics\|/bsi/analytics\|/bsi/calendar\|/bsi/posts" --include=*.tsx --include=*.ts app components`.
- If a subfolder route is **not linked anywhere** (only the sidebar's `/bpi`,`/bsi`,`/bpi/social`,`/bsi/social` are used), it is legacy: leave the folder in place untouched (it keeps working at its old URL) and only the board+social folders are removed in Step 5.
- If one **is** linked, add an equivalent `app/(dashboard)/smm/[project]/<sub>/page.tsx` and a redirect for it in Step 4. (Record what you found in the commit message.)

- [ ] **Step 2: Create the board route `app/(dashboard)/smm/[project]/page.tsx`**

```tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { useParams, notFound } from 'next/navigation'
import { PageHeader, type TabKey } from '@/components/shared/PageHeader'
import { BPIPage, BoardFilter, useBoardFilter, type BPIPageHandle, type BPITabType } from '@/components/BPI'
import { PostHistoryButton } from '@/components/shared/PostHistory'
import { getSupabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useSocmedProjects } from '@/lib/socmed-projects'

export default function SmmProjectBoardPage() {
  const t = useT()
  const params = useParams<{ project: string }>()
  const slug = params.project
  const projects = useSocmedProjects(false) // include archived so we can detect "exists"
  const known = projects.length === 0 || projects.some(p => p.slug === slug) // tolerate first paint before fetch
  const [tab, setTab] = useState<TabKey>('list')
  const ref = useRef<BPIPageHandle>(null)
  const bf = useBoardFilter(slug as 'bpi' | 'bsi' | 'all')

  const [currentUser, setCurrentUser] = useState('')
  useEffect(() => {
    getSupabase().auth.getUser().then(({ data }) => {
      if (data.user) {
        const meta = data.user.user_metadata ?? {}
        setCurrentUser(meta.full_name ?? meta.name ?? data.user.email?.split('@')[0] ?? '')
      }
    })
  }, [])

  if (!known) notFound()

  return (
    <>
      <PageHeader
        title="Projects"
        tabs={['list', 'board', 'calendar', 'files', 'analytics']}
        activeTab={tab}
        onTabChange={setTab}
        showDateFilter={tab === 'analytics'}
        tabsRight={tab !== 'analytics' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PostHistoryButton scope={{ entity: slug }} />
            <BoardFilter filters={bf.filters} setFilters={bf.setFilters} accounts={bf.accounts} months={bf.months} />
          </div>
        ) : undefined}
        action={
          <button
            onClick={() => ref.current?.openEdit()}
            style={{ height: 32, padding: '0 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >
            {t('+ Tambah Post')}
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto min-h-0">
        <BPIPage ref={ref} entity={slug} currentUser={currentUser} activeTab={tab as BPITabType} filters={bf.filters} />
      </div>
    </>
  )
}
```

Note: `useBoardFilter` is typed `'bpi' | 'bsi' | 'all' | { pic: string }`. Widen its signature in `components/BPI/index.tsx` from `scope: 'bpi' | 'bsi' | 'all' | { pic: string }` to `scope: string | { pic: string }` (the body only does string comparisons and `p.entity === scope`, which work for any slug). Update the cast above to just `bf = useBoardFilter(slug)` after widening. Also check `PostHistoryButton`'s `scope` prop type accepts `{ entity: string }` — widen if it's a literal union.

- [ ] **Step 3: Create the social route `app/(dashboard)/smm/[project]/social/page.tsx`**

Copy the full current contents of `app/(dashboard)/bpi/social/page.tsx` verbatim into this new file (it renders the mock Social view and does not depend on the entity). No other change needed.

- [ ] **Step 4: Add redirects in `next.config.js`**

Inside `nextConfig`, add:
```js
  async redirects() {
    return [
      { source: '/bpi', destination: '/smm/bpi', permanent: true },
      { source: '/bpi/social', destination: '/smm/bpi/social', permanent: true },
      { source: '/bsi', destination: '/smm/bsi', permanent: true },
      { source: '/bsi/social', destination: '/smm/bsi/social', permanent: true },
    ]
  },
```
(If Step 1 found a linked extra subfolder you recreated under `/smm/[project]/<sub>`, add its redirect here too.)

- [ ] **Step 5: Remove the replaced static folders**

```bash
git rm "app/(dashboard)/bpi/page.tsx" "app/(dashboard)/bpi/social/page.tsx" \
       "app/(dashboard)/bsi/page.tsx" "app/(dashboard)/bsi/social/page.tsx"
```
(Leave any audited-legacy subfolders from Step 1 in place. If a `bpi`/`bsi` folder becomes empty, remove it; otherwise keep it.) Restart dev (`next.config` + route changes need a dev restart): stop and re-run `npm run dev`.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Manual verify**

- Visit `http://localhost:3000/bpi` → redirects to `/smm/bpi`, shows the Bentala Project board with its posts.
- `http://localhost:3000/bpi/social` → `/smm/bpi/social`.
- `http://localhost:3000/smm/bsi` shows Bentala Studio posts.
- Creating a post on `/smm/bpi` saves with `entity='bpi'` and appears (check the board).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(socmed): dynamic /smm/[project] board + social routes, redirect /bpi,/bsi"
```

---

## Task 5: Dynamic sidebar + card glyph

**Files:**
- Modify: `components/Sidebar.tsx`
- Modify: `components/BPI/index.tsx`

- [ ] **Step 1: Build the SOCMED MANAGEMENT subgroups from the registry in `components/Sidebar.tsx`**

Add the import:
```ts
import { useSocmedProjects } from '@/lib/socmed-projects'
```
Inside `Sidebar()`, near the other hooks, add:
```ts
const smmProjects = useSocmedProjects(true)
```
In the `sections` `useMemo`, replace the hardcoded `smm` section's two project subgroups (the `smm-bpi` and `smm-bsi` `Subgroup` objects) with ones generated from `smmProjects`, keeping the "All Project" item (super admin) at the top. The `smm` section becomes:
```ts
    {
      id: 'smm',
      badge: <BrandBadge text="smm" />,
      fullLabel: 'Socmed Management',
      items: [
        ...(access.isSuper
          ? [{ href: '/projects-all', label: 'All Project', icon: <FolderIcon />, color: COLOR.blue }]
          : []),
        ...smmProjects.map(p => ({
          type: 'subgroup' as const,
          id: `smm-${p.slug}`,
          label: p.name,
          icon: <BrandGlyph text={p.glyph || p.slug} />,
          color: p.color,
          items: [
            { href: `/smm/${p.slug}/social`, label: 'Social Media', icon: <ShareIcon />, color: COLOR.teal },
            { href: `/smm/${p.slug}`,        label: 'Projects',     icon: <ListIcon />,  color: p.color },
          ],
        })),
      ],
    },
```
Add `smmProjects` to the `useMemo` dependency array (alongside `access.isSuper`).

- [ ] **Step 2: Make the card glyph dynamic in `components/BPI/index.tsx`**

Add the import:
```ts
import { useSocmedProjects } from '@/lib/socmed-projects'
```
Replace the static `ENTITY_GLYPH` map + `EntityGlyph` component so the glyph/color come from the project registry, with a neutral fallback (keep `ws` as a special case):
```tsx
function EntityGlyph({ entity }: { entity: string }) {
  const projects = useSocmedProjects(false)
  const proj = projects.find(p => p.slug === entity)
  const label = proj?.glyph || (entity === 'ws' ? 'ws' : entity.slice(0, 3))
  const color = proj?.color || '#5a5a60'
  const title = proj?.name || (entity === 'ws' ? 'Workspace' : entity)
  return (
    <span
      title={title}
      style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0, marginTop: 1,
        backgroundColor: color,
        backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.06) 45%, rgba(0,0,0,0.16) 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.32), inset 0 -1px 0 rgba(0,0,0,0.22), 0 1px 3px rgba(0,0,0,0.25)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 800, color: '#fff', letterSpacing: '0.03em', textTransform: 'lowercase',
      }}
    >
      {label}
    </span>
  )
}
```
Delete the now-unused `const ENTITY_GLYPH = {...}`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Manual verify**

Sidebar SOCMED MANAGEMENT shows All Project + Bentala Project + Bentala Studio (same as before, now from DB). Board cards show the correct orange/purple glyph per project. A non-super account only sees the projects it's granted.

- [ ] **Step 5: Commit**

```bash
git add components/Sidebar.tsx components/BPI/index.tsx
git commit -m "feat(socmed): render sidebar subgroups + card glyph from the project registry"
```

---

## Task 6: Management panel (create / rename / archive)

**Files:**
- Modify: `app/api/socmed-projects/route.ts` (add POST + PATCH)
- Create: `components/Socmed/ManageProjectsPanel.tsx`
- Modify: `app/(dashboard)/projects-all/page.tsx`

- [ ] **Step 1: Add POST + PATCH to `app/api/socmed-projects/route.ts`**

Add these imports at the top:
```ts
import type { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { isEffectiveSuperAdmin } from '@/lib/access'
```
Add a guard helper and the two handlers:
```ts
async function requireSuperAdmin(): Promise<NextResponse | null> {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isEffectiveSuperAdmin(user.email, user.app_metadata?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

function slugify(name: string): string {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'project'
}

export async function POST(req: NextRequest) {
  const forbidden = await requireSuperAdmin()
  if (forbidden) return forbidden

  let body: { name?: string; glyph?: string; color?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  const glyph = String(body.glyph ?? '').trim().slice(0, 6) || slugify(name).slice(0, 4)
  const color = /^#[0-9a-fA-F]{6}$/.test(body.color ?? '') ? body.color! : '#5a5a60'

  const admin = createSupabaseAdmin()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any
  // Unique slug (suffix on collision).
  const base = slugify(name)
  let slug = base
  for (let i = 2; i < 100; i++) {
    const { data: existing } = await sb.from('socmed_projects').select('slug').eq('slug', slug).maybeSingle()
    if (!existing) break
    slug = `${base}-${i}`
  }
  const { data: maxRow } = await sb.from('socmed_projects').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const sort_order = ((maxRow?.sort_order as number) ?? 0) + 1

  const { data, error } = await sb.from('socmed_projects')
    .insert({ slug, name, glyph, color, sort_order, active: true }).select('*').single()
  if (error) { console.error('[/api/socmed-projects] POST', error); return NextResponse.json({ error: 'Failed to create' }, { status: 500 }) }
  return NextResponse.json({ project: data })
}

export async function PATCH(req: NextRequest) {
  const forbidden = await requireSuperAdmin()
  if (forbidden) return forbidden

  let body: { slug?: string; name?: string; glyph?: string; color?: string; sort_order?: number; active?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  const slug = String(body.slug ?? '').trim()
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim()
  if (typeof body.glyph === 'string') patch.glyph = body.glyph.trim().slice(0, 6)
  if (typeof body.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.color)) patch.color = body.color
  if (typeof body.sort_order === 'number') patch.sort_order = body.sort_order
  if (typeof body.active === 'boolean') patch.active = body.active
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const admin = createSupabaseAdmin()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).from('socmed_projects').update(patch).eq('slug', slug).select('*').single()
  if (error) { console.error('[/api/socmed-projects] PATCH', error); return NextResponse.json({ error: 'Failed to update' }, { status: 500 }) }
  return NextResponse.json({ project: data })
}
```

- [ ] **Step 2: Create `components/Socmed/ManageProjectsPanel.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n/LanguageProvider'
import { fetchSocmedProjects, invalidateSocmedProjects, useSocmedProjects } from '@/lib/socmed-projects'
import type { SocmedProject } from '@/lib/types'

const PALETTE = ['#c46e1f', '#8845c0', '#1f5dca', '#2c9148', '#c4393a', '#2c85ad', '#c4a414', '#c4365a', '#4541b8', '#5a5a60']

export function ManageProjectsPanel() {
  const t = useT()
  // Include archived so the panel can show + unarchive them.
  const [projects, setProjects] = useState<SocmedProject[]>([])
  const live = useSocmedProjects(false)
  // Seed local state from the hook on first data.
  if (projects.length === 0 && live.length > 0) setProjects(live)

  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [glyph, setGlyph] = useState('')
  const [color, setColor] = useState(PALETTE[2])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function refresh() {
    invalidateSocmedProjects()
    setProjects(await fetchSocmedProjects(true))
  }

  async function create() {
    if (!name.trim() || busy) return
    setBusy(true); setError('')
    try {
      const r = await fetch('/api/socmed-projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, glyph, color }) })
      if (!r.ok) throw new Error((await r.json()).error || 'Gagal')
      setName(''); setGlyph(''); setColor(PALETTE[2]); setAdding(false)
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Gagal menambah project') }
    finally { setBusy(false) }
  }

  async function patch(slug: string, body: Partial<SocmedProject>) {
    await fetch('/api/socmed-projects', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, ...body }) })
    await refresh()
  }

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{t('Kelola Project Socmed')}</span>
        <button onClick={() => setAdding(a => !a)} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          + {t('Tambah Project')}
        </button>
      </div>

      {adding && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={t('Nama project')} style={{ flex: 1, minWidth: 160, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 11px', color: 'var(--text)', fontSize: 13 }} />
          <input value={glyph} onChange={e => setGlyph(e.target.value)} placeholder={t('Badge (mis. bpx)')} maxLength={6} style={{ width: 120, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 11px', color: 'var(--text)', fontSize: 13 }} />
          <div style={{ display: 'flex', gap: 5 }}>
            {PALETTE.map(c => (
              <button key={c} onClick={() => setColor(c)} title={c} style={{ width: 22, height: 22, borderRadius: 6, background: c, border: color === c ? '2px solid #fff' : '1px solid var(--border)', cursor: 'pointer' }} />
            ))}
          </div>
          <button onClick={create} disabled={busy || !name.trim()} style={{ background: name.trim() ? 'var(--accent)' : 'var(--bg2)', color: name.trim() ? '#fff' : 'var(--text2)', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: name.trim() ? 'pointer' : 'not-allowed' }}>
            {busy ? t('Menyimpan…') : t('Simpan')}
          </button>
          {error && <span style={{ fontSize: 12, color: '#f87171', width: '100%' }}>{error}</span>}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {projects.map(p => (
          <div key={p.slug} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 9, opacity: p.active ? 1 : 0.55 }}>
            <span style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, background: p.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff', textTransform: 'lowercase' }}>{p.glyph || p.slug}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.name}</span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>/{p.slug}</span>
            <button onClick={() => patch(p.slug, { active: !p.active })} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer' }}>
              {p.active ? t('Arsipkan') : t('Aktifkan')}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Mount the panel on the All Project page**

In `app/(dashboard)/projects-all/page.tsx`, import and render `<ManageProjectsPanel />` above the board (super admin only — this route is already super-admin-gated via `smm.all`/sidebar, but guard the panel render too if the page exposes `isSuper`). Add:
```tsx
import { ManageProjectsPanel } from '@/components/Socmed/ManageProjectsPanel'
```
and place `<ManageProjectsPanel />` just inside the page's scrollable content, before the `<BPIPage .../>` board. (Read the file first to match its exact JSX shape; keep the existing board untouched.)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Manual verify**

As super admin on All Project: the panel lists Bentala Project/Studio. Click **+ Tambah Project**, enter "Bentala X", badge "bpx", pick a color, Save → it appears in the list, in the sidebar (after refetch/refresh), and at `/smm/<slug>`. Open Atur Akses → the new project's Social Media/Projects sections appear. Archive it → it disappears from the sidebar; its posts (if any) remain in the DB. Unarchive restores it.

- [ ] **Step 6: Commit**

```bash
git add app/api/socmed-projects/route.ts components/Socmed/ManageProjectsPanel.tsx "app/(dashboard)/projects-all/page.tsx"
git commit -m "feat(socmed): manage projects (create/rename/archive) from All Project page"
```

---

## Task 7: Final audit, type widening fallout, verification

**Files:** any with `entity` literal switches surfaced by the `PostEntity = string` change.

- [ ] **Step 1: Find entity-literal assumptions**

Run: `grep -rn "=== 'bpi'\|=== 'bsi'\|'bpi' \?:\|entity: 'bpi'\|entity: 'bsi'" --include=*.ts --include=*.tsx app components lib hooks`.
Review each hit. Legitimate special cases (e.g. analytics that maps `ws`→`bpi`) can stay. Anything that assumed only bpi/bsi exist and would break for a new slug must be made slug-generic. Common spots: `components/BPI/Analytics`, `useBoardFilter`, `PostHistoryButton` scope typing, calendar entity props.

- [ ] **Step 2: Fix each surfaced issue** (apply the minimal slug-generic change; show the code in the commit). If none break, note "no entity-literal fallout" and continue.

- [ ] **Step 3: Full type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Manual regression matrix** (dev server)

- `/bpi`, `/bpi/social`, `/bsi`, `/bsi/social` redirect and show the same data as before.
- Existing posts render under their project; drag-to-move + status changes still persist.
- An existing non-super account with `smm.bpi.*` grants still sees/opens only Bentala Project (and is redirected away from a project it lacks).
- Create a project → reachable, postable, grantable; archive → hidden, posts kept.
- New project board card shows its glyph/color.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(socmed): make entity-literal call sites slug-generic; final verification"
```

---

## Self-review notes (author)

- **Spec coverage:** data model (T1), routing+redirects (T4), sidebar+card (T5), access auto-gen (T3), management UI on All Project (T6), archive=hide (T6 PATCH active), uniform routing (T4), full project = board+social (T2/T4). All covered.
- **Middleware stays DB-free:** `sectionForPath`/`firstAllowedLanding`/`normaliseSections` handle `smm.<slug>.*` by pattern (T3) — verified no project query added to `middleware.ts`.
- **Backward compatibility:** seeded slugs match existing `posts.entity` and `menu_access` grants; legacy `/bpi` paths gated on first pass and redirected (T3+T4).
- **Type names consistent:** `SocmedProject`, `fetchSocmedProjects`, `invalidateSocmedProjects`, `useSocmedProjects`, `socmedSections`, `buildAccessSections`, `STATIC_SECTIONS` used identically across tasks.
