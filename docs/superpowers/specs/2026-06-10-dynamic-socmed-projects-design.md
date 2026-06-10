# Dynamic Socmed Management Projects — Design

**Date:** 2026-06-10
**Status:** Approved (design) — implementation pending

## Problem

The Socmed Management area has exactly two projects — **Bentala Project (`bpi`)** and
**Bentala Studio (`bsi`)** — hardcoded across the codebase (static route folders,
`PostEntity` union, the sidebar, `ACCESS_SECTIONS`, and the card glyph colors).
There is no way for an admin to add a third (or more) socmed project at runtime.

**Goal:** a super admin can add / rename / archive socmed projects from the UI
(a "+ Tambah Project" button), and each project behaves exactly like Bentala
Project / Studio — its own **Projects** board and **Social Media** tab, with
access permissions generated automatically.

## Decisions (from brainstorming)

1. Each new project is **full**: a Projects (Kanban) board **and** a Social Media
   tab. (Social Media remains the current mock-backed view for now — out of scope
   to make it real here.)
2. Projects are **managed on the "All Project" page** (super admin only); the
   sidebar renders the project list dynamically.
3. **Uniform routing**: every project (old and new) lives under a dynamic route
   `/smm/<slug>`; the old `/bpi` and `/bsi` URLs **redirect** there.
4. **Delete = archive/hide**: an archived project disappears from the sidebar and
   forms but keeps all its posts (reversible). No hard delete.
5. Project identity fields the user sets: **Name, short badge label, color**.
   `slug` is auto-generated from the name. (YAGNI: no other per-project config.)
6. Registry lives in the **database** (a runtime "+ add" button rules out a
   code/config-file approach).

## Non-goals

- Making the Social Media tab use real per-project data (stays mock for now).
- Touching the non-socmed "Projects" group (`/projects`, `/tasks`, Video
  Production `/bpi-faizal`, Design Studio `/bpi-reinaldi`) — unrelated.
- Reworking the post schema beyond what's described (posts.entity already fits).

## Data model

New table **`socmed_projects`**:

| column | type | notes |
|---|---|---|
| `slug` | text, PK | unique id; used in the URL and in `posts.entity` (e.g. `bpi`, `bsi`, `bentala-x`) |
| `name` | text | display name (e.g. "Bentala Project") |
| `glyph` | text | short badge label for the sidebar/card (e.g. `bpi`) |
| `color` | text | hex badge color, chosen from a fixed palette |
| `sort_order` | int | order in the sidebar |
| `active` | boolean, default true | archived = false (hidden, posts kept) |
| `created_at` | timestamptz, default now() |

- **Link to posts:** `posts.entity` (already `text`) stores the project **slug**.
  Existing posts (`entity='bpi'`/`'bsi'`) match the seeded rows → **no post data
  migration**.
- **Seed:** insert `bpi` (orange, glyph `bpi`, sort 1) and `bsi` (purple, glyph
  `bsi`, sort 2) so the two existing projects join the dynamic system and render
  identically to today.
- RLS: readable by any authenticated user (needed by sidebar/board/access);
  writes only via the service role through the admin API (never client-side).

## Routing

- New dynamic routes:
  - `app/(dashboard)/smm/[project]/page.tsx` → Projects board (renders the
    existing board component with `entity={params.project}`).
  - `app/(dashboard)/smm/[project]/social/page.tsx` → Social Media tab.
- **Redirects** in `next.config`, scoped to the routes we actually recreate:
  `/bpi` → `/smm/bpi`, `/bpi/social` → `/smm/bpi/social`, and the same for `bsi`.
  Old bookmarks / notification deep-links to these keep working. We do **not**
  use a blanket `/bpi/:path*` redirect — that could point legacy subpaths (e.g.
  `/bpi/analytics`, `/bsi/calendar`, `/bsi/posts`) at routes that don't exist.
  During implementation, audit those extra static subfolders: if still reachable
  in the UI, recreate them under `/smm/[project]/...` (or leave the static folder
  in place); if legacy/unused, remove. The `/bpi` & `/bsi` board + `social`
  folders are replaced by the redirects.
- Unknown/archived slug → render a "project not found" state (or redirect to
  `/smm/all`).
- `/projects-all` ("All Project") is unchanged as the combined board + now hosts
  the management panel.

## Sidebar & card

