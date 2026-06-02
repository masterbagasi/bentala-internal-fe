# AI Studio Hub + Brief Generator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat AI Studio navigation with a Kanban content pipeline hub and add an AI Brief Generator that creates design + video briefs (with DALL-E images) and pushes them to the Video Production and Design Studio pages.

**Architecture:** A Kanban board at `/ai` tracks content cards through 4 stages (Ide → Brief → Caption → Selesai). Brief Generator calls Claude for structured brief JSON, then DALL-E 3 for images. Briefs are stored in Supabase and surfaced in a new Brief Inbox tab on `/bpi-faizal` (Video Production) and `/bpi-reinaldi` (Design Studio). Marking a brief done auto-advances the pipeline card.

**Tech Stack:** Next.js 14 App Router, Supabase (`@supabase/supabase-js`), `@anthropic-ai/sdk`, `openai` (DALL-E 3), inline styles, CSS variables (`--bg`, `--bg2`, `--bg3`, `--border`, `--accent`, `--accent3`, `--text`, `--text2`)

---

## File Map

**New files:**
- `lib/types.ts` — add `PipelineCard`, `ProductionBrief`, `DesignBrief`, `VideoBrief` types
- `lib/constants.ts` — add `PIPELINE_STAGES` constant
- `app/api/pipeline/route.ts` — GET list, POST create card, PATCH update stage
- `app/api/pipeline/briefs/route.ts` — GET briefs by type (design|video)
- `app/api/pipeline/briefs/[id]/route.ts` — PATCH update brief status + auto-advance pipeline
- `app/api/ai/brief/route.ts` — Claude generates design + video brief JSON
- `app/api/ai/generate-image/route.ts` — DALL-E 3 generates images
- `components/AIStudio/PipelineHub.tsx` — Kanban board with 4 columns
- `components/AIStudio/PipelineCard.tsx` — Individual card, stage-aware actions
- `components/AIStudio/BriefGenerator.tsx` — Overlay panel: type select → generate → show results → push
- `components/AIStudio/BriefInbox.tsx` — Brief list for production pages
- `app/(dashboard)/ai/page.tsx` — Hub page (replaces existing)

**Modified files:**
- `app/(dashboard)/bpi-faizal/page.tsx` — Add "Brief" tab + BriefInbox
- `app/(dashboard)/bpi-reinaldi/page.tsx` — Add "Brief" tab + BriefInbox
- `components/shared/PageHeader.tsx` — Add `'brief'` to TabKey type

---

