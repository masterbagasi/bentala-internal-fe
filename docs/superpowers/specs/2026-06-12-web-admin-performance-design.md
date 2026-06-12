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

## Out of scope

- Visual redesign (covered elsewhere).
- Infra/hosting changes beyond the deploy hook already discussed.
