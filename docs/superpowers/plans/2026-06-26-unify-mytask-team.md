# Unify My Task & Production → My Task + Team — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the three near-identical worksheets (Video Production, Design Studio, My Task) into two clear surfaces — a per-user **My Task** (with a Dashboard summary tab) and a super-admin-only **Team** page (Overview + one auto tab per account) — with assignment unified on Tag Account.

**Architecture:** Reuse the existing `BPIPage` board (which already supports a per-user `mineScope`) for each account; add a small read-only `TaskDashboard` summary component; add a new `/team` page that lists Overview + per-account tabs; restructure the sidebar and gate `/team` to super admins. A non-destructive SQL migration adds the right account tag to legacy track tasks so they keep appearing.

**Tech Stack:** Next.js 14 App Router, React client components, Zustand store (`useStore`), Supabase (auth + `posts` table), TypeScript. Styling is inline-style objects matching the existing components.

## Global Constraints

- **Do NOT disturb the running web admin.** The dev server is live and the team is working. Tasks 1–8 are additive/non-breaking; the disruptive cutover is **Task 9**, to be run only in a safe window.
- **Never delete data.** No row deletes; no dropping of `pics`, `video_status`, `design_status`, `content_types`, or any tag. Migration only *adds* tags (union).
- **No `npm run build`** while the dev server runs (it corrupts the live `.next`). Verify every task with `npx tsc --noEmit -p tsconfig.json` plus a manual browser check at `http://localhost:3000`.
- **Do NOT push.** Commit locally only. Branch: `feat/crm-comms`.
- **Super admins:** `SUPER_ADMIN_EMAILS = ['dandirivaldi@masterbagasi.com']`; use `isSuperAdmin(email)` / `isEffectiveSuperAdmin(email, role)` from `lib/access.ts`.
- **Account mapping for migration:** Videographer = Faizal Kusuma `fzkusuma16@gmail.com`; Designer = Komengsteffy `reynaldisya1998@gmail.com`.
- **Status set everywhere:** `WS_STATUS_COLS` = To Do List · Revisi · Production · Review · Done, with per-track derivation via the existing `smmColKey`/`mineColKey`. Same behaviour as Video Production / Design Studio.

> **Testing note:** this codebase has no unit-test runner; the established verification pattern is `tsc --noEmit` + targeted manual checks against the live dev server. Each task below uses that as its test cycle instead of a unit-test file.

---

### Task 1: Extract reusable scope helpers in `BPIPage`

Make the "does this task belong to account X" predicate and the column-fold function reusable, so My Task, Team per-account, and the dashboards all agree with the board. Pure refactor — no behaviour change.

**Files:**
- Modify: `components/BPI/index.tsx`

**Interfaces:**
- Produces: `export function isAccountTask(p: Post, acct: { email: string; name: string }): boolean`
- Produces: `export function mineColKey(p: Post): string` (change existing `function mineColKey` to be exported)

- [ ] **Step 1: Export `mineColKey`**

In `components/BPI/index.tsx`, change the declaration:

```ts
export function mineColKey(p: Post): string {
```

(only adds the `export` keyword to the existing function at the `function mineColKey(p: Post)` definition.)

- [ ] **Step 2: Add `isAccountTask` helper**

Immediately after the `mineColKey` function (before `const MINE_COL_STATUS`), add:

```ts
// A task belongs to an account's personal board when that account is tagged on
// it, OR it's that account's own personal/ad-hoc task. Shared by My Task, the
// Team per-account tabs, and the summary dashboards so they always agree.
export function isAccountTask(p: Post, acct: { email: string; name: string }): boolean {
  const tags = (p.tagged || []).map(x => (x || '').toLowerCase())
  const taggedMe = tags.includes(acct.email.toLowerCase())
  const myPersonal = p.entity === 'personal' && (p.created_by || '') === acct.name
  return taggedMe || myPersonal
}
```

- [ ] **Step 3: Use the helper in the board filter**

In the `filtered` `useMemo`, replace the `mineScope` block:

```ts
      if (mineScope) {
        // My Task receives project tasks ONLY via tagging; plus my own personal
        // tasks (the private 'personal' bucket created from here).
        const tags = (p.tagged || []).map(x => (x || '').toLowerCase())
        const taggedMe = tags.includes(mineScope.email.toLowerCase())
        const myPersonal = p.entity === 'personal' && (p.created_by || '') === mineScope.name
        if (!taggedMe && !myPersonal) return false
      } else if (allProjects
```

