# Chat Features (Retract / Edit / Attachments / Clear) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add retract (soft-delete → "Pesan ini ditarik"), edit, file attachments, and clear (select-delete + empty-room) to the project group chat, all syncing live.

**Architecture:** New columns + RLS on `chat_messages`, a private `chat-attachments` Storage bucket, five new/extended API routes under `app/api/chat/`, and `ChatRoom.tsx` UI for per-message actions, attachments, and a selection/clear mode. Realtime gains `UPDATE`/`DELETE` handlers.

**Tech Stack:** Next.js App Router (route handlers), Supabase (Postgres + RLS + Storage + Realtime), React client component with inline styles, TypeScript.

**Verification model:** No unit-test runner exists. Each task verifies with `npx tsc --noEmit -p tsconfig.json` (0 errors), applying SQL in the Supabase SQL editor, and explicit manual runtime checks in the running app (`npm run dev`, localhost:3000). Do NOT run `npm run build` while dev is running.

**Reference spec:** `docs/superpowers/specs/2026-06-12-chat-features-design.md`

---

## File map

- Create `docs/sql/2026-06-12-chat-v2.sql` — columns, `is_chat_super_admin()`, UPDATE/DELETE policies, bucket.
- Modify `app/api/chat/[room]/route.ts` — GET returns new fields; POST accepts `attachment_*` + allows empty body with attachment.
- Create `app/api/chat/[room]/[id]/route.ts` — PATCH (edit/retract), DELETE (hard-delete one).
- Create `app/api/chat/[room]/clear/route.ts` — POST bulk delete (`ids` or `all`).
- Create `app/api/chat/[room]/upload/route.ts` — POST multipart upload.
- Create `app/api/chat/[room]/file/route.ts` — GET signed-URL redirect.
- Modify `components/Chat/ChatRoom.tsx` — type, realtime, actions, edit mode, attachments, select/clear.
- Modify `lib/i18n/dictionary.ts` — new Indonesian strings.

---

## Task 1: DB migration — columns, helper, RLS, bucket

**Files:**
- Create: `docs/sql/2026-06-12-chat-v2.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Chat v2: edit/retract, attachments, moderation deletes.
alter table public.chat_messages
  add column if not exists edited_at        timestamptz,
  add column if not exists deleted_at       timestamptz,
  add column if not exists attachment_path  text,
  add column if not exists attachment_name  text,
  add column if not exists attachment_type  text,
  add column if not exists attachment_size  integer;

-- Super-admin check mirroring can_access_chat_room's super branch.
create or replace function public.is_chat_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select lower(coalesce(auth.jwt()->>'email','')) = 'dandirivaldi@masterbagasi.com'
      or coalesce(auth.jwt()->'app_metadata'->>'role','') = 'super_admin';
$$;

-- Author (or super admin) may edit/retract.
drop policy if exists chat_messages_update on public.chat_messages;
create policy chat_messages_update on public.chat_messages
  for update
  using ( public.can_access_chat_room(room)
          and ( author_email = auth.jwt()->>'email' or public.is_chat_super_admin() ) )
  with check ( public.can_access_chat_room(room)
          and ( author_email = auth.jwt()->>'email' or public.is_chat_super_admin() ) );

-- Author (or super admin) may hard-delete. A non-super "empty room" only nukes
-- their own rows; the UI restricts the button to super admin, RLS backs it up.
drop policy if exists chat_messages_delete on public.chat_messages;
create policy chat_messages_delete on public.chat_messages
  for delete
  using ( public.can_access_chat_room(room)
          and ( author_email = auth.jwt()->>'email' or public.is_chat_super_admin() ) );

-- Private attachments bucket.
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;
```

- [ ] **Step 2: Apply** in Supabase SQL editor (production project). Confirm no error.

- [ ] **Step 3: Verify** the bucket exists (Storage tab) and columns exist:
  `select column_name from information_schema.columns where table_name='chat_messages';`
  Expected to include `edited_at, deleted_at, attachment_path, attachment_name, attachment_type, attachment_size`.