- The **SOCMED MANAGEMENT** sidebar section builds its subgroups dynamically from
  active `socmed_projects` (sorted). Each project → a subgroup with **Social
  Media** (`/smm/<slug>/social`) and **Projects** (`/smm/<slug>`). "All Project"
  stays pinned at the top (super admin only, as today).
- The sidebar fetches the project list (client) once; badge uses
  `project.glyph` + `project.color`.
- The board card's `EntityGlyph` (currently hardcoded `bpi`/`bsi`) looks up
  glyph/color from the project list via a shared client source (small hook/store
  or a cached fetch), falling back to a neutral glyph for unknown slugs.

## Access control (auto-generated)

- Section ids per project: `smm.<slug>.social` and `smm.<slug>.projects`.
- `sectionForPath` derives the section from the **URL pattern**
  (`/smm/<slug>` → `smm.<slug>.projects`, `/smm/<slug>/social` →
  `smm.<slug>.social`) — no DB query in middleware, so it stays lightweight.
- `ACCESS_SECTIONS` becomes: the static (non-socmed) sections **plus**
  dynamically-generated socmed sections from the project list. The two contexts
  that need the full list (the **"Atur Akses"** admin UI and its API, and the
  sidebar) read `socmed_projects` and merge; middleware does not.
- Legacy grants (`smm.bpi.social`, etc., stored in `menu_access`) remain valid —
  they are slug-based and the seeded slugs match. The previously-hardcoded
  `smm.bpi.*` / `smm.bsi.*` entries are produced by the generator with identical
  ids → existing access is preserved.
- Generated sections carry `group: 'Socmed Management'`, `subgroup: <project name>`
  for the admin UI grouping. `smm.all` (All Project) stays a static section.
- Default DENY: a newly created project is invisible to non-super-admins until
  granted.

## Management UI (All Project page)

- A "Kelola Project" panel on `/projects-all` (super admin only):
  - List of projects: name, badge preview, color, active/archived state.
  - **+ Tambah Project** → form: Name, short badge label, color picker (palette).
    On submit, slug is generated from the name (unique; suffix on collision).
  - Per-row: edit (name/badge/color/sort_order) and **Archive/Unarchive** toggle.
- API: `app/api/socmed-projects/route.ts`
  - `GET` — list (any authed user; used by sidebar/board too).
  - `POST` — create (super admin only; generates slug, service role).
  - `PATCH` — update / archive (super admin only).
- On create the project appears in the sidebar (after the client refetches) and
  its access sections appear in "Atur Akses" immediately; the super admin can
  open `/smm/<slug>` right away.

## Type changes

- `PostEntity` widens from `'bpi' | 'bsi' | 'ws'` to `string` (slug). Audit the
  handful of spots that switch on the literal union (e.g. `ENTITY_GLYPH`,
  analytics entity props) and make them slug-driven with safe fallbacks.

## Rollout / order

1. Migration: create `socmed_projects`, seed `bpi` + `bsi`.
2. API + a shared client source for the project list.
3. Dynamic routes `/smm/[project]` (+ `/social`) + scoped `next.config`
   redirects; remove old `/bpi`,`/bsi` board+social folders (audit extra legacy
   subfolders first — see Routing).
4. Dynamic sidebar + card glyph.
5. Dynamic access sections (generator + `sectionForPath` + access API/UI).
6. Management panel on All Project.
7. Widen `PostEntity` and fix call sites.

## Testing / verification

- Existing `/bpi`, `/bpi/social` URLs redirect and still show the same data.
- Existing posts render under their project unchanged; existing `menu_access`
  grants still gate correctly.
- Create a new project → appears in sidebar, board reachable at `/smm/<slug>`,
  can create posts there (`entity=<slug>`), section shows in "Atur Akses",
  non-super-admin only sees it once granted.
- Archive a project → disappears from sidebar/forms, posts retained, unarchive
  restores it.
- Type-check passes; non-super-admin gating verified for a dynamic slug.

## Risks

- Middleware must gate dynamic `/smm/<slug>` paths correctly via path-derived
  sections (no DB) — get the parsing exact, including subpaths.
- Removing static `/bpi`,`/bsi` folders while adding redirects — ensure no route
  shadowing and that internal links/notifications resolve.
- `PostEntity` widening can surface `switch`/exhaustiveness assumptions — audit.
