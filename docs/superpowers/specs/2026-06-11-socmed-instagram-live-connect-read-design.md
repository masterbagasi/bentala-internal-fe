# Socmed Management — Instagram Live Connect + Read (Analytics/Reports) — Design

**Date:** 2026-06-11
**Status:** Design — pending user review

## Problem

The Social Media area under Socmed Management looks functional but is almost
entirely **mock**. Accounts live in `social_accounts`, but the `connected`
status is **typed manually** in the Add Account modal — there is no OAuth.
Analytics / Reports / Plan render from hardcoded constants in
`components/Social/mock.ts` (one real Composio snapshot from 2026-06-05, frozen).
There is **no** Composio SDK, no `/api/social/*` route, no token storage, no
webhook. The web app cannot connect, refresh, or read live data on its own.

## Goal (v1)

Make Instagram accounts **really connect** and **read live** inside the internal
web, via Composio:

1. **Connect** — OAuth-connect an Instagram account through Composio from the
   Accounts tab; store the connection; `status: 'connected'` becomes real.
2. **Read** — pull live Instagram data (account insights, per-post insights,
   demographics, followers) into a DB cache and render the **Analytics** and
   **Reports** tabs from it instead of `mock.ts`.

## Decisions

1. **Aggregator = Composio** (not direct Meta Graph apps). The codebase already
   references Composio and two Bentala accounts are already connected & ACTIVE in
   the Composio account:
   - `bentalaprojectindonesia` (ig_user_id `27672734475658027`)
   - `bentalastudioindonesia` (ig_user_id `36115742134707511`)
2. **Instagram only** for v1.
3. **Capability = Connect + Read.** Read scope = **Analytics + Reports**.
   **Plan** (calendar + AI recommendations) is **deferred** to a later spec.
4. **Sync = cache in DB + on-demand Refresh button + daily cron.** Pages read
   from the cache (fast, rate-limit-safe), never call Composio on raw page load.
5. The web uses **Composio's server SDK/REST with `COMPOSIO_API_KEY`** (a
   server-only secret) — NOT the Claude MCP. All Composio calls happen in
   Next.js API routes with the service role; never client-side.

## Non-goals (separate specs later)

- **Write** (publish / schedule posts from the Kanban to Instagram).
- **Plan** tab live (AI recommendations).
- Other platforms (TikTok, Facebook, YouTube, X, LinkedIn).
- Replacing the internal `posts` Kanban semantics.

## Feasibility — Composio Instagram read tools (verified)

| Need (today mock) | Composio tool | Notes |
|---|---|---|
| Profile + followers | `INSTAGRAM_GET_USER_INFO` | followers_count only for `me` |
| Account KPIs (reach, views, interactions, likes/comments/shares/saves, online_followers) | `INSTAGRAM_GET_USER_INSIGHTS` | period `day`/`week`/`days_28`/`lifetime`; `total_value` vs `values[]` |
| Followers over time | `INSTAGRAM_GET_USER_INSIGHTS` (`follower_count`, `day`, time_series) | only forward from when we start sampling |
| Demographics (age, gender, city, country) | `INSTAGRAM_GET_USER_INSIGHTS` (`follower_demographics` + breakdown) | `period=lifetime` |
| Post list | `INSTAGRAM_GET_IG_USER_MEDIA` | cursor pagination `paging.cursors.after` |
| Per-post insights (reach, views, saved, likes, comments, shares) | `INSTAGRAM_GET_IG_MEDIA_INSIGHTS` | shape varies by media_product_type; skip per-id failures |

Requires Business/Creator accounts (both Bentala accounts qualify).

**Historical trends caveat:** Instagram does not expose historical follower
counts retroactively. Time-series charts (e.g. `FOLLOWERS_BY_DAY`,
`PLATFORM_TRENDS`) are built by **accumulating our own daily cron snapshots**
going forward. v1 seeds from the frozen `mock.ts` snapshot where useful and grows
real history from first sync.

## Architecture

Four layers, each independently testable.

### 1. Composio access (server-only) — `lib/composio.ts`
Thin wrapper around the Composio server SDK/REST, authenticated by
`COMPOSIO_API_KEY`. Exposes typed functions:
`getUserInfo`, `getUserInsights`, `getUserMedia`, `getMediaInsights`,
plus `initiateConnection` / `getConnectionStatus` for OAuth. Takes a
`composioAccountId` (or `ig_user_id`) to target a specific connection. Handles
the documented pitfalls (retry transient 500s, smaller metric groups on partial
permission, `metric_type=total_value` fallback).
*Exact SDK surface (e.g. `@composio/core` `tools.execute` vs REST
`/api/v3/tools/execute/{slug}`) confirmed at implementation; the wrapper hides it.*

