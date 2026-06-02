# AI Studio Hub + Brief Generator — Design Spec

## Goal

Replace the current flat AI Studio navigation with a Kanban-based content pipeline hub, and add an AI-powered Brief Generator that produces design briefs (with DALL-E generated images + Midjourney prompts) and video briefs (with script, storyboard, and talking points), automatically pushing them to the Video Production and Design Studio pages.

## Architecture

A new Kanban hub at `/ai` replaces the current AI Studio index. Each content piece is a "pipeline card" that moves through four stages: Ide → Brief → Caption → Selesai. When a card reaches the Brief stage, AI generates both a Design Brief and a Video Brief. Briefs are stored in Supabase and surfaced in a new "Brief Inbox" tab on the Video Production and Design Studio pages. When production marks a brief done, the card advances to Caption automatically.

## Tech Stack

- Next.js 14 App Router, Supabase, Claude API (`claude-opus-4-7`), OpenAI DALL-E 3 API
- Existing: `@anthropic-ai/sdk`, `@supabase/supabase-js`, inline styles, dark theme CSS variables

---

## File Structure

### New files
- `app/(dashboard)/ai/page.tsx` — Kanban hub (replaces current AI Studio index)
- `components/AIStudio/PipelineHub.tsx` — Kanban board, column layout, card rendering
- `components/AIStudio/PipelineCard.tsx` — Individual content card with stage-appropriate actions
- `components/AIStudio/BriefGenerator.tsx` — Modal/panel: triggers AI brief generation, shows results
- `components/AIStudio/BriefInbox.tsx` — Brief list for production pages (used by both Video Production and Design Studio)
- `app/api/pipeline/route.ts` — CRUD for `content_pipeline` (GET list, POST create, PATCH update stage)
- `app/api/pipeline/briefs/route.ts` — GET briefs by type (`design` | `video`) for production inbox
- `app/api/ai/brief/route.ts` — POST: Claude generates design + video brief content
- `app/api/ai/generate-image/route.ts` — POST: DALL-E 3 generates design preview + storyboard frames

### Modified files
- `app/(dashboard)/bpi-faizal/page.tsx` — Add "Brief Inbox" tab using `BriefInbox` component (type: `video`)
- `app/(dashboard)/bpi-reinaldi/page.tsx` — Add "Brief Inbox" tab using `BriefInbox` component (type: `design`)
- `lib/types.ts` — Add `PipelineCard`, `ProductionBrief`, `DesignBrief`, `VideoBrief` types
- `lib/constants.ts` — Add `PIPELINE_STAGES` constant

---

## Feature Descriptions

### 1. AI Studio Hub — Kanban Board (`/ai`)

**Layout:** Full-width kanban with 4 columns. Header shows active count and "+ Konten Baru" button.

**Columns:**
- `IDE` (purple) — new ideas, not yet briefed
- `BRIEF` (amber) — brief generated, waiting for production to finish
- `CAPTION` (green) — production done, ready for caption/content writing
- `SELESAI` (gray, muted) — fully complete

**Cards show:** title, entity (BPI/BSI), platform (IG/TikTok/Both), creation date.

**Card actions by stage:**
- IDE stage: "⚡ Generate Brief" button — opens BriefGenerator
- BRIEF stage: shows brief status badges ("Design → In Progress", "Video → Pending"), "✎ Buat Caption" link to Content Builder
- CAPTION stage: "→ Content Builder" button
- SELESAI: read-only

**"Konten Baru" flow:** Modal with fields: Judul, Entity (BPI/BSI), Platform. Creates a card in IDE column. Optionally pre-fills from Pencari Ide output (via URL query params).

### 2. Brief Generator

Triggered by "Generate Brief" on an IDE-stage card. Opens as a full-panel overlay.

**Step 1 — Select brief type:**
User picks: Design, Video, or Both.

**Step 2 — AI generates content:**
Calls `/api/ai/brief` (Claude) with the card's title, entity, and platform. Returns structured JSON with two keys: `design` and `video`.

**Design brief JSON structure:**
```json
{
  "format": "Feed Instagram 1080×1350px",
  "tone": "Minimalis, fashion-forward, warm",
  "palette": [{ "name": "Cream", "hex": "#F5F0E8" }, ...],
  "typography": {
    "headline": "Bold 72px uppercase — teks headline",
    "subtext": "Light 24px — teks subtext",
    "cta": "Medium 32px terracotta — teks CTA"
  },
  "composition": "Hero image 60% atas, text block 40% bawah, logo pojok kanan bawah",
  "midjourney_prompt": "full prompt string ready to copy",
  "dalle_prompt": "prompt for DALL-E 3 preview image"
}
```