- [ ] **Step 4: Commit**
```bash
git add docs/sql/2026-06-12-chat-v2.sql
git commit -m "feat(chat): db v2 — edit/retract, attachment columns, RLS, bucket"
```

---

## Task 2: Extend send/list API for attachments + empty body

**Files:**
- Modify: `app/api/chat/[room]/route.ts`

- [ ] **Step 1:** In `GET`, the `select('*')` already returns the new columns — no change needed there. Confirm by reading the handler.

- [ ] **Step 2:** Replace the `POST` body-building block so it accepts optional attachment fields and allows empty `body` when a file is attached:

```ts
export async function POST(req: NextRequest, { params }: { params: { room: string } }) {
  const g = await gate(params.room)
  if ('error' in g) return g.error
  const payload = await req.json().catch(() => ({}))
  const text = String(payload.body ?? '').trim()
  const hasAttachment = typeof payload.attachment_path === 'string' && payload.attachment_path.length > 0
  if (!text && !hasAttachment) return NextResponse.json({ error: 'empty' }, { status: 400 })
  const row: Record<string, unknown> = {
    room: params.room,
    author_email: g.user.email,
    author_name: displayName(g.user),
    body: text.slice(0, 4000),
  }
  if (hasAttachment) {
    row.attachment_path = String(payload.attachment_path).slice(0, 500)
    row.attachment_name = String(payload.attachment_name ?? 'file').slice(0, 255)
    row.attachment_type = String(payload.attachment_type ?? 'application/octet-stream').slice(0, 128)
    row.attachment_size = Number(payload.attachment_size) || 0
  }
  const { data, error } = await (g.supabase as any).from('chat_messages').insert(row).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ message: data })
}
```

- [ ] **Step 3:** `npx tsc --noEmit -p tsconfig.json` → 0 errors.

- [ ] **Step 4: Commit**
```bash
git add app/api/chat/[room]/route.ts
git commit -m "feat(chat): accept attachment metadata + empty body with file"
```

---

## Task 3: Upload + file-serving routes

**Files:**
- Create: `app/api/chat/[room]/upload/route.ts`
- Create: `app/api/chat/[room]/file/route.ts`

- [ ] **Step 1:** Write `upload/route.ts`. Reuse the access pattern from the existing route (copy the `gate` helper import path; gate is module-local in the existing file, so re-implement a thin inline gate using `createServerSupabase` + `canAccessChat` exactly as in `[room]/route.ts`). Allowed MIME prefixes/types and 10 MB cap:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { isEffectiveSuperAdmin, canAccessChat, normaliseSections } from '@/lib/access'
/* eslint-disable @typescript-eslint/no-explicit-any */

const MAX = 10 * 1024 * 1024
const OK = [
  'image/png','image/jpeg','image/webp','image/gif',
  'application/pdf',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip','application/x-zip-compressed',
]

async function gate(room: string) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (isEffectiveSuperAdmin(user.email, (user as any).app_metadata?.role)) return { supabase, user }
  const { data } = await (supabase as any).from('menu_access').select('sections').limit(1).maybeSingle()
  const allowed = normaliseSections((data as any)?.sections)
  if (!canAccessChat(allowed, room)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { supabase, user }
}

export async function POST(req: NextRequest, { params }: { params: { room: string } }) {
  const g = await gate(params.room)
  if ('error' in g) return g.error
  const form = await req.formData().catch(() => null)
  const file = form?.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'no file' }, { status: 400 })
  if (file.size > MAX) return NextResponse.json({ error: 'too large (max 10MB)' }, { status: 413 })
  if (!OK.includes(file.type)) return NextResponse.json({ error: 'type not allowed' }, { status: 415 })
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120)
  const path = `${params.room}/${crypto.randomUUID()}-${safe}`
  const buf = Buffer.from(await file.arrayBuffer())
  const { error } = await (g.supabase as any).storage.from('chat-attachments')
    .upload(path, buf, { contentType: file.type, upsert: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    attachment_path: path, attachment_name: file.name, attachment_type: file.type, attachment_size: file.size,
  })
}
```

- [ ] **Step 2:** Write `file/route.ts` (same `gate`), redirecting to a signed URL. Confirm the storage `path` belongs to the room (prevents reading another room's object):

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { isEffectiveSuperAdmin, canAccessChat, normaliseSections } from '@/lib/access'
/* eslint-disable @typescript-eslint/no-explicit-any */

async function gate(room: string) { /* identical to upload/route.ts gate */ }

export async function GET(req: NextRequest, { params }: { params: { room: string } }) {
  const g = await gate(params.room)
  if ('error' in g) return g.error
  const path = new URL(req.url).searchParams.get('path') || ''
  if (!path.startsWith(`${params.room}/`)) return NextResponse.json({ error: 'bad path' }, { status: 400 })
  const { data, error } = await (g.supabase as any).storage.from('chat-attachments').createSignedUrl(path, 60)
  if (error || !data?.signedUrl) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.redirect(data.signedUrl)
}
```
(Paste the same `gate` body from Step 1 in place of the comment.)

