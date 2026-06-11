# Socmed Instagram Live Connect + Read — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Instagram accounts genuinely OAuth-connect through Composio and feed the existing Social Media → Analytics/Reports tabs with live, cached data instead of `mock.ts`.

**Architecture:** Four seams. (1) `lib/composio.ts` server-only wrapper over the Composio SDK. (2) A `social_connections` table mapping project slug → Composio connection. (3) Cache tables + a `/api/social/instagram/sync` route (manual Refresh + daily Vercel cron) that pulls from Composio, normalizes, and upserts. (4) Read routes the Analytics/Reports views consume. All Composio/secret calls live in Next.js API routes with the service role; nothing client-side.

**Tech Stack:** Next.js (app router) on Vercel, Supabase (service-role admin client), `@composio/core` TS SDK, Composio Instagram toolkit.

> **Verification note (repo reality):** This repo has **no test runner** (no jest/vitest; `package.json` scripts are `dev/build/start/lint/remotion:*`). So each task is verified with **`npx tsc --noEmit`** (type safety) plus a **concrete manual runtime check** against the running `next dev` and/or a real Composio call — not an automated test suite. Per the project memory: do **not** run `npm run build` while `next dev` is running; use `npx tsc --noEmit`. Commit after each task.

> **Prerequisites (one-time, outside code) — do before Task 2:**
> - In the Composio dashboard, confirm the **Instagram auth config** exists and copy its id → add `COMPOSIO_IG_AUTH_CONFIG_ID=ac_...` to `.env.local`. (`COMPOSIO_API_KEY=oak_...` already exists.)
> - Add `CRON_SECRET=<random-long-string>` to `.env.local` (protects the cron route).
> - Confirm the Composio API key can see the two already-connected Instagram accounts (`bentalaprojectindonesia`, `bentalastudioindonesia`); Task 1's import step verifies this.

---

## File structure

| File | Responsibility |
|---|---|
| `lib/composio.ts` (new) | Server-only Composio client + typed Instagram tool/connection helpers |
| `lib/social/normalize.ts` (new) | Pure functions: Composio response shapes → cache-row shapes |
| `lib/social/types.ts` (new) | Shared TS types for connections + cached analytics |
| `app/api/social/instagram/connect/route.ts` (new) | Start OAuth (link) + persist connection |
| `app/api/social/instagram/connect/status/route.ts` (new) | Poll connection status |
| `app/api/social/instagram/sync/route.ts` (new) | Pull → normalize → upsert cache (Refresh + cron) |
| `app/api/social/instagram/analytics/route.ts` (new) | Read cache → shape the views expect |
| `components/Social/AccountsView.tsx` (modify) | Real "Hubungkan Instagram" + live status/followers |
| `components/Social/AnalyticsView.tsx` (modify) | Read from analytics route, not `mock.ts` |
| `components/Social/sections.tsx` (modify) | Read demographics/overview from props, not `mock.ts` |
| `components/Social/ReportsView.tsx` (modify) | KPI summary from cache |
| `lib/database.types.ts` (regenerate) | Pick up new tables |
| `vercel.json` (new) | Daily cron → sync route |

---

## Task 1: Database schema + import existing connections

**Files:**
- SQL applied via Supabase MCP `apply_migration` (or dashboard SQL editor)
- Regenerate: `lib/database.types.ts`

- [ ] **Step 1: Apply the schema SQL**

Apply via the Supabase MCP tool `mcp__plugin_supabase_supabase__apply_migration` (name: `socmed_instagram_live`) or paste into the dashboard SQL editor:

