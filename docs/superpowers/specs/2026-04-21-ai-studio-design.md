# AI Studio — Design Spec

## Goal

Section baru "AI Studio" di sidebar yang membantu tim Bentala dalam pencarian ide konten, pembuatan konten lengkap berbasis Claude AI, dan agregasi berita internasional/Indonesia + social media untuk kebutuhan konten BPI — semuanya dari satu tempat, terintegrasi langsung ke BPI/BSI.

## Architecture

### New Routes
- `/ai/ideas` — Pencari Ide: generate angle konten dari keyword
- `/ai/builder` — Content Builder: generate paket lengkap (caption + hashtag + script)
- `/ai/bpi` — BPI Intelligence: agregasi berita + generate ide konten BPI

### Sidebar
Tambah section baru di `components/Sidebar.tsx` dengan badge `"ai"` dan fullLabel `"ai studio"`, berisi:
```ts
{ href: '/ai/ideas',   label: 'Pencari Ide',      icon: <Icon><IdeaIcon /></Icon> },
{ href: '/ai/builder', label: 'Content Builder',   icon: <Icon><BuildIcon /></Icon> },
{ href: '/ai/bpi',     label: 'BPI Intelligence',  icon: <Icon><NewsIcon /></Icon> },
```

### API Routes (server-side, API keys tidak terekspos ke client)
- `app/api/ai/ideas/route.ts` — Claude generate idea angles
- `app/api/ai/builder/route.ts` — Claude generate content package
- `app/api/ai/news/route.ts` — Fetch & parse RSS feeds + Reddit API

---

## Data Sources — BPI Intelligence

Semua sumber gratis, tanpa biaya:

| Sumber | Tipe | URL/Endpoint |
|---|---|---|
| BBC World | RSS | `http://feeds.bbci.co.uk/news/world/rss.xml` |
| Reuters | RSS | `https://feeds.reuters.com/reuters/topNews` |
| Al Jazeera English | RSS | `https://www.aljazeera.com/xml/rss/all.xml` |
| Google News (Indonesia) | RSS | `https://news.google.com/rss/search?q=Indonesia&hl=en` |
| Kompas | RSS | `https://rss.kompas.com/internasional` |
| Detik | RSS | `https://rss.detik.com/index.php/detikcom` |
| Tempo | RSS | `https://rss.tempo.co/nasional` |
| CNN Indonesia | RSS | `https://www.cnnindonesia.com/rss` |
| Reddit r/indonesia | Reddit API | `https://www.reddit.com/r/indonesia/hot.json` |
| Reddit r/worldnews | Reddit API | `https://www.reddit.com/r/worldnews/search.json?q=Indonesia` |

Reddit API: gunakan public JSON endpoint (`/hot.json`, `/search.json`) tanpa OAuth — tidak butuh API key untuk read-only.

---

## Data Model

### New Supabase Tables

#### `ai_ideas`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `keyword` | text | Input keyword/topik |
| `platform` | text | `'ig'`, `'tiktok'`, `'keduanya'` |
| `tone` | text | `'informatif'`, `'fun'`, `'inspiratif'`, `'viral'` |
| `ideas` | jsonb | Array of idea objects (lihat struktur di bawah) |
| `user_name` | text | Nama user yang generate |
| `created_at` | timestamptz | default now() |

Struktur `ideas`:
```json
[
  {
    "id": "idea_1",
    "title": "5 Fakta Mengejutkan tentang...",
    "concept": "Bahas dari sudut pandang...",
    "hook": "Kalimat pembuka yang menarik...",
    "saved": false
  }
]
```

#### `ai_generations`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `idea_id` | uuid (nullable) | FK ke ai_ideas jika dari Pencari Ide |
| `input_text` | text | Teks input manual jika tidak dari idea |
| `platform` | text | Target platform |
| `caption` | text | Generated caption |
| `hashtags` | text | Generated hashtags |
| `script` | text | Generated script (untuk video) |
| `posting_time` | text | Saran waktu posting |
| `exported_to` | text (nullable) | `'bpi'` atau `'bsi'` jika sudah dikirim |
| `exported_post_id` | uuid (nullable) | FK ke posts.id jika sudah dikirim |
| `user_name` | text | |
| `created_at` | timestamptz | |

#### `news_cache`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `source` | text | Nama sumber (e.g., `'bbc'`, `'kompas'`, `'reddit_indonesia'`) |
| `source_type` | text | `'international'`, `'indonesia'`, `'social'` |
| `title` | text | Judul berita |
| `summary` | text | Ringkasan singkat (dari RSS description atau AI) |
| `url` | text | Link asli |
| `published_at` | timestamptz | Waktu publikasi asli |
| `fetched_at` | timestamptz | Waktu di-fetch sistem |
| `relevance_score` | int (nullable) | 0–100, diisi Claude jika sudah dianalisis |

---

## TypeScript Types (`lib/types.ts` additions)

