# Menu Access Control — Design Spec

**Date:** 2026-06-04
**Status:** Approved (design)

## Goal

Add per-account access control to the Bentala internal dashboard. A super
admin (`dandirivaldi@masterbagasi.com`) can access everything and is the only
person who can manage access. From a settings page, the super admin configures
which **sidebar sections (tab menus)** each login account may access.

## Decisions (locked)

- **Enforcement:** Server-enforced. Disallowed sections are hidden from the
  sidebar **and** blocked by middleware if the user types the URL directly.
- **Granularity:** Per sidebar **section** (not per individual page).
- **Default:** **Default-deny.** An account with no rule sees nothing until the
  super admin grants sections. Consequence: on rollout, every account except
  the super admin is locked out until granted. Mitigated by a one-click
  "Full access" toggle per account in the admin UI.
- **Account list:** Auto-listed from Supabase Auth users via the service role.

## Sections under control

The 10 sidebar sections, keyed by their existing `id` in `Sidebar.tsx`:

`overview`, `website`, `bpi`, `bsi`, `social`, `client`, `projects`, `ai`,
`team`, `settings`.

Route→section mapping is **explicit** (not naive URL prefix) because
`/website/leads` belongs to the **client** section, not `website`. Matching is
longest-prefix wins; `/` matches only the exact root path.

| Section   | Routes                                                                                  | Landing          |
|-----------|------------------------------------------------------------------------------------------|------------------|
| overview  | `/`                                                                                       | `/`              |
| website   | `/website/home`, `/website/about`, `/website/news`, `/website/seo`, `/website/navbar`     | `/website/home`  |
| bpi       | `/bpi`                                                                                    | `/bpi`           |
| bsi       | `/bsi`                                                                                    | `/bsi`           |
| social    | `/social`                                                                                 | `/social/accounts` |
| client    | `/website/leads`, `/clients`, `/invoices`                                                 | `/clients`       |
| projects  | `/projects`, `/tasks`, `/bpi-faizal`, `/bpi-reinaldi`, `/pipeline/vp`, `/pipeline/ds`     | `/projects`      |
| ai        | `/ai`                                                                                     | `/ai/chat`       |
| team      | `/team`                                                                                   | `/team`          |
| settings  | `/settings`                                                                               | `/settings/ai`   |

Routes that match no section (e.g. `/login`, `/no-access`, auth callbacks) are
**not gated** — they pass through. The manager page `/settings/access` is a
special case: **super admin only**, regardless of `settings` access.

## Architecture

### 1. `lib/access.ts` (new) — single source of truth
- `SUPER_ADMIN_EMAILS = ['dandirivaldi@masterbagasi.com']`.
- `ACCESS_SECTIONS: { id, label, routes: string[], landing: string }[]` — the
  table above.