with:

```ts
      if (mineScope) {
        if (!isAccountTask(p, mineScope)) return false
      } else if (allProjects
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0, no errors.

- [ ] **Step 5: Manual check**

Open `http://localhost:3000/my-task` — board still shows the same tasks as before (no change).

- [ ] **Step 6: Commit**

```bash
git add components/BPI/index.tsx
git commit -m "refactor(my-task): extract isAccountTask + export mineColKey"
```

---

### Task 2: `TaskDashboard` summary component

A read-only summary used by both My Task › Dashboard (single account) and Team › Overview (all accounts, with per-account breakdown).

**Files:**
- Create: `components/BPI/TaskDashboard.tsx`

**Interfaces:**
- Consumes: `isAccountTask`, `mineColKey` (Task 1); `WS_STATUS_COLS` (`lib/constants`); `Post`, `Subtask` (`lib/types`).
- Produces: `export function TaskDashboard({ posts, accounts }: { posts: Post[]; accounts?: { email: string; name: string }[] }): JSX.Element`
  - When `accounts` is omitted → aggregate summary of `posts`.
  - When `accounts` is provided → same top aggregate plus a per-account breakdown table (used by Team Overview).

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useMemo } from 'react'
import { useT } from '@/lib/i18n/LanguageProvider'
import { WS_STATUS_COLS } from '@/lib/constants'
import type { Post } from '@/lib/types'
import { isAccountTask, mineColKey } from './index'

type Acct = { email: string; name: string }

function tally(posts: Post[]) {
  const counts: Record<string, number> = { brief: 0, revisi: 0, produksi: 0, review: 0, done: 0 }
  for (const p of posts) {
    const col = mineColKey(p)
    if (col in counts) counts[col] += 1
  }
  const total = posts.length
  const done = counts.done
  return { counts, total, done, open: total - done }
}

function dueSoon(posts: Post[]): number {
  // Tasks with a date within the next 7 days that aren't Done yet.
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const limit = new Date(today); limit.setDate(limit.getDate() + 7)
  let n = 0
  for (const p of posts) {
    if (mineColKey(p) === 'done') continue
    if (!p.date) continue
    const d = new Date(p.date)
    if (d >= today && d <= limit) n += 1
  }
  return n
}

