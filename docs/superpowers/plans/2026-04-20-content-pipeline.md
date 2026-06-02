# Content Production Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build two dedicated pipeline pages (Video Production + Design Studio) for tracking social media content through sequential production stages, with per-stage notes, checklists, file links, and timestamps.

**Architecture:** Each pipeline page is a standalone route (`/pipeline/vp`, `/pipeline/ds`) with a detail-first layout — list on the left (35%), stage detail panel on the right (65%). Data lives in a new Supabase `pipeline_items` table with a JSONB `stages_data` column. Zustand store manages pipeline state with realtime subscription.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (postgres + realtime), Zustand, inline styles (matching existing codebase pattern)

---

## File Map

**Create:**
- `components/Pipeline/StageCard.tsx` — one stage: status, notes, checklist, files, actions
- `components/Pipeline/StagePanel.tsx` — right panel: all stages for selected item
- `components/Pipeline/PipelineList.tsx` — left panel: item list + filter + add button
- `components/Pipeline/AddPipelineModal.tsx` — modal for creating new pipeline item
- `components/Pipeline/PipelineSummary.tsx` — summary tab: stats grid + completion rate
- `components/Pipeline/index.tsx` — page wrapper: 2-tab layout (Pipeline | Summary)
- `hooks/usePipelineData.ts` — data loading + realtime subscription hook
- `app/(dashboard)/pipeline/vp/page.tsx` — Video Production pipeline page
- `app/(dashboard)/pipeline/ds/page.tsx` — Design Studio pipeline page

**Modify:**
- `lib/types.ts` — add StageStatus, StageData, PipelineItem types
- `lib/constants.ts` — add VP_STAGES, DS_STAGES
- `hooks/useStore.ts` — add pipelineItems state slice
- `components/Sidebar.tsx` — add Video Pipeline + Design Pipeline nav items
- `components/WorkSpace/WSEditModal.tsx` — add "Buat Pipeline Item" button

---

### Task 1: Types + Constants

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/constants.ts`

- [ ] **Step 1: Add pipeline types to lib/types.ts**

Add at the end of the file, after `AppState`:

```typescript
// ── Pipeline types ──────────────────────────────────────────────

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

- [ ] **Step 2: Add pipeline constants to lib/constants.ts**

Add at the end of the file:

```typescript
// ── Pipeline stages ─────────────────────────────────────────────

export const VP_STAGES = [
  { key: 'ide',    label: 'Ide',    color: '#8b8fa8' },
  { key: 'script', label: 'Script', color: '#5b9bd5' },
  { key: 'audio',  label: 'Audio',  color: '#ffc542' },
  { key: 'video',  label: 'Video',  color: '#6c63ff' },
  { key: 'upload', label: 'Upload', color: '#43d9a2' },
] as const

export const DS_STAGES = [
  { key: 'ide',    label: 'Ide',    color: '#8b8fa8' },
  { key: 'brief',  label: 'Brief',  color: '#5b9bd5' },
  { key: 'design', label: 'Design', color: '#ffc542' },
  { key: 'review', label: 'Review', color: '#ff6b6b' },
  { key: 'upload', label: 'Upload', color: '#43d9a2' },
] as const

export type PipelineStage = { key: string; label: string; color: string }
```

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts lib/constants.ts
git commit -m "feat(pipeline): add PipelineItem types and stage constants"
```

---

### Task 2: Supabase Table

**Files:**
- Supabase SQL Editor (run manually)

- [ ] **Step 1: Run this SQL in Supabase Dashboard → SQL Editor**

```sql
create table pipeline_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  member text not null,
  source_post_id uuid references posts(id) on delete set null,
  current_stage text not null default 'ide',
  stages_data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table pipeline_items enable row level security;
create policy "Allow all" on pipeline_items for all using (true) with check (true);

alter publication supabase_realtime add table pipeline_items;
```

- [ ] **Step 2: Verify table exists**

In Supabase Dashboard → Table Editor, confirm `pipeline_items` table is visible with the correct columns.

---

### Task 3: Store + Data Hook

**Files:**
- Modify: `hooks/useStore.ts`
- Create: `hooks/usePipelineData.ts`

- [ ] **Step 1: Add pipeline slice to useStore.ts**

In `hooks/useStore.ts`, add `PipelineItem` to the imports at top:

```typescript
import type { Post, Client, Invoice, Project, Task, ActivityLog, PipelineItem } from '@/lib/types'
```

Add to the `DataState` interface (after `activity: ActivityLog[]`):

```typescript
  pipelineItems: PipelineItem[]