- [ ] **Step 3:** `npx tsc --noEmit` → 0 errors.

- [ ] **Step 4: Manual check:** with dev running, `curl -i -F file=@some.png http://localhost:3000/api/chat/<your-room>/upload` while logged-in is hard via curl (needs cookie); instead defer the live upload check to Task 8 and just confirm tsc + that the route compiles and 401s when unauthenticated.

- [ ] **Step 5: Commit**
```bash
git add app/api/chat/[room]/upload/route.ts app/api/chat/[room]/file/route.ts
git commit -m "feat(chat): file upload + signed-url serving routes"
```

---

## Task 4: Edit / retract / delete-one route

**Files:**
- Create: `app/api/chat/[room]/[id]/route.ts`

- [ ] **Step 1:** Write the route with the same `gate`. PATCH handles edit + retract; DELETE hard-deletes one (and its storage object). RLS enforces author/super-admin; we still pass through it:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { isEffectiveSuperAdmin, canAccessChat, normaliseSections } from '@/lib/access'
/* eslint-disable @typescript-eslint/no-explicit-any */

async function gate(room: string) { /* identical gate as Task 3 */ }

export async function PATCH(req: NextRequest, { params }: { params: { room: string; id: string } }) {
  const g = await gate(params.room)
  if ('error' in g) return g.error
  const p = await req.json().catch(() => ({}))
  if (p.action === 'retract') {
    const { data, error } = await (g.supabase as any).from('chat_messages')
      .update({ deleted_at: new Date().toISOString(), body: '', attachment_path: null, attachment_name: null, attachment_type: null, attachment_size: null })
      .eq('id', params.id).eq('room', params.room).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 403 })
    return NextResponse.json({ message: data })
  }
  const text = String(p.body ?? '').trim()
  if (!text) return NextResponse.json({ error: 'empty' }, { status: 400 })
  const { data, error } = await (g.supabase as any).from('chat_messages')
    .update({ body: text.slice(0, 4000), edited_at: new Date().toISOString() })
    .eq('id', params.id).eq('room', params.room).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 403 })
  return NextResponse.json({ message: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: { room: string; id: string } }) {
  const g = await gate(params.room)
  if ('error' in g) return g.error
  const { data: row } = await (g.supabase as any).from('chat_messages')
    .select('attachment_path').eq('id', params.id).eq('room', params.room).maybeSingle()
  const { error } = await (g.supabase as any).from('chat_messages')
    .delete().eq('id', params.id).eq('room', params.room)
  if (error) return NextResponse.json({ error: error.message }, { status: 403 })
  if (row?.attachment_path) await (g.supabase as any).storage.from('chat-attachments').remove([row.attachment_path])
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2:** `npx tsc --noEmit` → 0 errors.

- [ ] **Step 3: Commit**
```bash
git add app/api/chat/[room]/[id]/route.ts
git commit -m "feat(chat): edit/retract (PATCH) + hard-delete one (DELETE)"
```

---

## Task 5: Clear route (bulk select + empty room)

**Files:**
- Create: `app/api/chat/[room]/clear/route.ts`

- [ ] **Step 1:** Write the route. `ids` → delete those; `all:true` → super-admin-only empty-room. Remove storage objects for deleted rows:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { isEffectiveSuperAdmin, canAccessChat, normaliseSections } from '@/lib/access'
/* eslint-disable @typescript-eslint/no-explicit-any */

async function gate(room: string) { /* identical gate as Task 3, but also return isSuper */ }

export async function POST(req: NextRequest, { params }: { params: { room: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isSuper = isEffectiveSuperAdmin(user.email, (user as any).app_metadata?.role)
  if (!isSuper) {
    const { data } = await (supabase as any).from('menu_access').select('sections').limit(1).maybeSingle()
    if (!canAccessChat(normaliseSections((data as any)?.sections), params.room))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const p = await req.json().catch(() => ({}))
  let q = (supabase as any).from('chat_messages').select('attachment_path').eq('room', params.room)
  if (p.all === true) {
    if (!isSuper) return NextResponse.json({ error: 'super admin only' }, { status: 403 })
  } else if (Array.isArray(p.ids) && p.ids.length) {
    q = q.in('id', p.ids)
  } else {
    return NextResponse.json({ error: 'nothing to clear' }, { status: 400 })
  }
  const { data: rows } = await q
  let del = (supabase as any).from('chat_messages').delete().eq('room', params.room)
  if (p.all !== true) del = del.in('id', p.ids)
  const { error } = await del
  if (error) return NextResponse.json({ error: error.message }, { status: 403 })
  const paths = ((rows as any[]) ?? []).map(r => r.attachment_path).filter(Boolean)
  if (paths.length) await (supabase as any).storage.from('chat-attachments').remove(paths)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2:** `npx tsc --noEmit` → 0 errors.

- [ ] **Step 3: Commit**
```bash
git add app/api/chat/[room]/clear/route.ts
git commit -m "feat(chat): clear route — bulk select-delete + empty-room (super admin)"
```

---

## Task 6: Frontend — type + realtime UPDATE/DELETE

**Files:**
- Modify: `components/Chat/ChatRoom.tsx`

- [ ] **Step 1:** Extend the `Msg` interface:
```ts
interface Msg {
  id: string; room: string; author_email: string; author_name: string; body: string; created_at: string
  edited_at?: string | null; deleted_at?: string | null
  attachment_path?: string | null; attachment_name?: string | null; attachment_type?: string | null; attachment_size?: number | null
}
```

- [ ] **Step 2:** In the realtime channel, after the existing `INSERT` handler, add `UPDATE` and `DELETE`:
```ts
.on('postgres_changes',
  { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `room=eq.${room}` },
  payload => { if (cancelled) return
    const row = payload.new as Msg
    setMessages(prev => prev.map(m => (m.id === row.id ? row : m)))
  })
.on('postgres_changes',
  { event: 'DELETE', schema: 'public', table: 'chat_messages', filter: `room=eq.${room}` },
  payload => { if (cancelled) return
    const old = payload.old as { id: string }
    setMessages(prev => prev.filter(m => m.id !== old.id))
  })
```
(Chain these before `.subscribe()`.)

- [ ] **Step 3:** `npx tsc --noEmit` → 0 errors.

- [ ] **Step 4: Commit**
```bash
git add components/Chat/ChatRoom.tsx
git commit -m "feat(chat): msg type + realtime update/delete handlers"
```

---

## Task 7: Frontend — per-message menu, edit mode, retracted/edited render

**Files:**
- Modify: `components/Chat/ChatRoom.tsx`
- Modify: `lib/i18n/dictionary.ts`

- [ ] **Step 1:** Add i18n keys (Indonesian source → keep as-is; add English if the dict has an en map — follow the file's existing shape): `Edit`, `Tarik`, `Hapus`, `Simpan`, `Batal`, `(diedit)`, `Pesan ini ditarik`, `Hapus pesan ini?`, `Pilih`, `Batal pilih`, `Kosongkan room`, `Hapus terpilih`, `Lampirkan file`, `File terlalu besar (maks 10MB)`, `Tipe file tidak didukung`, `Kosongkan seluruh room? Semua pesan akan terhapus permanen.`. (Open the file, match the existing structure, add keys.)

- [ ] **Step 2:** Add component state near the other `useState`s:
```ts
const isSuper = SUPER_HINT // see step 3
const [menuFor, setMenuFor] = useState<string | null>(null)
const [editing, setEditing] = useState<string | null>(null)
const [editText, setEditText] = useState('')
```

- [ ] **Step 3:** The component needs to know if the viewer is super admin. Pass it in: in `app/(dashboard)/smm/[project]/chat/page.tsx`, compute `isSuperAdmin(email)` (import from `@/lib/access`) and pass `meSuper` prop to `ChatRoom`; add `meSuper: boolean` to the props type. Replace `SUPER_HINT` usage with the `meSuper` prop.

- [ ] **Step 4:** Add action handlers:
```ts
async function retract(id: string) {
  setMenuFor(null)
  setMessages(prev => prev.map(m => m.id === id ? { ...m, deleted_at: new Date().toISOString(), body: '' } : m))
  await fetch(`/api/chat/${encodeURIComponent(room)}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'retract' }) })
}
async function hardDelete(id: string) {
  setMenuFor(null)
  setMessages(prev => prev.filter(m => m.id !== id))
  await fetch(`/api/chat/${encodeURIComponent(room)}/${id}`, { method: 'DELETE' })
}
function startEdit(m: Msg) { setMenuFor(null); setEditing(m.id); setEditText(m.body) }
async function saveEdit(id: string) {
  const body = editText.trim(); if (!body) return
  setEditing(null)
  setMessages(prev => prev.map(m => m.id === id ? { ...m, body, edited_at: new Date().toISOString() } : m))
  await fetch(`/api/chat/${encodeURIComponent(room)}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) })
}
```

- [ ] **Step 5:** In the message render (`view.map`), branch on `m.deleted_at` → render the italic *"Pesan ini ditarik"* placeholder (no actions, no tick). Otherwise render the bubble; if `editing === m.id`, render an inline textarea bound to `editText` with Simpan/Batal (Enter→saveEdit, Esc→cancel). Append `t('(diedit)')` next to the timestamp when `m.edited_at`. Add a hover **⋯** button that opens a small menu (absolute-positioned) with: own & not deleted → *Edit*, *Tarik*; `meSuper` & not own → *Hapus*. Add the CSS classes to `CR_CSS` (`.cr-actions`, `.cr-menu`, `.cr-menu button`, `.cr-retracted`, `.cr-edited`, `.cr-edit-area`). Use existing tokens.

- [ ] **Step 6:** `npx tsc --noEmit` → 0 errors.

- [ ] **Step 7: Manual check** (dev running): send a message → hover shows ⋯ → Edit changes text and shows "(diedit)"; Tarik shows "Pesan ini ditarik". Open a second browser/profile to confirm the change syncs live.

- [ ] **Step 8: Commit**
```bash
git add components/Chat/ChatRoom.tsx lib/i18n/dictionary.ts app/(dashboard)/smm/[project]/chat/page.tsx
git commit -m "feat(chat): per-message edit/retract/delete menu + edited/retracted render"
```

---

## Task 8: Frontend — attachments (compose + render)

**Files:**
- Modify: `components/Chat/ChatRoom.tsx`

- [ ] **Step 1:** Add state + a hidden `<input type="file">` ref:
```ts
const fileRef = useRef<HTMLInputElement>(null)
const [pending, setPending] = useState<File | null>(null)
const [uploading, setUploading] = useState(false)
```

- [ ] **Step 2:** In the composer, add a 📎 button (inline SVG paperclip) that triggers `fileRef.current?.click()`; on change set `pending` (guard size ≤10MB and allowed type, else alert via a small inline error). Above the input, when `pending`, show a removable preview chip (filename + size + ✕).

- [ ] **Step 3:** Change `send()` to upload first when `pending` is set:
```ts
let attach: any = null
if (pending) {
  setUploading(true)
  const fd = new FormData(); fd.append('file', pending)
  const ur = await fetch(`/api/chat/${encodeURIComponent(room)}/upload`, { method: 'POST', body: fd })
  setUploading(false)
  if (!ur.ok) { /* show error, keep pending */ return }
  attach = await ur.json(); setPending(null)
}
// include attach fields in the POST body and in the optimistic Msg
```
Allow sending when `text` is empty but `attach` exists. Include `attachment_*` in both the optimistic message and the POST `body`.

- [ ] **Step 4:** Render attachments inside the bubble. Helper `fileUrl(m)` = `/api/chat/${room}/file?path=${encodeURIComponent(m.attachment_path!)}`. If `attachment_type` starts with `image/`, render `<img>` (max-width 260, rounded, click → open `fileUrl` in new tab). Otherwise a download chip: `<a href={fileUrl} download>` with a file-type icon, `attachment_name`, and a human size. Add CSS classes `.cr-img`, `.cr-file-chip`.

- [ ] **Step 5:** `npx tsc --noEmit` → 0 errors.

- [ ] **Step 6: Manual check:** attach a PNG → sends, shows inline; attach a PDF → shows a download chip that opens the file; oversize file is rejected client-side; verify the second client sees the attachment.

- [ ] **Step 7: Commit**
```bash
git add components/Chat/ChatRoom.tsx
git commit -m "feat(chat): send + render image/document attachments"
```

---

## Task 9: Frontend — selection & clear mode

**Files:**
- Modify: `components/Chat/ChatRoom.tsx`

- [ ] **Step 1:** Add state:
```ts
const [selecting, setSelecting] = useState(false)
const [selected, setSelected] = useState<Set<string>>(new Set())
const [confirm, setConfirm] = useState<null | { kind: 'selected' | 'all' }>(null)
```

- [ ] **Step 2:** Add a *Pilih* toggle (top of the stream, sticky like the day chip area). When `selecting`, render a checkbox at the leading edge of each row; clicking a row toggles its id in `selected`. Show a bottom action bar: *Hapus terpilih (n)* (enabled when n>0) and — when `meSuper` — *Kosongkan room*. A *Batal pilih* exits the mode.

- [ ] **Step 3:** Handlers:
```ts
async function clearSelected() {
  const ids = [...selected]; setConfirm(null); setSelecting(false); setSelected(new Set())
  setMessages(prev => prev.filter(m => !ids.includes(m.id)))
  await fetch(`/api/chat/${encodeURIComponent(room)}/clear`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
}
async function clearAll() {
  setConfirm(null); setSelecting(false); setSelected(new Set())
  setMessages([])
  await fetch(`/api/chat/${encodeURIComponent(room)}/clear`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) })
}
```

- [ ] **Step 4:** Use the shared `Modal` (`@/components/shared/Modal`) for `confirm`: selected → "Hapus N pesan terpilih? Permanen."; all → the empty-room warning string. Confirm calls the matching handler.

- [ ] **Step 5:** `npx tsc --noEmit` → 0 errors.

- [ ] **Step 6: Manual check:** select 2 messages → Hapus → gone (and gone on the 2nd client). As super admin, Kosongkan room empties everything; as a normal user the button is absent.

- [ ] **Step 7: Commit**
```bash
git add components/Chat/ChatRoom.tsx
git commit -m "feat(chat): selection mode — delete selected + empty room"
```

---

## Task 10: Final verification

- [ ] **Step 1:** `npx tsc --noEmit -p tsconfig.json` → 0 errors.
- [ ] **Step 2:** Run through the spec's Testing section manually with two logged-in profiles (author vs non-author vs super admin): edit, retract, delete-one, upload image, upload doc, oversize reject, select-delete, empty-room (super only), and confirm each syncs live.
- [ ] **Step 3:** Confirm a retracted message shows the placeholder for everyone and exposes no further actions.
- [ ] **Step 4: Commit** any final touch-ups, then stop (push only on the user's "push").

---

## Self-review notes

- Spec coverage: retract (T4/T7), edit (T4/T7), attachments (T1–T3/T8), clear select+all (T1/T5/T9), permissions via RLS + `meSuper` (T1/T3/T7/T9), realtime (T6). All covered.
- The `gate` helper is duplicated per route file (the existing `[room]/route.ts` keeps it module-local); each new route repeats it verbatim rather than importing, matching the current codebase style.
- `meSuper` prop name is consistent across page.tsx and ChatRoom.tsx (T7).
