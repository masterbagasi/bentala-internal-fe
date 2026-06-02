# Bentala Internal System — Next.js Setup Guide

## Stack
- **Next.js 14** (App Router)
- **Tailwind CSS** — utility classes + CSS variables
- **Supabase** — database, auth, realtime, storage
- **Zustand** — client state management
- **Chart.js** — analytics charts

---

## 1. Setup Supabase Project

1. Buka [supabase.com](https://supabase.com) → New Project
2. Setelah project jadi, buka **SQL Editor**
3. Paste & jalankan isi file `schema.sql`
4. Buka **Storage** → Create bucket bernama `bentala-files` → set ke **Private**
5. Buka **Database → Replication** → aktifkan realtime untuk:
   - `posts`
   - `tasks`
   - `clients`
   - `activity_log`

---

## 2. Setup Environment Variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://[PROJECT_ID].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[ANON_KEY]
SUPABASE_SERVICE_ROLE_KEY=[SERVICE_ROLE_KEY]
```

> Ambil dari Supabase Dashboard → Project Settings → API

---

## 3. Buat User untuk Tim

Di Supabase Dashboard → **Authentication → Users → Add User**:

Buat akun untuk:
- `dandi@bentala.id`
- `naufal@bentala.id`
- `reinaldi@bentala.id`
- `faizal@bentala.id`

---

## 4. Install & Run

```bash
cd bentala-nextjs

# Install dependencies
npm install

# Run development server
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) → login dengan akun yang sudah dibuat.

---

## 5. Migrasi Data dari HTML Lama

Jika kamu punya data di aplikasi HTML lama:

1. Buka aplikasi HTML lama di browser
2. Di tab yang sama, buka [http://localhost:3000/migrate](http://localhost:3000/migrate)
3. Klik **Mulai Migrasi**

Data dari localStorage akan diupload ke Supabase.

---

## 6. Deploy ke Vercel (Opsional)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set env variables di Vercel Dashboard
```

---

## Struktur File

```
bentala-nextjs/
├── app/
│   ├── (auth)/login/         — Login page
│   ├── (dashboard)/          — Dashboard layout + all pages
│   │   ├── page.tsx          — Dashboard overview
│   │   ├── bpi/              — BPI Projects (list/board/calendar/files)
│   │   ├── bpi/analytics/    — BPI Analytics + charts
│   │   ├── bpi-faizal/       — Faizal workspace
│   │   ├── bpi-reinaldi/     — Reinaldi workspace
│   │   ├── bsi/calendar/     — BSI Content Calendar
│   │   ├── bsi/posts/        — BSI Post Tracker
│   │   ├── clients/          — CRM Pipeline
│   │   ├── invoices/         — Invoice & Pembayaran
│   │   ├── projects/         — All Projects
│   │   ├── tasks/            — Task Board
│   │   └── team/             — Team & Roles
│   └── migrate/              — One-time data migration tool
│
├── components/
│   ├── Sidebar.tsx           — Collapsible sidebar nav
│   ├── BPI/                  — BPI kanban, list, modals, analytics
│   ├── WorkSpace/            — Faizal/Reinaldi workspace + file upload
│   ├── BSI/                  — Content calendar + post tracker
│   ├── CRM/                  — Client kanban + modal
│   ├── Invoices/             — Invoice table + modal
│   ├── Projects/             — Project table + modal
│   ├── Tasks/                — Task kanban + modal
│   ├── Team/                 — Team cards
│   ├── Dashboard/            — Dashboard overview
│   └── shared/               — Modal, StatusBadge, Topbar, DataProvider
│
├── hooks/
│   ├── useStore.ts           — Zustand state store
│   ├── useData.ts            — Initial data fetch
│   └── useRealtime.ts        — Supabase realtime subscriptions
│
├── lib/
│   ├── supabase.ts           — Browser Supabase client
│   ├── supabase-server.ts    — Server Supabase client
│   ├── migrate.ts            — localStorage → Supabase migration
│   ├── types.ts              — TypeScript types
│   ├── constants.ts          — Status labels, colors, team data
│   ├── utils.ts              — Formatting helpers
│   └── database.types.ts     — Generated DB types
│
├── middleware.ts             — Auth route protection
├── schema.sql                — Full Supabase schema
└── tailwind.config.ts        — Tailwind + CSS variables
```

---

## Fitur yang Diimplementasi

| Fitur | Status |
|-------|--------|
| Authentication (email/password) | ✅ |
| Protected routes via middleware | ✅ |
| Collapsible sidebar navigation | ✅ |
| Dashboard KPIs + activity | ✅ |
| BPI Board — List/Board/Calendar/Files | ✅ |
| BPI Board — Kanban drag & drop | ✅ |
| BPI Board — Revisi column (Naufal locked) | ✅ |
| Faizal/Reinaldi Workspace | ✅ |
| WS — Cannot drag TO Revisi | ✅ |
| WS — File upload (video + design) | ✅ |
| WS — Save before moving to "File Terlampir" | ✅ |
| WS — Status dropdown (fixed position) | ✅ |
| BSI Content Calendar (multi-month view) | ✅ |
| BSI Post Tracker table | ✅ |
| CRM Pipeline Kanban | ✅ |
| Invoice table + status update | ✅ |
| Projects table + progress tracking | ✅ |
| Tasks Kanban board | ✅ |
| Team & Roles overview | ✅ |
| BPI Analytics + Chart.js | ✅ |
| Supabase Realtime sync | ✅ |
| LocalStorage → Supabase migration | ✅ |
| Supabase Storage for file uploads | ✅ |
