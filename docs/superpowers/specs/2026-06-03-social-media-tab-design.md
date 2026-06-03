# Social Media Tab — Design Spec

**Date:** 2026-06-03
**Status:** Approved (design), pending implementation plan
**Scope:** Add a "Social Media" section to the Bentala internal app for analyzing
social media of Bentala and prospective clients — with analytics, exportable
reports, and forward-looking content/strategy plans.

---

## 1. Goal & Context

Add a new top-level **Social Media** section to the internal dashboard that lets
the team:

1. **Analytics** — view social performance (followers, reach/views, engagement,
   growth) per account and platform.
2. **Reports** — generate and export period summaries (AI-written narrative).
3. **Plan** — get AI-assisted content/strategy recommendations on a calendar.

Two kinds of subjects are analyzed:

- **Owned** — Bentala's own accounts and signed clients' accounts. Authenticated
  via Composio → full metrics available.
- **Prospect** — prospective clients / competitors, not yet authenticated. Only
  **public data** is available (platform limitation, not a technical choice).

Built **local-first**: developed and tested on `localhost:3000`. **No push** to
the admin website (origin/main) until explicitly requested.

## 2. Integration Backbone — Composio MCP

Social data and actions go through **Composio** (`https://connect.composio.dev/mcp`),
a managed-integrations platform that handles OAuth/auth for 250+ apps and exposes
them as MCP tools.

- **Developer auth:** single Composio API key, sent as `x-api-key` header. Stored
  server-side only in `.env.local` as `COMPOSIO_API_KEY`. Never exposed to the
  browser or the LLM.
- **Account auth:** each Owned account is authenticated **once** via a
  Composio-generated OAuth URL. Composio stores the tokens encrypted; our code and
  the LLM never see raw credentials.
- **SDK:** `@composio/core` (Node) used from Next.js API routes.
- **Toolkits used:** Instagram, Facebook, TikTok, LinkedIn, X/Twitter, YouTube
  (availability of each follows Composio toolkit support).
- **AI fit:** Composio tools plug into the existing Claude (`@anthropic-ai/sdk`)
  and OpenAI (`openai`) SDKs for the insight/report/plan layer.

MCP is **not** a bypass for platform credentials — owned accounts still require a
one-time Composio auth, and prospects remain public-data-only.

## 3. Architecture

```
UI  app/(dashboard)/social/{accounts,analytics,reports,plan}/page.tsx
    chart.js for charts; follows existing analytics page patterns

API  app/api/social/*   (server-side; holds COMPOSIO_API_KEY)
     • connect → generate Composio OAuth URL for an account+platform
     • sync    → pull metrics via Composio tools → store snapshots
     • report  → AI composes report narrative from stored metrics
     • plan    → AI composes strategy/content plan

Integration  lib/social/composio.ts  (@composio/core client wrapper)
     pluggable connectors = Composio toolkits per platform

Data  Supabase — schema_social.sql (follows existing schema*.sql pattern)
```

### Nav placement

New sidebar section **"Social Media"** (peer of Website, Client, AI Studio) with
sub-items: `Accounts`, `Analytics`, `Reports`, `Plan`. Routes under
`app/(dashboard)/social/`.

### Data model (Supabase — `schema_social.sql`)

- `social_accounts` — subject being analyzed. Fields: id, name, `type`
  (`owned` | `prospect`), owner/team ref, created_at.
- `social_connections` — a platform link for an account. Fields: id, account_id,
  `platform` (instagram|facebook|tiktok|linkedin|x|youtube), handle,
  `composio_connection_id`, `status` (connected|pending|error), created_at.
- `social_metrics` — daily time-series snapshot per connection. Fields: id,
  connection_id, captured_on (date), followers, reach, impressions, engagement,
  engagement_rate, plus a JSON `extra` for platform-specific fields.
- `social_reports` — id, account_id, period_start, period_end, narrative (text),
  export_ref, created_at.
- `social_plans` — id, account_id, content (JSON: recommendations + calendar
  items), created_at, updated_at.

## 4. Phased Delivery

### Phase 1 — Accounts + Analytics (first local build)

**Accounts page**
- Add a subject: name + type (Owned / Prospect).
- Per subject: "Connect" per platform → `POST /api/social/connect` → returns a
  Composio OAuth URL → user authenticates once → connection status persisted.
- Prospect: enter handle/username only (public-data analysis, no OAuth).

**Sync** — `POST /api/social/sync`
- Server calls Composio tools per connection → fetches metrics → stores daily
  snapshots in `social_metrics`.
- Manual "Sync now" button for this phase (scheduled/auto-sync is a later
  follow-up, explicitly out of scope here).

**Analytics page** (chart.js, follows existing analytics pages)
- Select subject + time range.
- Summary cards: Followers, Reach/Views, Engagement Rate, Growth %.
- Trend charts: follower growth, engagement over time — per platform and combined.
- Top-performing content table where the toolkit provides it.

### Phase 2 — Reports

- `POST /api/social/report`: select subject + period → AI (Claude/GPT) writes a
  narrative summary from `social_metrics` → shown on screen → export via existing
  `html-to-image` + `jszip` (or print-to-PDF). Saved to `social_reports`.

### Phase 3 — Plan

- `POST /api/social/plan`: AI produces strategy + content ideas from performance
  data → saved to `social_plans` → calendar view reusing the existing `bpi`/`bsi`
  calendar pattern.

## 5. Constraints & Non-Goals

- **Prospect = public data only** (platform limitation).
- Each Owned account requires a **one-time Composio auth**; platform availability
  follows Composio toolkit support.
- **Out of scope (this effort):** scheduled/automatic sync, outbound
  posting/scheduling, complex multi-tenant permissions. Noted as possible
  follow-ups.
- **Local-first; no push** to origin/main until explicitly requested.

## 6. New Dependencies & Config

- `@composio/core` (npm dependency).
- `COMPOSIO_API_KEY` in `.env.local` (server-side).
- New `schema_social.sql` applied to Supabase.
