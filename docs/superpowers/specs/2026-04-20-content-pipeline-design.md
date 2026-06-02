# Content Production Pipeline — Design Spec

## Goal

Two dedicated pipeline pages — one for Video Production, one for Design Studio — that track social media content from idea to upload, with per-stage notes, file links, checklists, and timestamps. Items can originate from BPI/BSI posts or be created independently.

## Architecture

### New Routes
- `/pipeline/vp` — Video Production Pipeline
- `/pipeline/ds` — Design Studio Pipeline

### Sidebar
Added under `proj.` section in `components/Sidebar.tsx`:
- `{ href: '/pipeline/vp', label: 'Video Pipeline', icon: VideoIcon }`
- `{ href: '/pipeline/ds', label: 'Design Pipeline', icon: DesignIcon }`

### Each Pipeline Page Has 2 Tabs
1. **Pipeline** — detail-first layout (list left, stage panel right)
2. **Summary** — stats: items per stage, avg duration, completion rate

---

## Stage Definitions

### Video Production Pipeline
`ide → script → audio → video → upload`

### Design Studio Pipeline
`ide → brief → design → review → upload`

---

## Data Model

### New Supabase Table: `pipeline_items`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key, default gen_random_uuid() |
| `title` | text | Content title |
| `member` | text | `'Video Production'` or `'Design Studio'` |
| `source_post_id` | uuid (nullable) | FK to posts.id if originated from BPI/BSI |
| `current_stage` | text | Active stage key |
| `stages_data` | jsonb | Per-stage tracking data (see below) |
| `created_at` | timestamptz | default now() |
| `updated_at` | timestamptz | updated on any change |

### `stages_data` JSONB Structure

```json
{
  "ide": {
    "status": "done",
    "notes": "Konsep approved Naufal",
    "files": [{ "label": "Brief Doc", "url": "https://..." }],
    "checklist": [
      { "id": "c1", "text": "Konsep dibuat", "done": true },
      { "id": "c2", "text": "Approved", "done": true }
    ],
    "started_at": "2026-04-10T08:00:00Z",
    "completed_at": "2026-04-10T10:00:00Z"
  },
  "script": {
    "status": "in_progress",
    "notes": "",
    "files": [],
    "checklist": [
      { "id": "c3", "text": "Draft selesai", "done": true },
      { "id": "c4", "text": "Review Naufal", "done": false }
    ],
    "started_at": "2026-04-11T09:00:00Z",
    "completed_at": null
  },
  "audio": { "status": "pending", "notes": "", "files": [], "checklist": [], "started_at": null, "completed_at": null },
  "video": { "status": "pending", "notes": "", "files": [], "checklist": [], "started_at": null, "completed_at": null },
  "upload": { "status": "pending", "notes": "", "files": [], "checklist": [], "started_at": null, "completed_at": null }
}
```

### Stage Status Values
- `pending` — not yet started
- `in_progress` — actively being worked on (started_at set)
- `done` — completed (completed_at set)

### TypeScript Types (lib/types.ts additions)

```ts
export type StageStatus = 'pending' | 'in_progress' | 'done'

export interface StageData {
  status: StageStatus
  notes: string
  files: { label: string; url: string }[]
  checklist: { id: string; text: string; done: boolean }[]
  started_at: string | null
  completed_at: string | null
}

export interface PipelineItem {
  id: string
  title: string
  member: 'Video Production' | 'Design Studio'
  source_post_id: string | null
  current_stage: string
  stages_data: Record<string, StageData>
  created_at: string
  updated_at: string
}
```

---

## Constants (lib/constants.ts additions)

```ts
export const VP_STAGES = [
  { key: 'ide',    label: 'Ide',    color: '#8b8fa8' },
  { key: 'script', label: 'Script', color: '#5b9bd5' },
  { key: 'audio',  label: 'Audio',  color: '#ffc542' },
  { key: 'video',  label: 'Video',  color: '#6c63ff' },
  { key: 'upload', label: 'Upload', color: '#43d9a2' },
]

export const DS_STAGES = [
  { key: 'ide',    label: 'Ide',    color: '#8b8fa8' },
  { key: 'brief',  label: 'Brief',  color: '#5b9bd5' },
  { key: 'design', label: 'Design', color: '#ffc542' },
  { key: 'review', label: 'Review', color: '#ff6b6b' },
  { key: 'upload', label: 'Upload', color: '#43d9a2' },
]
```

---