## Task 1: Install dependencies + Supabase tables + Types

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/constants.ts`

- [ ] **Step 1: Install openai package**

```bash
cd /Users/dandirivaldi/Documents/Claude/Projects/bentala-nextjs
npm install openai
```

Expected: `openai` added to `node_modules` and `package.json` dependencies.

- [ ] **Step 2: Create Supabase tables**

Run this SQL in the Supabase dashboard (project SQL editor):

```sql
create table if not exists content_pipeline (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  entity     text not null,
  platform   text not null,
  stage      text not null default 'ide',
  idea_text  text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists production_briefs (
  id          uuid primary key default gen_random_uuid(),
  pipeline_id uuid references content_pipeline(id) on delete cascade,
  type        text not null,
  content     jsonb not null,
  images      jsonb default '[]'::jsonb,
  status      text not null default 'pending',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table content_pipeline enable row level security;
alter table production_briefs enable row level security;

create policy "allow all" on content_pipeline for all using (true);
create policy "allow all" on production_briefs for all using (true);
```

Expected: Both tables appear in Supabase Table Editor with correct columns.

- [ ] **Step 3: Add types to `lib/types.ts`**

Append at the end of the file (after the existing `AIGeneration` type):

```typescript
// ── Pipeline types ────────────────────────────────────────────────

export type PipelineStageKey = 'ide' | 'brief' | 'caption' | 'selesai'
export type BriefType = 'design' | 'video'
export type BriefStatus = 'pending' | 'in_progress' | 'done'

export interface PipelineCard {
  id: string
  title: string
  entity: 'bpi' | 'bsi'
  platform: 'ig' | 'tiktok' | 'keduanya'
  stage: PipelineStageKey
  idea_text: string | null
  created_at: string
  updated_at: string
}

export interface DesignBrief {
  format: string
  tone: string
  palette: { name: string; hex: string }[]
  typography: { headline: string; subtext: string; cta: string }
  composition: string
  midjourney_prompt: string
  dalle_prompt: string
}

export interface ScriptScene {
  timecode: string
  label: string
  dialog: string
  direction: string
  talking_points: string[]
}

export interface VideoBrief {
  duration: string
  format: string
  tone: string
  editing_style: string
  script: ScriptScene[]
  storyboard_prompts: string[]
}

export interface ProductionBrief {
  id: string
  pipeline_id: string
  type: BriefType
  content: DesignBrief | VideoBrief
  images: string[]
  status: BriefStatus
  created_at: string
  updated_at: string
  pipeline?: PipelineCard
}
```

- [ ] **Step 4: Add PIPELINE_STAGES to `lib/constants.ts`**

Append at the end of the file (after `AI_PLATFORMS`):

```typescript
export const PIPELINE_STAGES = [
  { key: 'ide',     label: 'Ide',     color: 'var(--accent)' },
  { key: 'brief',   label: 'Brief',   color: '#f59e0b' },
  { key: 'caption', label: 'Caption', color: 'var(--accent3)' },
  { key: 'selesai', label: 'Selesai', color: 'var(--text2)' },
] as const
```

- [ ] **Step 5: Add OPENAI_API_KEY to `.env.local`**

Open `.env.local` and add:
```
OPENAI_API_KEY=sk-...your-key-here...
```

Get key from platform.openai.com → API Keys.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/constants.ts package.json package-lock.json
git commit -m "feat: add pipeline types, constants, install openai"
```

---

## Task 2: Pipeline API routes

**Files:**
- Create: `app/api/pipeline/route.ts`
- Create: `app/api/pipeline/briefs/route.ts`
- Create: `app/api/pipeline/briefs/[id]/route.ts`

- [ ] **Step 1: Create `app/api/pipeline/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function GET() {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('content_pipeline')
      .select('*')
      .order('updated_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ cards: data ?? [] })
  } catch (err) {
    console.error('[GET /api/pipeline]', err)
    return NextResponse.json({ error: 'Failed to fetch pipeline' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { title, entity, platform, idea_text } = await req.json()
    if (!title?.trim() || !entity || !platform) {
      return NextResponse.json({ error: 'title, entity, platform required' }, { status: 400 })
    }
    const supabase = getSupabase()
    const { data, error } = await (supabase as any)
      .from('content_pipeline')
      .insert({ title: title.trim(), entity, platform, stage: 'ide', idea_text: idea_text ?? null })
      .select('*')
      .single()
    if (error) throw error
    return NextResponse.json({ card: data })
  } catch (err) {
    console.error('[POST /api/pipeline]', err)
    return NextResponse.json({ error: 'Failed to create card' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, stage } = await req.json()
    if (!id || !stage) {
      return NextResponse.json({ error: 'id and stage required' }, { status: 400 })
    }
    const supabase = getSupabase()
    const { data, error } = await (supabase as any)
      .from('content_pipeline')
      .update({ stage, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return NextResponse.json({ card: data })
  } catch (err) {
    console.error('[PATCH /api/pipeline]', err)
    return NextResponse.json({ error: 'Failed to update card' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify route responds**

```bash
curl -s http://localhost:3004/api/pipeline | head -c 200
```

Expected: `{"cards":[]}` (empty array, no error).

- [ ] **Step 3: Create `app/api/pipeline/briefs/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const type = req.nextUrl.searchParams.get('type')
    const supabase = getSupabase()

    let query = supabase
      .from('production_briefs')
      .select('*, pipeline:content_pipeline(*)')
      .order('created_at', { ascending: false })

    if (type === 'design' || type === 'video') {
      query = query.eq('type', type)
    }

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ briefs: data ?? [] })
  } catch (err) {
    console.error('[GET /api/pipeline/briefs]', err)
    return NextResponse.json({ error: 'Failed to fetch briefs' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { pipeline_id, type, content, images } = await req.json()
    if (!pipeline_id || !type || !content) {
      return NextResponse.json({ error: 'pipeline_id, type, content required' }, { status: 400 })
    }
    const supabase = getSupabase()
    const { data, error } = await (supabase as any)
      .from('production_briefs')
      .insert({ pipeline_id, type, content, images: images ?? [] })
      .select('*')
      .single()
    if (error) throw error
    return NextResponse.json({ brief: data })
  } catch (err) {
    console.error('[POST /api/pipeline/briefs]', err)
    return NextResponse.json({ error: 'Failed to save brief' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Create `app/api/pipeline/briefs/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { status } = await req.json()
    if (!status) return NextResponse.json({ error: 'status required' }, { status: 400 })

    const supabase = getSupabase()

    // Update this brief's status
    const { data: brief, error: briefErr } = await (supabase as any)
      .from('production_briefs')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select('pipeline_id')
      .single()
    if (briefErr) throw briefErr

    // If done, check whether all briefs for this pipeline are done
    if (status === 'done') {
      const { data: allBriefs } = await supabase
        .from('production_briefs')
        .select('status')
        .eq('pipeline_id', brief.pipeline_id)

      const allDone = (allBriefs ?? []).every((b: { status: string }) => b.status === 'done')
      if (allDone) {
        await (supabase as any)
          .from('content_pipeline')
          .update({ stage: 'caption', updated_at: new Date().toISOString() })
          .eq('id', brief.pipeline_id)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[PATCH /api/pipeline/briefs/[id]]', err)
    return NextResponse.json({ error: 'Failed to update brief' }, { status: 500 })
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add app/api/pipeline/
git commit -m "feat: add pipeline CRUD and brief status API routes"
```

---

## Task 3: AI routes — Brief generation + Image generation

**Files:**
- Create: `app/api/ai/brief/route.ts`
- Create: `app/api/ai/generate-image/route.ts`

- [ ] **Step 1: Create `app/api/ai/brief/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  try {
    const { title, entity, platform, types } = await req.json()
    if (!title || !entity || !platform || !types?.length) {
      return NextResponse.json({ error: 'title, entity, platform, types required' }, { status: 400 })
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const entityLabel = entity === 'bpi' ? 'Bentala Project Indonesia' : 'Bentala Studio Indonesia'
    const platformLabel = platform === 'ig' ? 'Instagram' : platform === 'tiktok' ? 'TikTok' : 'Instagram & TikTok'
    const needsDesign = types.includes('design')
    const needsVideo = types.includes('video')

    const prompt = `Kamu adalah creative director untuk ${entityLabel}, sebuah akun media sosial Indonesia.

Konten yang akan diproduksi: "${title}"
Platform: ${platformLabel}

Buat creative brief lengkap dalam Bahasa Indonesia. Output HANYA JSON object berikut, tanpa teks lain:

{
  ${needsDesign ? `"design": {
    "format": "nama format dan dimensi (contoh: Feed Instagram 1080×1350px)",
    "tone": "deskripsi tone visual (2-4 kata)",
    "palette": [
      { "name": "nama warna", "hex": "#XXXXXX" },
      { "name": "nama warna", "hex": "#XXXXXX" },
      { "name": "nama warna", "hex": "#XXXXXX" }
    ],
    "typography": {
      "headline": "style + ukuran + contoh teks headline",
      "subtext": "style + ukuran + contoh teks subtext",
      "cta": "style + ukuran + contoh teks CTA"
    },
    "composition": "deskripsi layout dan komposisi elemen (2-3 kalimat)",
    "midjourney_prompt": "prompt lengkap siap pakai untuk Midjourney (bahasa Inggris, sertakan --ar dan --v 6)",
    "dalle_prompt": "prompt untuk DALL-E 3 yang menghasilkan visual representatif konten ini (bahasa Inggris)"
  }` : ''}
  ${needsDesign && needsVideo ? ',' : ''}
  ${needsVideo ? `"video": {
    "duration": "durasi yang disarankan (contoh: 45 detik)",
    "format": "format video (contoh: TikTok 9:16)",
    "tone": "tone video (contoh: Fun, energetic, fast-cut)",
    "editing_style": "gaya editing spesifik (contoh: jump cuts tiap 2-3 detik, CapCut template energetic)",
    "script": [
      {
        "timecode": "00:00–00:05",
        "label": "HOOK",
        "dialog": "dialog atau narasi yang diucapkan",
        "direction": "arahan visual dan kamera",
        "talking_points": ["poin 1", "poin 2"]
      },
      {
        "timecode": "00:05–00:20",
        "label": "ISI",
        "dialog": "dialog atau narasi",
        "direction": "arahan visual",
        "talking_points": ["poin 1"]
      },
      {
        "timecode": "00:20–00:35",
        "label": "KONTEN",
        "dialog": "dialog atau narasi",
        "direction": "arahan visual",
        "talking_points": ["poin 1", "poin 2"]
      },
      {
        "timecode": "00:35–00:45",
        "label": "CTA",
        "dialog": "call-to-action",
        "direction": "arahan visual untuk penutup",
        "talking_points": ["poin 1"]
      }
    ],
    "storyboard_prompts": [
      "DALL-E prompt untuk scene HOOK (bahasa Inggris)",
      "DALL-E prompt untuk scene ISI (bahasa Inggris)",
      "DALL-E prompt untuk scene KONTEN (bahasa Inggris)",
      "DALL-E prompt untuk scene CTA (bahasa Inggris)"
    ]
  }` : ''}
}`

    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = (message.content[0] as { type: string; text: string }).text
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const result = JSON.parse(cleaned)

    return NextResponse.json(result)
  } catch (err) {
    console.error('[POST /api/ai/brief]', err)
    return NextResponse.json({ error: 'Failed to generate brief' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create `app/api/ai/generate-image/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 })
  }

  try {
    const { prompt, size } = await req.json()
    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'prompt required' }, { status: 400 })
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const response = await client.images.generate({
      model: 'dall-e-3',
      prompt: prompt.slice(0, 1000),
      n: 1,
      size: size ?? '1024x1024',
      quality: 'standard',
    })

    const url = response.data[0]?.url
    if (!url) throw new Error('No image URL returned')

    return NextResponse.json({ url })
  } catch (err) {
    console.error('[POST /api/ai/generate-image]', err)
    return NextResponse.json({ error: 'Failed to generate image' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/ai/brief/route.ts app/api/ai/generate-image/route.ts
git commit -m "feat: add AI brief generation and DALL-E image generation routes"
```

---

## Task 4: PipelineCard + PipelineHub components

**Files:**
- Create: `components/AIStudio/PipelineCard.tsx`
- Create: `components/AIStudio/PipelineHub.tsx`

- [ ] **Step 1: Create `components/AIStudio/PipelineCard.tsx`**

```typescript
'use client'

import { PipelineCard as PipelineCardType } from '@/lib/types'

const ENTITY_COLORS: Record<string, string> = {
  bpi: 'var(--accent)',
  bsi: 'var(--accent3)',
}

const PLATFORM_LABELS: Record<string, string> = {
  ig: 'Instagram',
  tiktok: 'TikTok',
  keduanya: 'IG + TikTok',
}

interface Props {
  card: PipelineCardType
  onGenerateBrief: (card: PipelineCardType) => void
  onOpenBuilder: (card: PipelineCardType) => void
}

export default function PipelineCard({ card, onGenerateBrief, onOpenBuilder }: Props) {
  const entityColor = ENTITY_COLORS[card.entity] ?? 'var(--accent)'

  return (
    <div style={{
      background: 'var(--bg)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4 }}>
            {card.title}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: entityColor,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              {card.entity}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text2)' }}>
              {PLATFORM_LABELS[card.platform]}
            </span>
          </div>
        </div>
      </div>

      {/* Stage-specific actions */}
      {card.stage === 'ide' && (
        <button
          onClick={() => onGenerateBrief(card)}
          style={{
            width: '100%',
            padding: '6px 0',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          ⚡ Generate Brief
        </button>
      )}

      {card.stage === 'brief' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 10, color: 'var(--text2)' }}>Brief dalam proses produksi...</div>
          <button
            onClick={() => onOpenBuilder(card)}
            style={{
              width: '100%',
              padding: '5px 0',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text2)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            ✎ Buat Caption
          </button>
        </div>
      )}

      {card.stage === 'caption' && (
        <button
          onClick={() => onOpenBuilder(card)}
          style={{
            width: '100%',
            padding: '6px 0',
            background: 'var(--accent3)',
            border: 'none',
            borderRadius: 6,
            color: '#000',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          → Content Builder
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `components/AIStudio/PipelineHub.tsx`**

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PipelineCard as PipelineCardType } from '@/lib/types'
import { PIPELINE_STAGES, AI_PLATFORMS } from '@/lib/constants'
import PipelineCard from './PipelineCard'
import BriefGenerator from './BriefGenerator'

const ENTITY_OPTIONS = [
  { key: 'bpi', label: 'BPI' },
  { key: 'bsi', label: 'BSI' },
]

export default function PipelineHub() {
  const router = useRouter()
  const [cards, setCards] = useState<PipelineCardType[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [briefCard, setBriefCard] = useState<PipelineCardType | null>(null)

  // New card form state
  const [newTitle, setNewTitle] = useState('')
  const [newEntity, setNewEntity] = useState<'bpi' | 'bsi'>('bpi')
  const [newPlatform, setNewPlatform] = useState('ig')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const loadCards = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/pipeline')
      const data = await res.json()
      setCards(data.cards ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadCards() }, [loadCards])

  async function createCard() {
    if (!newTitle.trim()) return
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, entity: newEntity, platform: newPlatform }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Gagal membuat konten')
      setCards(prev => [data.card, ...prev])
      setNewTitle('')
      setShowNewModal(false)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Terjadi kesalahan')
    } finally {
      setCreating(false)
    }
  }

  function handleOpenBuilder(card: PipelineCardType) {
    const params = new URLSearchParams({ input_text: card.title, platform: card.platform })
    router.push(`/ai/builder?${params.toString()}`)
  }

  function handleBriefDone(updatedCard: PipelineCardType) {
    setCards(prev => prev.map(c => c.id === updatedCard.id ? updatedCard : c))
    setBriefCard(null)
  }

  const cardsByStage = (stage: string) => cards.filter(c => c.stage === stage)

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 10px',
    borderRadius: 16,
    border: '1px solid',
    borderColor: active ? 'var(--accent)' : 'var(--border)',
    background: active ? 'rgba(108,99,255,0.12)' : 'var(--bg3)',
    color: active ? 'var(--accent)' : 'var(--text2)',
    fontSize: 11,
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
  })

  const STAGE_COLORS: Record<string, string> = {
    ide: 'var(--accent)',
    brief: '#f59e0b',
    caption: 'var(--accent3)',
    selesai: 'var(--text2)',
  }

  return (
    <>
      {/* Brief Generator overlay */}
      {briefCard && (
        <BriefGenerator
          card={briefCard}
          onClose={() => setBriefCard(null)}
          onDone={handleBriefDone}
        />
      )}

      {/* New content modal */}
      {showNewModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowNewModal(false) }}
        >
          <div style={{
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 24, width: 400,
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Konten Baru</div>

            <div>
              <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, display: 'block', marginBottom: 6 }}>Judul Konten</label>
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createCard()}
                placeholder="contoh: Tren fashion summer 2025..."
                autoFocus
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, display: 'block', marginBottom: 8 }}>Entity</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {ENTITY_OPTIONS.map(e => (
                  <button key={e.key} onClick={() => setNewEntity(e.key as 'bpi' | 'bsi')} style={chipStyle(newEntity === e.key)}>
                    {e.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, display: 'block', marginBottom: 8 }}>Platform</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {AI_PLATFORMS.map(p => (
                  <button key={p.key} onClick={() => setNewPlatform(p.key)} style={chipStyle(newPlatform === p.key)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {createError && (
              <div style={{ padding: '8px 12px', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 6, color: '#ff6b6b', fontSize: 12 }}>
                {createError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowNewModal(false)}
                style={{ padding: '8px 16px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text2)', fontSize: 13, cursor: 'pointer' }}
              >
                Batal
              </button>
              <button
                onClick={createCard}
                disabled={creating || !newTitle.trim()}
                style={{ padding: '8px 16px', background: creating || !newTitle.trim() ? 'var(--bg3)' : 'var(--accent)', border: 'none', borderRadius: 8, color: creating || !newTitle.trim() ? 'var(--text2)' : '#fff', fontSize: 13, fontWeight: 600, cursor: creating || !newTitle.trim() ? 'not-allowed' : 'pointer' }}
              >
                {creating ? 'Membuat...' : 'Buat'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kanban board */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>
              {cards.filter(c => c.stage !== 'selesai').length} konten aktif
            </div>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            style={{ padding: '8px 16px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            + Konten Baru
          </button>
        </div>

        {/* Columns */}
        {loading ? (
          <div style={{ color: 'var(--text2)', fontSize: 13 }}>Memuat pipeline...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, alignItems: 'start' }}>
            {PIPELINE_STAGES.map(stage => (
              <div key={stage.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Column header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: STAGE_COLORS[stage.key], textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                    {stage.label}
                  </div>
                  <div style={{ background: `${STAGE_COLORS[stage.key]}22`, borderRadius: 10, padding: '1px 7px', fontSize: 10, color: STAGE_COLORS[stage.key] }}>
                    {cardsByStage(stage.key).length}
                  </div>
                </div>

                {/* Cards */}
                {cardsByStage(stage.key).length === 0 ? (
                  <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: '16px 0', textAlign: 'center', fontSize: 11, color: 'var(--text2)' }}>
                    Kosong
                  </div>
                ) : (
                  cardsByStage(stage.key).map(card => (
                    <PipelineCard
                      key={card.id}
                      card={card}
                      onGenerateBrief={setBriefCard}
                      onOpenBuilder={handleOpenBuilder}
                    />
                  ))
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/AIStudio/PipelineCard.tsx components/AIStudio/PipelineHub.tsx
git commit -m "feat: add PipelineCard and PipelineHub kanban components"
```

---

## Task 5: BriefGenerator component

**Files:**
- Create: `components/AIStudio/BriefGenerator.tsx`

- [ ] **Step 1: Create `components/AIStudio/BriefGenerator.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { PipelineCard, DesignBrief, VideoBrief, ScriptScene } from '@/lib/types'

interface Props {
  card: PipelineCard
  onClose: () => void
  onDone: (updatedCard: PipelineCard) => void
}

type BriefTypeSelection = 'design' | 'video' | 'both'
type ActiveTab = 'design' | 'video'

export default function BriefGenerator({ card, onClose, onDone }: Props) {
  const [briefType, setBriefType] = useState<BriefTypeSelection>('both')
  const [step, setStep] = useState<'select' | 'generating' | 'result'>('select')
  const [designBrief, setDesignBrief] = useState<DesignBrief | null>(null)
  const [videoBrief, setVideoBrief] = useState<VideoBrief | null>(null)
  const [designImage, setDesignImage] = useState<string | null>(null)
  const [storyboardImages, setStoryboardImages] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<ActiveTab>('design')
  const [pushing, setPushing] = useState(false)
  const [pushed, setPushed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const types = briefType === 'both' ? ['design', 'video'] : [briefType]

  async function generate() {
    setStep('generating')
    setError(null)
    try {
      // Step 1: Generate brief text via Claude
      const briefRes = await fetch('/api/ai/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: card.title, entity: card.entity, platform: card.platform, types }),
      })
      const briefData = await briefRes.json()
      if (!briefRes.ok) throw new Error(briefData.error ?? 'Gagal generate brief')

      const design: DesignBrief | null = briefData.design ?? null
      const video: VideoBrief | null = briefData.video ?? null
      setDesignBrief(design)
      setVideoBrief(video)
      if (video) setActiveTab('video')
      if (design) setActiveTab('design')

      // Step 2: Generate images (non-blocking individually)
      if (design?.dalle_prompt) {
        fetch('/api/ai/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: design.dalle_prompt, size: '1024x1024' }),
        })
          .then(r => r.json())
          .then(d => { if (d.url) setDesignImage(d.url) })
          .catch(() => {}) // non-blocking
      }

      if (video?.storyboard_prompts?.length) {
        const first4 = video.storyboard_prompts.slice(0, 4)
        Promise.allSettled(first4.map(p =>
          fetch('/api/ai/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: p, size: '1024x1024' }),
          }).then(r => r.json()).then(d => d.url ?? null)
        )).then(results => {
          const urls = results.map(r => r.status === 'fulfilled' ? (r.value ?? '') : '')
          setStoryboardImages(urls)
        })
      }

      setStep('result')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan')
      setStep('select')
    }
  }

  async function pushToProduction() {
    setPushing(true)
    try {
      // Save briefs to Supabase
      if (designBrief) {
        await fetch('/api/pipeline/briefs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pipeline_id: card.id,
            type: 'design',
            content: designBrief,
            images: designImage ? [designImage] : [],
          }),
        })
      }
      if (videoBrief) {
        await fetch('/api/pipeline/briefs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pipeline_id: card.id,
            type: 'video',
            content: videoBrief,
            images: storyboardImages.filter(Boolean),
          }),
        })
      }

      // Advance card to brief stage
      const stageRes = await fetch('/api/pipeline', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: card.id, stage: 'brief' }),
      })
      const stageData = await stageRes.json()
      if (!stageRes.ok) throw new Error(stageData.error ?? 'Gagal update stage')

      setPushed(true)
      onDone(stageData.card)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal kirim ke produksi')
    } finally {
      setPushing(false)
    }
  }

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 16px', borderRadius: 20, border: '1px solid',
    borderColor: active ? 'var(--accent)' : 'var(--border)',
    background: active ? 'rgba(108,99,255,0.12)' : 'var(--bg3)',
    color: active ? 'var(--accent)' : 'var(--text2)',
    fontSize: 13, cursor: 'pointer', fontWeight: active ? 600 : 400,
  })

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 20px', background: 'none', border: 'none',
    borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
    color: active ? 'var(--accent)' : 'var(--text2)',
    fontSize: 13, fontWeight: active ? 600 : 400, cursor: 'pointer',
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 14, width: '100%', maxWidth: 860,
        maxHeight: '90vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Brief Generator</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{card.title}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {/* Step: Select type */}
          {step === 'select' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Buat brief untuk:</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  {(['design', 'video', 'both'] as BriefTypeSelection[]).map(t => (
                    <button key={t} onClick={() => setBriefType(t)} style={chipStyle(briefType === t)}>
                      {t === 'design' ? '📐 Design' : t === 'video' ? '🎬 Video' : '📐🎬 Keduanya'}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div style={{ padding: '10px 14px', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 8, color: '#ff6b6b', fontSize: 13 }}>
                  {error}
                </div>
              )}

              <button
                onClick={generate}
                style={{ padding: '12px 24px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start' }}
              >
                ⚡ Generate Brief
              </button>
            </div>
          )}

          {/* Step: Generating */}
          {step === 'generating' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: 200 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} />
              <div style={{ color: 'var(--text2)', fontSize: 13 }}>AI sedang membuat brief...</div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Step: Result */}
          {step === 'result' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
                {designBrief && <button style={tabStyle(activeTab === 'design')} onClick={() => setActiveTab('design')}>📐 Design</button>}
                {videoBrief && <button style={tabStyle(activeTab === 'video')} onClick={() => setActiveTab('video')}>🎬 Video</button>}
              </div>

              {/* Design tab */}
              {activeTab === 'design' && designBrief && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {designImage && (
                    <img src={designImage} alt="Design preview" style={{ width: '100%', maxHeight: 280, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                  )}
                  {!designImage && (
                    <div style={{ height: 120, background: 'var(--bg3)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--text2)' }}>
                      Generating preview image...
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Format & Tone</div>
                      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>{designBrief.format}</div>
                      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{designBrief.tone}</div>
                    </div>
                    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Palette</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {designBrief.palette.map((c, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 20, height: 20, borderRadius: 4, background: c.hex, border: '1px solid var(--border)' }} />
                            <div>
                              <div style={{ fontSize: 10, color: 'var(--text)', fontWeight: 600 }}>{c.name}</div>
                              <div style={{ fontSize: 10, color: 'var(--text2)' }}>{c.hex}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Tipografi</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}><span style={{ color: 'var(--accent)' }}>Headline:</span> {designBrief.typography.headline}</div>
                      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}><span style={{ color: 'var(--accent)' }}>Subtext:</span> {designBrief.typography.subtext}</div>
                      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}><span style={{ color: 'var(--accent)' }}>CTA:</span> {designBrief.typography.cta}</div>
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1 }}>Midjourney Prompt</div>
                      <button
                        onClick={() => navigator.clipboard.writeText(designBrief.midjourney_prompt)}
                        style={{ fontSize: 10, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        📋 Copy
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--accent3)', lineHeight: 1.6, fontStyle: 'italic', wordBreak: 'break-word' }}>
                      {designBrief.midjourney_prompt}
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Komposisi</div>
                    <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>{designBrief.composition}</div>
                  </div>
                </div>
              )}

              {/* Video tab */}
              {activeTab === 'video' && videoBrief && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Durasi</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{videoBrief.duration}</div>
                    </div>
                    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Format</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{videoBrief.format}</div>
                    </div>
                    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Tone</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{videoBrief.tone}</div>
                    </div>
                  </div>

                  {storyboardImages.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Storyboard</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                        {storyboardImages.map((url, i) => (
                          <div key={i}>
                            {url ? (
                              <img src={url} alt={`Scene ${i + 1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                            ) : (
                              <div style={{ width: '100%', aspectRatio: '1', background: 'var(--bg3)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--text2)' }}>
                                Scene {i + 1}
                              </div>
                            )}
                            <div style={{ fontSize: 9, color: 'var(--text2)', textAlign: 'center', marginTop: 4 }}>
                              {videoBrief.script[i]?.label ?? `Scene ${i + 1}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Script</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {videoBrief.script.map((scene: ScriptScene, i: number) => (
                        <div key={i} style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12 }}>
                          <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b' }}>{scene.timecode}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'rgba(108,99,255,0.12)', padding: '1px 6px', borderRadius: 4 }}>{scene.label}</span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 4, lineHeight: 1.5 }}>"{scene.dialog}"</div>
                          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>↳ {scene.direction}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {scene.talking_points.map((pt, j) => (
                              <span key={j} style={{ fontSize: 10, color: 'var(--text2)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px' }}>
                                • {pt}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Editing Style</div>
                    <div style={{ fontSize: 12, color: 'var(--text)' }}>{videoBrief.editing_style}</div>
                  </div>
                </div>
              )}

              {error && (
                <div style={{ padding: '10px 14px', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 8, color: '#ff6b6b', fontSize: 13 }}>
                  {error}
                </div>
              )}

              {pushed ? (
                <div style={{ padding: '12px 16px', background: 'rgba(67,217,162,0.1)', border: '1px solid var(--accent3)', borderRadius: 8, color: 'var(--accent3)', fontSize: 13, fontWeight: 600 }}>
                  ✓ Brief berhasil dikirim ke tim produksi!
                </div>
              ) : (
                <button
                  onClick={pushToProduction}
                  disabled={pushing}
                  style={{ padding: '12px 24px', background: pushing ? 'var(--bg3)' : 'var(--accent3)', border: 'none', borderRadius: 8, color: pushing ? 'var(--text2)' : '#000', fontSize: 14, fontWeight: 700, cursor: pushing ? 'not-allowed' : 'pointer', alignSelf: 'flex-start' }}
                >
                  {pushing ? 'Mengirim...' : '🚀 Kirim ke Produksi'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/AIStudio/BriefGenerator.tsx
git commit -m "feat: add BriefGenerator overlay component"
```

---

## Task 6: BriefInbox component

**Files:**
- Create: `components/AIStudio/BriefInbox.tsx`

- [ ] **Step 1: Create `components/AIStudio/BriefInbox.tsx`**

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { ProductionBrief, DesignBrief, VideoBrief, ScriptScene } from '@/lib/types'

interface Props {
  type: 'design' | 'video'
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  in_progress: 'var(--accent)',
  done: 'var(--accent3)',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  done: 'Selesai',
}

export default function BriefInbox({ type }: Props) {
  const [briefs, setBriefs] = useState<ProductionBrief[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)

  const loadBriefs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pipeline/briefs?type=${type}`)
      const data = await res.json()
      setBriefs(data.briefs ?? [])
    } finally {
      setLoading(false)
    }
  }, [type])

  useEffect(() => { loadBriefs() }, [loadBriefs])

  async function markDone(brief: ProductionBrief) {
    setUpdating(brief.id)
    try {
      await fetch(`/api/pipeline/briefs/${brief.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      })
      setBriefs(prev => prev.map(b => b.id === brief.id ? { ...b, status: 'done' } : b))
    } finally {
      setUpdating(null)
    }
  }

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--text2)', fontSize: 13 }}>Memuat brief...</div>
  }

  if (briefs.length === 0) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
        Belum ada brief {type === 'design' ? 'design' : 'video'} masuk
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 24 }}>
      {briefs.map(brief => {
        const isExpanded = expanded === brief.id
        const designContent = type === 'design' ? (brief.content as DesignBrief) : null
        const videoContent = type === 'video' ? (brief.content as VideoBrief) : null

        return (
          <div key={brief.id} style={{ background: 'var(--bg2)', border: `1px solid ${brief.status === 'done' ? 'var(--border)' : STATUS_COLORS[brief.status] + '55'}`, borderRadius: 10, overflow: 'hidden' }}>
            {/* Brief header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: brief.status === 'done' ? 'var(--text2)' : 'var(--text)' }}>
                  {brief.pipeline?.title ?? 'Untitled'}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', fontWeight: 700 }}>
                    {brief.pipeline?.entity}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text2)' }}>·</span>
                  <span style={{ fontSize: 10, color: 'var(--text2)' }}>{brief.pipeline?.platform}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLORS[brief.status], background: `${STATUS_COLORS[brief.status]}22`, padding: '3px 8px', borderRadius: 6 }}>
                  {STATUS_LABELS[brief.status]}
                </span>
                <button
                  onClick={() => setExpanded(isExpanded ? null : brief.id)}
                  style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  {isExpanded ? 'Tutup' : 'Lihat Brief'}
                </button>
              </div>
            </div>

            {/* Expanded content */}
            {isExpanded && (
              <div style={{ borderTop: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Design content */}
                {designContent && (
                  <>
                    {brief.images?.[0] && (
                      <img src={brief.images[0]} alt="Design preview" style={{ width: '100%', maxHeight: 240, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 10 }}>
                        <div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Format</div>
                        <div style={{ fontSize: 12, color: 'var(--text)' }}>{designContent.format}</div>
                        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{designContent.tone}</div>
                      </div>
                      <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 10 }}>
                        <div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Palette</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {designContent.palette.map((c, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <div style={{ width: 16, height: 16, borderRadius: 3, background: c.hex, border: '1px solid var(--border)' }} />
                              <span style={{ fontSize: 10, color: 'var(--text2)' }}>{c.hex}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 10 }}>
                      <div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Tipografi</div>
                      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.7 }}>
                        <span style={{ color: 'var(--accent)' }}>Headline:</span> {designContent.typography.headline}<br />
                        <span style={{ color: 'var(--accent)' }}>Subtext:</span> {designContent.typography.subtext}<br />
                        <span style={{ color: 'var(--accent)' }}>CTA:</span> {designContent.typography.cta}
                      </div>
                    </div>
                    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Midjourney Prompt</div>
                        <button onClick={() => navigator.clipboard.writeText(designContent.midjourney_prompt)} style={{ fontSize: 10, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>📋 Copy</button>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--accent3)', lineHeight: 1.6, fontStyle: 'italic', wordBreak: 'break-word' }}>{designContent.midjourney_prompt}</div>
                    </div>
                    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 10 }}>
                      <div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Komposisi</div>
                      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>{designContent.composition}</div>
                    </div>
                  </>
                )}

                {/* Video content */}
                {videoContent && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      {[
                        { label: 'Durasi', value: videoContent.duration },
                        { label: 'Format', value: videoContent.format },
                        { label: 'Tone', value: videoContent.tone },
                      ].map(item => (
                        <div key={item.label} style={{ background: 'var(--bg3)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>{item.label}</div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{item.value}</div>
                        </div>
                      ))}
                    </div>
                    {brief.images?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Storyboard</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                          {brief.images.slice(0, 4).map((url, i) => (
                            <div key={i}>
                              {url ? <img src={url} alt={`Scene ${i + 1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} /> : null}
                              <div style={{ fontSize: 9, color: 'var(--text2)', textAlign: 'center', marginTop: 3 }}>
                                {videoContent.script[i]?.label ?? `Scene ${i + 1}`}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Script</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {videoContent.script.map((scene: ScriptScene, i: number) => (
                          <div key={i} style={{ background: 'var(--bg3)', borderRadius: 8, padding: 10 }}>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b' }}>{scene.timecode}</span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'rgba(108,99,255,0.12)', padding: '1px 5px', borderRadius: 4 }}>{scene.label}</span>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 4, lineHeight: 1.5 }}>"{scene.dialog}"</div>
                            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>↳ {scene.direction}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {scene.talking_points.map((pt, j) => (
                                <span key={j} style={{ fontSize: 10, color: 'var(--text2)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px' }}>• {pt}</span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 10 }}>
                      <div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Editing Style</div>
                      <div style={{ fontSize: 12, color: 'var(--text)' }}>{videoContent.editing_style}</div>
                    </div>
                  </>
                )}

                {brief.status !== 'done' && (
                  <button
                    onClick={() => markDone(brief)}
                    disabled={!!updating}
                    style={{ padding: '10px 20px', background: 'var(--accent3)', border: 'none', borderRadius: 8, color: '#000', fontSize: 13, fontWeight: 700, cursor: updating ? 'not-allowed' : 'pointer', alignSelf: 'flex-start' }}
                  >
                    {updating === brief.id ? 'Memperbarui...' : '✓ Tandai Selesai'}
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/AIStudio/BriefInbox.tsx
git commit -m "feat: add BriefInbox component for production pages"
```

---

## Task 7: Hub page + update production pages

**Files:**
- Create: `app/(dashboard)/ai/page.tsx`
- Modify: `components/shared/PageHeader.tsx`
- Modify: `app/(dashboard)/bpi-faizal/page.tsx`
- Modify: `app/(dashboard)/bpi-reinaldi/page.tsx`

- [ ] **Step 1: Create `app/(dashboard)/ai/page.tsx`**

```typescript
import PipelineHub from '@/components/AIStudio/PipelineHub'

export const metadata = { title: 'AI Studio — Bentala Internal' }

export default function AIHubPage() {
  return (
    <div style={{ padding: '24px 28px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0 }}>AI Studio</h1>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
          Pipeline konten dari ide sampai selesai
        </p>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <PipelineHub />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add `'brief'` to `TabKey` in `components/shared/PageHeader.tsx`**

Open [components/shared/PageHeader.tsx](components/shared/PageHeader.tsx) and find line 62:

```typescript
export type TabKey = 'list' | 'board' | 'calendar' | 'files' | 'analytics'
```

Change to:

```typescript
export type TabKey = 'list' | 'board' | 'calendar' | 'files' | 'analytics' | 'brief'
```

Also add to `TAB_ICONS` (after the `analytics` entry):

```typescript
  brief: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
```

And add to `TAB_LABELS`:

```typescript
  brief: 'Brief',
```

- [ ] **Step 3: Update `app/(dashboard)/bpi-faizal/page.tsx`**

Replace the entire file with:

```typescript
'use client'

import { useState, useRef } from 'react'
import { PageHeader, type TabKey } from '@/components/shared/PageHeader'
import { WorkspacePage, type WorkspacePageHandle } from '@/components/WorkSpace'
import BriefInbox from '@/components/AIStudio/BriefInbox'

export default function FaizalPage() {
  const wsRef = useRef<WorkspacePageHandle>(null)
  const [tab, setTab] = useState<TabKey>('list')

  return (
    <>
      <PageHeader
        title="Video Production"
        tabs={['list', 'brief']}
        activeTab={tab}
        onTabChange={setTab}
        action={tab === 'list' ? (
          <button
            onClick={() => wsRef.current?.openAdd()}
            style={{ height: 32, padding: '0 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >
            + Tambah Pekerjaan
          </button>
        ) : undefined}
      />
      <div className="flex-1 overflow-y-auto min-h-0">
        {tab === 'list' && <WorkspacePage ref={wsRef} member="Video Production" memberKey="fz" />}
        {tab === 'brief' && <BriefInbox type="video" />}
      </div>
    </>
  )
}
```

- [ ] **Step 4: Update `app/(dashboard)/bpi-reinaldi/page.tsx`**

Replace the entire file with:

```typescript
'use client'

import { useState, useRef } from 'react'
import { PageHeader, type TabKey } from '@/components/shared/PageHeader'
import { WorkspacePage, type WorkspacePageHandle } from '@/components/WorkSpace'
import BriefInbox from '@/components/AIStudio/BriefInbox'

export default function ReinaldPage() {
  const wsRef = useRef<WorkspacePageHandle>(null)
  const [tab, setTab] = useState<TabKey>('list')

  return (
    <>
      <PageHeader
        title="Design Studio"
        tabs={['list', 'brief']}
        activeTab={tab}
        onTabChange={setTab}
        action={tab === 'list' ? (
          <button
            onClick={() => wsRef.current?.openAdd()}
            style={{ height: 32, padding: '0 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >
            + Tambah Pekerjaan
          </button>
        ) : undefined}
      />
      <div className="flex-1 overflow-y-auto min-h-0">
        {tab === 'list' && <WorkspacePage ref={wsRef} member="Design Studio" memberKey="rn" />}
        {tab === 'brief' && <BriefInbox type="design" />}
      </div>
    </>
  )
}
```

- [ ] **Step 5: Verify the app compiles**

```bash
cd /Users/dandirivaldi/Documents/Claude/Projects/bentala-nextjs
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors (or only pre-existing errors unrelated to new files).

- [ ] **Step 6: Commit**

```bash
git add app/\(dashboard\)/ai/page.tsx components/shared/PageHeader.tsx app/\(dashboard\)/bpi-faizal/page.tsx app/\(dashboard\)/bpi-reinaldi/page.tsx
git commit -m "feat: add AI Hub page, Brief tab to Video Production and Design Studio"
```

---

## Task 8: Manual smoke test

- [ ] **Step 1: Open http://localhost:3004/ai**

Verify:
- Kanban board renders with 4 columns: Ide, Brief, Caption, Selesai
- "+ Konten Baru" button opens modal
- Modal has Judul, Entity (BPI/BSI), Platform chips

- [ ] **Step 2: Create a test card**

In the modal, enter: Judul = "Test konten fashion", Entity = BPI, Platform = Instagram. Click "Buat".

Verify: Card appears in "Ide" column with "⚡ Generate Brief" button.

- [ ] **Step 3: Open Brief Generator**

Click "⚡ Generate Brief" on the card.

Verify:
- Overlay opens with card title shown
- 3 type options: Design, Video, Keduanya
- If `ANTHROPIC_API_KEY` is set: click "Generate Brief" — spinner appears, then results with Design/Video tabs
- If key not set: red error message appears

- [ ] **Step 4: Open http://localhost:3004/bpi-faizal**

Verify:
- "Brief" tab appears in the tab bar next to "List"
- Clicking "Brief" tab shows "Belum ada brief video masuk" (if no briefs pushed yet)

- [ ] **Step 5: Open http://localhost:3004/bpi-reinaldi**

Verify:
- "Brief" tab appears
- Clicking shows "Belum ada brief design masuk"

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete AI Studio Hub + Brief Generator implementation"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| Kanban hub at /ai with 4 columns | Task 4 (PipelineHub) + Task 7 (page) |
| Cards with title, entity, platform, stage actions | Task 4 (PipelineCard) |
| "Konten Baru" modal | Task 4 (PipelineHub modal) |
| Brief Generator overlay with type selection | Task 5 (BriefGenerator) |
| Claude generates design + video brief JSON | Task 3 (/api/ai/brief) |
| DALL-E generates design preview + storyboard | Task 3 (/api/ai/generate-image) |
| Design tab: image, Midjourney prompt, typography, palette, composition | Task 5 (BriefGenerator design tab) |
| Video tab: storyboard grid, script, talking points | Task 5 (BriefGenerator video tab) |
| "Kirim ke Produksi" saves briefs + advances card to brief stage | Task 5 (pushToProduction) |
| Brief Inbox on Video Production (/bpi-faizal) | Task 6 (BriefInbox) + Task 7 (page update) |
| Brief Inbox on Design Studio (/bpi-reinaldi) | Task 6 (BriefInbox) + Task 7 (page update) |
| "Tandai Selesai" marks done + auto-advance to caption | Task 2 (/api/pipeline/briefs/[id]) |
| content_pipeline + production_briefs tables | Task 1 (SQL) |
| Error handling on all routes | All tasks (try/catch + error returns) |
| OPENAI_API_KEY guard | Task 3 |
| ANTHROPIC_API_KEY guard | Task 3 |

All spec requirements covered. No gaps.