```

Add to the `Actions` interface (after `addActivity`):

```typescript
  setPipelineItems:    (items: PipelineItem[]) => void
  upsertPipelineItem:  (item: PipelineItem) => void
  removePipelineItem:  (id: string) => void
```

Add to the initial state (after `activity: []`):

```typescript
  pipelineItems: [],
```

Add to the action implementations (after `addActivity`):

```typescript
  setPipelineItems: (pipelineItems) => set({ pipelineItems }),

  upsertPipelineItem: (item) => set((s) => ({
    pipelineItems: s.pipelineItems.find(p => p.id === item.id)
      ? s.pipelineItems.map(p => p.id === item.id ? item : p)
      : [item, ...s.pipelineItems],
  })),

  removePipelineItem: (id) => set((s) => ({
    pipelineItems: s.pipelineItems.filter(p => p.id !== id),
  })),
```

- [ ] **Step 2: Create hooks/usePipelineData.ts**

```typescript
'use client'

import { useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useStore } from '@/hooks/useStore'
import type { PipelineItem } from '@/lib/types'

export function usePipelineData(member: string) {
  const { setPipelineItems, upsertPipelineItem, removePipelineItem } = useStore()

  useEffect(() => {
    const supabase = getSupabase()

    supabase
      .from('pipeline_items')
      .select('*')
      .eq('member', member)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setPipelineItems(data as PipelineItem[])
      })

    const channel = supabase
      .channel(`pipeline_${member.replace(' ', '_')}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pipeline_items',
        filter: `member=eq.${member}`,
      }, (payload) => {
        if (payload.eventType === 'DELETE') {
          removePipelineItem((payload.old as PipelineItem).id)
        } else {
          upsertPipelineItem(payload.new as PipelineItem)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [member])
}
```

- [ ] **Step 3: Commit**

```bash
git add hooks/useStore.ts hooks/usePipelineData.ts
git commit -m "feat(pipeline): add pipeline store slice and data hook"
```

---

### Task 4: StageCard Component

**Files:**
- Create: `components/Pipeline/StageCard.tsx`

- [ ] **Step 1: Create components/Pipeline/StageCard.tsx**

```typescript
'use client'

import { useState } from 'react'
import type { StageData, PipelineStage } from '@/lib/types'
import { formatDate } from '@/lib/utils'

interface StageCardProps {
  stageDef: PipelineStage
  stageData: StageData
  isUnlocked: boolean   // previous stage is done (or this is first stage)
  onUpdate: (data: StageData) => void
}

export function StageCard({ stageDef, stageData, isUnlocked, onUpdate }: StageCardProps) {
  const [expanded, setExpanded] = useState(stageData.status === 'in_progress')
  const [newCheckText, setNewCheckText] = useState('')
  const [showFileForm, setShowFileForm] = useState(false)
  const [newFileLabel, setNewFileLabel] = useState('')
  const [newFileUrl, setNewFileUrl] = useState('')

  function handleStart() {
    onUpdate({ ...stageData, status: 'in_progress', started_at: new Date().toISOString() })
    setExpanded(true)
  }

  function handleComplete() {
    onUpdate({ ...stageData, status: 'done', completed_at: new Date().toISOString() })
    setExpanded(false)
  }

  function handleNotesBlur(notes: string) {
    if (notes !== stageData.notes) onUpdate({ ...stageData, notes })
  }

  function toggleCheck(id: string) {
    onUpdate({
      ...stageData,
      checklist: stageData.checklist.map(c => c.id === id ? { ...c, done: !c.done } : c),
    })
  }

  function addCheck() {
    if (!newCheckText.trim()) return
    onUpdate({
      ...stageData,
      checklist: [...stageData.checklist, { id: `${Date.now()}`, text: newCheckText.trim(), done: false }],
    })
    setNewCheckText('')
  }

  function removeCheck(id: string) {
    onUpdate({ ...stageData, checklist: stageData.checklist.filter(c => c.id !== id) })
  }

  function addFile() {
    if (!newFileLabel.trim() || !newFileUrl.trim()) return
    onUpdate({
      ...stageData,
      files: [...stageData.files, { label: newFileLabel.trim(), url: newFileUrl.trim() }],
    })
    setNewFileLabel(''); setNewFileUrl(''); setShowFileForm(false)
  }

  function removeFile(url: string) {
    onUpdate({ ...stageData, files: stageData.files.filter(f => f.url !== url) })
  }

  const doneChecks = stageData.checklist.filter(c => c.done).length
  const totalChecks = stageData.checklist.length

  const borderColor = stageData.status === 'done'
    ? stageDef.color + '55'
    : stageData.status === 'in_progress'
    ? stageDef.color + '44'
    : 'var(--border)'

  const bgColor = stageData.status === 'in_progress'
    ? stageDef.color + '0a'
    : 'var(--bg2)'

  return (
    <div style={{
      border: `1px solid ${borderColor}`,
      borderRadius: 10,
      marginBottom: 10,
      background: bgColor,
      overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      {/* Header */}
      <div
        onClick={() => isUnlocked && setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px',
          cursor: isUnlocked ? 'pointer' : 'default',
          borderBottom: expanded && isUnlocked ? '1px solid var(--border)' : 'none',
        }}
      >
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: stageDef.color, flexShrink: 0 }} />
        <span style={{ fontWeight: 600, fontSize: 14, flex: 1, color: 'var(--text)' }}>{stageDef.label}</span>

        {stageData.status === 'done' && (
          <span style={{ fontSize: 11, color: '#43d9a2', fontWeight: 600 }}>
            ✓ Selesai {stageData.completed_at ? `· ${formatDate(stageData.completed_at.slice(0, 10))}` : ''}
          </span>
        )}
        {stageData.status === 'in_progress' && (
          <span style={{ fontSize: 11, color: '#ffc542', fontWeight: 600 }}>
            ⟳ Berjalan
            {totalChecks > 0 && ` · ${doneChecks}/${totalChecks}`}
          </span>
        )}
        {stageData.status === 'pending' && isUnlocked && (
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>○ Belum mulai</span>
        )}

        {isUnlocked && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2.5"
            style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.18s', flexShrink: 0 }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        )}
      </div>

      {/* Locked */}
      {!isUnlocked && (
        <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text2)', fontStyle: 'italic' }}>
          Stage sebelumnya belum selesai
        </div>
      )}

      {/* Body */}
      {isUnlocked && expanded && (
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Notes */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
              Catatan
            </div>
            <textarea
              key={stageData.notes}
              defaultValue={stageData.notes}
              onBlur={e => handleNotesBlur(e.target.value)}
              placeholder="Tambah catatan..."
              rows={2}
              style={{ fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }}
            />
          </div>

          {/* Checklist */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
              Checklist {totalChecks > 0 && `(${doneChecks}/${totalChecks})`}
            </div>
            {stageData.checklist.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={c.done}
                  onChange={() => toggleCheck(c.id)}
                  style={{ width: 15, height: 15, cursor: 'pointer', flexShrink: 0, accentColor: stageDef.color }}
                />
                <span style={{
                  flex: 1, fontSize: 13,
                  textDecoration: c.done ? 'line-through' : 'none',
                  color: c.done ? 'var(--text2)' : 'var(--text)',
                }}>
                  {c.text}
                </span>
                <button
                  onClick={() => removeCheck(c.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 16, padding: 0, lineHeight: 1 }}
                >×</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <input
                value={newCheckText}
                onChange={e => setNewCheckText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCheck() } }}
                placeholder="+ Tambah checklist (Enter untuk simpan)"
                style={{ fontSize: 12, padding: '5px 8px' }}
              />
            </div>
          </div>

          {/* Files */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
              File & Link
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {stageData.files.map(f => (
                <span key={f.url} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 11, padding: '4px 10px', borderRadius: 20,
                  background: 'var(--bg3)', border: '1px solid var(--border)',
                }}>
                  <a href={f.url} target="_blank" rel="noreferrer"
                    style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                    📎 {f.label}
                  </a>
                  <button
                    onClick={() => removeFile(f.url)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 14, padding: 0, lineHeight: 1 }}
                  >×</button>
                </span>
              ))}
            </div>

            {showFileForm ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  value={newFileLabel}
                  onChange={e => setNewFileLabel(e.target.value)}
                  placeholder="Label (contoh: Script Doc)"
                  style={{ fontSize: 12, padding: '5px 8px' }}
                />
                <input
                  value={newFileUrl}
                  onChange={e => setNewFileUrl(e.target.value)}
                  placeholder="URL (https://drive.google.com/...)"
                  style={{ fontSize: 12, padding: '5px 8px' }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={addFile}
                    style={{ fontSize: 12, padding: '5px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                    Tambah
                  </button>
                  <button onClick={() => { setShowFileForm(false); setNewFileLabel(''); setNewFileUrl('') }}
                    style={{ fontSize: 12, padding: '5px 14px', background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }}>
                    Batal
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowFileForm(true)}
                style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                + Tambah file / link
              </button>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
            {stageData.status === 'pending' && (
              <button
                onClick={handleStart}
                style={{
                  padding: '8px 18px', background: 'var(--bg3)',
                  border: `1px solid ${stageDef.color}55`, borderRadius: 8,
                  cursor: 'pointer', fontSize: 13, color: stageDef.color, fontWeight: 600,
                }}
              >
                Mulai Stage
              </button>
            )}
            {stageData.status === 'in_progress' && (
              <button
                onClick={handleComplete}
                style={{
                  padding: '8px 18px', background: '#43d9a218',
                  border: '1px solid #43d9a244', borderRadius: 8,
                  cursor: 'pointer', fontSize: 13, color: '#43d9a2', fontWeight: 600,
                }}
              >
                ✓ Tandai Selesai
              </button>
            )}
            {stageData.status === 'done' && (
              <button
                onClick={() => onUpdate({ ...stageData, status: 'in_progress', completed_at: null })}
                style={{
                  padding: '6px 14px', background: 'none',
                  border: '1px solid var(--border)', borderRadius: 8,
                  cursor: 'pointer', fontSize: 12, color: 'var(--text2)',
                }}
              >
                Buka Kembali
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Pipeline/StageCard.tsx
git commit -m "feat(pipeline): add StageCard component"
```

---

### Task 5: StagePanel Component

**Files:**
- Create: `components/Pipeline/StagePanel.tsx`

- [ ] **Step 1: Create components/Pipeline/StagePanel.tsx**

```typescript
'use client'

import { useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useStore } from '@/hooks/useStore'
import { StageCard } from './StageCard'
import type { PipelineItem, StageData } from '@/lib/types'
import type { PipelineStage } from '@/lib/constants'

interface StagePanelProps {
  item: PipelineItem
  stages: PipelineStage[]
}

export function StagePanel({ item, stages }: StagePanelProps) {
  const { upsertPipelineItem } = useStore()
  const [saving, setSaving] = useState(false)

  async function handleStageUpdate(stageKey: string, stageData: StageData) {
    const newStagesData = { ...item.stages_data, [stageKey]: stageData }

    // Determine current_stage: first non-done stage, or last stage if all done
    let newCurrentStage = stages[stages.length - 1].key
    for (const s of stages) {
      if ((newStagesData[s.key]?.status ?? 'pending') !== 'done') {
        newCurrentStage = s.key
        break
      }
    }

    const updated: PipelineItem = {
      ...item,
      stages_data: newStagesData,
      current_stage: newCurrentStage,
      updated_at: new Date().toISOString(),
    }

    // Optimistic update
    upsertPipelineItem(updated)

    setSaving(true)
    const supabase = getSupabase()
    await supabase
      .from('pipeline_items')
      .update({ stages_data: newStagesData, current_stage: newCurrentStage, updated_at: updated.updated_at })
      .eq('id', item.id)
    setSaving(false)
  }

  const currentStageDef = stages.find(s => s.key === item.current_stage)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px 16px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0, marginBottom: 6 }}>
              {item.title}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {item.source_post_id && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                  background: '#6c63ff22', color: '#6c63ff', textTransform: 'uppercase',
                }}>
                  dari BPI/BSI
                </span>
              )}
              {currentStageDef && (
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                  Stage saat ini:
                  <span style={{ color: currentStageDef.color, fontWeight: 600, marginLeft: 4 }}>
                    {currentStageDef.label}
                  </span>
                </span>
              )}
              {saving && (
                <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 'auto' }}>Menyimpan...</span>
              )}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {(() => {
          const doneCount = stages.filter(s => item.stages_data[s.key]?.status === 'done').length
          const pct = Math.round((doneCount / stages.length) * 100)
          return (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text2)', marginBottom: 5 }}>
                <span>{doneCount} dari {stages.length} stage selesai</span>
                <span>{pct}%</span>
              </div>
              <div style={{ height: 5, background: 'var(--bg3)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 10,
                  background: `linear-gradient(90deg, var(--accent), #43d9a2)`,
                  width: `${pct}%`, transition: 'width 0.4s ease',
                }} />
              </div>
            </div>
          )
        })()}
      </div>

      {/* Stages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
        {stages.map((stageDef, idx) => {
          const stageData: StageData = item.stages_data[stageDef.key] ?? {
            status: 'pending', notes: '', files: [], checklist: [], started_at: null, completed_at: null,
          }
          // Unlocked if first stage, or previous stage is done
          const isUnlocked = idx === 0 || item.stages_data[stages[idx - 1].key]?.status === 'done'

          return (
            <StageCard
              key={stageDef.key}
              stageDef={stageDef}
              stageData={stageData}
              isUnlocked={isUnlocked}
              onUpdate={data => handleStageUpdate(stageDef.key, data)}
            />
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Pipeline/StagePanel.tsx
git commit -m "feat(pipeline): add StagePanel component"
```

---

### Task 6: PipelineList Component

**Files:**
- Create: `components/Pipeline/PipelineList.tsx`

- [ ] **Step 1: Create components/Pipeline/PipelineList.tsx**

```typescript
'use client'

import type { PipelineItem } from '@/lib/types'
import type { PipelineStage } from '@/lib/constants'
import { formatDate } from '@/lib/utils'

type FilterType = 'all' | 'source' | 'manual'

interface PipelineListProps {
  items: PipelineItem[]
  stages: PipelineStage[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddClick: () => void
}

export function PipelineList({ items, stages, selectedId, onSelect, onAddClick }: PipelineListProps) {
  const [filter, setFilter] = React.useState<FilterType>('all')

  const filtered = items.filter(item => {
    if (filter === 'source') return !!item.source_post_id
    if (filter === 'manual') return !item.source_post_id
    return true
  })

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            Konten ({items.length})
          </span>
          <button
            onClick={onAddClick}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 12px', background: 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 500,
            }}
          >
            + Tambah
          </button>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          {([
            { key: 'all', label: 'Semua' },
            { key: 'source', label: 'Dari BPI/BSI' },
            { key: 'manual', label: 'Mandiri' },
          ] as { key: FilterType; label: string }[]).map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                cursor: 'pointer',
                background: filter === f.key ? 'var(--accent)' : 'transparent',
                color: filter === f.key ? '#fff' : 'var(--text2)',
                border: `1px solid ${filter === f.key ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
            Belum ada konten
          </div>
        ) : filtered.map(item => {
          const stageDef = stages.find(s => s.key === item.current_stage)
          const isSelected = item.id === selectedId
          const doneCount = stages.filter(s => item.stages_data[s.key]?.status === 'done').length
          const pct = Math.round((doneCount / stages.length) * 100)

          return (
            <div
              key={item.id}
              onClick={() => onSelect(item.id)}
              style={{
                padding: '12px 16px',
                cursor: 'pointer',
                background: isSelected ? 'var(--bg3)' : 'transparent',
                borderBottom: '1px solid var(--border)',
                borderLeft: isSelected ? `3px solid var(--accent)` : '3px solid transparent',
                transition: 'background 0.12s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{
                  width: 9, height: 9, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                  background: stageDef?.color ?? 'var(--text2)',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: 'var(--text)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    marginBottom: 4,
                  }}>
                    {item.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {stageDef && (
                      <span style={{ fontSize: 11, color: stageDef.color, fontWeight: 500 }}>
                        {stageDef.label}
                      </span>
                    )}
                    {item.source_post_id && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 20,
                        background: '#6c63ff22', color: '#6c63ff', textTransform: 'uppercase',
                      }}>
                        bpi/bsi
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 'auto' }}>
                      {pct}%
                    </span>
                  </div>
                  {/* Mini progress bar */}
                  <div style={{ height: 3, background: 'var(--border)', borderRadius: 10, marginTop: 6, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 10,
                      background: stageDef?.color ?? 'var(--accent)',
                      width: `${pct}%`, transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Need React import for useState
import React from 'react'
```

- [ ] **Step 2: Commit**

```bash
git add components/Pipeline/PipelineList.tsx
git commit -m "feat(pipeline): add PipelineList component"
```

---

### Task 7: AddPipelineModal

**Files:**
- Create: `components/Pipeline/AddPipelineModal.tsx`

- [ ] **Step 1: Create components/Pipeline/AddPipelineModal.tsx**

```typescript
'use client'

import { useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import type { PipelineItem, StageData } from '@/lib/types'
import type { PipelineStage } from '@/lib/constants'

interface AddPipelineModalProps {
  open: boolean
  member: 'Video Production' | 'Design Studio'
  stages: PipelineStage[]
  onClose: () => void
}

function makeEmptyStageData(): StageData {
  return { status: 'pending', notes: '', files: [], checklist: [], started_at: null, completed_at: null }
}

export function AddPipelineModal({ open, member, stages, onClose }: AddPipelineModalProps) {
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)

  function reset() { setTitle('') }
  function handleClose() { reset(); onClose() }

  async function handleSave() {
    if (!title.trim()) { alert('Judul wajib diisi!'); return }
    setLoading(true)

    const stagesData: Record<string, StageData> = {}
    stages.forEach(s => { stagesData[s.key] = makeEmptyStageData() })

    const supabase = getSupabase()
    await supabase.from('pipeline_items').insert({
      title: title.trim(),
      member,
      source_post_id: null,
      current_stage: stages[0].key,
      stages_data: stagesData,
    })

    setLoading(false)
    handleClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Tambah Konten Pipeline"
      footer={
        <>
          <BtnSecondary onClick={handleClose}>Batal</BtnSecondary>
          <BtnPrimary onClick={handleSave} loading={loading}>Buat Pipeline</BtnPrimary>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 5 }}>
            Judul Konten *
          </label>
          <input
            type="text"
            placeholder="Nama konten / campaign..."
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            autoFocus
          />
        </div>

        <div style={{
          background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px',
        }}>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>Pipeline akan mulai dari:</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {stages.map((s, i) => (
              <span key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, color: s.color, fontWeight: 600 }}>{s.label}</span>
                {i < stages.length - 1 && <span style={{ color: 'var(--text2)', fontSize: 12 }}>→</span>}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Pipeline/AddPipelineModal.tsx
git commit -m "feat(pipeline): add AddPipelineModal"
```

---

### Task 8: PipelineSummary Component

**Files:**
- Create: `components/Pipeline/PipelineSummary.tsx`

- [ ] **Step 1: Create components/Pipeline/PipelineSummary.tsx**

```typescript
'use client'

import type { PipelineItem } from '@/lib/types'
import type { PipelineStage } from '@/lib/constants'

interface PipelineSummaryProps {
  items: PipelineItem[]
  stages: PipelineStage[]
  member: string
}

function msToHours(ms: number) {
  const h = Math.round(ms / 3600000)
  if (h < 24) return `${h}j`
  return `${Math.round(h / 24)}h`
}

export function PipelineSummary({ items, stages, member }: PipelineSummaryProps) {
  const total = items.length
  const completed = items.filter(item => item.stages_data[stages[stages.length - 1].key]?.status === 'done').length
  const inProgress = items.filter(item => {
    const cs = item.stages_data[item.current_stage]
    return cs?.status === 'in_progress'
  }).length
  const completionRate = total ? Math.round((completed / total) * 100) : 0

  // Per-stage stats
  const stageStats = stages.map(s => {
    const inStage = items.filter(item => item.current_stage === s.key).length
    const doneInStage = items.filter(item => item.stages_data[s.key]?.status === 'done').length

    // Average time in stage (for done stages with timestamps)
    const times = items
      .map(item => item.stages_data[s.key])
      .filter(sd => sd?.status === 'done' && sd.started_at && sd.completed_at)
      .map(sd => new Date(sd!.completed_at!).getTime() - new Date(sd!.started_at!).getTime())
    const avgMs = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0

    return { ...s, inStage, doneInStage, avgTime: avgMs ? msToHours(avgMs) : null }
  })

  return (
    <div style={{ padding: 24 }}>
      {/* Top stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Konten', value: total, color: 'var(--text)' },
          { label: 'Sedang Berjalan', value: inProgress, color: '#ffc542' },
          { label: 'Selesai', value: completed, color: '#43d9a2' },
          { label: 'Completion Rate', value: `${completionRate}%`, color: 'var(--accent)' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
              {stat.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Per-stage breakdown */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600 }}>
          Breakdown per Stage
        </div>
        {stageStats.map(s => (
          <div key={s.key} style={{
            display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px',
            padding: '12px 18px', borderBottom: '1px solid var(--border)', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>{s.label}</span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.inStage}</div>
              <div style={{ fontSize: 10, color: 'var(--text2)' }}>aktif</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#43d9a2' }}>{s.doneInStage}</div>
              <div style={{ fontSize: 10, color: 'var(--text2)' }}>selesai</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{s.avgTime ?? '—'}</div>
              <div style={{ fontSize: 10, color: 'var(--text2)' }}>rata-rata</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Pipeline/PipelineSummary.tsx
git commit -m "feat(pipeline): add PipelineSummary component"
```

---

### Task 9: Pipeline Index (Main Page Component)

**Files:**
- Create: `components/Pipeline/index.tsx`

- [ ] **Step 1: Create components/Pipeline/index.tsx**

```typescript
'use client'

import { useState } from 'react'
import { useStore } from '@/hooks/useStore'
import { usePipelineData } from '@/hooks/usePipelineData'
import { PipelineList } from './PipelineList'
import { StagePanel } from './StagePanel'
import { AddPipelineModal } from './AddPipelineModal'
import { PipelineSummary } from './PipelineSummary'
import type { PipelineStage } from '@/lib/constants'

type PipelineTab = 'pipeline' | 'summary'

interface PipelinePageProps {
  member: 'Video Production' | 'Design Studio'
  stages: PipelineStage[]
}

export function PipelinePage({ member, stages }: PipelinePageProps) {
  usePipelineData(member)

  const { pipelineItems } = useStore()
  const [tab, setTab] = useState<PipelineTab>('pipeline')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  const items = pipelineItems.filter(p => p.member === member)
  const selectedItem = items.find(p => p.id === selectedId) ?? null

  // Auto-select first item if none selected
  const displayItem = selectedItem ?? (items.length > 0 ? items[0] : null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab Bar */}
      <div style={{
        display: 'flex', alignItems: 'center',
        borderBottom: '1px solid var(--border)', padding: '0 24px',
        background: 'var(--bg)', position: 'sticky', top: 0, zIndex: 10,
      }}>
        {(['pipeline', 'summary'] as PipelineTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 500,
              color: tab === t ? 'var(--accent)' : 'var(--text2)',
              background: 'none', border: 'none',
              borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
              marginBottom: -1, transition: 'all 0.15s', textTransform: 'capitalize',
            }}
          >
            {t === 'pipeline' ? 'Pipeline' : 'Ringkasan'}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'summary' ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <PipelineSummary items={items} stages={stages} member={member} />
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left panel — 35% */}
          <div style={{ width: '35%', minWidth: 240, maxWidth: 320, flexShrink: 0, overflowY: 'auto' }}>
            <PipelineList
              items={items}
              stages={stages}
              selectedId={displayItem?.id ?? null}
              onSelect={setSelectedId}
              onAddClick={() => setShowAdd(true)}
            />
          </div>

          {/* Right panel — 65% */}
          <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
            {displayItem ? (
              <StagePanel item={displayItem} stages={stages} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text2)', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 40 }}>🎬</div>
                <div style={{ fontSize: 14 }}>Belum ada konten pipeline</div>
                <button
                  onClick={() => setShowAdd(true)}
                  style={{ padding: '8px 18px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
                >
                  + Tambah Konten Pertama
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <AddPipelineModal
        open={showAdd}
        member={member}
        stages={stages}
        onClose={() => setShowAdd(false)}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Pipeline/index.tsx
git commit -m "feat(pipeline): add PipelinePage main component"
```

---

### Task 10: Route Pages

**Files:**
- Create: `app/(dashboard)/pipeline/vp/page.tsx`
- Create: `app/(dashboard)/pipeline/ds/page.tsx`

- [ ] **Step 1: Create app/(dashboard)/pipeline/vp/page.tsx**

```typescript
'use client'

import { PageHeader } from '@/components/shared/PageHeader'
import { PipelinePage } from '@/components/Pipeline'
import { VP_STAGES } from '@/lib/constants'

export default function VideoPipelinePage() {
  return (
    <>
      <PageHeader title="Video Pipeline" />
      <div className="flex-1 overflow-hidden min-h-0">
        <PipelinePage member="Video Production" stages={[...VP_STAGES]} />
      </div>
    </>
  )
}
```

- [ ] **Step 2: Create app/(dashboard)/pipeline/ds/page.tsx**

```typescript
'use client'

import { PageHeader } from '@/components/shared/PageHeader'
import { PipelinePage } from '@/components/Pipeline'
import { DS_STAGES } from '@/lib/constants'

export default function DesignPipelinePage() {
  return (
    <>
      <PageHeader title="Design Pipeline" />
      <div className="flex-1 overflow-hidden min-h-0">
        <PipelinePage member="Design Studio" stages={[...DS_STAGES]} />
      </div>
    </>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/pipeline/vp/page.tsx app/(dashboard)/pipeline/ds/page.tsx
git commit -m "feat(pipeline): add pipeline route pages for VP and DS"
```

---

### Task 11: Sidebar Navigation

**Files:**
- Modify: `components/Sidebar.tsx`

- [ ] **Step 1: Add pipeline nav items to the 'projects' section in Sidebar.tsx**

Find the `projects` section items array (currently has All Projects, Task Board, Video Production, Design Studio). Add two new items after Design Studio:

```typescript
    {
      id: 'projects',
      badge: <span style={{ fontSize: 9, fontWeight: 900, color: '#fff', lineHeight: 1 }}>proj.</span>,
      fullLabel: 'Projects',
      items: [
        { href: '/projects', label: 'All Projects', icon: <Icon><FolderIcon /></Icon> },
        { href: '/tasks', label: 'Task Board', icon: <Icon><TaskIcon /></Icon> },
        { href: '/bpi-faizal', label: 'Video Production', icon: <Icon><VideoIcon /></Icon> },
        { href: '/pipeline/vp', label: 'Video Pipeline', icon: <Icon><VideoIcon /></Icon> },
        { href: '/bpi-reinaldi', label: 'Design Studio', icon: <Icon><DesignIcon /></Icon> },
        { href: '/pipeline/ds', label: 'Design Pipeline', icon: <Icon><DesignIcon /></Icon> },
      ],
    },
```

- [ ] **Step 2: Verify the sidebar renders without errors**

Open [http://localhost:3002](http://localhost:3002) and confirm the sidebar shows "Video Pipeline" and "Design Pipeline" under proj. section.

- [ ] **Step 3: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat(pipeline): add Video Pipeline and Design Pipeline sidebar nav items"
```

---

### Task 12: WSEditModal Integration

**Files:**
- Modify: `components/WorkSpace/WSEditModal.tsx`

- [ ] **Step 1: Add createPipelineItem helper and "Buat Pipeline Item" button to WSEditModal.tsx**

In `WSEditModal.tsx`, add this helper function before the component return, alongside existing functions like `handleSave`:

```typescript
async function handleCreatePipeline() {
  const supabase = getSupabase()

  // Determine stages based on member
  const isVP = member === 'Video Production'
  const stages = isVP
    ? [
        { key: 'ide' }, { key: 'script' }, { key: 'audio' },
        { key: 'video' }, { key: 'upload' },
      ]
    : [
        { key: 'ide' }, { key: 'brief' }, { key: 'design' },
        { key: 'review' }, { key: 'upload' },
      ]

  const stagesData: Record<string, StageData> = {}
  stages.forEach(s => {
    stagesData[s.key] = {
      status: 'pending', notes: '', files: [], checklist: [],
      started_at: null, completed_at: null,
    }
  })

  await supabase.from('pipeline_items').insert({
    title: post.title,
    member,
    source_post_id: post.id,
    current_stage: stages[0].key,
    stages_data: stagesData,
  })

  alert(`Pipeline item dibuat untuk "${post.title}"`)
}
```

Also add the import at the top of WSEditModal.tsx:

```typescript
import type { StageData } from '@/lib/types'
```

Then in the modal footer or action area (find where the existing action buttons are rendered), add the "Buat Pipeline Item" button. Add it after the existing save/close buttons when `post.status === 'produksi'`:

```typescript
{post.status === 'produksi' && (
  <button
    onClick={handleCreatePipeline}
    style={{
      padding: '7px 14px', background: 'transparent',
      border: '1px solid var(--accent)', borderRadius: 8,
      cursor: 'pointer', fontSize: 12, color: 'var(--accent)', fontWeight: 500,
    }}
  >
    📌 Buat Pipeline Item
  </button>
)}
```

- [ ] **Step 2: Verify the button appears**

Open a BPI/BSI post that has status "Production" and member "Video Production" or "Design Studio". Confirm the "Buat Pipeline Item" button is visible.

- [ ] **Step 3: Commit**

```bash
git add components/WorkSpace/WSEditModal.tsx
git commit -m "feat(pipeline): add 'Buat Pipeline Item' button in WSEditModal"
```

---

## Final Verification

- [ ] Open [http://localhost:3002/pipeline/vp](http://localhost:3002/pipeline/vp) — Video Pipeline page loads
- [ ] Open [http://localhost:3002/pipeline/ds](http://localhost:3002/pipeline/ds) — Design Pipeline page loads
- [ ] Click "+ Tambah" — AddPipelineModal opens, can create item
- [ ] New item appears in left panel, click it — StagePanel loads on right
- [ ] Click "Mulai Stage" on Ide — status changes to Berjalan
- [ ] Add checklist item, add file link, add note — saved on blur/Enter
- [ ] Click "Tandai Selesai" — stage marked done, next stage unlocks
- [ ] Summary tab shows correct stats
- [ ] Sidebar shows both pipeline items and correct active state