export function TaskDashboard({ posts, accounts }: { posts: Post[]; accounts?: Acct[] }) {
  const t = useT()
  const agg = useMemo(() => tally(posts), [posts])
  const soon = useMemo(() => dueSoon(posts), [posts])

  const perAccount = useMemo(() => {
    if (!accounts) return null
    return accounts
      .map(a => ({ account: a, ...tally(posts.filter(p => isAccountTask(p, a))) }))
      .filter(r => r.total > 0)
      .sort((x, y) => y.open - x.open)
  }, [accounts, posts])

  const card = (label: string, value: number, color: string) => (
    <div style={{ flex: '1 1 120px', minWidth: 120, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{label}</div>
    </div>
  )

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {card(t('Total Task'), agg.total, 'var(--text)')}
        {card(t('Belum selesai'), agg.open, '#5b9bd5')}
        {card(t('Selesai'), agg.done, '#43d9a2')}
        {card(t('Due 7 hari'), soon, '#ffc542')}
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', marginBottom: 8 }}>{t('Per Status')}</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {WS_STATUS_COLS.map(c => (
            <div key={c.key} style={{ flex: '1 1 110px', minWidth: 110, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: c.color }}>{agg.counts[c.key] ?? 0}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 2 }}>{c.label}</div>
            </div>
          ))}
        </div>
      </div>

      {perAccount && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', marginBottom: 8 }}>{t('Per Akun')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {perAccount.length === 0 && <div style={{ fontSize: 13, color: 'var(--text3)' }}>{t('Belum ada task.')}</div>}
            {perAccount.map(r => (
              <div key={r.account.email} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.account.name}</div>
                {WS_STATUS_COLS.map(c => (
                  <div key={c.key} title={c.label} style={{ fontSize: 12, color: 'var(--text2)', minWidth: 34, textAlign: 'center' }}>
                    <span style={{ color: c.color, fontWeight: 700 }}>{r.counts[c.key] ?? 0}</span>
                  </div>
                ))}
                <div style={{ fontSize: 12, color: 'var(--text3)', minWidth: 56, textAlign: 'right' }}>{r.open}/{r.total}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add components/BPI/TaskDashboard.tsx
git commit -m "feat(my-task): TaskDashboard summary component"
```

---

### Task 3: Add the **Dashboard** tab to My Task

Add a `dashboard` tab key, render `TaskDashboard` for the current user when it's active, keep the existing board tabs for the rest.

**Files:**
- Modify: `components/shared/PageHeader.tsx` (add `dashboard` to `TabKey`, label, icon)
- Modify: `app/(dashboard)/my-task/page.tsx`

**Interfaces:**
- Consumes: `TaskDashboard` (Task 2); `isAccountTask` (Task 1); `useStore` posts.
- Produces: My Task tab order `['dashboard','board','list','calendar','files']`.

- [ ] **Step 1: Extend `TabKey` + label + icon**

In `components/shared/PageHeader.tsx`:

Add to `TAB_LABELS` (object literal): `dashboard: 'Dashboard',`

Add to `TAB_ICONS` (object literal):

```tsx
  dashboard: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/>
      <rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>
    </svg>
  ),
```

Change the `TabKey` type:

```ts
export type TabKey = 'dashboard' | 'list' | 'board' | 'calendar' | 'files' | 'analytics' | 'brief' | 'accounts' | 'reports' | 'plan'
```

- [ ] **Step 2: Render the dashboard tab in My Task**

Replace the body of `app/(dashboard)/my-task/page.tsx` with:

```tsx
'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { PageHeader, type TabKey } from '@/components/shared/PageHeader'
import { BPIPage, BoardFilter, useBoardFilter, isAccountTask, type BPIPageHandle, type BPITabType } from '@/components/BPI'
import { TaskDashboard } from '@/components/BPI/TaskDashboard'
import { useStore } from '@/hooks/useStore'
import { useT } from '@/lib/i18n/LanguageProvider'
import { getSupabase } from '@/lib/supabase'

// "My Task" — a personal board for the logged-in account: every task that tags
// me (Tag Account) OR that I created, across all projects.
export default function MyTaskPage() {
  const t = useT()
  const [tab, setTab] = useState<TabKey>('dashboard')
  const ref = useRef<BPIPageHandle>(null)
  const bf = useBoardFilter('all')
  const [me, setMe] = useState<{ email: string; name: string } | null>(null)
  const posts = useStore(s => s.posts)

  useEffect(() => {
    getSupabase().auth.getUser().then(({ data }) => {
      const u = data.user
      if (!u) return
      const meta = u.user_metadata ?? {}
      setMe({
        email: (u.email ?? '').toLowerCase(),
        name: meta.full_name ?? meta.name ?? u.email?.split('@')[0] ?? '',
      })
    })
  }, [])

  const myPosts = useMemo(
    () => (me ? posts.filter(p => !p.deleted_at && isAccountTask(p, me)) : []),
    [posts, me],
  )

  return (
    <>
      <PageHeader
        title="My Task"
        tabs={['dashboard', 'board', 'list', 'calendar', 'files']}
        activeTab={tab}
        onTabChange={setTab}
        tabsRight={
          tab !== 'dashboard'
            ? <BoardFilter filters={bf.filters} setFilters={bf.setFilters} accounts={bf.accounts} months={bf.months} projects={bf.projects} personal />
            : undefined
        }
        action={
          <button
            onClick={() => ref.current?.openEdit()}
            style={{ height: 32, padding: '0 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >
            + {t('Tambah Task')}
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto min-h-0">
        {me && tab === 'dashboard' && <TaskDashboard posts={myPosts} />}
        {me && tab !== 'dashboard' && (
          <BPIPage ref={ref} entity="bpi" mineScope={me} activeTab={tab as BPITabType} filters={bf.filters} currentUser="" />
        )}
      </div>
    </>
  )
}
```

> Note: `+ Tambah Task` calls `ref.current?.openEdit()`. When `tab === 'dashboard'`, `BPIPage` isn't mounted so `ref.current` is null and the click is a no-op. This is acceptable (Add is available from the board tabs). If desired later, switch to the board tab on click — out of scope here.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 4: Manual check**

Open `http://localhost:3000/my-task`. The **Dashboard** tab is first and shows summary cards (Total/Belum selesai/Selesai/Due 7 hari + per-status). Board/List/Calendar/Files behave as before; the Filter button hides on the Dashboard tab.

- [ ] **Step 5: Commit**

```bash
git add components/shared/PageHeader.tsx "app/(dashboard)/my-task/page.tsx"
git commit -m "feat(my-task): add Dashboard summary tab"
```

---

### Task 4: `/team` page — Overview + per-account tabs (super admin)

A new page that super admins use to see every account. Top row = `Overview` + one button per account. Overview renders `TaskDashboard` across all accounts; selecting an account renders that account's board via `BPIPage` with `mineScope` set to them.

**Files:**
- Create: `app/(dashboard)/team/page.tsx`

**Interfaces:**
- Consumes: `BPIPage`, `useBoardFilter`, `BoardFilter`, `isAccountTask`, `BPIPageHandle`, `BPITabType` (`components/BPI`); `TaskDashboard` (Task 2); `isSuperAdmin` (`lib/access`); `/api/accounts`.

- [ ] **Step 1: Create the page**

```tsx
'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, type TabKey } from '@/components/shared/PageHeader'
import { BPIPage, useBoardFilter, isAccountTask, type BPIPageHandle, type BPITabType } from '@/components/BPI'
import { TaskDashboard } from '@/components/BPI/TaskDashboard'
import { useStore } from '@/hooks/useStore'
import { useT } from '@/lib/i18n/LanguageProvider'
import { getSupabase } from '@/lib/supabase'
import { isSuperAdmin } from '@/lib/access'

type Acct = { email: string; name: string }

// "Team" — super-admin-only window into every account's board. Overview = a
// summary across all accounts; each account tab = that account's full board.
export default function TeamPage() {
  const t = useT()
  const router = useRouter()
  const ref = useRef<BPIPageHandle>(null)
  const bf = useBoardFilter('all')
  const posts = useStore(s => s.posts)

  const [ready, setReady] = useState(false)
  const [accounts, setAccounts] = useState<Acct[]>([])
  // active = 'overview' or an account email
  const [active, setActive] = useState<string>('overview')
  const [innerTab, setInnerTab] = useState<TabKey>('board')

  // Guard: super admin only. Non-supers are bounced to their own My Task.
  useEffect(() => {
    let cancelled = false
    getSupabase().auth.getUser().then(({ data }) => {
      if (cancelled) return
      if (!isSuperAdmin(data.user?.email)) { router.replace('/my-task'); return }
      setReady(true)
    })
    return () => { cancelled = true }
  }, [router])

  // Accounts list drives the per-account tabs.
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    fetch('/api/accounts')
      .then(r => (r.ok ? r.json() : { accounts: [] }))
      .then((d: { accounts?: Acct[] }) => { if (!cancelled) setAccounts(d.accounts ?? []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [ready])

  const activeAcct = useMemo(
    () => accounts.find(a => a.email === active) ?? null,
    [accounts, active],
  )

  const allPosts = useMemo(
    () => posts.filter(p => !p.deleted_at && accounts.some(a => isAccountTask(p, a))),
    [posts, accounts],
  )

  if (!ready) return null

  return (
    <>
      <PageHeader
        title="Team"
        action={
          activeAcct
            ? <button onClick={() => ref.current?.openEdit()} style={{ height: 32, padding: '0 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>+ {t('Tambah Task')}</button>
            : undefined
        }
      />

      {/* Account switcher row */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
        <button
          onClick={() => setActive('overview')}
          style={chip(active === 'overview')}
        >{t('Overview')}</button>
        {accounts.map(a => (
          <button key={a.email} onClick={() => setActive(a.email)} style={chip(active === a.email)}>{a.name}</button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {active === 'overview' && <TaskDashboard posts={allPosts} accounts={accounts} />}
        {activeAcct && (
          <>
            <div style={{ display: 'flex', gap: 6, padding: '8px 24px 0' }}>
              {(['dashboard', 'board', 'list', 'calendar', 'files'] as TabKey[]).map(tk => (
                <button key={tk} onClick={() => setInnerTab(tk)} style={chip(innerTab === tk)}>{tk}</button>
              ))}
            </div>
            {innerTab === 'dashboard'
              ? <TaskDashboard posts={posts.filter(p => !p.deleted_at && isAccountTask(p, activeAcct))} />
              : <BPIPage ref={ref} entity="bpi" mineScope={activeAcct} activeTab={innerTab as BPITabType} filters={bf.filters} currentUser="" />}
          </>
        )}
      </div>
    </>
  )
}

function chip(activeState: boolean): React.CSSProperties {
  return {
    height: 30, padding: '0 12px', borderRadius: 8, cursor: 'pointer',
    border: `1px solid ${activeState ? 'var(--accent)' : 'var(--border)'}`,
    background: activeState ? 'rgba(108,99,255,0.15)' : 'var(--bg3)',
    color: activeState ? 'var(--accent)' : 'var(--text2)',
    fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', textTransform: 'capitalize',
  }
}
```

> The inner board reuses `BoardFilter` filters only on the board tabs via `bf.filters`; a Filter button isn't shown for Team in this first cut (Overview + per-account browsing is the goal). Adding a per-account Filter button is a later enhancement, out of scope.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 3: Manual check (super admin)**

Logged in as `dandirivaldi@masterbagasi.com`, open `http://localhost:3000/team`. Overview shows the aggregate + per-account breakdown. Clicking an account name shows that account's board (and a dashboard sub-tab). (Sidebar link comes in Task 6; navigate by URL for now.)

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/team/page.tsx"
git commit -m "feat(team): super-admin Team page — Overview + per-account tabs"
```

---

### Task 5: Gate `/team` to super admins in middleware

Server-side enforcement so a non-super can't reach `/team` by typing the URL.

**Files:**
- Modify: `middleware.ts`

**Interfaces:**
- Consumes: existing `isSuperOnlyPage` logic.

- [ ] **Step 1: Add `/team` to the super-only set**

In `middleware.ts`, extend `isSuperOnlyPage`:

```ts
    const isSuperOnlyPage =
      pathname === '/settings/access' || pathname.startsWith('/settings/access/') ||
      pathname === '/settings/projects' || pathname.startsWith('/settings/projects/') ||
      pathname === '/team' || pathname.startsWith('/team/')
```

> `/team` deliberately is NOT added to the escape-hatch branch (`if (isSuper && isSuperOnlyPage)` already covers super access at line ~93); the `if (isSuperOnlyPage)` deny branch (~131) then blocks non-supers. Confirm both branches reference the same `isSuperOnlyPage` variable so adding `/team` covers allow + deny together.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 3: Manual check**

As a non-super account, navigating to `/team` redirects away (no access). As super admin, `/team` opens.

- [ ] **Step 4: Commit**

```bash
git add middleware.ts
git commit -m "feat(team): gate /team to super admins in middleware"
```

---

### Task 6: Sidebar — add **Team** (super admin) and move **All Projects / Task Board** into Projects

Additive sidebar change. **Keep** Video Production & Design Studio items for now (removed in the cutover, Task 9) so the live team isn't disturbed.

**Files:**
- Modify: `components/Sidebar.tsx`

- [ ] **Step 1: Move All Projects + Task Board into the `smm` (Projects) section**

In the `smm` section's `items` array (the one with `fullLabel: 'Projects'`), after the `'/projects-all'` item and the `...smmProjects.map(...)` spread, append:

```tsx
        { href: '/projects', label: 'All Projects', icon: <FolderIcon />, color: COLOR.orange },
        { href: '/tasks',    label: 'Task Board',   icon: <TaskIcon />,   color: COLOR.green },
```

- [ ] **Step 2: Turn the `projects` (Productions) section into **Team** (super admin only)**

Replace the entire `projects` section object:

```tsx
    {
      id: 'projects',
      badge: <BrandBadge text="prod" />,
      fullLabel: 'Productions',
      items: [
        { href: '/projects',     label: 'All Projects',     icon: <FolderIcon />, color: COLOR.orange },
        { href: '/tasks',        label: 'Task Board',       icon: <TaskIcon />,   color: COLOR.green },
        { href: '/bpi-faizal',   label: 'Video Production', icon: <VideoIcon />,  color: COLOR.red },
        { href: '/bpi-reinaldi', label: 'Design Studio',    icon: <DesignIcon />, color: COLOR.purple },
      ],
    },
```

with:

```tsx
    {
      id: 'team',
      badge: <BrandBadge text="team" />,
      fullLabel: 'Team',
      items: [
        // Super-admin-only window into every account's board (Overview + per
        // account). Gated with access.isSuper here AND in middleware.
        ...(access.isSuper
          ? [{ href: '/team', label: 'Team', icon: <TaskIcon />, color: COLOR.green }]
          : []),
        // Video Production / Design Studio are kept available until the cutover
        // (Task 9) so the live team isn't disrupted mid-work.
        { href: '/bpi-faizal',   label: 'Video Production', icon: <VideoIcon />,  color: COLOR.red },
        { href: '/bpi-reinaldi', label: 'Design Studio',    icon: <DesignIcon />, color: COLOR.purple },
      ],
    },
```

- [ ] **Step 3: Add `access.isSuper` to the `sections` `useMemo` deps**

The `sections` `useMemo` dependency array (currently `[access.isSuper, smmProjects]`) already includes `access.isSuper` — confirm it still does after the edit. If not, add it.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 5: Manual check**

As super admin: the **Team** section shows `Team`, `Video Production`, `Design Studio`; the **Projects** section now also lists `All Projects` and `Task Board`. As a non-super: no `Team` link (but VP/DS still visible if granted). Nothing previously reachable disappeared.

- [ ] **Step 6: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat(team): add Team sidebar entry; move All Projects/Task Board to Projects"
```

---

### Task 7: Register Projects-group access ids for the relocated routes

`/projects` and `/tasks` already map to sections `projects.all` / `projects.tasks` (group "Projects") in `lib/access.ts`. They keep working after the sidebar move — **no access change needed**. This task only **verifies** that and adds a comment so the moved items stay grant-compatible.

**Files:**
- Modify: `lib/access.ts` (comment only)

- [ ] **Step 1: Confirm sections exist**

Run: `grep -n "projects.all\|projects.tasks\|projects.vp\|projects.ds" lib/access.ts`
Expected: the four `projects.*` sections print. No code change to their ids/routes (legacy grants keep resolving).

- [ ] **Step 2: Add an orientation comment** above the `// Projects` block in `STATIC_SECTIONS`:

```ts
  // Projects — `projects.all` / `projects.tasks` now surface in the Projects
  // sidebar group; `projects.vp` / `projects.ds` remain until the Team cutover.
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit -p tsconfig.json` (exit 0)

```bash
git add lib/access.ts
git commit -m "docs(access): note Projects-group routes after Team move"
```

---

### Task 8: Non-destructive data migration — tag legacy track tasks

Add the videographer / designer account tag to every legacy task so it shows in their My Task. **Adds tags only**; never removes anything; safe to run while VP/DS still work (they read `pics`, untouched).

**Files:**
- Migration run via Supabase MCP `execute_sql` (idempotent UPDATEs). No file.

**Interfaces:**
- Faizal = `fzkusuma16@gmail.com`; Komengsteffy = `reynaldisya1998@gmail.com`.

- [ ] **Step 1: Dry-run counts (read-only)**

Run via Supabase `execute_sql`:

```sql
select
  count(*) filter (where 'Video Production' = any(pics) or 'video' = any(content_types) or 'fzkusuma16@gmail.com' = any(tagged)) as video_like,
  count(*) filter (where 'Design Studio'   = any(pics) or 'design' = any(content_types) or 'reynaldisya1998@gmail.com' = any(tagged)) as design_like
from posts
where deleted_at is null;
```

Expected: two counts (the number of tasks each rule will ensure-tag). Note them.

- [ ] **Step 2: Tag videographer (Faizal) — idempotent**

```sql
update posts
set tagged = array_append(coalesce(tagged, '{}'), 'fzkusuma16@gmail.com')
where deleted_at is null
  and not ('fzkusuma16@gmail.com' = any(coalesce(tagged, '{}')))
  and (
    'Video Production' = any(coalesce(pics, '{}'))
    or 'video' = any(coalesce(content_types, '{}'))
  );
```

> Note: the third trigger ("already tagged Faizal") is a no-op for tagging — if already tagged, nothing to add — so it's intentionally omitted from the WHERE here.

- [ ] **Step 3: Tag designer (Komengsteffy) — idempotent**

```sql
update posts
set tagged = array_append(coalesce(tagged, '{}'), 'reynaldisya1998@gmail.com')
where deleted_at is null
  and not ('reynaldisya1998@gmail.com' = any(coalesce(tagged, '{}')))
  and (
    'Design Studio' = any(coalesce(pics, '{}'))
    or 'design' = any(coalesce(content_types, '{}'))
  );
```

- [ ] **Step 4: Verify nothing was dropped**

```sql
select count(*) as faizal_tasks from posts where 'fzkusuma16@gmail.com' = any(tagged) and deleted_at is null;
select count(*) as komeng_tasks from posts where 'reynaldisya1998@gmail.com' = any(tagged) and deleted_at is null;
```

Expected: counts ≥ the dry-run numbers; `pics`, `content_types`, `video_status`, `design_status` unchanged (spot-check a couple of rows).

- [ ] **Step 5: Manual check**

Faizal's account → My Task shows the migrated video tasks; Komengsteffy's → the design tasks. Their old Video Production / Design Studio boards still show the same tasks too (unchanged).

> No git commit — this is a data migration, not a code change. Record the executed SQL in the PR description / changelog when the work is eventually shared.

---

### Task 9: CUTOVER — retire Video Production / Design Studio (run only in a safe window)

**Do NOT run while the production team is working.** This removes the old boards from the sidebar and redirects their routes to `/team`. All data remains; only navigation changes.

**Files:**
- Modify: `components/Sidebar.tsx` (remove VP/DS items from the `team` section)
- Modify: `app/(dashboard)/bpi-faizal/page.tsx` (redirect)
- Modify: `app/(dashboard)/bpi-reinaldi/page.tsx` (redirect)

- [ ] **Step 1: Remove VP/DS from the sidebar `team` section**

In the `team` section, delete the two trailing items so only the super-admin `Team` link remains:

```tsx
    {
      id: 'team',
      badge: <BrandBadge text="team" />,
      fullLabel: 'Team',
      items: [
        ...(access.isSuper
          ? [{ href: '/team', label: 'Team', icon: <TaskIcon />, color: COLOR.green }]
          : []),
      ],
    },
```

- [ ] **Step 2: Redirect the old routes to `/team`**

Replace `app/(dashboard)/bpi-faizal/page.tsx` entirely:

```tsx
import { redirect } from 'next/navigation'

// Video Production has been absorbed into Team / each person's My Task.
export default function FaizalRedirect() {
  redirect('/team')
}
```

Replace `app/(dashboard)/bpi-reinaldi/page.tsx` entirely:

```tsx
import { redirect } from 'next/navigation'

// Design Studio has been absorbed into Team / each person's My Task.
export default function ReinaldiRedirect() {
  redirect('/team')
}
```

> Because `/team` is super-admin-only, a non-super hitting `/bpi-faizal` is redirected to `/team`, where middleware then bounces them to their own landing. Acceptable post-cutover (the videographer/designer use **My Task**). If a friendlier target is wanted for non-supers, redirect to `/my-task` instead — decide at cutover time.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 4: Manual check**

`/bpi-faizal` and `/bpi-reinaldi` now redirect. Sidebar `Team` section shows only the super-admin `Team` link. My Task / Team carry all the work.

- [ ] **Step 5: Commit**

```bash
git add components/Sidebar.tsx "app/(dashboard)/bpi-faizal/page.tsx" "app/(dashboard)/bpi-reinaldi/page.tsx"
git commit -m "feat(team): cutover — retire Video Production/Design Studio into Team"
```

---

## Post-implementation notes

- The access sections `projects.vp` / `projects.ds` remain defined in `lib/access.ts` (harmless; their routes now redirect). They can be pruned later in a dedicated cleanup once no menu_access rows reference them.
- `content_types` and `pics` are untouched and still usable elsewhere; they simply no longer *route* a task to a track board.
- Adding a per-account Filter button on Team and a "switch to board on + Tambah from Dashboard" affordance are deliberate follow-ups, not part of this plan.