```ts
export interface IdeaItem {
  id: string
  title: string
  concept: string
  hook: string
  saved: boolean
}

export interface AIIdea {
  id: string
  keyword: string
  platform: string
  tone: string
  ideas: IdeaItem[]
  user_name: string
  created_at: string
}

export interface AIGeneration {
  id: string
  idea_id: string | null
  input_text: string
  platform: string
  caption: string
  hashtags: string
  script: string
  posting_time: string
  exported_to: string | null
  exported_post_id: string | null
  user_name: string
  created_at: string
}

export interface NewsItem {
  id: string
  source: string
  source_type: 'international' | 'indonesia' | 'social'
  title: string
  summary: string
  url: string
  published_at: string
  fetched_at: string
  relevance_score: number | null
}
```

---

## Constants (`lib/constants.ts` additions)

```ts
export const AI_TONES = [
  { key: 'informatif', label: 'Informatif' },
  { key: 'fun',        label: 'Fun & Santai' },
  { key: 'inspiratif', label: 'Inspiratif' },
  { key: 'viral',      label: 'Viral / Hook' },
] as const

export const AI_PLATFORMS = [
  { key: 'ig',       label: 'Instagram' },
  { key: 'tiktok',   label: 'TikTok' },
  { key: 'keduanya', label: 'IG + TikTok' },
] as const

export const NEWS_SOURCES = [
  { key: 'bbc',              label: 'BBC World',       type: 'international' },
  { key: 'reuters',          label: 'Reuters',         type: 'international' },
  { key: 'aljazeera',        label: 'Al Jazeera',      type: 'international' },
  { key: 'google_indonesia', label: 'Google News',     type: 'international' },
  { key: 'kompas',           label: 'Kompas',          type: 'indonesia' },
  { key: 'detik',            label: 'Detik',           type: 'indonesia' },
  { key: 'tempo',            label: 'Tempo',           type: 'indonesia' },
  { key: 'cnn_indonesia',    label: 'CNN Indonesia',   type: 'indonesia' },
  { key: 'reddit_indonesia', label: 'r/indonesia',     type: 'social' },
  { key: 'reddit_worldnews', label: 'r/worldnews',     type: 'social' },
] as const
```

---

## Component Structure

```
components/AIStudio/
├── IdeaExplorer.tsx       — Pencari Ide: form input + grid hasil ideas
├── IdeaCard.tsx           — Satu idea card (title, concept, hook, tombol save + build)
├── ContentBuilder.tsx     — Content Builder: input + hasil generated content
├── GeneratedOutput.tsx    — Tampilkan caption/hashtag/script + tombol export ke BPI/BSI
├── BPIIntelligence.tsx    — Two-panel: kiri daftar berita, kanan hasil AI
├── NewsCard.tsx           — Satu berita card (title, source, time, summary, tombol select)
└── NewsFilter.tsx         — Filter tabs: Semua / Internasional / Indonesia / Social Media
```

### Page Files
```
app/(dashboard)/ai/
├── ideas/page.tsx
├── builder/page.tsx
└── bpi/page.tsx
```

---

## UI Layout

### `/ai/ideas` — Pencari Ide

```
┌─────────────────────────────────────────────────────┐
│  Topik / Keyword: [____________________]             │
│  Platform: [IG] [TikTok] [IG+TikTok]               │
│  Tone: [Informatif] [Fun] [Inspiratif] [Viral]      │
│  [Generate Ide →]                                   │
├─────────────────────────────────────────────────────┤
│  Hasil (8 ide):                                     │
│  ┌──────────────────┐ ┌──────────────────┐          │
│  │ 5 Fakta...       │ │ POV: Indonesia.. │          │
│  │ Concept: ...     │ │ Concept: ...     │          │
│  │ Hook: ...        │ │ Hook: ...        │          │
│  │ [Simpan] [Build] │ │ [Simpan] [Build] │          │
│  └──────────────────┘ └──────────────────┘          │
└─────────────────────────────────────────────────────┘
```

### `/ai/builder` — Content Builder

```
┌─────────────────────────────────────────────────────┐
│  [Dari Idea Tersimpan ▾]  atau  [Ketik Manual]       │
│  Platform: [IG] [TikTok]                            │
│  [Generate Konten →]                                │
├─────────────────────────────────────────────────────┤
│  Caption:   [__________________________________]     │
│  Hashtag:   [__________________________________]     │
│  Script:    [__________________________________]     │
│  Waktu post: Selasa 18.00–20.00 WIB                 │
│                                                     │
│  [Kirim ke BPI]   [Kirim ke BSI]   [Salin]          │
└─────────────────────────────────────────────────────┘
```

### `/ai/bpi` — BPI Intelligence

```
┌───────────────────────┬─────────────────────────────┐
│  [Semua][Int][ID][SM] │  Pilih berita di kiri untuk │
│  ──────────────────── │  generate ide konten BPI    │
│  🔴 BBC               │                             │
│  Judul berita...      │  ─────────────────────────  │
│  12 menit lalu        │  Ide Konten BPI:            │
│  [Select]             │                             │
│                       │  1. Angle: Dampak ke RI...  │
│  🟠 Kompas            │     Hook: "Indonesia...     │
│  Judul berita...      │                             │
│  1 jam lalu           │  2. Angle: Ekonomi global.. │
│  [Select]             │     Hook: "Di saat dunia..  │
│                       │                             │
│  🟣 r/indonesia       │  [Kirim ke BPI sebagai     │
│  Judul post...        │   Draft Post]               │
└───────────────────────┴─────────────────────────────┘
```