```sql
-- Connection registry: project slug -> Composio Instagram connection
create table if not exists social_connections (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  platform text not null default 'instagram',
  composio_user_id text not null,
  connected_account_id text not null,
  ig_user_id text,
  username text,
  status text not null default 'pending',
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  unique (brand, platform, connected_account_id)
);

-- Account-level KPIs + follower time series (one row per metric sample)
create table if not exists ig_account_insights (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  ig_user_id text not null,
  metric text not null,
  period text not null,           -- day | week | days_28 | lifetime
  day date,                       -- for time-series points; null for totals
  value numeric,
  fetched_at timestamptz not null default now(),
  unique (brand, metric, period, day)
);

-- Media inventory
create table if not exists ig_media (
  brand text not null,
  media_id text not null,
  caption text,
  permalink text,
  media_type text,
  media_product_type text,
  timestamp timestamptz,
  like_count integer,
  comments_count integer,
  fetched_at timestamptz not null default now(),
  primary key (brand, media_id)
);

-- Per-post insights (one row per media+metric)
create table if not exists ig_media_insights (
  media_id text not null,
  metric text not null,
  value numeric,
  fetched_at timestamptz not null default now(),
  primary key (media_id, metric)
);

-- Demographics buckets (follower/engaged/reached)
create table if not exists ig_demographics (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  kind text not null,             -- follower | engaged | reached
  breakdown text not null,        -- age | gender | city | country
  bucket text not null,           -- e.g. '25-34', 'F', 'Jakarta', 'ID'
  value numeric,
  fetched_at timestamptz not null default now(),
  unique (brand, kind, breakdown, bucket)
);

-- Sync bookkeeping
create table if not exists ig_sync_state (
  brand text primary key,
  last_synced_at timestamptz,
  last_status text,
  last_error text
);

-- RLS: authed users may READ; writes are service-role only (bypasses RLS).
alter table social_connections enable row level security;
alter table ig_account_insights enable row level security;
alter table ig_media enable row level security;
alter table ig_media_insights enable row level security;
alter table ig_demographics enable row level security;
alter table ig_sync_state enable row level security;

create policy "read social_connections" on social_connections for select to authenticated using (true);
create policy "read ig_account_insights" on ig_account_insights for select to authenticated using (true);
create policy "read ig_media" on ig_media for select to authenticated using (true);
create policy "read ig_media_insights" on ig_media_insights for select to authenticated using (true);
create policy "read ig_demographics" on ig_demographics for select to authenticated using (true);
create policy "read ig_sync_state" on ig_sync_state for select to authenticated using (true);
```

- [ ] **Step 2: Regenerate types**

Run: `npx supabase gen types typescript --project-id gbmqudkkuzpqykmyrkqc > lib/database.types.ts`
Expected: file updates; `git diff lib/database.types.ts` shows the 6 new tables.

- [ ] **Step 3: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/database.types.ts
git commit -m "feat(socmed): add Instagram connection + analytics cache tables"
```

> The two existing connections are imported in **Task 2, Step 5** (needs the Composio client).

---

## Task 2: Composio access layer

**Files:**
- Create: `lib/composio.ts`
- Create: `lib/social/types.ts`
- Modify: `package.json` (add `@composio/core`)

- [ ] **Step 1: Install the SDK**

Run: `npm install @composio/core`
Expected: `@composio/core` added to `dependencies`.

- [ ] **Step 2: Shared types**

Create `lib/social/types.ts`:

```typescript
export interface SocialConnection {
  id: string
  brand: string
  platform: 'instagram'
  composio_user_id: string
  connected_account_id: string
  ig_user_id: string | null
  username: string | null
  status: 'connected' | 'pending' | 'error'
  connected_at: string | null
}

// One normalized analytics payload the views consume.
export interface IgAnalytics {
  followers: number | null
  overview: { reach: number | null; views: number | null; interactions: number | null; engaged: number | null }
  followersByDay: { day: string; value: number }[]
  posts: {
    id: string; caption: string | null; permalink: string | null; type: string | null
    timestamp: string | null; likes: number; comments: number
    reach: number | null; views: number | null; saved: number | null; shares: number | null
  }[]
  demographics: { kind: string; breakdown: string; buckets: { bucket: string; value: number }[] }[]
  lastSyncedAt: string | null
}
```

- [ ] **Step 3: Composio client wrapper**

Create `lib/composio.ts` (server-only — never imported by a client component):

```typescript
import 'server-only'
import { Composio } from '@composio/core'

let _client: Composio | null = null
export function composio(): Composio {
  if (_client) return _client
  const apiKey = process.env.COMPOSIO_API_KEY
  if (!apiKey) throw new Error('COMPOSIO_API_KEY is not set')
  _client = new Composio({ apiKey })
  return _client
}

const IG_AUTH_CONFIG = () => {
  const id = process.env.COMPOSIO_IG_AUTH_CONFIG_ID
  if (!id) throw new Error('COMPOSIO_IG_AUTH_CONFIG_ID is not set')
  return id
}

// userId convention for app-created brand connections.
export const brandUserId = (slug: string) => `socmed:${slug}`

interface ExecCtx { userId: string; connectedAccountId?: string }

async function exec(slug: string, ctx: ExecCtx, args: Record<string, unknown>) {
  const res = await composio().tools.execute(slug, {
    userId: ctx.userId,
    connectedAccountId: ctx.connectedAccountId,
    arguments: args,
  })
  return res as { data?: any; successful?: boolean; error?: string | null }
}

