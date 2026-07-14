# Access-Based Dashboard Placement — Design

**Date:** 2026-07-06
**Status:** Approved design, pending spec review

## Problem

An account with no **general Dashboard** grant (`overview`) and no **project**
access lands nowhere useful — the general Dashboard (`/`) is hidden by access
gating, and their only real surface is the ungated **My Task** page, whose
dashboard is buried as an inner tab. These "personal-only" users should get a
first-class Dashboard at the very top of the sidebar.

Accounts that *do* have project access already have a home (their project
boards), so nothing changes for them — the My Task dashboard stays an inner tab.

## Definitions

- **Project access** — the account holds any *board* grant: `projects.*`
  (Projects group: All Projects, Task Board, Video Production, Design Studio),
  `smm.all`, or a project's `smm.<slug>.social` / `smm.<slug>.projects`.
  A **chat-only** grant (`smm.<slug>.chat`) does **not** count — chat is an
  independent grant, and a chat-only account still has no dashboard/board of its
  own, so it stays personal-only.
- **Personal-only account** — `!allowed.has('overview') && !hasProjectAccess(allowed)`.
  A super admin with no `menu_access` row (`fullBypass`) is **never**
  personal-only (they see everything).

## Behavior

| Account | Sidebar top | My Task tabs | `/` and login landing |
|---|---|---|---|
| **Personal-only** | New **"Dashboard"** item at the very top → `/my-task/dashboard` | board, list, calendar, files (**no** dashboard tab) | redirected to `/my-task/dashboard` |
| Has `overview` and/or project | Unchanged (general Dashboard `/` if `overview`; project boards if project) | dashboard, board, list, calendar, files (**unchanged**) | unchanged |

The general Dashboard (`/`) remains gated by `overview` and is untouched. The
personal Dashboard is the **same** `TaskDashboard` the My Task dashboard tab
renders today — only its placement changes.

## Components & changes

1. **lib/access.ts** — add two pure helpers (shared by client + middleware):
   - `hasProjectAccess(allowed: Set<string> | string[]): boolean` — true if any
     id matches `/^projects\./`, equals `smm.all`, or matches
     `/^smm\.[a-z0-9-]+\.(social|projects)$/`. Chat grants (`.chat`) are excluded.
   - `isPersonalOnly(allowed: Set<string> | string[]): boolean` — the definition
     above. Callers pass `fullBypass` separately (a fullBypass super short-circuits
     to `false` at the call site / in the hook).

2. **hooks/useAccess.ts** (new) — extract the `menu_access` resolution currently
   inline in `Sidebar` into a reusable hook returning
   `{ loading, isSuper, fullBypass, allowed: Set<string>, personalOnly }`.
   Keeps the existing realtime subscription (re-resolves on `menu_access`
   changes) so grant changes apply live everywhere it's consumed. Behavior is a
   byte-for-byte extraction of Sidebar's current logic — no semantic change.

3. **components/BPI/MyTaskDashboardView.tsx** (new) — extract the dashboard slice
   of `my-task/page.tsx`: resolves the auth `me`, computes `myPosts`
   (non-deleted, non-`todo`, `isAccountTask`) and date-ranged `dashPosts`, wires
   `useBoardFilter` for `projects`, and renders `<TaskDashboard>`. Consumed by
   both the new route and the My Task dashboard tab so the two never drift.

4. **app/(dashboard)/my-task/dashboard/page.tsx** (new) — standalone personal
   dashboard: a `PageHeader` (title "Dashboard", date filter, no tabs) +
   `<MyTaskDashboardView>`. Ungated (`sectionForPath` returns `null`), so any
   logged-in account can reach it; it's only *linked* for personal-only users.

5. **app/(dashboard)/my-task/page.tsx** — when `personalOnly`, drop `dashboard`
   from the `tabs` array and default the active tab to `board`. Otherwise
   unchanged (dashboard tab still rendered via the shared view).

6. **components/Sidebar.tsx** — consume `useAccess`. When `personalOnly`,
   prepend a **Dashboard** nav item (`/my-task/dashboard`, dashboard icon) as
   the first item of the `overview` section, above Chat / My Task. The general
   Dashboard (`/`) item stays gated by `overview` and is hidden for these users.

7. **middleware.ts** — when the resolved account is personal-only and hits a
   gated route (including `/`), redirect to `/my-task/dashboard` instead of
   `firstAllowedLanding(...) ?? '/no-access'`. Uses the same pure
   `isPersonalOnly` helper server-side.

## Data flow

`menu_access` (Supabase, RLS-scoped to the caller) → `useAccess` (client,
realtime) / middleware query (server) → `isPersonalOnly` → drives (a) the
sidebar Dashboard item, (b) the My Task tab set, (c) the login/`/` landing.
All three read the one helper, so they can't disagree.

## Routing & active state

- `/my-task/dashboard` — personal dashboard (new). Longest-prefix active-match
  highlights the Dashboard item; `/my-task` (exact) highlights My Task. No
  double-highlight.
- Project-access users have no sidebar link to `/my-task/dashboard`; visiting it
  directly still renders harmlessly (ungated). No redirect needed.

## Edge cases

- **fullBypass super** → `personalOnly = false`; sees general Dashboard as today.
- **Zero grants at all** → personal-only; lands on `/my-task/dashboard`; sidebar
  shows Dashboard + My Task (+ Chat only if they hold a chat grant).
- **Realtime grant change** — an admin granting `overview`/a project flips
  `personalOnly` live via the `menu_access` subscription: the top Dashboard item
  disappears and the My Task dashboard tab returns without a reload.
- **Direct nav to `/`** by a personal-only user → middleware redirect to
  `/my-task/dashboard`.

## Out of scope

- No change to the general Dashboard (`/`) page content or its `overview` grant.
- No new access grant is introduced (personal-only is *derived*, not stored).
- No change to project board dashboards.

## Approach decisions (approved)

- Shared `useAccess` hook (Sidebar refactored onto it) — chosen over duplicating
  the fetch, for one realtime-consistent source of truth.
- Personal-only landing → `/my-task/dashboard`.
- Project access = `smm.*` OR `projects.*`.
- Personal-only: dashboard is **extracted** from My Task (not duplicated).