---

## API Routes

### `POST /api/ai/ideas`
Request: `{ keyword, platform, tone }`
Response: `{ ideas: IdeaItem[] }`
Claude prompt: Generate 8 angle konten untuk platform `{platform}` dengan tone `{tone}` tentang topik `{keyword}`. Output JSON array.

### `POST /api/ai/builder`
Request: `{ input_text, platform }`
Response: `{ caption, hashtags, script, posting_time }`
Claude prompt: Buat konten lengkap (caption, hashtag, script) untuk `{platform}` dari ide: `{input_text}`. Bahasa Indonesia. Output JSON.

### `GET /api/ai/news`
Response: `{ items: NewsItem[] }`
Server fetches all RSS feeds + Reddit JSON endpoints, parses XML/JSON, stores to `news_cache` (TTL 30 menit), returns merged array sorted by `published_at`.

### `POST /api/ai/bpi-analyze`
Request: `{ news_ids: string[] }` (1–3 berita yang dipilih)
Response: `{ ideas: { angle: string, hook: string }[] }`
Claude prompt: Analisis berita berikut dan hasilkan 5 angle konten untuk akun berita BPI (Bentala Project Indonesia) yang aktif di IG/TikTok. Output JSON.

---

## News Fetch Implementation

`/api/ai/news/route.ts`:
1. Fetch semua RSS URL secara paralel (`Promise.all`)
2. Parse XML dengan `fast-xml-parser` (npm package, gratis)
3. Fetch Reddit JSON: `https://www.reddit.com/r/indonesia/hot.json?limit=25`
4. Merge semua item, normalize ke `NewsItem` format
5. Upsert ke `news_cache` (by URL untuk dedup)
6. Return items dari cache jika ada row dengan `fetched_at` > now() - 30 menit; jika tidak ada atau stale → fetch ulang semua sumber lalu upsert

---

## Claude Integration

Gunakan `@anthropic-ai/sdk` (npm). API key dari env: `ANTHROPIC_API_KEY`.

```ts
import Anthropic from '@anthropic-ai/sdk'
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const message = await client.messages.create({
  model: 'claude-opus-4-7',
  max_tokens: 2048,
  messages: [{ role: 'user', content: prompt }],
})
```

Semua AI call dari server-side API routes — API key tidak pernah terekspos ke browser.

---

## Export ke BPI/BSI

"Kirim ke BPI" / "Kirim ke BSI":
1. Insert ke tabel `posts` dengan data dari generated content:
   - `entity`: `'bpi'` atau `'bsi'`
   - `title`: dari idea title
   - `caption`: generated caption
   - `hashtags`: generated hashtags
   - `status`: `'todo'` (draft)
   - `platforms`: sesuai pilihan user
2. Update `ai_generations.exported_to` dan `exported_post_id`
3. Toast notifikasi sukses + link ke post yang baru dibuat

---

## Supabase SQL

```sql
create table ai_ideas (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  platform text not null,
  tone text not null,
  ideas jsonb not null default '[]',
  user_name text not null,
  created_at timestamptz default now()
);

create table ai_generations (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid references ai_ideas(id) on delete set null,
  input_text text not null,
  platform text not null,
  caption text not null default '',
  hashtags text not null default '',
  script text not null default '',
  posting_time text not null default '',
  exported_to text,
  exported_post_id uuid references posts(id) on delete set null,
  user_name text not null,
  created_at timestamptz default now()
);

create table news_cache (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_type text not null,
  title text not null,
  summary text not null default '',
  url text not null unique,
  published_at timestamptz,
  fetched_at timestamptz default now(),
  relevance_score int
);
```

---

## Files to Create
- `app/(dashboard)/ai/ideas/page.tsx`
- `app/(dashboard)/ai/builder/page.tsx`
- `app/(dashboard)/ai/bpi/page.tsx`
- `app/api/ai/ideas/route.ts`
- `app/api/ai/builder/route.ts`
- `app/api/ai/news/route.ts`
- `app/api/ai/bpi-analyze/route.ts`
- `components/AIStudio/IdeaExplorer.tsx`
- `components/AIStudio/IdeaCard.tsx`
- `components/AIStudio/ContentBuilder.tsx`
- `components/AIStudio/GeneratedOutput.tsx`
- `components/AIStudio/BPIIntelligence.tsx`
- `components/AIStudio/NewsCard.tsx`
- `components/AIStudio/NewsFilter.tsx`

## Files to Modify
- `lib/types.ts` — tambah AIIdea, AIGeneration, NewsItem, IdeaItem
- `lib/constants.ts` — tambah AI_TONES, AI_PLATFORMS, NEWS_SOURCES
- `lib/database.types.ts` — tambah ai_ideas, ai_generations, news_cache tables
- `components/Sidebar.tsx` — tambah section "ai" dengan 3 nav items