// ── Instagram reads (shapes per Composio pitfalls: data may be double-wrapped,
//    metric values under values[0].value or total_value.value) ──
export const ig = {
  userInfo: (ctx: ExecCtx) =>
    exec('INSTAGRAM_GET_USER_INFO', ctx, { ig_user_id: 'me', graph_api_version: 'v21.0' }),

  userInsights: (ctx: ExecCtx, metric: string[], period: string, extra: Record<string, unknown> = {}) =>
    exec('INSTAGRAM_GET_USER_INSIGHTS', ctx, { metric, period, ...extra }),

  userMedia: (ctx: ExecCtx, after?: string) =>
    exec('INSTAGRAM_GET_IG_USER_MEDIA', ctx, {
      ig_user_id: 'me', limit: 100, after,
      fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count',
    }),

  mediaInsights: (ctx: ExecCtx, mediaId: string, metric: string[]) =>
    exec('INSTAGRAM_GET_IG_MEDIA_INSIGHTS', ctx, { ig_media_id: mediaId, metric }),
}

// ── Connections ──
export async function startInstagramLink(slug: string, callbackUrl: string) {
  const conn = await composio().connectedAccounts.link(brandUserId(slug), IG_AUTH_CONFIG(), { callbackUrl })
  return conn // { id, redirectUrl, status, waitForConnection() }
}

export async function listActiveInstagram() {
  // Active Instagram connected accounts visible to this API key.
  return composio().connectedAccounts.list({ statuses: ['ACTIVE'] })
}
```

- [ ] **Step 4: Verify type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (If `tools.execute`/`connectedAccounts.link` signatures differ in the installed SDK version, adjust the wrapper here — this is the single seam where the SDK surface is pinned.)

- [ ] **Step 5: Import the two existing connections (one-off script-route)**

Create a temporary admin route `app/api/social/instagram/import/route.ts` to seed `social_connections` from the live Composio accounts (run once, then it stays as a re-import utility):

```typescript
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { isEffectiveSuperAdmin } from '@/lib/access'
import { listActiveInstagram } from '@/lib/composio'

// Map Instagram username -> project slug. Extend as you connect more.
const USERNAME_TO_SLUG: Record<string, string> = {
  bentalaprojectindonesia: 'bpi',
  bentalastudioindonesia: 'bsi',
}

export async function POST() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isEffectiveSuperAdmin(user.email, user.app_metadata?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const accounts = await listActiveInstagram()
  const admin = createSupabaseAdmin()
  const rows: Record<string, unknown>[] = []
  // accounts.items shape: confirm at runtime; each item exposes id, user info, and the userId it was created under.
  for (const a of (accounts as any).items ?? []) {
    const username = a?.data?.username || a?.meta?.username || a?.toolkit?.username
    const igUserId = a?.data?.id || a?.meta?.id || null
    const slug = username ? USERNAME_TO_SLUG[username] : undefined
    if (!slug) continue
    rows.push({
      brand: slug, platform: 'instagram',
      composio_user_id: a.userId ?? a.user_id, connected_account_id: a.id,
      ig_user_id: igUserId, username, status: 'connected', connected_at: new Date().toISOString(),
    })
  }
  if (rows.length) {
    const { error } = await (admin as any).from('social_connections')
      .upsert(rows, { onConflict: 'brand,platform,connected_account_id' })
    if (error) { console.error('[import]', error); return NextResponse.json({ error: 'upsert failed' }, { status: 500 }) }
  }
  return NextResponse.json({ imported: rows.length, rows })
}
```

- [ ] **Step 6: Run the import + verify**

With `next dev` running and logged in as super admin, POST to it:
Run: `curl -X POST http://localhost:3000/api/social/instagram/import -H "Cookie: <your-session-cookie>"`
Expected: JSON `{ imported: 2, rows: [...] }`. Inspect the returned `rows` to confirm `connected_account_id`, `composio_user_id`, and `ig_user_id` are populated. If `username`/`ig_user_id` come back null, adjust the field accessors in Step 5 to match the actual `accounts.items[*]` shape printed, then re-run.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/composio.ts lib/social/types.ts app/api/social/instagram/import/route.ts
git commit -m "feat(socmed): Composio access layer + import existing IG connections"
```

---

## Task 3: Normalization module

**Files:**
- Create: `lib/social/normalize.ts`

- [ ] **Step 1: Write the normalizers**

Create `lib/social/normalize.ts` (pure functions; isolate Composio's messy shapes):

```typescript
// Composio media/account insight metric value can be at values[0].value or total_value.value.
export function metricValue(m: any): number | null {
  const tv = m?.total_value
  if (tv && typeof tv === 'object' && 'value' in tv) return num(tv.value)
  if (tv != null) return num(tv)
  const vals = m?.values
  if (Array.isArray(vals) && vals.length) return num(vals[vals.length - 1]?.value)
  return null
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number)
  return Number.isFinite(n) ? n : null
}