- `sectionForPath(pathname): string | null` — **segment-aware** longest-prefix
  match: a route matches when `pathname === route` or
  `pathname.startsWith(route + '/')` (so `/bpi-faizal` does **not** match the
  `bpi` section's `/bpi` route); `/` matches only the exact root. This mirrors
  the existing `activeHref` logic in `Sidebar.tsx`. Query strings are ignored.
- `isSuperAdmin(email): boolean`.
- `firstAllowedLanding(sections: string[]): string | null`.

Imported by middleware, the sidebar, the admin page, and the API routes so the
mapping never drifts.

### 2. Data — `menu_access` table
SQL migration file at repo root: `schema_menu_access.sql`.

```
menu_access(
  email      text primary key,
  sections   text[] not null default '{}',
  updated_at timestamptz default now(),
  updated_by text
)
```
- RLS **enabled**.
- Policy `read_own_access`: `SELECT` allowed when
  `email = auth.jwt() ->> 'email'`. Lets middleware + sidebar read the current
  user's own row.
- No user-facing insert/update/delete policies. All writes go through the
  service-role admin API (bypasses RLS).

Applied to the remote project via the Supabase MCP `apply_migration` — confirm
with the user before applying.

### 3. Enforcement — `middleware.ts` (edit)
After the existing auth check (unauthenticated → `/login`):
1. Super admin → pass through everything.
2. `pathname` starts with `/settings/access` and **not** super admin →
   redirect to first allowed landing (or `/no-access`).
3. Resolve `section = sectionForPath(pathname)`.
   - `null` (unmapped) → pass through.
   - In the user's allowed sections → pass through.
   - Otherwise → redirect to the user's first allowed landing, or `/no-access`
     if they have none.

The user's allowed sections are read from `menu_access` using the same
cookie-bound server client already constructed in the middleware (RLS lets them
read their own row). Adds one indexed PK lookup per request — acceptable for an
internal tool.

### 4. Sidebar filtering — `Sidebar.tsx` (edit)
On mount, determine the current user's allowed section ids:
- Super admin → all sections.
- Otherwise → read own `menu_access` row via the browser Supabase client.
Filter the `sections` array to allowed ids before rendering. While loading,
render nothing section-wise (or a light skeleton) to avoid flashing menus the
user can't access.

### 5. Entry point — `AccountButton.tsx` (edit)
Add a **"Setting Access"** `PopupItem` (gear/shield icon) shown **only when the
current user is super admin**, linking to `/settings/access`. Also surface it
in the sidebar's `settings` section for the super admin.

### 6. Admin page — `app/(dashboard)/settings/access/` (new)
- `page.tsx` + `AccessControlClient.tsx`.
- Data via `/api/access`:
  - `GET` (super-admin-guarded): lists all Supabase Auth users (service role,
    `auth.admin.listUsers()`) merged with their `menu_access.sections`.
  - `POST` (super-admin-guarded): body `{ email, sections }` → upsert row,
    set `updated_by` to the caller's email.
- UI: one row per account (email + name/avatar), a checkbox grid of the 9
  manageable sections, plus **Full access** / **No access** quick toggles. Save
  per row writes via POST. The super admin's own row is shown as locked-on
  (always full access).

Both API handlers verify the caller is super admin by reading the session via
`createServerSupabase()` and checking `isSuperAdmin(user.email)`; otherwise
`403`.

### 7. `/no-access` page (new)
`app/no-access/page.tsx` — shown to a logged-in user with zero sections:
explanatory message ("Akun Anda belum memiliki akses ke menu apa pun. Hubungi
admin.") + logout button. Reachable while authenticated (not gated by section).

## Data flow

1. Super admin opens `/settings/access` → `GET /api/access` returns users +
   sections → toggles checkboxes → `POST /api/access` upserts `menu_access`.
2. A normal user logs in → middleware reads their `menu_access` row → blocks
   disallowed routes, redirects to first allowed landing. Sidebar shows only
   allowed sections. Changes take effect on next navigation (no re-login).

## Error handling

- Missing `menu_access` row → treated as empty sections (default-deny).
- `menu_access` read failure in middleware → fail **closed** for non-super
  admins (redirect to `/no-access`) so a DB blip can't open access. Super admin
  is never affected (checked by email before any DB read).
- API routes: non-super-admin → `403`; malformed body → `400`; unknown section
  ids in POST are filtered out against `ACCESS_SECTIONS`.

## Testing / verification

- Super admin sees all menus and can open every route + `/settings/access`.
- A user granted only `bpi` + `social`: sidebar shows only those; visiting
  `/ai/chat` redirects to `/bpi`; `/settings/access` redirects away.
- A user with no row: redirected to `/no-access`; sidebar empty.
- Non-super-admin `GET/POST /api/access` → `403`.
- Saving sections for an account immediately changes what that account sees on
  next navigation.

## Out of scope (YAGNI)

- Per-page (sub-item) granularity.
- Role/group abstractions (direct email→sections only).
- Audit log beyond `updated_by` / `updated_at`.
- Seeding existing users with full access (default-deny is intentional; the
  one-click Full-access toggle covers re-enabling).
