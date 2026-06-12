# Web Admin Performance — Audit & Fixes

Date: 2026-06-12
Status: Approved (approach)

## Goal

The web admin feels slow ("sangat lama dan lemot"). Make navigation and data loads
noticeably faster. This is **Track B**, independent of the chat features (Track A).

## Principle: measure first, then fix

Performance is diagnosed, not guessed. We profile, rank the worst offenders, fix the
top few, re-measure. Each fix is small and verifiable so we never trade correctness for
speed.

## Phase 1 — Measure

1. **Bundle**: run a production build with bundle analysis; record the largest route
   chunks and shared chunks, and flag heavy dependencies (charts, date libs, icon packs,
   editors) that aren't code-split or lazy-loaded.
2. **API latency**: time the dashboard's data routes (`/api/accounts`, social analytics,
   access, projects, etc.). Note which are slow and which are re-fetched on every
   navigation. (A prior commit already cached `/api/accounts` — confirms this is a real
   axis.)
3. **Supabase queries**: look for `select *`, missing indexes on hot filters, and
   N+1 patterns in the slow routes.
4. **Client rendering**: identify pages that re-fetch on mount with no cache, large
   client components that could be server components, and unnecessary re-renders
   (unmemoized context/props).

Output of Phase 1: a ranked list of the 3–5 biggest wins with rough cost/impact.

## Phase 2 — Fix (high-impact, low-risk first)

Likely fixes, to be confirmed by Phase 1 measurements:

- **Cache + dedupe data fetching**: adopt a consistent client cache (e.g. SWR-style
  stale-while-revalidate or a shared in-memory cache like the existing `/api/accounts`
  pattern) so revisiting a page doesn't re-hit slow endpoints.
- **Code-split heavy UI**: `next/dynamic` (ssr:false where safe) for charts, editors,
  and other heavy widgets so they don't bloat the initial bundle.
- **Trim queries**: replace `select *` with explicit columns on hot paths; add Postgres
  indexes for the filters those routes use; collapse N+1 into single queries.
- **Server-render where cheap**: move static/data-only pages to server components / route
  caching where it doesn't fight the existing auth model.
- **Reduce re-renders**: memoize expensive derived data and stable callbacks on the
  heaviest pages only (not a blanket refactor).

## Phase 3 — Verify

Re-measure the same metrics from Phase 1 and report before/after for each fix. No silent
regressions: each change is independently revertible.

## Constraints

- Don't break the access-control model (middleware + RLS) while moving things between
  server/client.
- No `npm run build` while the dev server is running (corrupts `.next`); use a separate
  build invocation or stop dev first. Typecheck with `tsc` during iteration.
- Keep changes scoped — no broad rewrites; targeted fixes ranked by measured impact.

## Phase 1 findings (measured 2026-06-12)

Production build (`next build`) + static audit:

1. **Middleware is the #1 app-wide cost.** It matches every non-static request
   (all pages AND all `/api/*` calls) and on each runs `supabase.auth.getUser()`
   — a network round-trip to the Supabase Auth server — plus, for non-super
   users, a `menu_access` Postgres query. So every navigation pays 1–2 remote
   round-trips before render, and every API call paid the same.
   - **Applied (safe):** skip the section-gate block (the `menu_access` query +
     redirect logic, which only matches page paths) for `/api/*` requests.
     Removes a DB query from every API call; `getUser` auth is unchanged.
   - **Bigger win, needs audit:** drop `getUser()` from `/api/*` entirely by
     excluding `/api` from the matcher — only safe once every API route is
     confirmed to self-authenticate (some appear to rely on shared helpers /
     RLS; a per-route pass is required before this).
2. **No client cache library** (no SWR/react-query). Repeated navigations
   re-fetch the same endpoints. A prior commit hand-cached `/api/accounts`,
   confirming this axis. Recommend a small SWR-style cache for hot reads.
3. **Bundle sizes are moderate** (most routes 170–270 kB First Load JS; shared
   87 kB). A few heavy pages: `/website/home/hero` 340 kB, `/website/about/content`
   337 kB, `/smm/[project]/social` 294 kB. Lazy-loading their heavy widgets
   (`next/dynamic`) trims initial load, but this is a secondary win vs the
   middleware round-trips.
4. **`select *` in 7 API routes** — trim to needed columns on hot paths.

Ranked next steps: (1) verify API self-gating → exclude `/api` from middleware;
(2) client SWR cache for hot reads; (3) lazy-load the 3 heavy pages; (4) trim
`select *`.

## Phase 2 outcomes (2026-06-12)

**Item 1 — exclude `/api` from middleware: REJECTED as unsafe.** Audit of all 49
API routes found the app's API security *depends on the middleware*: most `/api/ai/*`
(expensive external calls), proxies, render, and **3 RLS-bypassing admin routes**
(`settings/ai/[provider]`, `settings/ai/[provider]/test`, `settings/features/[id]`)
have **no auth of their own**. Removing middleware from `/api` would expose them.
Worse, the audit revealed an *existing* bug: middleware only blocks unauthenticated
users on `/api` (it never section-gates API paths), so any logged-in user could
write AI provider API keys via those 3 routes.
- **Fixed:** added `lib/api-auth.ts` (`requireUser` / `requireSuperAdmin` /
  `requireSectionOrSuper`) and gated the 3 admin routes to super-admin OR
  `settings.ai`. This is a security fix independent of perf.
- The full `/api` exclusion remains possible only after adding self-auth to the
  ~20 unauthenticated `/api/ai/*` + proxy routes — a separate hardening project.

**Item 2 — client cache: mostly already done.** The hottest shared reads
(`useSocmedProjects`, `/api/accounts`) already use module-level cache + inflight
dedup, and the dashboard layout/sidebar persists across client navigations (no
re-fetch per click). Remaining uncached reads are page-specific with modest
per-page upside — not worth a broad refactor. Cache individual slow pages on
demand using the same module-cache pattern.

**The real remaining app-wide win:** middleware `supabase.auth.getUser()` makes a
network round-trip to the Supabase Auth server on **every page navigation** (it
blocks render). The documented fix is to migrate the project to **asymmetric JWT
signing keys** (Supabase Dashboard → Auth → JWT Keys) and swap `getUser()` →
`getClaims()` in middleware, which verifies the JWT **locally** (no round-trip,
same security). Requires a one-time Supabase config change + testing — recommended
as the next dedicated perf task.

## Out of scope

- Visual redesign (covered elsewhere).
- Infra/hosting changes beyond the deploy hook already discussed.