### 2. Connection model & mapping
Store the Composio link per Instagram account. **New table
`social_connections`** (keep `social_accounts` for the display grouping):

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `brand` | text | project slug (`bpi`, `bsi`, …) |
| `platform` | text | `instagram` (v1) |
| `composio_account_id` | text | e.g. `instagram_mig-applot` |
| `ig_user_id` | text | numeric IG business id |
| `username` | text | handle |
| `status` | text | `connected` / `pending` / `error` |
| `connected_at` | timestamptz | |

- **Seed/import** the two existing ACTIVE connections, mapped by slug.
- RLS: readable by authed users with project access; writes service-role only.

### 3. Connect flow (OAuth)
- Accounts tab gets **"Hubungkan Instagram"**.
- `POST /api/social/instagram/connect` → `initiateConnection` → returns
  `redirect_url` → opened in a popup/redirect for the user to authorize.
- Frontend polls `GET /api/social/instagram/connect/status` (which calls
  Composio `WAIT_FOR_CONNECTIONS`/status) until `ACTIVE`.
- On ACTIVE: persist a `social_connections` row (`status='connected'`), then
  kick an initial sync. This is what flips the **"Akun belum login"** gate
  (already built) to the live state.
- `DELETE` / disconnect: remove the Composio connection + mark row.

### 4. Sync + cache
New cache tables (snapshot + `fetched_at`), e.g.:
- `ig_account_insights` (brand, metric, period, value, day) — KPIs + follower
  time series.
- `ig_media` (brand, media_id, caption, permalink, media_type, timestamp,
  like_count, comments_count).
- `ig_media_insights` (media_id, metric, value).
- `ig_demographics` (brand, kind, breakdown, bucket, value).

`POST /api/social/instagram/sync?brand=<slug>` (service role + Composio):
pull → normalize → upsert into cache. Idempotent; partial-failure tolerant;
paginates media; batches media insights. Triggered by **(a)** the UI Refresh
button and **(b)** a **daily cron** (Vercel Cron if deployed on Vercel, else
Supabase `pg_cron` → edge function) hitting the same route. `last_synced_at`
surfaced in the UI.

### 5. Read / UI
- `GET /api/social/instagram/analytics?brand=<slug>` (or direct Supabase select)
  returns the cached, normalized shape the views already expect.
- `AnalyticsView` + `components/Social/sections.tsx` read this instead of
  `mock.ts`. Component structure unchanged — only the data source swaps.
- `AccountsView` shows real followers + connection status (from
  `social_connections` + cache).
- `ReportsView` derives its KPI summary from the same cache.
- A **normalization module** (`lib/social/normalize.ts`) maps Composio response
  shapes → the existing view types, isolating the messy API surface.

### Security
- `COMPOSIO_API_KEY` server-only env var; never shipped to the client.
- Connect / disconnect / sync gated to super-admin (or project-admin); analytics
  readable by users who have that project's access section.
- Composio calls only from API routes using the service role.

## Data flow (read path)
`cron/Refresh → /api/social/instagram/sync → Composio (IG tools) → normalize →
cache tables` … then independently … `Analytics/Reports page → /api/social/
instagram/analytics (or select) → cache tables → render`.

## Rollout / order
1. `social_connections` table + import the 2 existing connections.
2. `lib/composio.ts` access layer + `COMPOSIO_API_KEY` wiring.
3. Cache tables + `/api/social/instagram/sync` + normalization module.
4. Connect flow (`/connect` + status poll) + AccountsView button → real status.
5. Swap AnalyticsView/sections to read cache; wire Refresh button + last-synced.
6. ReportsView onto cache.
7. Daily cron trigger.

## Testing / verification
- Connect a fresh IG account end-to-end: redirect → authorize → status flips to
  `connected` → `social_connections` row written → initial sync populates cache.
- For the 2 seeded accounts, a manual sync fills cache; Analytics renders live
  numbers matching a spot-check via the Composio tools.
- Analytics/Reports no longer import `mock.ts`; with an empty cache they show a
  graceful "belum ada data, klik Refresh" state (and the existing "Akun belum
  login" gate still holds for unconnected projects).
- Refresh button re-syncs; `last_synced_at` updates. Cron run is idempotent.
- Rate-limit/partial-failure handling: a failing per-post insight is skipped,
  not fatal.
- Security: analytics/sync routes reject non-authorized callers; API key never
  appears client-side.

## Risks / open items
- **Composio SDK specifics** (auth, execute signature, entity scoping for the API
  key vs the existing connections) — confirm the API key can act on the two
  already-connected accounts; otherwise re-connect them under the app's Composio
  entity.
- **Cron infra** depends on deploy target (Vercel Cron vs Supabase pg_cron) —
  the sync route is the stable seam either way.
- **Mock → live cutover**: some mock surfaces (12-week projections, illustrative
  trends) have no direct API source and only become real as daily history
  accumulates; show them as "membangun riwayat" until enough days exist.
- **Demographics availability** can be empty/permission-limited per account;
  treat missing metrics as unavailable, not zero.