## Component Structure

```
components/Pipeline/
├── index.tsx             — Page wrapper: 2 tabs (Pipeline | Summary)
├── PipelineList.tsx      — Left panel (35%): list of items + filter + add button
├── StagePanel.tsx        — Right panel (65%): all stages for selected item
├── StageCard.tsx         — One stage accordion: status, notes, files, checklist
├── AddPipelineModal.tsx  — Modal: create new pipeline item (title, source link)
└── PipelineSummary.tsx   — Summary tab: stats grid + completion rate
```

---

## UI Layout — Pipeline Tab

```
┌─────────────────────────────────────────────────────────────────┐
│  [Pipeline]  [Summary]                                          │
├───────────────────────┬─────────────────────────────────────────┤
│  Konten               │  "Video Promo BPI - April"              │
│                       │  [bpi] tag   Stage: Script              │
│  + Tambah Konten      │                                         │
│  ─────────────────    │  ┌─ Ide ─────────────── ✓ Done ──────┐ │
│  🔵 Video Promo BPI   │  │  Selesai: 10 Apr · 2j durasi       │ │
│     Script  [bpi]     │  │  "Konsep approved Naufal"           │ │
│                       │  │  📎 Brief Doc                       │ │
│  🟡 Konten Mandiri    │  └──────────────────────────────────── ┘ │
│     Audio             │                                         │
│                       │  ┌─ Script ──────────── ⟳ Berjalan ──┐ │
│  ⚪ Reels Tutorial    │  │  ☑ Draft selesai                    │ │
│     Ide  [bsi]        │  │  ☐ Review Naufal                    │ │
│                       │  │  + Tambah checklist                 │ │
│                       │  │  📎 + Tambah file                   │ │
│                       │  │  📝 Catatan...                      │ │
│                       │  │  [Tandai Selesai ✓]                 │ │
│                       │  └──────────────────────────────────── ┘ │
│                       │                                         │
│                       │  ┌─ Audio ──────────── ○ Pending ─────┐ │
│                       │  │  (stage sebelumnya belum selesai)   │ │
│                       │  └──────────────────────────────────── ┘ │
└───────────────────────┴─────────────────────────────────────────┘
```

### Interaction Rules
- Klik item di kiri → panel kanan terbuka, stage aktif auto-expand
- "Mulai" button muncul di stage aktif → sets `status: in_progress`, records `started_at`
- "Tandai Selesai" → sets `status: done`, records `completed_at`, `current_stage` advances to next
- Stage `pending` yang belum gilirannya ditampilkan collapsed dengan label "stage sebelumnya belum selesai"
- Checklist item bisa ditambah/hapus inline
- File link: label + URL, ditampilkan sebagai clickable chip
- Notes: textarea autosave on blur

---

## BPI/BSI Integration

In `components/WorkSpace/WSEditModal.tsx`:
- When post status changes to `produksi` AND `pics` includes Video Production or Design Studio
- Show button: **"Buat Pipeline Item"**
- On click: creates `pipeline_items` row with `source_post_id = post.id`, `member`, `current_stage = 'ide'`, empty stages_data initialized
- Post detail panel shows: "📌 Pipeline: [link ke pipeline item]"

---

## Summary Tab

Stats displayed in a grid:
- Items per stage (count + colored bar)
- Total items: In Progress / Done / Pending
- Average time per stage (calculated from started_at → completed_at)
- Completion rate (% items reached 'upload' stage)

---

## Real-time

Use existing Supabase realtime pattern from `useStore`. Add subscription to `pipeline_items` table filtered by `member`. Updates propagate instantly across sessions.

---

## Files to Create
- `app/(dashboard)/pipeline/vp/page.tsx`
- `app/(dashboard)/pipeline/ds/page.tsx`
- `components/Pipeline/index.tsx`
- `components/Pipeline/PipelineList.tsx`
- `components/Pipeline/StagePanel.tsx`
- `components/Pipeline/StageCard.tsx`
- `components/Pipeline/AddPipelineModal.tsx`
- `components/Pipeline/PipelineSummary.tsx`

## Files to Modify
- `lib/types.ts` — add PipelineItem, StageData, StageStatus types
- `lib/constants.ts` — add VP_STAGES, DS_STAGES
- `components/Sidebar.tsx` — add Video Pipeline and Design Pipeline nav items
- `components/WorkSpace/WSEditModal.tsx` — add "Buat Pipeline Item" button trigger