**Video brief JSON structure:**
```json
{
  "duration": "45 detik",
  "format": "TikTok 9:16",
  "tone": "Fun, energetic, fast-cut",
  "editing_style": "Jump cuts tiap 2-3 detik, CapCut template energetic",
  "script": [
    {
      "timecode": "00:00–00:03",
      "label": "HOOK",
      "dialog": "Ini 3 tren fashion 2025 yang WAJIB kamu tau!",
      "direction": "Close-up wajah, zoom-in cepat",
      "talking_points": ["Emphasis pada WAJIB", "Pause sebelum mulai"]
    }
  ],
  "storyboard_prompts": ["DALL-E prompt for scene 1", "DALL-E prompt for scene 2", ...]
}
```

**Step 3 — Generate images:**
Calls `/api/ai/generate-image` (DALL-E 3):
- For design: 1 preview image using `dalle_prompt`
- For video storyboard: up to 4 key scene images using `storyboard_prompts`

**Step 4 — Display results in two tabs: Design | Video**

Design tab shows: generated preview image, Midjourney prompt with copy button, typography specs, color palette swatches, composition guide.

Video tab shows: storyboard grid (4 frames with scene labels), script table (timecode / dialog / direction), talking points list.

**Step 5 — Push to production:**
"Kirim ke Produksi" button:
- Saves brief to `production_briefs` table (one row for design, one for video)
- Updates card stage to `brief` in `content_pipeline`
- Design brief appears in Design Studio Brief Inbox
- Video brief appears in Video Production Brief Inbox

### 3. Brief Inbox (Video Production + Design Studio pages)

Both `/bpi-faizal` and `/bpi-reinaldi` get a new **"Brief"** tab added to `PageHeader`.

Tab shows `BriefInbox` component, filtered by type (`video` for faizal, `design` for reinaldi).

**Brief list item shows:**
- Content title + entity + platform
- Brief type badge
- Status chip: `Pending` / `In Progress` / `Done`
- "Lihat Brief" expand button — reveals full brief content inline
- "Tandai Selesai" button — marks brief `done`, triggers pipeline card to advance to `caption` stage

**Design brief expanded view:** Generated image, Midjourney prompt (copy button), typography, palette, composition.

**Video brief expanded view:** Storyboard grid (4 images), script per scene (timecode / dialog / direction / talking points).

---

## Data Model

### Table: `content_pipeline`
```sql
id          uuid primary key default gen_random_uuid()
title       text not null
entity      text not null  -- 'bpi' | 'bsi'
platform    text not null  -- 'ig' | 'tiktok' | 'keduanya'
stage       text not null default 'ide'  -- 'ide' | 'brief' | 'caption' | 'selesai'
idea_text   text           -- optional, from Pencari Ide
created_at  timestamptz default now()
updated_at  timestamptz default now()
```

### Table: `production_briefs`
```sql
id            uuid primary key default gen_random_uuid()
pipeline_id   uuid references content_pipeline(id) on delete cascade
type          text not null  -- 'design' | 'video'
content       jsonb not null  -- full brief JSON (see above structures)
images        jsonb          -- array of generated image URLs
status        text not null default 'pending'  -- 'pending' | 'in_progress' | 'done'
created_at    timestamptz default now()
updated_at    timestamptz default now()
```

---

## API Routes

### `GET/POST /api/pipeline`
- GET: returns all `content_pipeline` rows ordered by `updated_at desc`
- POST body: `{ title, entity, platform, idea_text? }` → creates card in `ide` stage
- PATCH body: `{ id, stage }` → updates card stage

### `GET /api/pipeline/briefs?type=design|video`
Returns `production_briefs` joined with `content_pipeline` filtered by type and ordered by `created_at desc`.

### `PATCH /api/pipeline/briefs/[id]`
Body: `{ status }` → updates brief status. If status = `done` and all briefs that exist for this pipeline (1 or 2 depending on what was generated) are `done`, advances pipeline card to `caption`.

### `POST /api/ai/brief`
Body: `{ title, entity, platform, types: ('design'|'video')[] }`
Calls Claude (`claude-opus-4-7`) with structured prompt. Returns `{ design?: DesignBrief, video?: VideoBrief }`.
Has try/catch, returns `{ error }` on failure.

### `POST /api/ai/generate-image`
Body: `{ prompt, size?: '1024x1024' | '1024x1792' }`
Calls OpenAI DALL-E 3 (`openai` npm package). Returns `{ url: string }`.
Images stored as URLs (no upload to Supabase Storage needed for MVP).
Has try/catch, returns `{ error }` on failure.

---

## Error Handling

- All API routes return `{ error: string }` with appropriate HTTP status on failure
- `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` checked at handler start — return 500 if missing
- JSON from Claude stripped of markdown fences before `JSON.parse`
- DALL-E failures are non-blocking — brief still saved, image shows placeholder
- Components show inline red error messages (matching existing pattern in codebase)

---

## Out of Scope (future sub-projects)

- Auto-publish to Instagram/TikTok API
- Content analytics dashboard + AI recommendations
- AI video generation (RunwayML/Kling)
- Drag-and-drop between Kanban columns (cards advance via button actions only)