// Insight responses may be double-wrapped: res.data.data is the metric array.
export function metricRows(res: any): any[] {
  return res?.data?.data ?? res?.data ?? []
}

// name -> value map from an insights metric array.
export function metricMap(res: any): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  for (const m of metricRows(res)) {
    const name = m?.name
    if (name) out[name] = metricValue(m)
  }
  return out
}

// Media list is under res.data.data; cursor under res.data.paging.cursors.after.
export function mediaPage(res: any): { items: any[]; after: string | null } {
  const data = res?.data ?? {}
  const items = data?.data ?? []
  const paging = data?.paging ?? {}
  const after = paging?.next ? (paging?.cursors?.after ?? null) : null
  return { items, after }
}

// follower_demographics returns nested breakdown buckets; flatten to {bucket,value}[].
export function demographicBuckets(res: any): { bucket: string; value: number }[] {
  const rows = metricRows(res)
  const out: { bucket: string; value: number }[] = []
  for (const m of rows) {
    const tv = m?.total_value
    const breakdowns = tv?.breakdowns ?? []
    for (const b of breakdowns) {
      for (const r of (b?.results ?? [])) {
        const key = Array.isArray(r?.dimension_values) ? r.dimension_values.join(' / ') : String(r?.dimension_values ?? '')
        const v = num(r?.value)
        if (key && v != null) out.push({ bucket: key, value: v })
      }
    }
  }
  return out
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/social/normalize.ts
git commit -m "feat(socmed): Instagram response normalizers"
```

> The demographics/insight output shapes are validated against live data in **Task 4, Step 3** (the sync run prints what it stored). Adjust accessors there if a shape differs.

---

## Task 4: Sync route

**Files:**
- Create: `app/api/social/instagram/sync/route.ts`

- [ ] **Step 1: Write the sync handler**

Create `app/api/social/instagram/sync/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { isEffectiveSuperAdmin } from '@/lib/access'
import { ig } from '@/lib/composio'
import { metricMap, mediaPage, demographicBuckets } from '@/lib/social/normalize'
import type { SocialConnection } from '@/lib/social/types'

export const maxDuration = 60

async function authorize(req: NextRequest): Promise<NextResponse | null> {
  // Cron path: shared secret header. UI path: super-admin session.
  if (req.headers.get('x-cron-secret') && req.headers.get('x-cron-secret') === process.env.CRON_SECRET) return null
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isEffectiveSuperAdmin(user.email, user.app_metadata?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

const now = () => new Date().toISOString()

export async function POST(req: NextRequest) {
  const forbidden = await authorize(req)
  if (forbidden) return forbidden

  const slug = new URL(req.url).searchParams.get('brand')
  const admin = createSupabaseAdmin()

  let conns = (admin as any).from('social_connections').select('*').eq('platform', 'instagram').eq('status', 'connected')
  if (slug) conns = conns.eq('brand', slug)
  const { data: connections } = await conns
  const list = (connections ?? []) as SocialConnection[]

  const results: Record<string, string> = {}
  for (const c of list) {
    const ctx = { userId: c.composio_user_id, connectedAccountId: c.connected_account_id }
    try {
      // 1) Followers + 28-day account KPIs
      const followers = metricMap(await ig.userInsights(ctx, ['follower_count'], 'day'))
      const kpis = metricMap(await ig.userInsights(ctx, ['reach', 'views', 'total_interactions', 'accounts_engaged'], 'days_28'))

      const insightRows: any[] = []
      if (followers.follower_count != null)
        insightRows.push({ brand: c.brand, ig_user_id: c.ig_user_id, metric: 'follower_count', period: 'day', day: now().slice(0, 10), value: followers.follower_count, fetched_at: now() })
      for (const k of ['reach', 'views', 'total_interactions', 'accounts_engaged'])
        if (kpis[k] != null) insightRows.push({ brand: c.brand, ig_user_id: c.ig_user_id, metric: k, period: 'days_28', day: null, value: kpis[k], fetched_at: now() })
      if (insightRows.length)
        await (admin as any).from('ig_account_insights').upsert(insightRows, { onConflict: 'brand,metric,period,day' })

      // 2) Media inventory (paginate)
      const media: any[] = []
      let after: string | undefined
      do {
        const page = mediaPage(await ig.userMedia(ctx, after))
        media.push(...page.items)
        after = page.after ?? undefined
      } while (after && media.length < 200)

      if (media.length) {
        await (admin as any).from('ig_media').upsert(media.map(m => ({
          brand: c.brand, media_id: m.id, caption: m.caption ?? null, permalink: m.permalink ?? null,
          media_type: m.media_type ?? null, media_product_type: m.media_product_type ?? null,
          timestamp: m.timestamp ?? null, like_count: m.like_count ?? null, comments_count: m.comments_count ?? null,
          fetched_at: now(),
        })), { onConflict: 'brand,media_id' })

        // 3) Per-post insights (skip per-id failures)
        for (const m of media) {
          try {
            const map = metricMap(await ig.mediaInsights(ctx, m.id, ['reach', 'views', 'saved', 'likes', 'comments', 'shares']))
            const rows = Object.entries(map).filter(([, v]) => v != null)
              .map(([metric, value]) => ({ media_id: m.id, metric, value, fetched_at: now() }))
            if (rows.length) await (admin as any).from('ig_media_insights').upsert(rows, { onConflict: 'media_id,metric' })
          } catch { /* ineligible/old media — skip */ }
        }
      }

      // 4) Follower demographics (age, gender, country)
      for (const breakdown of ['age', 'gender', 'country']) {
        try {
          const res = await ig.userInsights(ctx, ['follower_demographics'], 'lifetime', { metric_type: 'total_value', breakdown, timeframe: undefined })
          const buckets = demographicBuckets(res)
          if (buckets.length)
            await (admin as any).from('ig_demographics').upsert(
              buckets.map(b => ({ brand: c.brand, kind: 'follower', breakdown, bucket: b.bucket, value: b.value, fetched_at: now() })),
              { onConflict: 'brand,kind,breakdown,bucket' })
        } catch { /* demographics may be permission-limited — skip */ }
      }

      await (admin as any).from('ig_sync_state').upsert({ brand: c.brand, last_synced_at: now(), last_status: 'ok', last_error: null }, { onConflict: 'brand' })
      results[c.brand] = 'ok'
    } catch (e) {
      await (admin as any).from('ig_sync_state').upsert({ brand: c.brand, last_synced_at: now(), last_status: 'error', last_error: String(e) }, { onConflict: 'brand' })
      results[c.brand] = 'error'
    }
  }

  return NextResponse.json({ synced: results })
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run a real sync + verify the cache filled**

With `next dev` running, logged in as super admin:
Run: `curl -X POST "http://localhost:3000/api/social/instagram/sync?brand=bpi" -H "Cookie: <session>"`
Expected: `{ "synced": { "bpi": "ok" } }`.
Then in the Supabase dashboard (or via the Supabase MCP `execute_sql`) confirm rows exist:
`select metric, value from ig_account_insights where brand='bpi';`
`select count(*) from ig_media where brand='bpi';`
`select breakdown, count(*) from ig_demographics where brand='bpi' group by breakdown;`
If `ig_demographics` is empty or a metric is missing, inspect the raw Composio response (temporarily `console.log` it in the route) and adjust `demographicBuckets`/`metricMap` in `lib/social/normalize.ts` to the real shape, then re-run. This is the deliberate shape-validation checkpoint.

- [ ] **Step 4: Commit**

```bash
git add app/api/social/instagram/sync/route.ts lib/social/normalize.ts
git commit -m "feat(socmed): Instagram sync route (pull -> normalize -> cache)"
```

---

## Task 5: Analytics read route + view swap

**Files:**
- Create: `app/api/social/instagram/analytics/route.ts`
- Modify: `components/Social/AnalyticsView.tsx`
- Modify: `components/Social/sections.tsx`

- [ ] **Step 1: Write the read route**

Create `app/api/social/instagram/analytics/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import type { IgAnalytics } from '@/lib/social/types'

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const brand = new URL(req.url).searchParams.get('brand')
  if (!brand) return NextResponse.json({ error: 'brand required' }, { status: 400 })
  const db = supabase as any

  const [insights, media, mediaIns, demo, syncState] = await Promise.all([
    db.from('ig_account_insights').select('metric,period,day,value').eq('brand', brand),
    db.from('ig_media').select('*').eq('brand', brand).order('timestamp', { ascending: false }),
    db.from('ig_media_insights').select('media_id,metric,value'),
    db.from('ig_demographics').select('kind,breakdown,bucket,value').eq('brand', brand),
    db.from('ig_sync_state').select('last_synced_at').eq('brand', brand).maybeSingle(),
  ])

  const ins = (insights.data ?? []) as any[]
  const totalsByMetric = (m: string) => ins.find(r => r.metric === m && r.period === 'days_28')?.value ?? null
  const insByMedia = new Map<string, Record<string, number>>()
  for (const r of (mediaIns.data ?? []) as any[]) {
    const cur = insByMedia.get(r.media_id) ?? {}; cur[r.metric] = r.value; insByMedia.set(r.media_id, cur)
  }

  const payload: IgAnalytics = {
    followers: ins.filter(r => r.metric === 'follower_count' && r.period === 'day').sort((a, b) => (a.day < b.day ? 1 : -1))[0]?.value ?? null,
    overview: { reach: totalsByMetric('reach'), views: totalsByMetric('views'), interactions: totalsByMetric('total_interactions'), engaged: totalsByMetric('accounts_engaged') },
    followersByDay: ins.filter(r => r.metric === 'follower_count' && r.day).map(r => ({ day: r.day, value: Number(r.value) })).sort((a, b) => (a.day < b.day ? -1 : 1)),
    posts: ((media.data ?? []) as any[]).map(m => {
      const mi = insByMedia.get(m.media_id) ?? {}
      return { id: m.media_id, caption: m.caption, permalink: m.permalink, type: m.media_product_type ?? m.media_type, timestamp: m.timestamp, likes: m.like_count ?? 0, comments: m.comments_count ?? 0, reach: mi.reach ?? null, views: mi.views ?? null, saved: mi.saved ?? null, shares: mi.shares ?? null }
    }),
    demographics: Object.values(((demo.data ?? []) as any[]).reduce((acc: Record<string, any>, r) => {
      const key = `${r.kind}:${r.breakdown}`; (acc[key] ??= { kind: r.kind, breakdown: r.breakdown, buckets: [] }).buckets.push({ bucket: r.bucket, value: Number(r.value) }); return acc
    }, {})),
    lastSyncedAt: syncState.data?.last_synced_at ?? null,
  }
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'private, max-age=30' } })
}
```

- [ ] **Step 2: Swap AnalyticsView to fetch live data + Refresh button**

In `components/Social/AnalyticsView.tsx`: accept a `brand: string` prop, fetch `/api/social/instagram/analytics?brand=${brand}` on mount into state, and replace each `mock.ts` constant read (`OVERVIEW`, `FOLLOWERS_BY_DAY`, `CONTENT_POSTS`, `AUDIENCE`, etc.) with the fetched `IgAnalytics` fields. Add a Refresh button that `POST`s `/api/social/instagram/sync?brand=${brand}` then re-fetches, and show `lastSyncedAt`. Empty cache → show `"Belum ada data — klik Refresh untuk menarik dari Instagram."`. Keep the existing chart components; only change their data source. Pass the relevant slices into `sections.tsx` via props.

```typescript
// shape of the change (illustrative for the data wiring; keep existing JSX/charts):
const [data, setData] = useState<IgAnalytics | null>(null)
const [refreshing, setRefreshing] = useState(false)
useEffect(() => { fetch(`/api/social/instagram/analytics?brand=${brand}`).then(r => r.json()).then(setData) }, [brand])
async function refresh() {
  setRefreshing(true)
  await fetch(`/api/social/instagram/sync?brand=${brand}`, { method: 'POST' })
  const r = await fetch(`/api/social/instagram/analytics?brand=${brand}`); setData(await r.json())
  setRefreshing(false)
}
```

- [ ] **Step 3: Pass brand from the page**

In `app/(dashboard)/smm/[project]/social/page.tsx`, change `<AnalyticsView ... />` to also pass `brand={slug}` (the slug already exists in that file from the earlier "Akun belum login" work).

- [ ] **Step 4: Make `sections.tsx` prop-driven**

In `components/Social/sections.tsx`, replace direct imports of `OVERVIEW`/`AUDIENCE`/etc. from `mock.ts` with props supplied by `AnalyticsView` (overview numbers + demographics buckets). Charts unchanged.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` → no errors.
Manual: open `/smm/bpi/social` → Analytics tab → numbers match the synced cache; Refresh updates `lastSyncedAt`; an unconnected project still shows the "Akun belum login" gate; a connected-but-unsynced project shows the empty-cache hint.

- [ ] **Step 6: Commit**

```bash
git add app/api/social/instagram/analytics/route.ts components/Social/AnalyticsView.tsx components/Social/sections.tsx "app/(dashboard)/smm/[project]/social/page.tsx"
git commit -m "feat(socmed): Analytics tab reads live Instagram cache"
```

---

## Task 6: Connect flow (OAuth) in the Accounts tab

**Files:**
- Create: `app/api/social/instagram/connect/route.ts`
- Create: `app/api/social/instagram/connect/status/route.ts`
- Modify: `components/Social/AccountsView.tsx`

- [ ] **Step 1: Start-connection route**

Create `app/api/social/instagram/connect/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { isEffectiveSuperAdmin } from '@/lib/access'
import { startInstagramLink, brandUserId } from '@/lib/composio'

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isEffectiveSuperAdmin(user.email, user.app_metadata?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { brand } = await req.json()
  if (!brand) return NextResponse.json({ error: 'brand required' }, { status: 400 })
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/smm/${brand}/social`
  const conn = await startInstagramLink(brand, callbackUrl)
  return NextResponse.json({ redirectUrl: (conn as any).redirectUrl, connectedAccountId: (conn as any).id, userId: brandUserId(brand) })
}
```

- [ ] **Step 2: Status route (poll + persist on ACTIVE)**

Create `app/api/social/instagram/connect/status/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { isEffectiveSuperAdmin } from '@/lib/access'
import { composio, ig } from '@/lib/composio'

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isEffectiveSuperAdmin(user.email, user.app_metadata?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const url = new URL(req.url)
  const brand = url.searchParams.get('brand')!
  const connectedAccountId = url.searchParams.get('connectedAccountId')!
  const userId = url.searchParams.get('userId')!

  const acct = await composio().connectedAccounts.get(connectedAccountId) as any
  if (acct?.status !== 'ACTIVE') return NextResponse.json({ status: acct?.status ?? 'PENDING' })

  // Connected: fetch IG profile, persist the row.
  let username: string | null = null, igUserId: string | null = null
  try {
    const info = (await ig.userInfo({ userId, connectedAccountId })) as any
    username = info?.data?.username ?? null
    igUserId = info?.data?.id ?? null
  } catch { /* leave null; sync can backfill */ }

  const admin = createSupabaseAdmin()
  await (admin as any).from('social_connections').upsert({
    brand, platform: 'instagram', composio_user_id: userId, connected_account_id: connectedAccountId,
    ig_user_id: igUserId, username, status: 'connected', connected_at: new Date().toISOString(),
  }, { onConflict: 'brand,platform,connected_account_id' })

  return NextResponse.json({ status: 'ACTIVE', username })
}
```

> If the installed SDK names the getter differently than `connectedAccounts.get(id)`, adjust here (the wrapper in `lib/composio.ts` is the only other place the SDK surface appears).

- [ ] **Step 3: AccountsView connect button**

In `components/Social/AccountsView.tsx`, add a **"Hubungkan Instagram"** button (super-admin only) that: `POST`s `/connect` with `{ brand }`, opens `redirectUrl` in a popup (`window.open`), then polls `/connect/status?brand&connectedAccountId&userId` every ~2s until `ACTIVE`, then calls the existing `load()` and kicks `POST /sync?brand=`. Keep the existing manual Add Account modal for non-Instagram/manual rows.

```typescript
async function connectInstagram(brand: string) {
  const r = await fetch('/api/social/instagram/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brand }) })
  const { redirectUrl, connectedAccountId, userId } = await r.json()
  window.open(redirectUrl, 'composio', 'width=600,height=720')
  const qs = `brand=${brand}&connectedAccountId=${encodeURIComponent(connectedAccountId)}&userId=${encodeURIComponent(userId)}`
  const poll = setInterval(async () => {
    const s = await (await fetch(`/api/social/instagram/connect/status?${qs}`)).json()
    if (s.status === 'ACTIVE') { clearInterval(poll); await fetch(`/api/social/instagram/sync?brand=${brand}`, { method: 'POST' }); load() }
  }, 2000)
}
```

`AccountsView` already receives `brand` (the slug) from Task 5/earlier work — use it.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` → no errors.
Manual: on a project with no IG connection, click "Hubungkan Instagram" → Composio OAuth opens → authorize → popup returns → status flips to ACTIVE → `social_connections` row appears → an initial sync runs → the "Akun belum login" gate clears and Analytics populates.

- [ ] **Step 5: Commit**

```bash
git add app/api/social/instagram/connect components/Social/AccountsView.tsx
git commit -m "feat(socmed): OAuth-connect Instagram via Composio from Accounts tab"
```

---

## Task 7: Reports tab onto the cache

**Files:**
- Modify: `components/Social/ReportsView.tsx`

- [ ] **Step 1: Swap Reports data source**

In `components/Social/ReportsView.tsx`, accept `brand` + the same `IgAnalytics` payload (fetch it the same way as AnalyticsView, or lift the fetch to the page and pass down). Replace `REPORT_NARRATIVE`/KPI constants from `mock.ts` with computed values from the payload (followers, 28-day reach/views/interactions, top posts by reach). Keep the report layout; swap only the numbers. Where a figure has no live source yet (e.g. period-over-period delta before history accumulates), show "—" or "membangun riwayat".

- [ ] **Step 2: Pass brand from the social page**

In `app/(dashboard)/smm/[project]/social/page.tsx`, pass `brand={slug}` to `<ReportsView />` (it currently passes `subjectId`/`period`).

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` → no errors.
Manual: Reports tab for `bpi` shows live KPIs consistent with Analytics; an unsynced brand shows the empty-cache hint.

- [ ] **Step 4: Commit**

```bash
git add components/Social/ReportsView.tsx "app/(dashboard)/smm/[project]/social/page.tsx"
git commit -m "feat(socmed): Reports tab reads live Instagram cache"
```

---

## Task 8: Daily cron

**Files:**
- Create: `vercel.json`
- Modify: `app/api/social/instagram/sync/route.ts` (already reads `CRON_SECRET`; add a GET entry for Vercel cron)

- [ ] **Step 1: Add a GET handler for Vercel cron**

Vercel cron issues a GET. Add to `app/api/social/instagram/sync/route.ts`:

```typescript
export async function GET(req: NextRequest) {
  // Vercel sets the Authorization: Bearer <CRON_SECRET> header on cron requests.
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  // Reuse POST logic by syncing all connected brands (no brand filter).
  const proxied = new NextRequest(req.url, { method: 'POST', headers: { 'x-cron-secret': process.env.CRON_SECRET! } })
  return POST(proxied)
}
```

- [ ] **Step 2: Create `vercel.json`**

```json
{
  "crons": [
    { "path": "/api/social/instagram/sync", "schedule": "0 1 * * *" }
  ]
}
```

(01:00 UTC daily. Vercel automatically sends `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is set in project env.)

- [ ] **Step 3: Add `CRON_SECRET` to Vercel + local env**

Ensure `CRON_SECRET` is set in Vercel project settings (Production) and in `.env.local`.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` → no errors.
Manual (local): `curl http://localhost:3000/api/social/instagram/sync -H "Authorization: Bearer <CRON_SECRET>"` → `{ "synced": { ... } }` for all connected brands. After deploy, confirm the cron run in the Vercel dashboard's Cron logs.

- [ ] **Step 5: Commit**

```bash
git add vercel.json app/api/social/instagram/sync/route.ts
git commit -m "feat(socmed): daily cron to refresh Instagram analytics"
```

---

## Self-review notes

- **Spec coverage:** Connect (Task 6) ✓, Read/Analytics (Tasks 4-5) ✓, Reports (Task 7) ✓, cache tables (Task 1) ✓, Composio access layer (Task 2) ✓, normalization (Task 3) ✓, on-demand Refresh + daily cron (Tasks 5 & 8) ✓, security/service-role + secret-gated cron (Tasks 4, 6, 8) ✓, import existing connections (Task 2) ✓, "Akun belum login" gate now driven by real status (Tasks 5-6) ✓. Plan/publish/other-platforms explicitly deferred ✓.
- **Shape-uncertainty seams (called out, not hidden):** the exact Composio SDK method names (`tools.execute`, `connectedAccounts.link/list/get`) live only in `lib/composio.ts`; the exact tool *response* shapes are validated at Task 4 Step 3 against a real sync and adjusted in `lib/social/normalize.ts`. These are deliberate runtime-verification checkpoints, not placeholders.
- **No automated tests** because the repo has none; verification is `npx tsc --noEmit` + concrete manual runtime checks each task, per the repo reality note up top.
